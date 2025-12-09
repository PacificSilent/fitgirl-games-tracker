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

// Default: Check first 5 pages (newest games are usually on first pages)
const PAGES_TO_CHECK = process.env.UPDATE_PAGES || 5;

// Delay helper to avoid rate limiting
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getIgdbAccessToken() {
  if (!IGDB_CLIENT_ID || !IGDB_CLIENT_SECRET) {
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
    return igdbAccessToken;
  } catch (error) {
    console.error("❌ Error getting IGDB token:", error.message);
    return null;
  }
}

function cleanGameTitle(title) {
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
  
  const cleanedTitle = cleanGameTitle(title);
  const safeTitle = cleanedTitle.replace(/"/g, '\\"');
  
  const searchStrategies = [
    `search "${safeTitle}"; fields name, first_release_date, cover.image_id; limit 3;`,
    `fields name, first_release_date, cover.image_id; where name ~ *"${safeTitle}"*; limit 3;`
  ];
  
  try {
    const accessToken = await getIgdbAccessToken();
    if (!accessToken) {
      return { image: null, year: null };
    }
    
    let bestMatch = null;
    
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
        
        for (const game of results) {
          if (game.cover && game.cover.image_id) {
            const gameName = cleanGameTitle(game.name || '').toLowerCase();
            const searchName = cleanedTitle.toLowerCase();
            
            if (gameName.includes(searchName) || searchName.includes(gameName)) {
              bestMatch = game;
              break;
            }
          }
        }
        
        if (bestMatch) break;
        
        if (!bestMatch && results.length > 0) {
          bestMatch = results.find(g => g.cover && g.cover.image_id) || results[0];
        }
        
        if (bestMatch) break;
      } catch (strategyError) {
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
  } catch (error) {
    console.error(`❌ Error scraping page ${pageNumber}:`, error.message);
    return [];
  }
}

async function loadExistingDatabase() {
  try {
    const fileContent = await fs.promises.readFile(DB_PATH, "utf-8");
    const parsed = JSON.parse(fileContent);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (error) {
    console.log("⚠️  No existing database found, will create new one.");
  }
  return [];
}

async function checkForNewGames() {
  console.log("╔════════════════════════════════════════════════════╗");
  console.log("║    FitGirl Repacks - Quick Update Checker         ║");
  console.log("╚════════════════════════════════════════════════════╝\n");
  
  // Load existing database
  console.log("📂 Loading existing database...");
  const existingGames = await loadExistingDatabase();
  const existingSlugs = new Set(existingGames.map(g => g.slug));
  console.log(`   ✅ Found ${existingGames.length} existing games\n`);
  
  // Scrape first N pages
  console.log(`🔍 Checking first ${PAGES_TO_CHECK} pages for new games...\n`);
  const scrapedGames = [];
  const seenSlugs = new Set();
  
  for (let page = 1; page <= PAGES_TO_CHECK; page++) {
    console.log(`📄 Scraping page ${page}/${PAGES_TO_CHECK}...`);
    const games = await scrapePage(page);
    
    // Filter duplicates within scraped data
    const uniqueGames = games.filter(game => {
      if (seenSlugs.has(game.slug)) {
        return false;
      }
      seenSlugs.add(game.slug);
      return true;
    });
    
    scrapedGames.push(...uniqueGames);
    console.log(`   ✅ Found ${games.length} games on page`);
    
    await delay(500);
  }
  
  // Find new games (not in existing database)
  const newGames = scrapedGames.filter(game => !existingSlugs.has(game.slug));
  
  console.log(`\n📊 Summary:`);
  console.log(`   Total games scraped: ${scrapedGames.length}`);
  console.log(`   New games found: ${newGames.length}`);
  
  if (newGames.length === 0) {
    console.log("\n✅ No new games found. Database is up to date!\n");
    return;
  }
  
  console.log(`\n🆕 New games to add:`);
  newGames.forEach((game, idx) => {
    console.log(`   ${idx + 1}. ${game.title}`);
  });
  
  // Enrich new games with IGDB data
  console.log(`\n🎮 Enriching ${newGames.length} new games with IGDB data...\n`);
  const enrichedNewGames = [];
  
  for (let i = 0; i < newGames.length; i++) {
    const game = newGames[i];
    const igdbData = await fetchIgdbData(game.title);
    
    enrichedNewGames.push({
      id: game.slug,
      slug: game.slug,
      title: game.title,
      link: game.link,
      image: igdbData.image,
      year: igdbData.year
    });
    
    console.log(`   ✅ ${i + 1}/${newGames.length} - ${game.title}`);
    
    // Delay every 4 requests to respect IGDB rate limits
    if (i % 4 === 0 && i > 0) {
      await delay(1000);
    }
  }
  
  // Merge with existing database (new games at the beginning)
  const updatedDatabase = [...enrichedNewGames, ...existingGames];
  
  // Save updated database
  console.log(`\n💾 Saving updated database...`);
  try {
    await fs.promises.writeFile(DB_PATH, JSON.stringify(updatedDatabase, null, 2));
    console.log(`   ✅ Database saved to ${DB_PATH}`);
    console.log(`   Total games: ${updatedDatabase.length}`);
    console.log(`   Added: ${enrichedNewGames.length} new games`);
  } catch (error) {
    console.error("❌ Error saving database:", error.message);
  }
  
  console.log("\n🎉 Update complete!\n");
}

// Run the update checker
checkForNewGames().catch(error => {
  console.error("\n❌ Fatal error:", error.message);
  console.error(error.stack);
});
