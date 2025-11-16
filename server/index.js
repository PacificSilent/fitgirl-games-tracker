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

async function fetchFitGirlSlugs() {
  if (fitGirlCache) {
    return fitGirlCache;
  }
  const url = "https://fitgirl-repacks.site/updates-list/";
  const response = await axios.get(url);
  const html = response.data;
  const $ = cheerio.load(html);
  const slugs = [];
  $(".su-spoiler").each((_, spoilerEl) => {
    const spoiler = $(spoilerEl);
    const titleEl = spoiler.find(".su-spoiler-title").first();
    let spoilerTitle = "";
    if (titleEl && titleEl.length) {
      const cloned = titleEl.clone();
      cloned.children().remove();
      spoilerTitle = cloned.text().trim();
    }

    let slug = null;
    spoiler.find("a").each((__, linkEl) => {
      if (slug) return;
      const linkText = $(linkEl).text().trim().toLowerCase();
      const href = $(linkEl).attr("href") || "";
      if (!href) return;
      if (!linkText.includes("repack page")) return;

      let cleanedHref = href.trim();
      const domainMarker = "fitgirl-repacks.site/";
      const domainIndex = cleanedHref.indexOf(domainMarker);
      if (domainIndex !== -1) {
        cleanedHref = cleanedHref.slice(domainIndex + domainMarker.length);
      }
      if (cleanedHref.startsWith("/")) {
        cleanedHref = cleanedHref.slice(1);
      }
      const possibleSlug = cleanedHref.split("/")[0];
      if (possibleSlug) {
        slug = possibleSlug;
      }
    });

    if (slug && !slugs.find((item) => item.slug === slug)) {
      slugs.push({ slug, spoilerTitle });
    }
  });
  fitGirlCache = slugs;
  return slugs;
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
  const slugsData = await fetchFitGirlSlugs();
  const games = [];
  for (const item of slugsData) {
    const baseTitle =
      item.spoilerTitle && item.spoilerTitle.trim().length
        ? item.spoilerTitle.trim()
        : item.slug.replace(/-/g, " ").replace(/\s+/g, " ").trim();
    const existingGame = existingBySlug.get(item.slug);
    if (existingGame) {
      games.push({
        id: item.slug,
        slug: item.slug,
        title: baseTitle,
        spoilerTitle: item.spoilerTitle,
        image: existingGame.image || null,
        year:
          typeof existingGame.year === "number" ? existingGame.year : null,
      });
      continue;
    }
    const igdbData = await fetchIgdbData(baseTitle);
    games.push({
      id: item.slug,
      slug: item.slug,
      title: baseTitle,
      spoilerTitle: item.spoilerTitle,
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
  fetchFitGirlSlugs().catch((error) => {
    console.error("Error inicial al obtener la lista de juegos de FitGirl", error);
  });
});
