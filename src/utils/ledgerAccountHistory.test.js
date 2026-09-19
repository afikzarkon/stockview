import { valueOfLedgerAccountAtDate, valueOfLedgerAccountsAtDate } from './ledgerAccountHistory';

describe('valueOfLedgerAccountAtDate', () => {
  // The common case: a provident fund whose value was recorded once, with
  // contributions paid in afterwards.
  test('carries the most recent recorded value forward and adds the deposits made since', () => {
    const fund = {
      fundName: 'קופת גמל',
      currentValue: 50000,
      currentValueDate: '2024-01-01',
      deposits: [
        { date: '2024-02-01', amount: 1000 },
        { date: '2024-03-01', amount: 1000 }
      ]
    };
    expect(valueOfLedgerAccountAtDate(fund, '2024-01-15')).toBe(50000);
    expect(valueOfLedgerAccountAtDate(fund, '2024-02-15')).toBe(51000);
    expect(valueOfLedgerAccountAtDate(fund, '2024-03-15')).toBe(52000);
  });

  test('uses the previous recorded value for a date before the current one', () => {
    const fund = {
      previousValue: 40000,
      previousValueDate: '2023-01-01',
      currentValue: 50000,
      currentValueDate: '2024-01-01',
      deposits: []
    };
    expect(valueOfLedgerAccountAtDate(fund, '2023-06-01')).toBe(40000);
    expect(valueOfLedgerAccountAtDate(fund, '2024-06-01')).toBe(50000);
  });

  // Going backwards from a later known balance: the contributions made in
  // between are backed out, rather than pretending the balance was always
  // what it later became.
  test('backs contributions out of a later recorded value when the date precedes every recording', () => {
    const fund = {
      currentValue: 50000,
      currentValueDate: '2024-06-01',
      deposits: [
        { date: '2024-02-01', amount: 1000 },
        { date: '2024-04-01', amount: 2000 }
      ]
    };
    // Both deposits fall after 2024-01-01 and before the recording.
    expect(valueOfLedgerAccountAtDate(fund, '2024-01-01')).toBe(47000);
    // Only the April deposit is still ahead of this date.
    expect(valueOfLedgerAccountAtDate(fund, '2024-03-01')).toBe(48000);
  });

  test('falls back to the cumulative deposits when no value was ever recorded', () => {
    const fund = {
      deposits: [
        { date: '2024-01-10', amount: 1000 },
        { date: '2024-02-10', amount: 1500 },
        { date: '2024-03-10', amount: 500 }
      ]
    };
    expect(valueOfLedgerAccountAtDate(fund, '2024-02-15')).toBe(2500);
    expect(valueOfLedgerAccountAtDate(fund, '2024-12-31')).toBe(3000);
  });

  // An account that didn't exist yet on the requested date is worth 0 then,
  // which is correct rather than a missing value.
  test('is zero for a date before the account had anything at all', () => {
    const fund = { deposits: [{ date: '2024-05-01', amount: 1000 }] };
    expect(valueOfLedgerAccountAtDate(fund, '2024-01-01')).toBe(0);
  });

  test('supports a single-figure account (amount + updateDate), like a current account', () => {
    const account = { amount: 8000, updateDate: '2024-03-01' };
    expect(valueOfLedgerAccountAtDate(account, '2024-06-01')).toBe(8000);
  });

  test('is exact on the dates a value was actually recorded', () => {
    const fund = {
      previousValue: 40000,
      previousValueDate: '2023-01-01',
      currentValue: 50000,
      currentValueDate: '2024-01-01',
      deposits: [{ date: '2023-06-01', amount: 5000 }]
    };
    expect(valueOfLedgerAccountAtDate(fund, '2023-01-01')).toBe(40000);
    expect(valueOfLedgerAccountAtDate(fund, '2024-01-01')).toBe(50000);
  });

  test('handles missing/invalid input gracefully instead of throwing', () => {
    expect(valueOfLedgerAccountAtDate(null, '2024-01-01')).toBe(0);
    expect(valueOfLedgerAccountAtDate({ deposits: [] }, 'not-a-date')).toBe(0);
    expect(valueOfLedgerAccountAtDate({ deposits: [{ date: null, amount: 5 }] }, '2024-01-01')).toBe(0);
  });
});

describe('valueOfLedgerAccountsAtDate', () => {
  test('sums a whole category', () => {
    const accounts = [
      { currentValue: 1000, currentValueDate: '2024-01-01', deposits: [] },
      { currentValue: 2500, currentValueDate: '2024-01-01', deposits: [] }
    ];
    expect(valueOfLedgerAccountsAtDate(accounts, '2024-06-01')).toBe(3500);
  });

  test('an empty or missing category is worth zero', () => {
    expect(valueOfLedgerAccountsAtDate([], '2024-01-01')).toBe(0);
    expect(valueOfLedgerAccountsAtDate(undefined, '2024-01-01')).toBe(0);
  });
});
