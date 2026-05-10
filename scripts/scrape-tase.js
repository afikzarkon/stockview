#!/usr/bin/env node
// CLI helper for the TASE scraper.
//
// Usage:
//   node scripts/scrape-tase.js 1159250
//   node scripts/scrape-tase.js 01159250
//   node scripts/scrape-tase.js "טבע"
//   node scripts/scrape-tase.js TEVA
//
// Prints the scraped שער אחרון + שינוי % to stdout as JSON.

const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { scrapeTaseMajorData, closeTaseBrowser } = require('../src/server/taseScraper');

async function main() {
  const query = (process.argv[2] || '').trim();
  if (!query) {
    console.error('Usage: node scripts/scrape-tase.js <secId|name>');
    process.exit(1);
  }

  const startedAt = Date.now();
  try {
    const r = await scrapeTaseMajorData(query);
    const elapsedMs = Date.now() - startedAt;
    console.log(
      JSON.stringify(
        {
          query: r.query,
          secId: r.secId,
          securityName: r.securityName,
          lastRate: r.lastRate,
          changePercent: r.changePercent,
          source: r.source,
          url: r.url,
          elapsedMs
        },
        null,
        2
      )
    );
  } catch (err) {
    console.error('Scrape failed:', err && err.message ? err.message : err);
    if (err && err.debug) {
      console.error('Debug:', JSON.stringify(err.debug, null, 2));
    }
    process.exitCode = 2;
  } finally {
    await closeTaseBrowser();
  }
}

main();
