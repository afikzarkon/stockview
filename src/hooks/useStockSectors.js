// Resolves sector/industry for a list of US stock tickers, batched into a
// single request. Public data (see server/sectorRoutes.js) — no auth needed.
//
// The caching and the deferral both live in useSymbolReferenceData.js,
// which this shares with the analyst and dividend hooks; see that file for
// why the cache is module-level and why the request waits for idle.
import { createSymbolStore, useSymbolReferenceData } from './useSymbolReferenceData';

const store = createSymbolStore({ endpoint: '/api/stock-sectors', responseKey: 'sectors' });

// symbols: string[] (raw tickers, e.g. from americanStocks.map(s => s.stockName))
export function useStockSectors(symbols) {
  const { data, loading } = useSymbolReferenceData(store, symbols);
  return { sectorBySymbol: data, loading };
}

export const __sectorStore = store;
