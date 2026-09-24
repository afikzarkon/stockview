import {
  computePortfolioInceptionDate,
  computeFirstStockPurchaseDate,
  startDateForPeriod,
  periodKeyForRange,
  RETURN_PERIODS,
  DEFAULT_RETURN_PERIOD,
  monthEndDate
} from './portfolioDates';

describe('computeFirstStockPurchaseDate', () => {
  const israeliStocks = [{ purchaseDate: '2015-06-01' }, { purchaseDate: '2012-03-04' }];
  const americanStocks = [{ purchaseDate: '2018-11-20' }];
  const pensionFunds = [{ deposits: [{ date: '2008-01-01', amount: 1000 }] }];
  const bankSavingsFunds = [{ deposits: [{ date: '2009-05-05', amount: 500 }] }];

  // THE REQUIREMENT: a curve of shares starts at the first share. The
  // whole-portfolio inception is a different date and answers a different
  // question - it is kept, and tested below, for the callers that want it.
  test('ignores deposits into non-traded accounts, however early they are', () => {
    expect(
      computeFirstStockPurchaseDate({ israeliStocks, americanStocks, pensionFunds, bankSavingsFunds })
    ).toBe('2012-03-04');
  });

  test('the whole-portfolio inception still counts those deposits', () => {
    expect(
      computePortfolioInceptionDate({ israeliStocks, americanStocks, pensionFunds, bankSavingsFunds })
    ).toBe('2008-01-01');
  });

  test('is the earliest across both markets, not the earliest in one of them', () => {
    expect(computeFirstStockPurchaseDate({ americanStocks })).toBe('2018-11-20');
    expect(computeFirstStockPurchaseDate({ israeliStocks })).toBe('2012-03-04');
  });

  // A half-typed or malformed date sorts before every real one and would
  // drag the range back to a point with no prices behind it.
  test('ignores a malformed date rather than sorting it to the front', () => {
    expect(
      computeFirstStockPurchaseDate({ israeliStocks: [{ purchaseDate: '20-3' }, { purchaseDate: '2021-02-02' }] })
    ).toBe('2021-02-02');
  });

  test('returns an empty string when nothing has been bought', () => {
    expect(computeFirstStockPurchaseDate({})).toBe('');
    expect(computeFirstStockPurchaseDate()).toBe('');
  });
});

describe('startDateForPeriod', () => {
  const today = '2026-09-24';

  test.each([
    ['day', '2026-09-23'],
    ['month', '2026-08-24'],
    ['ytd', '2026-01-01'],
    ['1y', '2025-09-24'],
    ['3y', '2023-09-24'],
    ['5y', '2021-09-24']
  ])('%s resolves to %s', (key, expected) => {
    expect(startDateForPeriod(key, today)).toBe(expected);
  });

  // '' is what the page reads as "track the first purchase as holdings
  // change" rather than pinning a start date, so 'all' has to produce it
  // rather than a computed date.
  test('"all" resolves to an empty string, not to a date', () => {
    expect(startDateForPeriod('all', today)).toBe('');
  });

  test('an unrecognised period falls back to the whole history', () => {
    expect(startDateForPeriod('decade', today)).toBe('');
    expect(startDateForPeriod(undefined, today)).toBe('');
  });

  test('a malformed "today" produces no range rather than an invalid one', () => {
    expect(startDateForPeriod('1y', 'not-a-date')).toBe('');
  });

  // Israel is ahead of UTC, so a local-time construction turns
  // "1 January" into the 31st of December - and these strings are compared
  // against ISO dates from the exchanges.
  test('year-to-date is the 1st of January, not the 31st of December before it', () => {
    expect(startDateForPeriod('ytd', '2026-01-01')).toBe('2026-01-01');
  });

  // Month and year arithmetic across a boundary, where a naive
  // day-subtraction would land in the wrong month.
  test('steps back across a year boundary correctly', () => {
    expect(startDateForPeriod('month', '2026-01-15')).toBe('2025-12-15');
    expect(startDateForPeriod('1y', '2026-01-01')).toBe('2025-01-01');
  });
});

describe('periodKeyForRange', () => {
  const today = '2026-09-24';

  test('recognises a range one of the toggles produced', () => {
    RETURN_PERIODS.forEach((period) => {
      const from = startDateForPeriod(period.key, today);
      expect(periodKeyForRange(from, today, today)).toBe(period.key);
    });
  });

  // A range typed by hand is not one of the offered periods, so none of
  // them may keep claiming to be what is on screen.
  test('returns null for a range typed by hand', () => {
    expect(periodKeyForRange('2023-06-11', today, today)).toBeNull();
  });

  test('returns null once the end date is moved off today', () => {
    expect(periodKeyForRange(startDateForPeriod('ytd', today), '2026-06-01', today)).toBeNull();
  });

  test('an open start is the whole history', () => {
    expect(periodKeyForRange('', today, today)).toBe('all');
  });
});

describe('RETURN_PERIODS', () => {
  test('offers every period the dashboard is expected to have, in order', () => {
    expect(RETURN_PERIODS.map((p) => p.key)).toEqual(['day', 'month', 'ytd', '1y', '3y', '5y', 'all']);
  });

  test('the default is one of them, and it is year-to-date', () => {
    expect(RETURN_PERIODS.some((p) => p.key === DEFAULT_RETURN_PERIOD)).toBe(true);
    expect(DEFAULT_RETURN_PERIOD).toBe('ytd');
  });

  test('every period is labelled and hinted, so a toggle is never a bare key', () => {
    RETURN_PERIODS.forEach((period) => {
      expect(period.label).toBeTruthy();
      expect(period.hint).toBeTruthy();
    });
  });
});

describe('monthEndDate', () => {
  test('is the last calendar day of the month', () => {
    expect(monthEndDate('2024-02', '2026-09-24')).toBe('2024-02-29'); // leap year
    expect(monthEndDate('2023-02', '2026-09-24')).toBe('2023-02-28');
  });

  // A month still in progress has no prices past today to value it at.
  test('never returns a date in the future', () => {
    expect(monthEndDate('2026-09', '2026-09-24')).toBe('2026-09-24');
  });

  test('rejects anything that is not a month key', () => {
    expect(monthEndDate('2026-09-24')).toBeNull();
    expect(monthEndDate('')).toBeNull();
  });
});
