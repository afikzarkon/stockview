// Diversification by sector — a different question from exchangeDistribution
// (portfolioAnalysis.js), which only answers "how much is in Israeli vs.
// American stocks". Someone can hold 10 different US tickers and still be
// heavily concentrated in one sector; this is only visible once you group
// by sector instead of by exchange.
//
// Scoped to American stocks only: sector data here comes from Yahoo
// Finance keyed by ticker, and Israeli/TASE holdings in this app are
// identified by a TASE security id, not a Yahoo-compatible ticker, so
// there's no sector mapping available for them without a separate data
// source. This is a deliberate, disclosed limitation, not an oversight.

import { calculateAmericanStockMetrics } from './portfolioMath';
import { UNCLASSIFIED_SECTOR_KEY } from './sectorLabels';

// sectorBySymbol: { [symbol]: { sector: string|null, industry: string|null } }
export const computeSectorDistribution = (americanStocks, sectorBySymbol) => {
  const stocks = Array.isArray(americanStocks) ? americanStocks : [];
  const bySymbol = sectorBySymbol || {};

  const totalsBySector = {};
  let totalValueILS = 0;

  stocks.forEach((stock) => {
    const metrics = calculateAmericanStockMetrics(stock);
    const value = metrics.totalCurrentValueILS;
    totalValueILS += value;

    const symbol = String(stock.stockName || '').trim().toUpperCase();
    const sectorKey = bySymbol[symbol]?.sector || UNCLASSIFIED_SECTOR_KEY;

    if (!totalsBySector[sectorKey]) {
      totalsBySector[sectorKey] = { sectorKey, value: 0, symbols: new Set() };
    }
    totalsBySector[sectorKey].value += value;
    if (symbol) totalsBySector[sectorKey].symbols.add(symbol);
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
