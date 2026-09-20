import {
  AUDIT_COLUMNS,
  buildAuditCsv,
  buildAuditJson,
  buildPerformanceAuditRows
} from './performanceAudit';

// A portfolio worth 1,000 that receives 1,000 halfway through and ends at
// 2,200. The naive reading is +120%; the money that was paid in accounts
// for all but 200 of it. These fixtures are deliberately small enough that
// every figure below can be checked by hand.
const series = [
  { date: '2024-01-01', value: 1000 },
  { date: '2024-02-01', value: 1100 },
  { date: '2024-03-01', value: 2200 }
];

const historicalSeries = [
  { date: '2024-01-01', valueILS: 1000, isPartial: false, byCategory: { israeli: 600, american: 400 } },
  { date: '2024-02-01', valueILS: 1100, isPartial: false, byCategory: { israeli: 700, american: 400 } },
  { date: '2024-03-01', valueILS: 2200, isPartial: false, byCategory: { israeli: 700, american: 400, bank: 1100 } }
];

const cashFlows = [{ date: '2024-02-15', amount: 1000 }];

const rows = () => buildPerformanceAuditRows({ series, historicalSeries, cashFlows });

describe('buildPerformanceAuditRows', () => {
  test('emits one row per plotted point', () => {
    expect(rows().map((r) => r.date)).toEqual(['2024-01-01', '2024-02-01', '2024-03-01']);
  });

  // The opening point has no preceding period, so nothing can have flowed
  // in "since" it - its own funding is already inside its value.
  test('the first row has no period to report a return or a flow for', () => {
    const first = rows()[0];
    expect(first.netCashFlowILS).toBe(0);
    expect(first.subPeriodReturnPercent).toBeNull();
    expect(first.naiveChangePercent).toBeNull();
    expect(first.chainedTwrPercent).toBe(0);
  });

  test('breaks each point down by asset class', () => {
    const last = rows()[2];
    expect(last.israeliILS).toBe(700);
    expect(last.americanILS).toBe(400);
    expect(last.bankILS).toBe(1100);
    expect(last.portfolioValueILS).toBe(2200);
  });

  // A category absent from a point's breakdown contributed nothing, which
  // is a 0 rather than a blank - the columns have to add up.
  test('reports an absent category as zero, so the row sums to the total', () => {
    const first = rows()[0];
    expect(first.pensionILS).toBe(0);
    expect(first.bankSavingsILS).toBe(0);
    const parts =
      first.israeliILS + first.americanILS + first.pensionILS +
      first.cashFundsILS + first.bankILS + first.bankSavingsILS;
    expect(parts).toBeCloseTo(first.portfolioValueILS, 2);
  });

  test('attributes each flow to the period it landed in, and accumulates it', () => {
    const [first, second, third] = rows();
    expect(first.cumulativeCashFlowILS).toBe(0);
    expect(second.netCashFlowILS).toBe(0);
    expect(third.netCashFlowILS).toBe(1000);
    expect(third.cumulativeCashFlowILS).toBe(1000);
  });

  // The gap between these two columns IS the cash-flow adjustment. The
  // portfolio doubled on paper in the last period; almost all of it was
  // the deposit.
  test('shows the naive change beside the flow-adjusted return', () => {
    const third = rows()[2];
    expect(third.naiveChangePercent).toBeCloseTo(100, 2); // 1100 -> 2200
    expect(third.subPeriodReturnPercent).toBeLessThan(15);
    expect(third.subPeriodReturnPercent).toBeGreaterThan(0);
  });

  test('the chained figure compounds the periods rather than adding them', () => {
    const [, second, third] = rows();
    const expected = ((1 + second.subPeriodReturnPercent / 100) * (1 + third.subPeriodReturnPercent / 100) - 1) * 100;
    expect(third.chainedTwrPercent).toBeCloseTo(expected, 2);
  });

  test('handles an empty series without throwing', () => {
    expect(buildPerformanceAuditRows()).toEqual([]);
    expect(buildPerformanceAuditRows({ series: [], historicalSeries: [], cashFlows: [] })).toEqual([]);
  });

  // The rows are read against the chart, so a point whose breakdown is
  // missing still has to appear rather than vanish from the audit.
  test('still emits a row when a point has no breakdown attached', () => {
    const out = buildPerformanceAuditRows({ series, historicalSeries: [], cashFlows });
    expect(out).toHaveLength(3);
    expect(out[0].portfolioValueILS).toBe(1000);
    expect(out[0].israeliILS).toBe(0);
  });
});

describe('buildAuditCsv', () => {
  test('writes a header row matching the columns, then one line per row', () => {
    const lines = buildAuditCsv(rows()).trim().split('\n');
    expect(lines).toHaveLength(4);
    // One field per column, in the declared order. Compared after parsing
    // the quoting rather than by rebuilding the expected string, which
    // would just restate the implementation.
    const header = lines[0].replace(/^﻿/, '');
    expect(header.split(',')).toHaveLength(AUDIT_COLUMNS.length);
    expect(header).toContain('תאריך');
    expect(header).toContain('TWR מצטבר (%)');
    expect(lines[1].startsWith('2024-01-01,1000')).toBe(true);
  });

  // Excel is the most likely destination, and without a BOM it reads a
  // UTF-8 file with Hebrew headers as mojibake.
  test('starts with a BOM so Hebrew headers survive Excel', () => {
    expect(buildAuditCsv(rows()).charCodeAt(0)).toBe(0xfeff);
  });

  // A Hebrew header containing a quote character would otherwise break the
  // column alignment of every row beneath it.
  test('quotes any header containing a comma or a quote', () => {
    const bankColumn = AUDIT_COLUMNS.find((c) => c.key === 'bankILS');
    expect(bankColumn.label).toContain('"');
    expect(buildAuditCsv([])).toContain('"עו""ש"');
  });

  test('renders an empty row set as a header alone', () => {
    expect(buildAuditCsv([]).trim().split('\n')).toHaveLength(1);
  });
});

describe('buildAuditJson', () => {
  const parsed = () =>
    JSON.parse(
      buildAuditJson({
        rows: rows(),
        stats: {
          firstDate: '2024-01-01',
          lastDate: '2024-03-01',
          snapshotsCount: 3,
          timeWeightedReturnPercent: 12.3456,
          naiveReturnPercent: 120,
          netCashFlow: 1000
        },
        cashFlows,
        range: { fromDate: '2024-01-01', toDate: '2024-03-01' },
        partial: { count: 2, symbols: ['NOPRICE'] }
      })
    );

  test('carries the rows, the headline figures and the inputs behind them', () => {
    const doc = parsed();
    expect(doc.rows).toHaveLength(3);
    expect(doc.headline.timeWeightedReturnPercent).toBe(12.35);
    expect(doc.headline.naiveReturnPercent).toBe(120);
    expect(doc.cashFlows).toEqual(cashFlows);
    expect(doc.range).toEqual({ fromDate: '2024-01-01', toDate: '2024-03-01' });
  });

  // A downloaded file is read away from the app, so it has to say how its
  // numbers were produced rather than assume the reader knows.
  test('states the method, so the file is self-contained evidence', () => {
    const doc = parsed();
    expect(doc.method.valuation).toBeTruthy();
    expect(doc.method.return).toContain('Modified Dietz');
    expect(doc.generatedAt).toBeTruthy();
  });

  test('reports the dates that had to be skipped', () => {
    expect(parsed().skippedPartialDates).toEqual({ count: 2, symbols: ['NOPRICE'] });
  });

  test('produces valid JSON with no arguments at all', () => {
    expect(() => JSON.parse(buildAuditJson())).not.toThrow();
  });
});
