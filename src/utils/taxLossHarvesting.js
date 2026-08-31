// Tax-loss harvesting: a portfolio-wide view of which currently-held
// positions have a real (CPI/currency-adjusted) loss right now, and what
// realizing that loss could be worth in tax terms if offset against real
// gains elsewhere in the portfolio this tax year.
//
// This deliberately reuses the exact same per-position real gain/tax
// functions already used throughout the app (calculateStockRealGainTax,
// calculateAmericanStockMetrics, calculatePensionRealGainTax) rather than
// recomputing anything independently - so a number shown here always
// matches what the same position shows in its own table row, instead of
// risking two slightly-different "real gain" calculations drifting apart.
//
// Not tax advice: offsetting rules (same tax year, carry-forward,
// matching asset classes) are more complex than "loss cancels gain" and
// vary by situation - see cpiTax.js's own disclaimer. This surfaces
// candidates and an estimate, not a recommendation to sell.

import { calculateStockRealGainTax, calculatePensionRealGainTax, monthKeyFromDate } from './cpiTax';
import { calculateAmericanStockMetrics } from './portfolioMath';
import { normalizeIsraeliPrice } from './formatters';

const buildIsraeliPosition = (stock, cpi) => {
  // normalizeIsraeliPrice matters here: a live-refreshed price is already
  // in shekels, but a manually-entered one may still be in agorot (TASE's
  // own display convention) - see IsraeliStocksTable.js / portfolioSummary.js
  // for the same pattern. Skipping this would silently overstate the
  // position's value 100x whenever the raw stored price happens to be in
  // agorot, which would show a real gain/loss ~100x too large here.
  const displayCurrentPrice = normalizeIsraeliPrice(stock.currentPrice);
  const totalCurrentValue = (displayCurrentPrice || 0) * (stock.quantity || 0);
  const currentIndex = cpi ? cpi.currentIndex : null;
  const indexAtPurchase = cpi && cpi.indexByMonth ? cpi.indexByMonth[monthKeyFromDate(stock.purchaseDate)] : null;

  let realGain;
  if (currentIndex && indexAtPurchase) {
    realGain = calculateStockRealGainTax({
      purchasePrice: stock.purchasePrice,
      quantity: stock.quantity,
      currentValue: totalCurrentValue,
      indexAtPurchase,
      currentIndex
    }).realGain;
  } else {
    // Same fallback as IsraeliStocksTable.js when CPI data isn't
    // available yet: flat nominal gain, no linkage adjustment.
    realGain = totalCurrentValue - (stock.purchasePrice || 0) * (stock.quantity || 0);
  }

  return {
    id: stock.id,
    name: stock.stockName,
    category: 'israeli',
    categoryLabel: 'בורסה ישראלית',
    realGain,
    taxRate: 0.25
  };
};

const buildAmericanPosition = (stock) => {
  const metrics = calculateAmericanStockMetrics(stock);
  return {
    id: stock.id,
    name: stock.stockName,
    category: 'american',
    categoryLabel: 'בורסה אמריקאית',
    realGain: metrics.realGainILS,
    taxRate: 0.25
  };
};

const buildPensionPosition = (fund, cpi) => {
  const deposits = Array.isArray(fund.deposits) ? fund.deposits : [];
  const fundCurrentValue = fund.currentValue ?? fund.amount ?? 0;
  const isLinked = !!fund.isLinkedToIndex;
  const currentIndex = cpi ? cpi.currentIndex : null;
  const indexByMonth = cpi && cpi.indexByMonth ? cpi.indexByMonth : {};

  let gain;
  let taxRate = isLinked ? 0.25 : 0.15;
  if (currentIndex) {
    gain = calculatePensionRealGainTax({
      deposits,
      currentValue: fundCurrentValue,
      isLinkedToIndex: isLinked,
      currentIndex,
      indexByMonth
    }).gain;
  } else {
    const totalDeposited = deposits.reduce((sum, d) => sum + (d.amount || 0), 0);
    gain = fundCurrentValue - totalDeposited;
  }

  return {
    id: fund.id,
    name: fund.fundName,
    category: 'pension',
    categoryLabel: 'קופת גמל',
    realGain: gain,
    taxRate
  };
};

export const computeTaxLossHarvestingOpportunities = (
  israeliStocks = [],
  americanStocks = [],
  pensionFunds = [],
  cpi = null
) => {
  const positions = [
    ...israeliStocks.map((s) => buildIsraeliPosition(s, cpi)),
    ...americanStocks.map((s) => buildAmericanPosition(s)),
    ...pensionFunds.map((f) => buildPensionPosition(f, cpi))
  ];

  const lossPositions = positions
    .filter((p) => p.realGain < 0)
    .map((p) => ({ ...p, harvestableLoss: -p.realGain, taxValue: -p.realGain * p.taxRate }))
    .sort((a, b) => b.harvestableLoss - a.harvestableLoss);

  const gainPositions = positions
    .filter((p) => p.realGain > 0)
    .map((p) => ({ ...p, taxValue: p.realGain * p.taxRate }))
    .sort((a, b) => b.realGain - a.realGain);

  const totalHarvestableLoss = lossPositions.reduce((sum, p) => sum + p.harvestableLoss, 0);
  const totalPotentialTaxValue = lossPositions.reduce((sum, p) => sum + p.taxValue, 0);
  const totalCurrentGains = gainPositions.reduce((sum, p) => sum + p.realGain, 0);
  const totalGainsTax = gainPositions.reduce((sum, p) => sum + p.taxValue, 0);

  return {
    lossPositions,
    gainPositions,
    totalHarvestableLoss,
    totalPotentialTaxValue,
    totalCurrentGains,
    totalGainsTax,
    hasLossPositions: lossPositions.length > 0,
    hasGainPositions: gainPositions.length > 0
  };
};
