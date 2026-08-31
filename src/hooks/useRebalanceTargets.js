// Loads and saves the user's rebalancing target allocation (personal
// planning data, requires auth — see server/rebalanceRoutes.js). Same
// fetch/auth pattern as usePortfolioData.js: authHeader() is a fresh
// function reference every render, so it's deliberately excluded from
// effect dependency arrays (see usePortfolioSnapshots.js for why that
// matters — omitting it caused a real infinite-loop bug there).

import { useCallback, useEffect, useState } from 'react';
import { apiUrl } from '../apiBase';
import { emptyTargets } from '../utils/rebalancing';

export function useRebalanceTargets(user, authHeader) {
  const [targets, setTargets] = useState(null); // null = not loaded yet / none saved
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (!user) {
      setTargets(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const r = await fetch(apiUrl('/api/rebalance-targets'), {
          credentials: 'include',
          headers: { ...authHeader() }
        });
        if (!r.ok) throw new Error('load failed');
        const d = await r.json();
        if (!cancelled) setTargets(d.targets || emptyTargets());
      } catch {
        if (!cancelled) setTargets(emptyTargets());
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const saveTargets = useCallback(
    async (newTargets) => {
      setSaving(true);
      setSaveError('');
      try {
        const r = await fetch(apiUrl('/api/rebalance-targets'), {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', ...authHeader() },
          body: JSON.stringify(newTargets)
        });
        if (!r.ok) throw new Error('save failed');
        const d = await r.json();
        setTargets(d.targets || newTargets);
        return true;
      } catch {
        setSaveError('שמירת היעדים נכשלה, נסו שוב');
        return false;
      } finally {
        setSaving(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return { targets, loading, saving, saveError, saveTargets };
}
