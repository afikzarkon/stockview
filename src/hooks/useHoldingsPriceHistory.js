// Fetches historical daily closes for multiple US tickers in one batched
// request, used to compute the correlation matrix between holdings (see
// src/utils/correlationAnalysis.js). Public data (see
// server/correlationRoutes.js) — no auth needed. Mirrors useStockSectors.js.

import { useEffect, useRef, useState } from 'react';
import { apiUrl } from '../apiBase';

// symbols: string[] (raw tickers, e.g. from americanStocks.map(s => s.stockName))
export function useHoldingsPriceHistory(symbols) {
  const [historyBySymbol, setHistoryBySymbol] = useState({});
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
        const r = await fetch(apiUrl('/api/stock-price-history'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbols: missingSymbols })
        });
        if (!r.ok) throw new Error('load failed');
        const d = await r.json();
        const history = d.history || {};
        if (!cancelled) {
          Object.keys(history).forEach((s) => knownSymbolsRef.current.add(s));
          setHistoryBySymbol((prev) => ({ ...prev, ...history }));
        }
      } catch {
        // Best-effort: missing history just means those symbols are
        // excluded from the correlation matrix, not a broken page.
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

  return { historyBySymbol, loading };
}
