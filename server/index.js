require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const port = process.env.PORT || 4000;
const IGDB_CLIENT_ID = process.env.IGDB_CLIENT_ID;
const IGDB_CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET;
let fitGirlCache = null;
const igdbCache = {};
let igdbAccessToken = null;
let igdbTokenExpiresAt = 0;
const DB_PATH = path.join(__dirname, "db.json");
let gamesCache = null;
let gamesCacheDate = null;

app.use(cors());
app.use(express.json());

async function fetchFitGirlGames(pageNumber = 1) {
  const url = pageNumber === 1 
    ? "https://fitgirl-repacks.site/all-my-repacks-a-z/"
    : `https://fitgirl-repacks.site/all-my-repacks-a-z/?lcp_page0=${pageNumber}`;
  
  const response = await axios.get(url);
  const html = response.data;
  const $ = cheerio.load(html);
  const games = [];
  
  const lcpList = $("#lcp_instance_0 li a, .lcp_catlist li a");
  
  lcpList.each((index, el) => {
    const $link = $(el);
    const title = $link.text().trim();
    const link = $link.attr("href");
    
    if (title && link) {
      // Extract slug from URL
      const urlParts = link.split("/").filter(Boolean);
      const slug = urlParts[urlParts.length - 1] || title.toLowerCase().replace(/\s+/g, "-");
      
      games.push({
        id: slug,
        slug: slug,
        title: title,
        link: link
      });
    }
  });
  
  return games;
}

async function getTotalPages() {
  try {
    const response = await axios.get("https://fitgirl-repacks.site/all-my-repacks-a-z/");
    const $ = cheerio.load(response.data);
    
    let maxPage = 1;
    
    // Look for pagination links
    $(".lcp_paginator a, .pagination a").each((i, el) => {
      const href = $(el).attr("href");
      if (href && href.includes("lcp_page0=")) {
        const match = href.match(/lcp_page0=(\d+)/);
        if (match) {
          const pageNum = parseInt(match[1], 10);
          if (pageNum > maxPage) {
            maxPage = pageNum;
          }
        }
      }
    });
    
    // Also check for direct page number text
    $(".lcp_paginator a, .pagination a").each((i, el) => {
      const text = $(el).text().trim();
      const pageNum = parseInt(text, 10);
      if (!isNaN(pageNum) && pageNum > maxPage) {
        maxPage = pageNum;
      }
    });
    
    return maxPage;
  } catch (error) {
    console.error("Error detecting total pages:", error.message);
    return 127; // Default fallback
  }
}

async function fetchAllFitGirlGames() {
  if (fitGirlCache) {
    return fitGirlCache;
  }
  
  const totalPages = await getTotalPages();
  console.log(`Fetching all games from FitGirl (${totalPages} pages, this may take a while)...`);
  const allGames = [];
  const seenSlugs = new Set();
  
  for (let page = 1; page <= totalPages; page++) {
    try {
      const games = await fetchFitGirlGames(page);
      
      // Filter duplicates
      const uniqueGames = games.filter(game => {
        if (seenSlugs.has(game.slug)) {
          return false;
        }
        seenSlugs.add(game.slug);
        return true;
      });
      
      allGames.push(...uniqueGames);
      
      if (page % 10 === 0) {
        console.log(`Progress: ${page}/${totalPages} pages scraped...`);
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (error) {
      console.error(`Error scraping page ${page}:`, error.message);
    }
  }
  
  console.log(`Scraping complete! Found ${allGames.length} unique games.`);
  fitGirlCache = allGames;
  return allGames;
}

async function getIgdbAccessToken() {
  if (!IGDB_CLIENT_ID || !IGDB_CLIENT_SECRET) {
    return null;
  }
  const now = Date.now();
  // Deja al menos 60 segundos de margen antes de que expire
  if (igdbAccessToken && igdbTokenExpiresAt - now > 60 * 1000) {
    return igdbAccessToken;
  }
  try {
    const response = await axios.post(
      "https://id.twitch.tv/oauth2/token",
      null,
      {
        params: {
          client_id: IGDB_CLIENT_ID,
          client_secret: IGDB_CLIENT_SECRET,
          grant_type: "client_credentials",
        },
      }
    );
    const data = response.data || {};
    if (!data.access_token) {
      return null;
    }
    igdbAccessToken = data.access_token;
    const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 0;
    igdbTokenExpiresAt = Date.now() + expiresIn * 1000;
    return igdbAccessToken;
  } catch (error) {
    return null;
  }
}

async function fetchIgdbData(title) {
  if (!IGDB_CLIENT_ID || !IGDB_CLIENT_SECRET) {
    return { image: null, year: null };
  }
  const cacheKey = title.toLowerCase();
  if (igdbCache[cacheKey]) {
    return igdbCache[cacheKey];
  }
  const safeTitle = title.replace(/"/g, "\\\"");
  const query = `search "${safeTitle}"; fields name, first_release_date, cover.image_id; limit 1;`;
  try {
    const accessToken = await getIgdbAccessToken();
    if (!accessToken) {
      return { image: null, year: null };
    }
    const response = await axios.post(
      "https://api.igdb.com/v4/games",
      query,
      {
        headers: {
          "Client-ID": IGDB_CLIENT_ID,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "text/plain",
          Accept: "application/json",
        },
      }
    );
    const results = Array.isArray(response.data) ? response.data : [];
    const game = results[0];
    if (!game) {
      return { image: null, year: null };
    }

    let image = null;
    if (game.cover && game.cover.image_id) {
      image = `https://images.igdb.com/igdb/image/upload/t_cover_big/${game.cover.image_id}.jpg`;
    }

    let year = null;
    if (game.first_release_date) {
      const d = new Date(game.first_release_date * 1000);
      if (!isNaN(d.getTime())) {
        year = d.getFullYear();
      }
    }
    const result = { image, year };
    igdbCache[cacheKey] = result;
    return result;
  } catch (error) {
    return { image: null, year: null };
  }
}

async function buildGamesData() {
  let existingGames = [];
  try {
    const fileContent = await fs.promises.readFile(DB_PATH, "utf-8");
    const parsed = JSON.parse(fileContent);
    if (Array.isArray(parsed)) {
      existingGames = parsed;
    }
  } catch (error) {
  }
  const existingBySlug = new Map();
  for (const game of existingGames) {
    if (game && typeof game.slug === "string") {
      existingBySlug.set(game.slug, game);
    }
  }

  fitGirlCache = null;
  const gamesData = await fetchAllFitGirlGames();
  const games = [];
  
  for (const item of gamesData) {
    const existingGame = existingBySlug.get(item.slug);
    
    if (existingGame) {
      // Use existing data to preserve IGDB info
      games.push({
        id: item.slug,
        slug: item.slug,
        title: item.title,
        link: item.link,
        image: existingGame.image || null,
        year: typeof existingGame.year === "number" ? existingGame.year : null,
      });
      continue;
    }
    
    // Fetch IGDB data for new games
    const igdbData = await fetchIgdbData(item.title);
    games.push({
      id: item.slug,
      slug: item.slug,
      title: item.title,
      link: item.link,
      image: igdbData.image,
      year: igdbData.year,
    });
  }
  
  return games;
}

async function getGames() {
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  if (gamesCache && gamesCacheDate === todayKey) {
    return gamesCache;
  }

  try {
    const stats = await fs.promises.stat(DB_PATH);
    const fileDate = stats.mtime;
    const fileKey = fileDate.toISOString().slice(0, 10);
    if (fileKey === todayKey) {
      const fileContent = await fs.promises.readFile(DB_PATH, "utf-8");
      const parsed = JSON.parse(fileContent);
      if (Array.isArray(parsed)) {
        gamesCache = parsed;
        gamesCacheDate = todayKey;
        return gamesCache;
      }
    }
  } catch (error) {
  }

  const games = await buildGamesData();
  gamesCache = games;
  gamesCacheDate = todayKey;
  try {
    await fs.promises.writeFile(DB_PATH, JSON.stringify(games, null, 2));
  } catch (error) {
  }
  return games;
}

app.get("/api/games", async (req, res) => {
  try {
    const gamesData = await getGames();
    let limit = gamesData.length;
    if (req.query.limit) {
      const parsed = parseInt(req.query.limit, 10);
      if (!isNaN(parsed) && parsed > 0) {
        limit = parsed;
      }
    }
    const selected = gamesData.slice(0, limit);
    res.json(selected);
  } catch (error) {
    res.status(500).json({ error: "No se pudo obtener la lista de juegos" });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(port, () => {
  console.log("Servidor escuchando en el puerto " + port);
  console.log("Note: First request may take a while as it scrapes all 127 pages");
});
