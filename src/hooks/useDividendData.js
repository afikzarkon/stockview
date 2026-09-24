// Fetches dividend data (forward-looking yield/payout/next date + actual
// historical payments) for multiple US tickers in one batched request, used
// by the "מעקב דיבידנדים" section. Public data (see
// server/dividendRoutes.js) — no auth needed. Mirrors useStockSectors.js.
import { createSymbolStore, useSymbolReferenceData } from './useSymbolReferenceData';

const store = createSymbolStore({ endpoint: '/api/dividend-data', responseKey: 'dividends' });

// symbols: string[] (raw tickers). fromDate: 'YYYY-MM-DD', ideally the
// portfolio's earliest American purchase date, so the server fetches
// dividend history far back enough to cover the whole holding period.
export function useDividendData(symbols, fromDate) {
  const { data, loading } = useSymbolReferenceData(store, symbols, { from: fromDate || undefined });
  return { dividendsBySymbol: data, loading };
}

export const __dividendStore = store;
