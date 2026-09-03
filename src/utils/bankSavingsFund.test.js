import { yearsBetween, computeBankSavingsFundValue } from './bankSavingsFund';

describe('yearsBetween', () => {
  test('computes elapsed years between two dates', () => {
    expect(yearsBetween('2023-01-01', new Date('2024-01-01'))).toBeCloseTo(1, 2);
  });

  test('never returns a negative number (future deposit dates clamp to 0)', () => {
    expect(yearsBetween('2025-01-01', new Date('2024-01-01'))).toBe(0);
  });

  test('returns 0 for an invalid date', () => {
    expect(yearsBetween('not-a-date', new Date('2024-01-01'))).toBe(0);
  });
});

describe('computeBankSavingsFundValue', () => {
  // Elapsed time is measured against a 365.25-day average year (see
  // bankSavingsFund.js) so multi-year spans average out leap years
  // correctly - a calendar year that happens to include a leap day (like
  // 2023-01-01 to 2024-01-01, which spans 2024's Feb 29) lands a fraction
  // of a day short of exactly 1.0 elapsed years, hence precision 0 (within
  // 0.5 ₪) instead of an exact match here.
  test('a single deposit grows by compound annual interest from its own date', () => {
    const fund = { interestRate: 10, deposits: [{ date: '2023-01-01', amount: 1000 }] };
    const value = computeBankSavingsFundValue(fund, new Date('2024-01-01'));
    expect(value).toBeCloseTo(1100, 0);
  });

  test('two years of compounding at 10% grows 1000 to ~1210, not 1200 (real compounding, not simple interest)', () => {
    const fund = { interestRate: 10, deposits: [{ date: '2022-01-01', amount: 1000 }] };
    const value = computeBankSavingsFundValue(fund, new Date('2024-01-01'));
    expect(value).toBeCloseTo(1210, 0);
  });

  test('multiple deposits each grow independently from their own deposit date and are summed', () => {
    const fund = {
      interestRate: 10,
      deposits: [
        { date: '2023-01-01', amount: 1000 }, // 1 year -> ~1100
        { date: '2024-01-01', amount: 500 }   // 0 years -> 500
      ]
    };
    const value = computeBankSavingsFundValue(fund, new Date('2024-01-01'));
    expect(value).toBeCloseTo(1600, 0);
  });

  test('a 0% interest rate returns the deposited amount unchanged regardless of elapsed time', () => {
    const fund = { interestRate: 0, deposits: [{ date: '2020-01-01', amount: 1000 }] };
    const value = computeBankSavingsFundValue(fund, new Date('2024-01-01'));
    expect(value).toBeCloseTo(1000, 5);
  });

  test('no deposits -> value is 0', () => {
    expect(computeBankSavingsFundValue({ interestRate: 5, deposits: [] })).toBe(0);
  });

  test('handles a missing/malformed fund gracefully', () => {
    expect(computeBankSavingsFundValue(undefined)).toBe(0);
    expect(computeBankSavingsFundValue({})).toBe(0);
  });
});
