// Stock/FX price fetching helpers.
// Extracted from App.js — behavior is unchanged, only the location moved.
// These are used both by the price-polling hook and by the stock form
// (when adding/editing a stock, to pull an initial current price).

import { apiUrl } from '../apiBase';

// Get current price + daily change % for an Israeli stock (TASE) via the local server
export const fetchIsraeliStockPrice = async (stockId) => {
  try {
    const response = await fetch(apiUrl(`/api/israeli-stock/${stockId}`), {
      credentials: 'include'
    });
    if (!response.ok) throw new Error('שגיאה בקריאת נתונים מהשרת');
    const json = await response.json();
    return json;
  } catch (error) {
    return null;
  }
};

// Get current price + daily change % for a US stock via Yahoo Finance proxy
export const fetchCurrentPrice = async (stockSymbol) => {
  try {
    const response = await fetch(apiUrl(`/api/american-stock/${encodeURIComponent(stockSymbol)}`), {
      credentials: 'include'
    });
    if (!response.ok) throw new Error('failed to fetch american stock');
    const data = await response.json();
    if (data && data.currentPrice !== null && data.currentPrice !== undefined) return data;
  } catch (error) {
    return null;
  }
  return null;
};

// Get current USD/ILS exchange rate via Yahoo Finance
export const fetchExchangeRate = async () => {
  try {
    const response = await fetch(apiUrl('/api/exchange-rate'), {
      credentials: 'include'
    });
    if (!response.ok) throw new Error('failed to fetch exchange rate');
    const data = await response.json();
    return data && data.rate !== null && data.rate !== undefined ? data.rate : null;
  } catch (error) {
    return null;
  }
};
