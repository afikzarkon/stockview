// Fetches dividend data (forward-looking yield/payout/next date + actual
// historical payments) for multiple US tickers in one batched request, used
// by the "מעקב דיבידנדים" section. Also carries next-earnings-date fields
// (earningsDateEpoch, epsEstimateAverage, ...) used by the "לוח רבעונים"
// section — see fetchYahooDividendSummary in yahooQuotes.js for why they
// ride along here instead of a separate fetch. Public data (see
// server/dividendRoutes.js) — no auth needed. Mirrors useStockSectors.js.

import { useEffect, useRef, useState } from 'react';
import { apiUrl } from '../apiBase';

// symbols: string[] (raw tickers). fromDate: 'YYYY-MM-DD', ideally the
// portfolio's earliest American purchase date, so the server fetches
// dividend history far back enough to cover the whole holding period.
export function useDividendData(symbols, fromDate) {
  const [dividendsBySymbol, setDividendsBySymbol] = useState({});
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
        const r = await fetch(apiUrl('/api/dividend-data'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbols: missingSymbols, from: fromDate || undefined })
        });
        if (!r.ok) throw new Error('load failed');
        const d = await r.json();
        const dividends = d.dividends || {};
        if (!cancelled) {
          Object.keys(dividends).forEach((s) => knownSymbolsRef.current.add(s));
          setDividendsBySymbol((prev) => ({ ...prev, ...dividends }));
        }
      } catch {
        // Best-effort: missing dividend data just means those symbols show
        // up as "לא זמין" in the table, not a broken page.
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

  return { dividendsBySymbol, loading };
}
