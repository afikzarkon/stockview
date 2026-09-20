// A date-by-date account of how the performance curve was built.
//
// The chart shows one number per date and a handful of headline
// percentages. When those disagree with what someone believes their
// portfolio did, the chart itself offers no way to find out which of the
// two is wrong - the valuation, the cash-flow model, or the expectation.
// This produces the working: for every point, what each asset class
// contributed, what money crossed the boundary since the previous point,
// what that sub-period returned once the flows were netted out, and what
// the chained time-weighted return stood at by then.
//
// It recomputes nothing. Every figure here comes from the same functions
// the chart uses (Modified Dietz per sub-period, chained geometrically -
// see portfolioStats.js), so a row that looks wrong is evidence about the
// real calculation rather than about a second implementation of it.
import { calculateModifiedDietzReturn } from './modifiedDietz';
import { cashFlowsInPeriod } from './portfolioCashFlows';

const round = (value, dp = 2) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const factor = 10 ** dp;
  return Math.round(value * factor) / factor;
};

// series: {date, value}[] as fed to computeStatsFromSeries (partial points
// already dropped). historicalSeries: the raw points, which still carry
// byCategory/isPartial. cashFlows: [{date, amount}].
export const buildPerformanceAuditRows = ({
  series = [],
  historicalSeries = [],
  cashFlows = []
} = {}) => {
  const byDate = new Map(
    (historicalSeries || []).filter((p) => p && p.date).map((p) => [p.date, p])
  );

  let chainedGrowth = 1;
  let cumulativeFlow = 0;

  return series.map((point, i) => {
    const prev = i > 0 ? series[i - 1] : null;
    const raw = byDate.get(point.date) || {};
    const categories = raw.byCategory || {};

    // The first point has no preceding period, so nothing has "flowed in
    // since" it - its own funding is already inside its opening value.
    const flows = prev ? cashFlowsInPeriod(cashFlows, prev.date, point.date) : [];
    const netFlow = flows.reduce((sum, f) => sum + (f.amount || 0), 0);
    cumulativeFlow += netFlow;

    let subPeriodReturnPercent = null;
    if (prev && prev.value > 0) {
      const { percent } = calculateModifiedDietzReturn({
        beginningValue: prev.value,
        endingValue: point.value,
        cashFlows: flows,
        periodStart: prev.date,
        periodEnd: point.date
      });
      if (percent !== null && Number.isFinite(percent) && 1 + percent / 100 > 0) {
        subPeriodReturnPercent = percent;
        chainedGrowth *= 1 + percent / 100;
      }
    }

    // The naive change is carried alongside deliberately: the gap between
    // the two columns IS the cash-flow adjustment, so a reader can see how
    // much of the portfolio's growth was contributions rather than take
    // that on trust.
    const naiveChangePercent =
      prev && prev.value > 0 ? (point.value / prev.value - 1) * 100 : null;

    return {
      date: point.date,
      portfolioValueILS: round(point.value),
      israeliILS: round(categories.israeli ?? 0),
      americanILS: round(categories.american ?? 0),
      pensionILS: round(categories.pension ?? 0),
      cashFundsILS: round(categories.cashFunds ?? 0),
      bankILS: round(categories.bank ?? 0),
      bankSavingsILS: round(categories.bankSavings ?? 0),
      netCashFlowILS: round(netFlow),
      cumulativeCashFlowILS: round(cumulativeFlow),
      naiveChangePercent: round(naiveChangePercent),
      subPeriodReturnPercent: round(subPeriodReturnPercent),
      chainedTwrPercent: round((chainedGrowth - 1) * 100)
    };
  });
};

// Column order and Hebrew headers for the on-screen table and the CSV.
// One list, so the two can never drift apart.
export const AUDIT_COLUMNS = [
  { key: 'date', label: 'תאריך', type: 'text' },
  { key: 'portfolioValueILS', label: 'שווי התיק (₪)', type: 'money' },
  { key: 'israeliILS', label: 'בורסה ישראלית', type: 'money' },
  { key: 'americanILS', label: 'בורסה אמריקאית', type: 'money' },
  { key: 'pensionILS', label: 'קופות גמל', type: 'money' },
  { key: 'cashFundsILS', label: 'כספית שקלית', type: 'money' },
  { key: 'bankILS', label: 'עו"ש', type: 'money' },
  { key: 'bankSavingsILS', label: 'חיסכון בבנק', type: 'money' },
  { key: 'netCashFlowILS', label: 'תזרים בתקופה (₪)', type: 'money' },
  { key: 'cumulativeCashFlowILS', label: 'תזרים מצטבר (₪)', type: 'money' },
  { key: 'naiveChangePercent', label: 'שינוי נאיבי (%)', type: 'percent' },
  { key: 'subPeriodReturnPercent', label: 'תשואת התקופה (%)', type: 'percent' },
  { key: 'chainedTwrPercent', label: 'TWR מצטבר (%)', type: 'percent' }
];

// RFC 4180 quoting: a field containing a comma, a quote or a newline is
// wrapped and its quotes doubled. Hebrew headers make this more than
// theoretical.
const csvCell = (value) => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const buildAuditCsv = (rows) => {
  const header = AUDIT_COLUMNS.map((c) => csvCell(c.label)).join(',');
  const body = (rows || []).map((row) => AUDIT_COLUMNS.map((c) => csvCell(row[c.key])).join(','));
  // A BOM, so Excel opens a UTF-8 file with Hebrew headers as Hebrew rather
  // than as mojibake - the single most likely destination for this export.
  return `\uFEFF${[header, ...body].join('\n')}\n`;
};

// The whole audit as one JSON document: the rows, the headline figures the
// UI displays, and the inputs they were derived from - so a downloaded file
// is self-contained evidence rather than a table that needs the app open
// beside it to interpret.
export const buildAuditJson = ({ rows = [], stats = {}, cashFlows = [], range = {}, partial = {} } = {}) =>
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      // Which holdings the figures below are about - a file showing only
      // the Israeli equities is not a file about the whole portfolio, and
      // has to say which it is.
      selection: {
        segment: range.segment ?? null,
        // Which currency basis the American figures are on. The same dates
        // carry different values under the two modes, so a file without
        // this cannot be interpreted.
        fxMode: range.fxMode ?? null,
        description: range.description ?? null
      },
      range,
      method: {
        valuation:
          'Historical closing prices per holding (TASE in agorot/100, Yahoo in USD x USD-ILS on the day), carried forward from the last trading day on or before each date. A lot bought on the date itself is valued at its own cost basis. Non-traded accounts are reconstructed from their value/deposit ledgers; bank savings compound each deposit at its stated rate.',
        return:
          'Time-weighted return: Modified Dietz per sub-period over the flows inside it, chained geometrically. Contributions are excluded from performance.',
        skippedDates:
          'Dates where some holding could not be priced are omitted from the series entirely rather than plotted as a partial sum.'
      },
      headline: {
        firstDate: stats.firstDate ?? null,
        lastDate: stats.lastDate ?? null,
        pointsUsed: stats.snapshotsCount ?? 0,
        timeWeightedReturnPercent: round(stats.timeWeightedReturnPercent),
        naiveReturnPercent: round(stats.naiveReturnPercent),
        annualizedReturnPercent: round(stats.annualizedReturnPercent),
        volatilityPercent: round(stats.volatilityPercent),
        netCashFlowILS: round(stats.netCashFlow)
      },
      skippedPartialDates: partial,
      cashFlows,
      rows
    },
    null,
    2
  );
