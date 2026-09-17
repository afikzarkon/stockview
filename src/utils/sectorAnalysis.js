// Diversification by sector — a different question from exchangeDistribution
// (portfolioAnalysis.js), which only answers "how much is in Israeli vs.
// American stocks". Someone can hold 10 different US tickers and still be
// heavily concentrated in one sector; this is only visible once you group
// by sector instead of by exchange.
//
// American stocks: sector comes from Yahoo Finance, keyed by ticker
// (sectorBySymbol, from useStockSectors.js/server/sectorRoutes.js) - fully
// automatic. Israeli/TASE holdings have no Yahoo-compatible ticker, so
// there's no automatic sector source for them - instead, an optional
// manual `sector` field on the item itself (set via a dropdown in
// FinancialAccountsTables.js, using the same SECTOR_LABELS_HE keys as the
// American side so the two consolidate into the same buckets) is used
// when present. A holding with neither falls into UNCLASSIFIED_SECTOR_KEY,
// same as before.

import { calculateAmericanStockMetrics } from './portfolioMath';
import { normalizeIsraeliPrice, toNum } from './formatters';
import { UNCLASSIFIED_SECTOR_KEY } from './sectorLabels';

function addToSector(totalsBySector, sectorKey, value, symbol) {
  if (!totalsBySector[sectorKey]) {
    totalsBySector[sectorKey] = { sectorKey, value: 0, symbols: new Set() };
  }
  totalsBySector[sectorKey].value += value;
  if (symbol) totalsBySector[sectorKey].symbols.add(symbol);
}

// sectorBySymbol: { [symbol]: { sector: string|null, industry: string|null } }
// israeliStocks (optional): each item may carry its own manually-tagged
// `sector` field (a SECTOR_LABELS_HE key, or absent/falsy for unclassified).
export const computeSectorDistribution = (americanStocks, sectorBySymbol, israeliStocks = []) => {
  const stocks = Array.isArray(americanStocks) ? americanStocks : [];
  const bySymbol = sectorBySymbol || {};
  const israeli = Array.isArray(israeliStocks) ? israeliStocks : [];

  const totalsBySector = {};
  let totalValueILS = 0;

  stocks.forEach((stock) => {
    const metrics = calculateAmericanStockMetrics(stock);
    const value = metrics.totalCurrentValueILS;
    totalValueILS += value;

    const symbol = String(stock.stockName || '').trim().toUpperCase();
    const sectorKey = bySymbol[symbol]?.sector || UNCLASSIFIED_SECTOR_KEY;
    addToSector(totalsBySector, sectorKey, value, symbol);
  });

  israeli.forEach((stock) => {
    const value = toNum(normalizeIsraeliPrice(stock.currentPrice)) * toNum(stock.quantity);
    totalValueILS += value;

    const sectorKey = stock.sector || UNCLASSIFIED_SECTOR_KEY;
    addToSector(totalsBySector, sectorKey, value, stock.stockName);
  });

  const sectors = Object.values(totalsBySector)
    .map((entry) => ({
      sectorKey: entry.sectorKey,
      value: entry.value,
      percentage: totalValueILS > 0 ? (entry.value / totalValueILS) * 100 : 0,
      symbolCount: entry.symbols.size
    }))
    .sort((a, b) => b.value - a.value);

  const topSectorPercent = sectors.length ? sectors[0].percentage : 0;

  return {
    totalValueILS,
    sectors,
    hasData: sectors.length > 0,
    topSectorPercent
  };
};
