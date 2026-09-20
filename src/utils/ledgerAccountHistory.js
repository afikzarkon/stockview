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

// The earliest date this account carries ANY evidence of existing - the
// first recorded value, or the first deposit, whichever came first.
//
// Before that date the app knows nothing about the account. See
// valueOfLedgerAccountAtDate's `anchorToFirstRecord` option for why that
// distinction matters to a performance series and not to a checkpoint.
export const earliestEvidenceDate = (account) => {
  const dates = [
    ...recordedValuePoints(account).map((p) => p.date),
    ...deposits(account).map((d) => d.date.slice(0, 10))
  ];
  if (dates.length === 0) return null;
  return dates.sort()[0];
};

// The balance an account already held when it first appears - the part of
// its opening value that no deposit in the ledger accounts for.
//
// That figure is money entering the measured portfolio, not growth, which
// is exactly what a return calculation has to net out - see
// portfolioCashFlows.js, which turns it into a dated flow.
//
// Which of the two kinds of evidence comes first decides the answer:
//
//   a RECORDED VALUE first - the app knows the account held that much and
//     knows nothing about how it got there, so all of it (less anything
//     deposited that same day) is opening balance. A current account
//     recorded at 20,000 with no ledger is 20,000 of opening balance.
//
//   a DEPOSIT first - the account opened with that deposit, which is
//     already recorded as a flow in its own right. The opening balance is
//     0, and saying otherwise would double-count the same money.
//
// Deliberately NOT derived by carrying a later recorded value backwards:
// that carry-back removes the deposits made in between but not the GROWTH
// earned in between, so a fund opened with 5,000 and worth 5,200 by the
// time it was first recorded would report 200 of "opening balance" - its
// investment return, reclassified as a contribution and netted out of the
// very performance being measured.
export const openingBalanceOfLedgerAccount = (account) => {
  const opening = earliestEvidenceDate(account);
  if (!opening) return 0;

  const recordedOnOpeningDay = recordedValuePoints(account).find((p) => p.date === opening);
  if (!recordedOnOpeningDay) return 0;

  const depositedOnOpeningDay = deposits(account).reduce(
    (sum, d) => (d.date.slice(0, 10) === opening ? sum + toNum(d.amount) : sum),
    0
  );
  return recordedOnOpeningDay.value - depositedOnOpeningDay;
};

// date: 'YYYY-MM-DD'. Returns a number (never null) - an account with no
// usable data at all is worth 0 on that date, which is correct for an
// account opened later.
//
// `anchorToFirstRecord` changes what happens BEFORE the account's earliest
// evidence date, and nothing else.
//
//   false (default) - rule 2 above: carry the earliest known balance
//     backwards, net of the deposits made in between. This is what a
//     monthly checkpoint wants. Asked for June 2023 by someone who has
//     been holding the account for years and only recorded a value last
//     month, it gives the best reconstruction available.
//
//   true - the account is worth 0 before there is any evidence it existed.
//     This is what a PERFORMANCE series wants, and the difference is not
//     cosmetic. Carrying a bare ₪20,000 current-account balance back to
//     the start of a multi-year series adds ₪20,000 to both ends of every
//     sub-period, which drags every percentage toward zero: a holding that
//     genuinely doubled was measured at +13%. The balance is asserted for
//     years in which there is no evidence the account was open at all,
//     and the assertion silently rewrites the return.
//
//     Valuing it at 0 before it appears would instead make the balance
//     arrive as a jump, which would read as a gain - so it does not travel
//     alone: portfolioCashFlows.js records the same opening balance as a
//     dated contribution on that date, and the time-weighted return nets
//     it straight back out. Value and cash flow are two halves of one
//     change and are only correct together.
export const valueOfLedgerAccountAtDate = (account, date, { anchorToFirstRecord = false } = {}) => {
  if (!account || !isValidDate(date)) return 0;
  const day = date.slice(0, 10);
  const points = recordedValuePoints(account);

  if (anchorToFirstRecord) {
    const opening = earliestEvidenceDate(account);
    if (opening && day < opening) return 0;
  }

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
export const valueOfLedgerAccountsAtDate = (accounts, date, options) =>
  (Array.isArray(accounts) ? accounts : []).reduce(
    (sum, account) => sum + valueOfLedgerAccountAtDate(account, date, options),
    0
  );
