// Dates derived from the portfolio itself, shared by the pages that need
// the same answer.
//
// The analytics page and the monthly tracker both value the portfolio over
// its full history, so both need to know when that history starts. Each
// used to work it out inline; with the two now on separate pages that would
// be the same derivation written twice, free to drift.

// The earliest date anything was bought or deposited - the portfolio's
// inception, and the natural start of any "since the beginning" range.
//
// Only fully-formed ISO dates count: a half-typed or malformed one would
// sort before every real date and drag the range back to an arbitrary
// point with no prices behind it.
export function computePortfolioInceptionDate({
  israeliStocks = [],
  americanStocks = [],
  pensionFunds = [],
  bankSavingsFunds = []
} = {}) {
  const dates = [
    ...israeliStocks.map((s) => s.purchaseDate),
    ...americanStocks.map((s) => s.purchaseDate),
    ...pensionFunds.flatMap((f) => (Array.isArray(f.deposits) ? f.deposits : []).map((d) => d.date)),
    ...bankSavingsFunds.flatMap((f) => (Array.isArray(f.deposits) ? f.deposits : []).map((d) => d.date))
  ].filter((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d));
  if (dates.length === 0) return '';
  return dates.sort()[0].slice(0, 10);
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// A "YYYY-MM" key -> a Hebrew month name and year ("מרץ 2024").
//
// The key itself is a clean sortable string used as-is everywhere else;
// this is display only, so the raw sort key is never shown to the user.
export function formatMonthLabel(monthKey) {
  const [year, month] = String(monthKey).split('-').map(Number);
  if (!year || !month) return monthKey;
  return new Date(year, month - 1, 1).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
}

// The last calendar day of a month, never later than `today` - the date a
// month's checkpoint is valued at. A month still in progress is valued as
// of today rather than at a future date with no prices behind it.
export function monthEndDate(monthKey, today = todayISO()) {
  if (!/^\d{4}-\d{2}$/.test(String(monthKey || ''))) return null;
  const [year, month] = monthKey.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return lastDay > today ? today : lastDay;
}
