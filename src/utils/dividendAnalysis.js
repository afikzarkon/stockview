// Dividend metrics built from Yahoo dividend data (server/dividendRoutes.js)
// combined with a portfolio's actual American stock lots. Pure functions,
// separate from the fetching hook, so they're independently testable.

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
