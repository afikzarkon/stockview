// "What was this non-traded account worth on date X?"
//
// Provident funds (קופות גמל), money-market funds (קרנות כספיות) and
// current accounts (עו"ש) have no market price to look up - unlike a stock,
// there is no close to fetch for a past date. What the app does have for
// them is a small ledger: one or two recorded values with the dates they
// were recorded on (currentValue/currentValueDate and the previous pair
// that rolls off when the user updates it - see portfolioMath.js's
// applyLedgerValueEditPayload), plus a deposits list of {date, amount}.
//
// This reconstructs a value at an arbitrary date from those, which is what
// lets the monthly tracker fill itself in for a chosen month instead of
// asking the user to remember and retype figures they already entered.
//
// Reconstruction rules, in order:
//   1. If a value was recorded on or before the date, start from the most
//      recent such recording and add every deposit made after that
//      recording up to and including the date. (Money paid in after the
//      last valuation is money the account holds, even though no new
//      valuation was recorded.)
//   2. Otherwise, if the only recorded values are later than the date,
//      start from the earliest of them and subtract the deposits made
//      between the date and that recording - backing the contributions out
//      of a later known balance.
//   3. Otherwise fall back to the cumulative deposits up to the date, i.e.
//      the amount paid in. Nothing better exists in that case.
//
// LIMITATION, stated rather than hidden: rules 1 and 2 carry a recorded
// balance across time without any growth between recordings, because the
// app has no return series for these accounts. The figure is exact on the
// dates a value was actually recorded and is a contribution-adjusted
// carry-forward in between. Bank savings funds are the exception and do
// not go through here at all: their value is a closed-form compounding of
// each deposit at the stated rate, so they can be valued exactly at any
// date (see bankSavingsFund.js's computeBankSavingsFundValue).

import { toNum } from './formatters';

const isValidDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d);

// The dated value recordings an account carries, oldest first.
function recordedValuePoints(account) {
  if (!account) return [];
  const points = [];
  const push = (date, value) => {
    if (!isValidDate(date)) return;
    const num = Number(value);
    if (!Number.isFinite(num)) return;
    points.push({ date: date.slice(0, 10), value: num });
  };
  push(account.previousValueDate, account.previousValue);
  push(account.currentValueDate, account.currentValue);
  // Accounts that only ever carry a single "amount" + "updateDate" (עו"ש).
  if (account.currentValue == null && account.currentValueDate == null) {
    push(account.updateDate, account.amount);
  }
  return points.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function deposits(account) {
  return (Array.isArray(account?.deposits) ? account.deposits : []).filter((d) => d && isValidDate(d.date));
}

// Sum of deposits in (afterDateExclusive, uptoDateInclusive].
function depositsBetween(account, afterDateExclusive, uptoDateInclusive) {
  return deposits(account).reduce((sum, d) => {
    const date = d.date.slice(0, 10);
    if (afterDateExclusive && date <= afterDateExclusive) return sum;
    if (uptoDateInclusive && date > uptoDateInclusive) return sum;
    return sum + toNum(d.amount);
  }, 0);
}

// date: 'YYYY-MM-DD'. Returns a number (never null) - an account with no
// usable data at all is worth 0 on that date, which is correct for an
// account opened later.
export const valueOfLedgerAccountAtDate = (account, date) => {
  if (!account || !isValidDate(date)) return 0;
  const day = date.slice(0, 10);
  const points = recordedValuePoints(account);

  const atOrBefore = points.filter((p) => p.date <= day);
  if (atOrBefore.length > 0) {
    const anchor = atOrBefore[atOrBefore.length - 1];
    return anchor.value + depositsBetween(account, anchor.date, day);
  }

  if (points.length > 0) {
    const anchor = points[0];
    return anchor.value - depositsBetween(account, day, anchor.date);
  }

  return depositsBetween(account, null, day);
};

// Convenience wrapper for a whole category.
export const valueOfLedgerAccountsAtDate = (accounts, date) =>
  (Array.isArray(accounts) ? accounts : []).reduce(
    (sum, account) => sum + valueOfLedgerAccountAtDate(account, date),
    0
  );
