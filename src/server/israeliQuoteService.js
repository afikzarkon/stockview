const { fetchIsraeliQuoteFromTaseMajorData } = require('./taseIsraeliQuote');
const { scrapeTaseMajorData } = require('./taseScraper');

const ALLOWED_STEPS = new Set(['tase', 'tase_scrape']);
const DEFAULT_PIPELINE = 'tase,tase_scrape';

function normalizePipeline(raw) {
  const s = String(raw || '').trim();
  const parts = (s.length ? s : DEFAULT_PIPELINE)
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);

  const filtered = parts.filter((p) => ALLOWED_STEPS.has(p));
  return filtered.length > 0 ? filtered : DEFAULT_PIPELINE.split(',');
}

/**
 * Resolver order from ISRAELI_QUOTE_PIPELINE (default: tase,tase_scrape).
 *
 * Steps:
 *   tase         - TASE Majordata JSON (fast, ~500ms; same data the site loads).
 *   tase_scrape  - Headless-browser scrape of the rendered major_data HTML page
 *                  (the literal "שער אחרון" / "שינוי" displayed on
 *                  market.tase.co.il). Slow (~4-5s) but useful when the JSON
 *                  endpoint is blocked / changed, and supports name lookups
 *                  via the alias map in taseScraper.js.
 */
async function fetchIsraeliStockQuote(cacheKey) {
  const pipeline = normalizePipeline(process.env.ISRAELI_QUOTE_PIPELINE);
  const errors = [];

  for (const step of pipeline) {
    try {
      if (step === 'tase') {
        const r = await fetchIsraeliQuoteFromTaseMajorData(cacheKey);
        if (r.currentPrice != null || r.changePercent != null)
          return { ...r, sourceLabel: 'tase_majordata', symbolUsed: r.symbol };
      }
      if (step === 'tase_scrape') {
        const r = await scrapeTaseMajorData(cacheKey);
        if (r.lastRate != null || r.changePercent != null) {
          return {
            currentPrice: r.lastRate != null ? Math.round(r.lastRate) : null,
            changePercent: r.changePercent,
            sourceLabel: 'tase_html_scrape',
            symbolUsed: r.secId
              ? `${r.secId}:TASE${r.securityName ? `(${r.securityName})` : ''}`
              : null
          };
        }
      }
    } catch (e) {
      errors.push(`${step}:${e && e.message ? e.message : e}`);
    }
  }

  const err = new Error(`Israeli quote failed: ${errors.join(' | ')}`);
  err.pipelineErrors = errors;
  throw err;
}

module.exports = {
  fetchIsraeliStockQuote,
  normalizePipeline
};
