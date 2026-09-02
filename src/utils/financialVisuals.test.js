import {
  buildRevenueBreakdown,
  buildRevenueTrend,
  buildBalanceSheetTreemap,
  computeLatestRoce,
  buildHistoricalPeSeries,
  findNearestPricePoint
} from './financialVisuals';

describe('buildRevenueBreakdown', () => {
  test('builds slices for the latest year and omits a negligible residual', () => {
    const fundamentalsHistory = {
      annualTotalRevenue: [{ date: '2024-12-31', value: 1000 }],
      annualCostOfRevenue: [{ date: '2024-12-31', value: -400 }],
      annualOperatingExpense: [{ date: '2024-12-31', value: -300 }],
      annualInterestExpense: [{ date: '2024-12-31', value: -50 }],
      annualTaxProvision: [{ date: '2024-12-31', value: -60 }],
      annualNetIncome: [{ date: '2024-12-31', value: 190 }]
    };
    const result = buildRevenueBreakdown(fundamentalsHistory);
    expect(result).not.toBeNull();
    expect(result.revenue).toBe(1000);
    expect(result.slices.map((s) => s.key).sort()).toEqual(['cogs', 'interest', 'netIncome', 'opEx', 'tax'].sort());
    expect(result.slices.find((s) => s.key === 'cogs').value).toBe(400);
  });

  test('adds an "other" slice when a meaningful residual remains', () => {
    const fundamentalsHistory = {
      annualTotalRevenue: [{ date: '2024-12-31', value: 1000 }],
      annualCostOfRevenue: [{ date: '2024-12-31', value: -400 }],
      annualNetIncome: [{ date: '2024-12-31', value: 100 }]
      // opEx/interest/tax missing -> big residual
    };
    const result = buildRevenueBreakdown(fundamentalsHistory);
    expect(result.slices.some((s) => s.key === 'other')).toBe(true);
  });

  test('returns null when revenue is missing', () => {
    expect(buildRevenueBreakdown({})).toBeNull();
    expect(buildRevenueBreakdown({ annualTotalRevenue: [] })).toBeNull();
  });
});

describe('buildRevenueTrend', () => {
  test('pairs revenue with net income per year', () => {
    const fundamentalsHistory = {
      annualTotalRevenue: [
        { date: '2023-12-31', value: 900 },
        { date: '2024-12-31', value: 1000 }
      ],
      annualNetIncome: [
        { date: '2023-12-31', value: 80 },
        { date: '2024-12-31', value: 100 }
      ]
    };
    const result = buildRevenueTrend(fundamentalsHistory);
    expect(result).toEqual([
      { year: '2023', revenue: 900, netIncome: 80 },
      { year: '2024', revenue: 1000, netIncome: 100 }
    ]);
  });

  test('returns null when there is no revenue series', () => {
    expect(buildRevenueTrend({})).toBeNull();
  });

  test('returns a null netIncome for a year with no matching data point', () => {
    const fundamentalsHistory = { annualTotalRevenue: [{ date: '2024-12-31', value: 1000 }] };
    const result = buildRevenueTrend(fundamentalsHistory);
    expect(result[0].netIncome).toBeNull();
  });
});

describe('buildBalanceSheetTreemap', () => {
  test('builds Assets and Liabilities & Equity groups from the latest year', () => {
    const fundamentalsHistory = {
      annualCurrentAssets: [{ date: '2024-12-31', value: 500 }],
      annualNetPPE: [{ date: '2024-12-31', value: 300 }],
      annualCashAndCashEquivalents: [{ date: '2024-12-31', value: 200 }],
      annualCurrentLiabilities: [{ date: '2024-12-31', value: 150 }],
      annualLongTermDebt: [{ date: '2024-12-31', value: 400 }],
      annualStockholdersEquity: [{ date: '2024-12-31', value: 450 }]
    };
    const result = buildBalanceSheetTreemap(fundamentalsHistory);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('נכסים');
    expect(result[0].children).toHaveLength(3); // goodwill missing, dropped
    expect(result[1].name).toBe('התחייבויות והון');
    expect(result[1].children).toHaveLength(3);
  });

  test('returns null when nothing is available', () => {
    expect(buildBalanceSheetTreemap({})).toBeNull();
  });

  test('drops a zero or negative line item rather than showing a fake slice', () => {
    const fundamentalsHistory = {
      annualCurrentAssets: [{ date: '2024-12-31', value: 0 }],
      annualNetPPE: [{ date: '2024-12-31', value: 300 }]
    };
    const result = buildBalanceSheetTreemap(fundamentalsHistory);
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children[0].name).toBe('רכוש קבוע');
  });
});

describe('computeLatestRoce', () => {
  test('divides latest EBIT by latest invested capital', () => {
    const fundamentalsHistory = {
      annualEBIT: [{ date: '2024-12-31', value: 200 }],
      annualInvestedCapital: [{ date: '2024-12-31', value: 1000 }]
    };
    expect(computeLatestRoce(fundamentalsHistory)).toBeCloseTo(0.2, 6);
  });

  test('returns null when invested capital is zero or missing', () => {
    expect(computeLatestRoce({ annualEBIT: [{ date: '2024-12-31', value: 200 }] })).toBeNull();
    expect(
      computeLatestRoce({
        annualEBIT: [{ date: '2024-12-31', value: 200 }],
        annualInvestedCapital: [{ date: '2024-12-31', value: 0 }]
      })
    ).toBeNull();
  });
});

describe('findNearestPricePoint', () => {
  const priceHistory = [
    { date: '2024-01-05', close: 10 },
    { date: '2024-06-15', close: 15 },
    { date: '2024-12-20', close: 20 }
  ];

  test('finds the closest point within range', () => {
    expect(findNearestPricePoint(priceHistory, '2024-12-31')).toEqual({ date: '2024-12-20', close: 20 });
  });

  test('returns null when the closest point is further than maxDiffMs', () => {
    expect(findNearestPricePoint(priceHistory, '2023-01-01')).toBeNull();
  });

  test('returns null for empty/invalid input', () => {
    expect(findNearestPricePoint([], '2024-01-01')).toBeNull();
    expect(findNearestPricePoint(priceHistory, null)).toBeNull();
  });
});

describe('buildHistoricalPeSeries', () => {
  const priceHistory = [
    { date: '2023-12-29', close: 100 },
    { date: '2024-12-30', close: 150 }
  ];

  test('matches each EPS point to the nearest close and computes P/E', () => {
    const epsSeries = [
      { date: '2023-12-31', value: 5 },
      { date: '2024-12-31', value: 10 }
    ];
    const result = buildHistoricalPeSeries(epsSeries, priceHistory);
    expect(result).toEqual([
      { year: '2023', pe: 20 },
      { year: '2024', pe: 15 }
    ]);
  });

  test('drops a year with non-positive EPS rather than showing a nonsensical P/E', () => {
    const epsSeries = [{ date: '2024-12-31', value: -2 }];
    expect(buildHistoricalPeSeries(epsSeries, priceHistory)).toBeNull();
  });

  test('returns null when either series is missing', () => {
    expect(buildHistoricalPeSeries(null, priceHistory)).toBeNull();
    expect(buildHistoricalPeSeries([{ date: '2024-12-31', value: 5 }], [])).toBeNull();
  });
});
