require("dotenv").config();
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const IGDB_CLIENT_ID = process.env.IGDB_CLIENT_ID;
const IGDB_CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET;
let igdbAccessToken = null;
let igdbTokenExpiresAt = 0;
const igdbCache = {};

const BASE_URL = "https://fitgirl-repacks.site/all-my-repacks-a-z/";
const DB_PATH = path.join(__dirname, "db.json");

// Delay helper to avoid rate limiting
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getTotalPages() {
  try {
    console.log("🔍 Detecting total number of pages...");
    const response = await axios.get(BASE_URL);
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
    
    console.log(`✅ Found ${maxPage} total pages\n`);
    return maxPage;
  } catch (error) {
    console.error("❌ Error detecting total pages:", error.message);
    console.log("⚠️  Defaulting to 127 pages");
    return 127;
  }
}

async function getIgdbAccessToken() {
  if (!IGDB_CLIENT_ID || !IGDB_CLIENT_SECRET) {
    console.log("⚠️  IGDB credentials not found. Skipping IGDB enrichment.");
    return null;
  }
  const now = Date.now();
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
    console.log("✅ IGDB access token obtained");
    return igdbAccessToken;
  } catch (error) {
    console.error("❌ Error getting IGDB token:", error.message);
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
  
  const safeTitle = title.replace(/"/g, '\\"');
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
      const result = { image: null, year: null };
      igdbCache[cacheKey] = result;
      return result;
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
    console.error(`Error fetching IGDB data for "${title}":`, error.message);
    return { image: null, year: null };
  }
}

async function scrapePage(pageNumber) {
  const url = pageNumber === 1 
    ? BASE_URL 
    : `${BASE_URL}?lcp_page0=${pageNumber}`;
  
  try {
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    
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
          link: link,
          image: null,
          year: null
        });
      }
    });
    
    return games;
  } catch (error) {
    console.error(`❌ Error scraping page ${pageNumber}:`, error.message);
    return [];
  }
}

async function scrapeAllPages() {
  const totalPages = await getTotalPages();
  console.log(`\n🚀 Starting to scrape ${totalPages} pages...\n`);
  
  const allGames = [];
  const seenSlugs = new Set();
  
  for (let page = 1; page <= totalPages; page++) {
    console.log(`📄 Scraping page ${page}/${totalPages}...`);
    
    const games = await scrapePage(page);
    
    // Filter duplicates
    const uniqueGames = games.filter(game => {
      if (seenSlugs.has(game.slug)) {
        return false;
      }
      seenSlugs.add(game.slug);
      return true;
    });
    
    allGames.push(...uniqueGames);
    console.log(`   ✅ Found ${games.length} games (${uniqueGames.length} unique)`);
    
    // Add delay to avoid rate limiting (every 10 pages)
    if (page % 10 === 0) {
      console.log(`   ⏳ Pausing for 2 seconds... (${page}/${totalPages})`);
      await delay(2000);
    } else {
      await delay(500);
    }
  }
  
  console.log(`\n✅ Scraping complete! Total unique games: ${allGames.length}\n`);
  return allGames;
}

async function enrichWithIgdb(games) {
  console.log(`\n🎮 Enriching ${games.length} games with IGDB data...\n`);
  
  // Load existing data to preserve IGDB info
  let existingGames = [];
  try {
    const fileContent = await fs.promises.readFile(DB_PATH, "utf-8");
    const parsed = JSON.parse(fileContent);
    if (Array.isArray(parsed)) {
      existingGames = parsed;
    }
  } catch (error) {
    console.log("No existing database found, starting fresh.");
  }
  
  const existingBySlug = new Map();
  for (const game of existingGames) {
    if (game && typeof game.slug === "string") {
      existingBySlug.set(game.slug, game);
    }
  }
  
  const enrichedGames = [];
  let enrichedCount = 0;
  let cachedCount = 0;
  
  for (let i = 0; i < games.length; i++) {
    const game = games[i];
    const existing = existingBySlug.get(game.slug);
    
    // If we have existing IGDB data, use it
    if (existing && (existing.image || existing.year)) {
      enrichedGames.push({
        ...game,
        image: existing.image,
        year: existing.year
      });
      cachedCount++;
    } else {
      // Fetch new IGDB data
      const igdbData = await fetchIgdbData(game.title);
      enrichedGames.push({
        ...game,
        image: igdbData.image,
        year: igdbData.year
      });
      
      if (igdbData.image || igdbData.year) {
        enrichedCount++;
      }
      
      // Add delay every 4 requests to respect IGDB rate limits
      if (i % 4 === 0 && i > 0) {
        await delay(1000);
      }
    }
    
    // Progress update every 50 games
    if ((i + 1) % 50 === 0) {
      console.log(`   📊 Progress: ${i + 1}/${games.length} games processed`);
    }
  }
  
  console.log(`\n✅ Enrichment complete!`);
  console.log(`   📦 Cached: ${cachedCount} games`);
  console.log(`   🆕 Newly enriched: ${enrichedCount} games`);
  console.log(`   ⚠️  Not found: ${games.length - cachedCount - enrichedCount} games\n`);
  
  return enrichedGames;
}

async function saveToDatabase(games) {
  try {
    await fs.promises.writeFile(DB_PATH, JSON.stringify(games, null, 2));
    console.log(`✅ Database saved to ${DB_PATH}`);
    console.log(`   Total games: ${games.length}`);
  } catch (error) {
    console.error("❌ Error saving database:", error.message);
  }
}

async function main() {
  console.log("╔════════════════════════════════════════════════════╗");
  console.log("║     FitGirl Repacks - Complete Scraper v2.0       ║");
  console.log("╚════════════════════════════════════════════════════╝");
  
  try {
    // Step 1: Scrape all pages
    const games = await scrapeAllPages();
    
    if (games.length === 0) {
      console.error("❌ No games found. Exiting.");
      return;
    }
    
    // Step 2: Enrich with IGDB data
    const enrichedGames = await enrichWithIgdb(games);
    
    // Step 3: Save to database
    await saveToDatabase(enrichedGames);
    
    console.log("\n🎉 All done! Your database is ready.\n");
    
  } catch (error) {
    console.error("\n❌ Fatal error:", error.message);
    console.error(error.stack);
  }
}

// Run the scraper
main();
