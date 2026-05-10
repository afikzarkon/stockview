const axios = require('axios');

const DEFAULT_API_BASE = 'https://api.tase.co.il/api';

/** Headers that mimic market.tase.co.il callers; required to pass Imperva/Incapsula for many IPs. */
function buildTaseRequestHeaders() {
  const ua =
    String(process.env.TASE_HTTP_USER_AGENT || '').trim() ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  return {
    'User-Agent': ua,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': process.env.TASE_LANG === 'en' ? 'en-US,en;q=0.9' : 'he-IL,he;q=0.9,en;q=0.8',
    Origin: String(process.env.TASE_HTTP_ORIGIN || 'https://market.tase.co.il').trim(),
    Referer: String(process.env.TASE_HTTP_REFERER || 'https://market.tase.co.il/').trim()
  };
}

function pickQuoteFromLastRates(lastRates) {
  if (!Array.isArray(lastRates) || lastRates.length === 0) return null;
  const intraday = lastRates.find((r) => r && r.InDay);
  if (intraday && intraday.Rate != null) return intraday;
  const closing =
    lastRates.find((r) => r && (r.TradingStage === 'מנ' || String(r.TradingStageDesc || '').includes('נעילה'))) ||
    lastRates.find((r) => r && String(r.TradingStageDesc || '').includes('מסחר'));
  if (closing && closing.Rate != null) return closing;
  const firstRated = lastRates.find((r) => r && r.Rate != null && Number.isFinite(Number(r.Change)));
  return firstRated || lastRates[0];
}

function pickFromLastDaysData(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const row = rows[0];
  if (!row || row.LastRate == null) return null;
  return row;
}

/**
 * Fetches TASE "majordata" JSON (same source as דף הנייר ב-market.tase).
 * `compId=0` is accepted by the public API when only מספר נייר ידוע (מנסה מהבנדל הרשמי).
 */
async function fetchIsraeliQuoteFromTaseMajorData(stockId) {
  const secId = String(stockId || '').trim();
  const base = String(process.env.TASE_API_BASE_URL || DEFAULT_API_BASE).replace(/\/$/, '');
  const lang = String(process.env.TASE_LANG || 'he').trim().toLowerCase() === 'en' ? 'en' : 'he';
  const url = `${base}/security/majordata`;
  const { data } = await axios.get(url, {
    params: { secId, compId: String(process.env.TASE_COMPANY_ID || '0').trim(), lang },
    headers: buildTaseRequestHeaders(),
    timeout: Number(process.env.TASE_HTTP_TIMEOUT_MS || 14000)
  });

  if (!data || typeof data !== 'object' || (!data.LastRates && !data.LastDaysData))
    throw new Error(typeof data === 'object' && data.Message ? String(data.Message) : 'tase unexpected response');

  const fromRates = pickQuoteFromLastRates(data.LastRates);
  let currentPrice = null;
  let changePercent = null;

  if (fromRates && fromRates.Rate != null) {
    currentPrice = Math.round(Number(fromRates.Rate));
    changePercent =
      fromRates.Change == null ? null : Number.parseFloat(String(fromRates.Change).replace(',', '.'));
    if (!Number.isFinite(changePercent)) changePercent = null;
  }

  if (currentPrice == null) {
    const dayRow = pickFromLastDaysData(data.LastDaysData);
    if (dayRow) {
      currentPrice = Math.round(Number(dayRow.LastRate));
      changePercent =
        dayRow.Change == null ? null : Number.parseFloat(String(dayRow.Change).replace(',', '.'));
      if (!Number.isFinite(changePercent)) changePercent = null;
    }
  }

  if (currentPrice == null && changePercent == null)
    throw new Error('tase majordata parse miss');

  return {
    currentPrice,
    changePercent,
    symbol: `${secId}:TASE`
  };
}

module.exports = {
  fetchIsraeliQuoteFromTaseMajorData
};
