// Fetches the raw historical-price data (Israeli/American closes + USD/ILS
// FX history) needed to compute a historical portfolio value series over
// an arbitrary date range (see utils/historicalPortfolioValue.js), and
// exposes the resulting series. Only fetches when both fromDate and
// toDate are set - i.e. the user has actually picked a custom range in
// PortfolioAnalysisView.js's date-range filter. The saved-snapshot-based
// equity curve stays the default view; this hook only powers that
// optional custom-range comparison.
//
// Two-stage on purpose: the network fetch is keyed by the *set* of
// symbols + the date range (a stable string, so a price-refresh tick
// that produces a new array reference with the same symbols doesn't
// re-fetch) - but the final series computation is a useMemo depending on
// the live israeliStocks/americanStocks arrays directly, so a quantity
// edit is reflected immediately without needing a network round-trip.
import { useEffect, useMemo, useState } from 'react';
import { apiUrl } from '../apiBase';
import { computeHistoricalPortfolioSeries } from '../utils/historicalPortfolioValue';

function uniqueSymbols(stocks) {
  return [...new Set(stocks.map((s) => s.stockName).filter(Boolean))];
}

async function postJson(path, body) {
  const r = await fetch(apiUrl(path), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`${path} failed`);
  return r.json();
}

export function useHistoricalPortfolioValue({ fromDate, toDate, israeliStocks, americanStocks }) {
  const [priceData, setPriceData] = useState({ taseHistoricalCloses: {}, yahooHistoricalCloses: {}, fxHistoricalCloses: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const israeliKey = useMemo(() => uniqueSymbols(israeliStocks).sort().join(','), [israeliStocks]);
  const americanKey = useMemo(() => uniqueSymbols(americanStocks).sort().join(','), [americanStocks]);

  useEffect(() => {
    if (!fromDate || !toDate) {
      setPriceData({ taseHistoricalCloses: {}, yahooHistoricalCloses: {}, fxHistoricalCloses: [] });
      return;
    }
    const israeliSymbols = israeliKey ? israeliKey.split(',') : [];
    const americanSymbols = americanKey ? americanKey.split(',') : [];
    let cancelled = false;
    setLoading(true);
    setError('');

    (async () => {
      try {
        const [israeliRes, americanRes, fxRes] = await Promise.all([
          israeliSymbols.length
            ? postJson('/api/israeli-stocks-history', { symbols: israeliSymbols, from: fromDate })
            : Promise.resolve({ history: {} }),
          americanSymbols.length
            ? postJson('/api/american-stocks-history', { symbols: americanSymbols, from: fromDate })
            : Promise.resolve({ history: {} }),
          americanSymbols.length
            ? fetch(apiUrl(`/api/exchange-rate-history?from=${encodeURIComponent(fromDate)}`), { credentials: 'include' }).then((r) => r.json())
            : Promise.resolve({ history: [] })
        ]);
        if (cancelled) return;
        setPriceData({
          taseHistoricalCloses: israeliRes.history || {},
          yahooHistoricalCloses: americanRes.history || {},
          fxHistoricalCloses: fxRes.history || []
        });
      } catch {
        if (!cancelled) {
          setError('לא ניתן היה לטעון נתוני מחירים היסטוריים כרגע');
          setPriceData({ taseHistoricalCloses: {}, yahooHistoricalCloses: {}, fxHistoricalCloses: [] });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fromDate, toDate, israeliKey, americanKey]);

  const series = useMemo(
    () =>
      fromDate && toDate
        ? computeHistoricalPortfolioSeries(fromDate, toDate, { israeliStocks, americanStocks }, priceData)
        : [],
    [fromDate, toDate, israeliStocks, americanStocks, priceData]
  );

  return { series, loading, error };
}
