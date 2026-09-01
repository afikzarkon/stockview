// Dividend metrics built from Yahoo dividend data (server/dividendRoutes.js)
// combined with a portfolio's actual American stock lots. Pure functions,
// separate from the fetching hook, so they're independently testable.
import { formatEpochDateISO } from './analystData';

// Total dividends actually received on one stock: sums amountPerShare for
// every historical payment on/after the earliest lot's purchase date,
// multiplied by the total quantity held across all lots of that symbol.
// Doesn't model quantity changing mid-holding (buying more/selling some
// between payments) - an approximation, same spirit as the "רווח מצטבר
// מול הפקדות" note in FinancialAccountsTables.js. Returned in USD - the
// currency dividends are actually paid in, not converted to ILS (that
// would need the historical FX rate on each individual payment date,
// which isn't data this app has).
export const computeReceivedDividends = (history, lots) => {
  if (!Array.isArray(history) || history.length === 0) return 0;
  if (!Array.isArray(lots) || lots.length === 0) return 0;

  const totalQuantity = lots.reduce((sum, lot) => sum + (lot.quantity || 0), 0);
  const earliestPurchaseDate = lots.reduce((earliest, lot) => {
    if (!lot.purchaseDate) return earliest;
    return !earliest || lot.purchaseDate < earliest ? lot.purchaseDate : earliest;
  }, null);
  if (!earliestPurchaseDate || totalQuantity <= 0) return 0;

  return history
    .filter((d) => d.date >= earliestPurchaseDate)
    .reduce((sum, d) => sum + d.amountPerShare * totalQuantity, 0);
};

// Upcoming dividend calendar: one row per US symbol with a known future
// ex-dividend/payment date, soonest first. Only future dates - a stale
// exDividendDate left over from the last payment (Yahoo doesn't always
// roll it forward immediately) isn't useful in a "coming up" list.
export const buildUpcomingDividendCalendar = (dividendsBySymbol, todayISO) => {
  const today = todayISO || new Date().toISOString().slice(0, 10);
  const rows = [];
  Object.entries(dividendsBySymbol || {}).forEach(([symbol, data]) => {
    const nextDate =
      formatEpochDateISO(data?.nextDividendDateEpoch) || formatEpochDateISO(data?.exDividendDateEpoch);
    if (!nextDate || nextDate < today) return;
    rows.push({
      symbol,
      date: nextDate,
      dividendRate: data?.dividendRate ?? null,
      dividendYieldPercent: data?.dividendYieldPercent ?? null
    });
  });
  return rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
};
