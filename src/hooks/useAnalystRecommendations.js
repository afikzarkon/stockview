// Resolves analyst recommendation data for a list of US stock tickers,
// batched into a single request — same shape as useStockSectors.js. Public
// data (see server/analystRoutes.js), no auth.
import { createSymbolStore, useSymbolReferenceData } from './useSymbolReferenceData';

const store = createSymbolStore({
  endpoint: '/api/analyst-recommendations',
  responseKey: 'recommendations'
});

export function useAnalystRecommendations(symbols) {
  const { data, loading } = useSymbolReferenceData(store, symbols);
  return { recommendationsBySymbol: data, loading };
}

export const __analystStore = store;
