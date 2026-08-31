// Resolves analyst recommendation data for a list of US stock tickers,
// batched into a single request and cached in state — same shape as
// useStockSectors.js. Public data (see server/analystRoutes.js), no auth.

import { useEffect, useRef, useState } from 'react';
import { apiUrl } from '../apiBase';

export function useAnalystRecommendations(symbols) {
  const [recommendationsBySymbol, setRecommendationsBySymbol] = useState({});
  const [loading, setLoading] = useState(false);
  const knownSymbolsRef = useRef(new Set());

  const uniqueSymbols = [...new Set((symbols || []).map((s) => String(s || '').trim().toUpperCase()).filter(Boolean))];
  const missingSymbols = uniqueSymbols.filter((s) => !knownSymbolsRef.current.has(s));
  const missingKey = missingSymbols.slice().sort().join(',');

  useEffect(() => {
    if (missingSymbols.length === 0) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const r = await fetch(apiUrl('/api/analyst-recommendations'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbols: missingSymbols })
        });
        if (!r.ok) throw new Error('load failed');
        const d = await r.json();
        const recommendations = d.recommendations || {};
        if (!cancelled) {
          Object.keys(recommendations).forEach((s) => knownSymbolsRef.current.add(s));
          setRecommendationsBySymbol((prev) => ({ ...prev, ...recommendations }));
        }
      } catch {
        // Best-effort: missing data just means those holdings show up as
        // "not available" in the UI, not a broken page.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingKey]);

  return { recommendationsBySymbol, loading };
}
