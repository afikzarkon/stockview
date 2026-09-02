// Fetches fundamentals for a single searched-up symbol (see
// server/stockResearchRoutes.js), for the "חקר מניות" page. Public data —
// no auth needed. Unlike useStockSectors.js/useDividendData.js (which
// batch-fetch across a whole portfolio), this is a single-symbol lookup
// that changes whenever the user picks a different stock to research.

import { useEffect, useState } from 'react';
import { apiUrl } from '../apiBase';

// symbol: string | null (null = nothing selected yet, don't fetch).
export function useStockResearch(symbol) {
  const [research, setResearch] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!symbol) {
      setResearch(null);
      setError('');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const r = await fetch(apiUrl(`/api/stock-research/${encodeURIComponent(symbol)}`));
        if (!r.ok) throw new Error('load failed');
        const d = await r.json();
        if (!cancelled) setResearch(d.research || null);
      } catch {
        if (!cancelled) {
          setResearch(null);
          setError('לא ניתן היה לטעון נתוני מנייה כרגע');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  return { research, loading, error };
}
