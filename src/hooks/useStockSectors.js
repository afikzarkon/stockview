// Resolves sector/industry for a list of US stock tickers, batched into a
// single request and cached in state so re-renders (or switching back into
// the analysis view) don't re-fetch symbols we already have. Public data
// (see server/sectorRoutes.js) — no auth needed.

import { useEffect, useRef, useState } from 'react';
import { apiUrl } from '../apiBase';

// symbols: string[] (raw tickers, e.g. from americanStocks.map(s => s.stockName))
export function useStockSectors(symbols) {
  const [sectorBySymbol, setSectorBySymbol] = useState({});
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
        const r = await fetch(apiUrl('/api/stock-sectors'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbols: missingSymbols })
        });
        if (!r.ok) throw new Error('load failed');
        const d = await r.json();
        const sectors = d.sectors || {};
        if (!cancelled) {
          Object.keys(sectors).forEach((s) => knownSymbolsRef.current.add(s));
          setSectorBySymbol((prev) => ({ ...prev, ...sectors }));
        }
      } catch {
        // Best-effort: missing sector data just means those holdings show
        // up as "unclassified" in the breakdown, not a broken page.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // missingKey captures exactly which new symbols need fetching; using it
    // (rather than the `symbols` prop reference, which is a new array every
    // render) avoids re-fetching on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingKey]);

  return { sectorBySymbol, loading };
}
