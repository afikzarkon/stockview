// Silent automatic portfolio-value snapshot - replaces the old manual
// "שמור מידע יומי עדכני" button entirely. Fires at most once per mount,
// and only after usePriceRefresh.js signals that a full price-refresh
// cycle has actually completed (firstCycleComplete) - not on raw page
// load, where the displayed value is still whatever was last persisted
// rather than freshly confirmed live. This is exactly the problem that
// got the ORIGINAL always-on auto-save reverted to manual-only (see
// usePortfolioSnapshots.js's header comment) - waiting for a real
// completed cycle is what makes bringing it back safe.
//
// De-duplication is derived from the already-fetched snapshots/
// monthlySnapshots arrays (the real source of truth), not localStorage -
// so it works correctly across devices/browsers, not just the one that
// happened to save first. A daily snapshot is skipped if today's date is
// already present; a monthly snapshot is only ever taken once per
// calendar month (the first time the daily check fires that month), so
// month-over-month comparison keeps meaning "value as of whichever day
// the app was first opened that month" instead of being overwritten
// every single day.
import { useEffect, useRef } from 'react';

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonthString() {
  return new Date().toISOString().slice(0, 7);
}

export function useAutoSnapshot({
  firstCycleComplete,
  totalValueILS,
  breakdown,
  snapshots,
  saveSnapshotNow,
  monthlySnapshots,
  saveMonthlySnapshot
}) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (!firstCycleComplete || firedRef.current) return;
    if (!Number.isFinite(totalValueILS) || totalValueILS <= 0) return;

    const today = todayDateString();
    const alreadySavedToday = Array.isArray(snapshots) && snapshots.some((s) => s.date === today);
    firedRef.current = true;
    if (alreadySavedToday) return;

    saveSnapshotNow(totalValueILS, breakdown);

    const currentMonth = currentMonthString();
    const hasCurrentMonth = Array.isArray(monthlySnapshots) && monthlySnapshots.some((m) => m.month === currentMonth);
    if (!hasCurrentMonth) {
      saveMonthlySnapshot(totalValueILS, breakdown);
    }
  }, [firstCycleComplete, totalValueILS, breakdown, snapshots, saveSnapshotNow, monthlySnapshots, saveMonthlySnapshot]);
}
