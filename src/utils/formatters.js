// Formatting and small pure helpers used across the app.
// Extracted from App.js — behavior is unchanged, only the location moved.

export const formatDate = (dateString) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('he-IL');
};

export const formatPrice = (price) => {
  if (price === null || price === undefined || isNaN(price)) {
    return '0.00';
  }
  const formattedNumber = price.toFixed(2);
  return parseFloat(formattedNumber).toLocaleString('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

export const formatPriceWithSign = (price) => {
  if (price === null || price === undefined || isNaN(price)) {
    return '0.00';
  }
  const formattedNumber = Math.abs(price).toFixed(2);
  const withCommas = parseFloat(formattedNumber).toLocaleString('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  if (price >= 0) {
    return withCommas;
  } else {
    return `${withCommas}-`;
  }
};

// Normalize Israeli price: if saved in agorot (big number), convert to shekels
export const normalizeIsraeliPrice = (price) => {
  const num = typeof price === 'string' ? parseFloat(price) : price;
  if (num === null || num === undefined || isNaN(num)) return 0;
  return num > 1000 ? num / 100 : num;
};

export const calculateProfitPercentage = (purchaseValue, currentValue) => {
  if (purchaseValue === 0 || !purchaseValue || !currentValue) return 0;
  return ((currentValue - purchaseValue) / purchaseValue * 100).toFixed(2);
};

// Returns the CSS class for a profit/loss value — the
// `value >= 0 ? 'profit-positive' : 'profit-negative'` check that used to
// be repeated ~36 times across the two stock tables.
export const profitClass = (value) => ((value || 0) >= 0 ? 'profit-positive' : 'profit-negative');

// Formats a daily-change percentage the way both stock tables display it:
// falls back to '0.00' when null/undefined, otherwise 2 decimal places.
export const formatDailyChangePercent = (value) =>
  value !== undefined && value !== null ? value.toFixed(2) : '0.00';

export const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Normalize an array of Israeli stocks loaded from storage: if a stock's
// currentPrice looks like it was saved in agorot (a big number), convert it
// to shekels.
export const normalizeIsraeliStocksFromStorage = (parsed) => {
  if (!Array.isArray(parsed)) return [];
  return parsed.map((stock) => {
    const priceNum =
      typeof stock.currentPrice === 'string' ? parseFloat(stock.currentPrice) : stock.currentPrice;
    const needsDivide =
      priceNum !== null && priceNum !== undefined && !isNaN(priceNum) && priceNum > 1000;
    return {
      ...stock,
      currentPrice: needsDivide ? priceNum / 100 : priceNum
    };
  });
};
