// Portfolio value history: saves one snapshot/day (upserted server-side, so
// calling this multiple times in a day is harmless) and fetches the full
// saved history, so the analysis view can show a real equity curve,
// drawdown, and risk stats instead of only point-in-time numbers.

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl } from '../apiBase';

// Only attempt one save per calendar day per browser tab, to avoid firing a
// POST on every render/analysis view visit. The server upserts by date
// anyway (so this is a courtesy, not a correctness requirement) — it just
// avoids pointless network calls if the user flips back and forth into the
// analysis screen.
function savedTodayFlagKey(userId) {
  const today = new Date().toISOString().slice(0, 10);
  return `stockview_snapshot_saved_${userId}_${today}`;
}

export function usePortfolioSnapshots(user, authHeader, totalValueILS, breakdown) {
  const [snapshots, setSnapshots] = useState([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);
  const savingRef = useRef(false);

  // authHeader() is a fresh function reference on every render of useAuth()
  // (same as in usePortfolioData) - it must NOT be a dependency here, or
  // this callback (and the effect that runs it) would be recreated every
  // render, causing an infinite fetch loop.
  const fetchSnapshots = useCallback(async () => {
    if (!user) {
      setSnapshots([]);
      return;
    }
    setSnapshotsLoading(true);
    try {
      const r = await fetch(apiUrl('/api/portfolio-snapshots'), {
        credentials: 'include',
        headers: { ...authHeader() }
      });
      if (!r.ok) throw new Error('load failed');
      const d = await r.json();
      setSnapshots(Array.isArray(d.snapshots) ? d.snapshots : []);
    } catch {
      // Keep whatever we had before; a failed refresh shouldn't wipe the
      // chart the user is already looking at.
    } finally {
      setSnapshotsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    fetchSnapshots();
  }, [fetchSnapshots]);

  // Save today's total value once we have a meaningful (>0) number and
  // haven't already saved today in this browser.
  useEffect(() => {
    if (!user || !user.id) return;
    if (!Number.isFinite(totalValueILS) || totalValueILS <= 0) return;
    if (savingRef.current) return;

    const flagKey = savedTodayFlagKey(user.id);
    if (localStorage.getItem(flagKey) === '1') return;

    savingRef.current = true;
    (async () => {
      try {
        const r = await fetch(apiUrl('/api/portfolio-snapshot'), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', ...authHeader() },
          body: JSON.stringify({ totalValueILS, breakdown: breakdown || undefined })
        });
        if (r.ok) {
          localStorage.setItem(flagKey, '1');
          fetchSnapshots();
        }
      } catch {
        // Best-effort: a missed snapshot for today just means one gap in
        // the history, not a broken app. It'll try again next visit/day.
      } finally {
        savingRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, totalValueILS]);

  return { snapshots, snapshotsLoading, refetchSnapshots: fetchSnapshots };
}
