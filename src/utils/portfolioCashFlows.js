// Every dated external cash flow into or out of the portfolio, drawn from
// the records the user already keeps in the main tables.
//
// "External" means money crossing the portfolio's boundary - a deposit, a
// withdrawal, or the cash spent buying a new position. It is NOT investment
// performance, and it is exactly what has to be netted out before a
// "return" figure means anything: a portfolio that went from ₪100k to
// ₪150k because ₪50k was paid into it did not grow 50%, it grew 0%.
//
// Sources, all of them already maintained elsewhere in the app:
//   * stock purchase lots  - each lot's cost at its purchase date
//                            (an American lot's cost is converted to ILS
//                            at the rate actually paid, matching how
//                            totalPurchaseILS is computed everywhere else)
//   * provident funds      - the dated deposit ledger
//   * bank savings funds   - the dated deposit ledger
//   * money-market funds   - the dated deposit ledger
//
// LIMITATION, stated rather than hidden: this app has no sell/withdrawal
// ledger, so the automatic side only ever sees money going IN. A sale or a
// withdrawal is invisible here and would still read as a fall in value,
// i.e. as a loss. That is why the monthly tracker keeps a manual net-flow
// field for the liquid accounts, and why a current account's balance
// changes are not treated as flows at all (see below).
import { toNum } from './formatters';

const isDatedFlow = (date) => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date);

function pushFlow(flows, date, amount) {
  if (!isDatedFlow(date)) return;
  const value = toNum(amount);
  if (value === 0) return;
  flows.push({ date: date.slice(0, 10), amount: value });
}

function pushDepositLedger(flows, accounts) {
  (accounts || []).forEach((account) => {
    (Array.isArray(account?.deposits) ? account.deposits : []).forEach((deposit) => {
      pushFlow(flows, deposit?.date, deposit?.amount);
    });
  });
}

// holdings: { israeliStocks, americanStocks, pensionFunds, cashFunds,
// bankSavingsFunds }. Returns [{ date, amount }] sorted ascending by date,
// positive = money in.
//
// bankBalances (עו"ש) is deliberately NOT a source: a current account
// carries a single overwritten balance with no ledger behind it, so a
// change in it is indistinguishable from spending, salary, or a transfer to
// a brokerage account that is already counted as a stock purchase. Guessing
// would double-count real flows; leaving it out keeps the adjustment to
// flows the app can actually evidence.
export const buildPortfolioCashFlows = ({
  israeliStocks = [],
  americanStocks = [],
  pensionFunds = [],
  cashFunds = [],
  bankSavingsFunds = []
} = {}) => {
  const flows = [];

  (israeliStocks || []).forEach((lot) => {
    pushFlow(flows, lot?.purchaseDate, toNum(lot?.purchasePrice) * toNum(lot?.quantity));
  });

  (americanStocks || []).forEach((lot) => {
    // The ILS actually paid: price x quantity x the rate on the day, the
    // same basis as totalPurchaseILS in portfolioMath.js. Using today's
    // rate instead would fold an FX move into the flow and quietly cancel
    // out part of the very performance being measured.
    const costILS = toNum(lot?.purchasePrice) * toNum(lot?.quantity) * toNum(lot?.exchangeRate);
    pushFlow(flows, lot?.purchaseDate, costILS);
  });

  pushDepositLedger(flows, pensionFunds);
  pushDepositLedger(flows, cashFunds);
  pushDepositLedger(flows, bankSavingsFunds);

  return flows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
};

// The subset of flows falling in (periodStart, periodEnd] - a flow dated
// exactly on periodStart is treated as already reflected in that point's
// value, not as new money arriving during the period. Same convention as
// monthlySnapshotComparison.js's flowsInPeriod.
export const cashFlowsInPeriod = (flows, periodStart, periodEnd) =>
  (flows || []).filter((flow) => flow.date > periodStart && flow.date <= periodEnd);
