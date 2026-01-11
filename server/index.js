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

function cleanGameTitle(title) {
  // Remove common patterns to get cleaner game name
  let cleaned = title;
  
  // Remove version numbers (v1.0, v2.3.1, etc.)
  cleaned = cleaned.replace(/\s+v?\d+\.\d+(\.\d+)?(\.\d+)?/gi, '');
  
  // Remove "Repack" and similar terms
  cleaned = cleaned.replace(/\s*-?\s*(repack|fitgirl|repacks?)\s*/gi, ' ');
  
  // Remove content in parentheses and brackets (usually versions, editions)
  cleaned = cleaned.replace(/\s*[\(\[].*?[\)\]]/g, '');
  
  // Remove "Edition", "Complete", "GOTY", etc.
  cleaned = cleaned.replace(/\s+(edition|complete|goty|deluxe|ultimate|enhanced|definitive|remastered|remake|hd|directors?\s+cut)/gi, '');
  
  // Remove plus signs and ampersands with spaces
  cleaned = cleaned.replace(/\s*[\+\&]\s*/g, ' ');
  
  // Remove extra whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
}

async function fetchIgdbData(title) {
  if (!IGDB_CLIENT_ID || !IGDB_CLIENT_SECRET) {
    return { image: null, year: null };
  }
  const cacheKey = title.toLowerCase();
  if (igdbCache[cacheKey]) {
    return igdbCache[cacheKey];
  }
  
  // Clean the title for better search results
  const cleanedTitle = cleanGameTitle(title);
  const safeTitle = cleanedTitle.replace(/"/g, "\\\"");
  
  // Try multiple search strategies
  const searchStrategies = [
    // Strategy 1: Exact search with cleaned title
    `search "${safeTitle}"; fields name, first_release_date, cover.image_id; limit 3;`,
    // Strategy 2: Search by name field (more flexible)
    `fields name, first_release_date, cover.image_id; where name ~ *"${safeTitle}"*; limit 3;`
  ];
  
  try {
    const accessToken = await getIgdbAccessToken();
    if (!accessToken) {
      return { image: null, year: null };
    }
    
    let bestMatch = null;
    
    // Try each strategy until we find a match
    for (const query of searchStrategies) {
      try {
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
        
        // Find best match by comparing cleaned names
        for (const game of results) {
          if (game.cover && game.cover.image_id) {
            const gameName = cleanGameTitle(game.name || '').toLowerCase();
            const searchName = cleanedTitle.toLowerCase();
            
            // Check if names match closely
            if (gameName.includes(searchName) || searchName.includes(gameName)) {
              bestMatch = game;
              break;
            }
          }
        }
        
        // If we found a match with cover, use it
        if (bestMatch) break;
        
        // Otherwise, use first result with cover
        if (!bestMatch && results.length > 0) {
          bestMatch = results.find(g => g.cover && g.cover.image_id) || results[0];
        }
        
        if (bestMatch) break;
      } catch (strategyError) {
        // Continue to next strategy
        continue;
      }
    }
    
    if (!bestMatch) {
      const result = { image: null, year: null };
      igdbCache[cacheKey] = result;
      return result;
    }

    let image = null;
    if (bestMatch.cover && bestMatch.cover.image_id) {
      image = `https://images.igdb.com/igdb/image/upload/t_cover_big/${bestMatch.cover.image_id}.jpg`;
    }

    let year = null;
    if (bestMatch.first_release_date) {
      const d = new Date(bestMatch.first_release_date * 1000);
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
  // Si ya tenemos caché en memoria, retornarlo
  if (gamesCache) {
    return gamesCache;
  }

  // Intentar cargar de db.json primero
  try {
    const fileContent = await fs.promises.readFile(DB_PATH, "utf-8");
    const parsed = JSON.parse(fileContent);
    if (Array.isArray(parsed) && parsed.length > 0) {
      console.log(`\u2713 Loaded ${parsed.length} games from database`);
      gamesCache = parsed;
      return gamesCache;
    }
  } catch (error) {
    console.log("⚠️  No database found. Please run 'npm run scrape' to build the database.");
  }

  // Si no existe db.json, retornar array vacío y sugerir ejecutar el scraper
  return [];
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
  console.log("\n🚀 Servidor escuchando en el puerto " + port);
  console.log("💾 Database: " + DB_PATH);
  
  // Verificar si existe la base de datos
  try {
    if (fs.existsSync(DB_PATH)) {
      const stats = fs.statSync(DB_PATH);
      const fileSize = (stats.size / 1024 / 1024).toFixed(2);
      console.log("✓ Database found (" + fileSize + " MB)");
    } else {
      console.log("⚠️  No database found!");
      console.log("🛠️  Run 'npm run scrape' to build the complete database");
      console.log("🛠️  Or run 'npm run update' to fetch new games only\n");
    }
  } catch (error) {
    console.log("⚠️  Error checking database");
  }
});
