import {
  compareMonthlySnapshots,
  normalizeCategoryItems,
  isLegacyRollup,
  MONTHLY_CATEGORY_KEYS,
  MONTHLY_CATEGORY_LABELS_HE
} from './monthlySnapshotComparison';

const january = {
  month: '2024-01',
  totalValueILS: 100000,
  breakdown: {
    israeli: [{ key: 'TEVA', label: 'TEVA', value: 20000 }],
    american: [
      { key: 'PLTR', label: 'PLTR', value: 12000 },
      { key: 'AAPL', label: 'AAPL', value: 18000 }
    ],
    pension: [{ key: 'קופה א', label: 'קופה א', value: 40000 }],
    cashFunds: [{ key: 'קרן X', label: 'קרן X', value: 5000 }],
    bank: [{ key: 'bank-1', label: 'עו"ש', value: 5000 }]
  }
};

const february = {
  month: '2024-02',
  totalValueILS: 110000,
  breakdown: {
    israeli: [{ key: 'TEVA', label: 'TEVA', value: 22000 }],
    american: [
      { key: 'PLTR', label: 'PLTR', value: 15000 },
      { key: 'AAPL', label: 'AAPL', value: 17000 }
      // note: no new stock added/removed vs. january in this fixture
    ],
    pension: [{ key: 'קופה א', label: 'קופה א', value: 44000 }],
    cashFunds: [{ key: 'קרן X', label: 'קרן X', value: 5000 }],
    bank: [{ key: 'bank-1', label: 'עו"ש', value: 12000 }]
  }
};

describe('normalizeCategoryItems', () => {
  test('passes through the itemized array shape as-is', () => {
    const items = [{ key: 'TEVA', label: 'TEVA', value: 100 }];
    expect(normalizeCategoryItems(items, 'israeli')).toEqual(items);
  });

  test('wraps the legacy flat-number shape (pre-itemized snapshots) as a single item', () => {
    expect(normalizeCategoryItems(5000, 'bank')).toEqual([{ key: 'bank', label: 'עו"ש', value: 5000 }]);
  });

  test('returns an empty array for missing/invalid category data', () => {
    expect(normalizeCategoryItems(undefined, 'bank')).toEqual([]);
    expect(normalizeCategoryItems(null, 'bank')).toEqual([]);
    expect(normalizeCategoryItems('not a number', 'bank')).toEqual([]);
  });
});

describe('isLegacyRollup', () => {
  test('true for the single synthetic item normalizeCategoryItems() produces from a legacy flat number', () => {
    expect(isLegacyRollup(normalizeCategoryItems(5000, 'bank'), 'bank')).toBe(true);
  });

  test('false for a real itemized list, even a single-holding one', () => {
    expect(isLegacyRollup([{ key: 'TEVA', label: 'TEVA', value: 5000 }], 'israeli')).toBe(false);
  });

  test('false for an empty list or multiple items', () => {
    expect(isLegacyRollup([], 'bank')).toBe(false);
    expect(
      isLegacyRollup(
        [
          { key: 'TEVA', label: 'TEVA', value: 1 },
          { key: 'AAPL', label: 'AAPL', value: 2 }
        ],
        'israeli'
      )
    ).toBe(false);
  });
});

describe('compareMonthlySnapshots', () => {
  test('returns one row per category plus a trailing total row', () => {
    const rows = compareMonthlySnapshots(january, february);
    expect(rows.map((r) => r.key)).toEqual([...MONTHLY_CATEGORY_KEYS, 'total']);
    rows.slice(0, -1).forEach((r) => expect(r.label).toBe(MONTHLY_CATEGORY_LABELS_HE[r.key]));
    expect(rows[rows.length - 1].label).toBe('סה"כ תיק');
  });

  test('computes category subtotals (sum of items) and % change', () => {
    const rows = compareMonthlySnapshots(january, february);
    const american = rows.find((r) => r.key === 'american');
    expect(american.baseValue).toBe(30000); // 12000 + 18000
    expect(american.compareValue).toBe(32000); // 15000 + 17000
    expect(american.changePercent).toBeCloseTo(((32000 - 30000) / 30000) * 100, 5);
  });

  test('each category row carries per-item rows matched across the two months by key', () => {
    const rows = compareMonthlySnapshots(january, february);
    const american = rows.find((r) => r.key === 'american');
    const pltr = american.items.find((i) => i.key === 'PLTR');
    expect(pltr.baseValue).toBe(12000);
    expect(pltr.compareValue).toBe(15000);
    expect(pltr.changePercent).toBeCloseTo(25, 5);
    expect(american.items.map((i) => i.key).sort()).toEqual(['AAPL', 'PLTR']);
  });

  test('an item bought since the base month (present only in the compare snapshot) gets a null base value/% change, not 0', () => {
    const febWithNewStock = {
      ...february,
      breakdown: {
        ...february.breakdown,
        american: [...february.breakdown.american, { key: 'NVDA', label: 'NVDA', value: 9000 }]
      }
    };
    const rows = compareMonthlySnapshots(january, febWithNewStock);
    const american = rows.find((r) => r.key === 'american');
    const nvda = american.items.find((i) => i.key === 'NVDA');
    expect(nvda.baseValue).toBeNull();
    expect(nvda.compareValue).toBe(9000);
    expect(nvda.changePercent).toBeNull();
  });

  test('an item sold since the base month (present only in the base snapshot) gets a null compare value/% change, not 0', () => {
    const janWithExtraStock = {
      ...january,
      breakdown: {
        ...january.breakdown,
        american: [...january.breakdown.american, { key: 'MSFT', label: 'MSFT', value: 4000 }]
      }
    };
    const rows = compareMonthlySnapshots(janWithExtraStock, february);
    const american = rows.find((r) => r.key === 'american');
    const msft = american.items.find((i) => i.key === 'MSFT');
    expect(msft.baseValue).toBe(4000);
    expect(msft.compareValue).toBeNull();
    expect(msft.changePercent).toBeNull();
  });

  test('computes the trailing total row from totalValueILS, not a sum of the categories', () => {
    const rows = compareMonthlySnapshots(january, february);
    const total = rows.find((r) => r.key === 'total');
    expect(total.baseValue).toBe(100000);
    expect(total.compareValue).toBe(110000);
    expect(total.changePercent).toBeCloseTo(10, 5);
    expect(total.items).toEqual([]);
  });

  test('a category entirely missing from one snapshot (e.g. no pension funds yet that month) gets null values/change, not 0', () => {
    const noPension = { ...january, breakdown: { ...january.breakdown, pension: [] } };
    const rows = compareMonthlySnapshots(noPension, february);
    const pension = rows.find((r) => r.key === 'pension');
    expect(pension.baseValue).toBeNull();
    expect(pension.compareValue).toBe(44000);
    expect(pension.changePercent).toBeNull();
  });

  test('is backward-compatible with legacy snapshots saved as flat category numbers (pre-itemized) - category totals/% change still work, even though there is no per-stock detail to match against the itemized month', () => {
    const legacyJanuary = {
      month: '2024-01',
      totalValueILS: 100000,
      breakdown: { israeli: 20000, american: 30000, pension: 40000, cashFunds: 5000, bank: 5000 }
    };
    const rows = compareMonthlySnapshots(legacyJanuary, february);
    const israeli = rows.find((r) => r.key === 'israeli');
    expect(israeli.baseValue).toBe(20000);
    expect(israeli.compareValue).toBe(22000);
    expect(israeli.changePercent).toBeCloseTo(10, 5);
    // the legacy side has no per-stock keys to match against, so the
    // itemized TEVA row and the legacy category-as-one-item row both show
    // up, each with the other side null - not silently merged/dropped
    expect(israeli.items).toEqual(
      expect.arrayContaining([
        { key: 'TEVA', label: 'TEVA', baseValue: null, compareValue: 22000, changePercent: null },
        { key: 'israeli', label: 'בורסה ישראלית', baseValue: 20000, compareValue: null, changePercent: null }
      ])
    );
  });

  test('a base value of 0 yields a null % change rather than Infinity/NaN', () => {
    const zeroBank = { ...january, breakdown: { ...january.breakdown, bank: [{ key: 'bank-1', label: 'עו"ש', value: 0 }] } };
    const rows = compareMonthlySnapshots(zeroBank, february);
    const bank = rows.find((r) => r.key === 'bank');
    expect(bank.baseValue).toBe(0);
    expect(bank.changePercent).toBeNull();
  });

  test('returns an empty array when either snapshot is missing', () => {
    expect(compareMonthlySnapshots(null, february)).toEqual([]);
    expect(compareMonthlySnapshots(january, null)).toEqual([]);
    expect(compareMonthlySnapshots(null, null)).toEqual([]);
  });

  test('handles a snapshot with no breakdown at all (older data, or a failed breakdown save)', () => {
    const noBreakdown = { month: '2024-01', totalValueILS: 100000, breakdown: null };
    const rows = compareMonthlySnapshots(noBreakdown, february);
    MONTHLY_CATEGORY_KEYS.forEach((key) => {
      const row = rows.find((r) => r.key === key);
      expect(row.baseValue).toBeNull();
      expect(row.changePercent).toBeNull();
      // february (the compare side) still has real items in every category,
      // so items isn't empty here - only each item's baseValue is null
      row.items.forEach((item) => expect(item.baseValue).toBeNull());
    });
    const total = rows.find((r) => r.key === 'total');
    expect(total.baseValue).toBe(100000);
  });
});
