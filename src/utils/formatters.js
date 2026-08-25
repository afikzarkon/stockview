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

export const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const normalizeIsraeliStocksFromStorage = (stocks) => {
  if (!Array.isArray(stocks)) return [];
  return stocks.map((stock) => ({
    ...stock,
    price: normalizeIsraeliPrice(stock.price),
  }));
};