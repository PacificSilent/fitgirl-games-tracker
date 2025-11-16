require("dotenv").config();
const axios = require("axios");
const cheerio = require("cheerio");

async function testScraping() {
  try {
    console.log("Fetching page 1...");
    const url = "https://fitgirl-repacks.site/all-my-repacks-a-z/";
    const response = await axios.get(url);
    const html = response.data;
    const $ = cheerio.load(html);

    console.log("\n=== Analyzing page structure ===\n");

    // Try different selectors
    console.log("Looking for list items...");
    const listItems = $("ul li a, ol li a");
    console.log(`Found ${listItems.length} list links`);

    // Look for the specific list container
    const lcpList = $("#lcp_instance_0 li a, .lcp_catlist li a");
    console.log(`Found ${lcpList.length} LCP list links`);

    const games = [];
    lcpList.each((index, el) => {
      const $link = $(el);
      const title = $link.text().trim();
      const link = $link.attr("href");
      
      if (title && link) {
        games.push({
          title,
          link
        });
      }
    });

    console.log(`\n=== Total games found: ${games.length} ===\n`);
    console.log("First 5 games:");
    games.slice(0, 5).forEach((game, i) => {
      console.log(`  ${i + 1}. ${game.title}`);
      console.log(`     ${game.link}`);
    });

    // Check pagination
    const pagination = $(".lcp_paginator a, .pagination a, nav.navigation a");
    console.log(`\n=== Pagination links found: ${pagination.length} ===\n`);
    
    const pageLinks = [];
    pagination.each((i, el) => {
      const href = $(el).attr("href");
      const text = $(el).text().trim();
      if (href && href.includes("lcp_page")) {
        pageLinks.push({ text, href });
      }
    });

    console.log("Sample page links:");
    pageLinks.slice(0, 5).forEach(link => {
      console.log(`  ${link.text}: ${link.href}`);
    });

    // Test page 2
    console.log("\n\n=== Testing page 2 ===\n");
    const page2Url = "https://fitgirl-repacks.site/all-my-repacks-a-z/?lcp_page0=2";
    const response2 = await axios.get(page2Url);
    const $2 = cheerio.load(response2.data);
    
    const lcpList2 = $2("#lcp_instance_0 li a, .lcp_catlist li a");
    console.log(`Found ${lcpList2.length} games on page 2`);

    const games2 = [];
    lcpList2.each((index, el) => {
      const $link = $2(el);
      const title = $link.text().trim();
      const link = $link.attr("href");
      if (title && link) {
        games2.push({ title, link });
      }
    });

    console.log("\nFirst 5 games from page 2:");
    games2.slice(0, 5).forEach((game, i) => {
      console.log(`  ${i + 1}. ${game.title}`);
    });

  } catch (error) {
    console.error("Error:", error.message);
  }
}

testScraping();
