import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import { getChartTheme, tooltipStyles, AREA_GRADIENT_ID } from '../utils/chartTheme';
import { buildSeriesFromHistoricalValues, computeStatsFromSeries } from '../utils/portfolioStats';
import { buildPortfolioCashFlows } from '../utils/portfolioCashFlows';
import { buildComparisonSeries } from '../utils/benchmarkComparison';
import { computeSectorDistribution } from '../utils/sectorAnalysis';
import { sectorLabelHe } from '../utils/sectorLabels';
import { computeReceivedDividends, buildUpcomingDividendCalendar } from '../utils/dividendAnalysis';
import { buildUpcomingEarningsCalendar } from '../utils/earningsCalendar';
import {
  recommendationLabelHe,
  recommendationSentiment,
  computeUpsidePercent,
  actionLabelHe,
  formatEpochDateISO
} from '../utils/analystData';
import { useBenchmarkHistory } from '../hooks/useBenchmarkHistory';
import { useStockSectors } from '../hooks/useStockSectors';
import { useAnalystRecommendations } from '../hooks/useAnalystRecommendations';
import { useDividendData } from '../hooks/useDividendData';
import { useHistoricalPortfolioValue } from '../hooks/useHistoricalPortfolioValue';
import { formatDate } from '../utils/formatters';
import { computeTaxLossHarvestingOpportunities } from '../utils/taxLossHarvesting';
import {
  compareMonthlySnapshots,
  normalizeCategoryItems,
  isLegacyRollup,
  MONTHLY_CATEGORY_KEYS,
  MONTHLY_CATEGORY_LABELS_HE,
  AUTO_DERIVED_CATEGORIES,
  MANUAL_ENTRY_CATEGORIES
} from '../utils/monthlySnapshotComparison';
import RebalancingSection from './RebalancingSection';

const BENCHMARK_OPTIONS = [
  { key: 'sp500', label: 'S&P 500' },
  { key: 'ta125', label: 'TA-125' }
];

// In-page sidebar nav (same sectionRefs/scrollToSection mechanics as
// StockResearchView.js's sidebar, and reusing its .sw-layout/.sw-sidebar/
// .sw-main CSS as-is - those are already theme-aware, page-agnostic
// classes, not scoped to .sw-page). Grouped rather than one flat list of
// 16 items, separating "whole portfolio" sections from the "American
// stocks only" block and the actionable tools, which used to be
// interleaved in a way that made the page hard to scan.
const NAV_GROUPS = [
  {
    label: 'סקירה כללית',
    items: [
      { key: 'summary', label: 'תקציר ניתוח' },
      { key: 'performance', label: 'ביצועי התיק לאורך זמן' },
      { key: 'monthly', label: 'מעקב חודשי' },
      { key: 'benchmark', label: 'השוואה מול מדד ייחוס' }
    ]
  },
  {
    label: 'הרכב התיק',
    items: [
      { key: 'pie', label: 'גרף עוגה - פיזור התיק' },
      { key: 'byStock', label: 'פיזור לפי מניות' },
      { key: 'byDate', label: 'פיזור לפי תאריכי קנייה' }
    ]
  },
  {
    label: 'מניות אמריקאיות',
    items: [
      { key: 'sector', label: 'פיזור לפי סקטור' },
      { key: 'dividends', label: 'מעקב דיבידנדים' },
      { key: 'earnings', label: 'לוח רבעונים' },
      { key: 'analysts', label: 'המלצות אנליסטים' }
    ]
  },
  {
    label: 'כלים',
    items: [
      { key: 'rebalancing', label: 'איזון מחדש' },
      { key: 'taxLoss', label: 'קיזוז מס' }
    ]
  },
  {
    label: 'דוחות',
    items: [{ key: 'reports', label: 'דוחות מפורטים' }]
  }
];

// analysis.monthlyDistribution's own key is "YYYY-MM" (a clean sortable
// string, used as-is elsewhere) - formatted here, at display time only,
// into a Hebrew month name + year (e.g. "מרץ 2024") instead of showing the
// raw sort key to the user.
function formatMonthLabel(monthKey) {
  const [year, month] = String(monthKey).split('-').map(Number);
  if (!year || !month) return monthKey;
  return new Date(year, month - 1, 1).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
}

// Net external cash flow declared per category (positive = net deposit,
// negative = net withdrawal), for the LIQUID categories only - current
// accounts, money-market funds and bank savings.
//
// Stocks and provident funds are deliberately absent: their flows are
// already recorded, dated, in the main tables (a purchase lot's own date
// and cost; a provident fund's deposit ledger) and are read straight from
// there. Offering a second, manual place to declare the same flow created
// two sources for one number with nothing to say which was right, and
// invited double-counting - the declared amount and the ledger entry would
// both be netted out. A liquid account has no such ledger, so for those
// the user's declaration is the only source there is.
//
// Kept as strings while being edited (like every other numeric input in
// this form), parsed into numbers (dropping blank/zero entries) just
// before being sent.
const emptyCashFlows = () => MANUAL_ENTRY_CATEGORIES.reduce((acc, key) => ({ ...acc, [key]: '' }), {});
const parseCashFlows = (draft) =>
  MANUAL_ENTRY_CATEGORIES.reduce((acc, key) => {
    const v = parseFloat(draft[key]);
    if (Number.isFinite(v) && v !== 0) acc[key] = v;
    return acc;
  }, {});

// The declared flows a saved month carries on categories that NO LONGER
// HAVE A FIELD - stocks and provident funds, declared back when that was
// possible.
//
// These have to survive an edit untouched. Opening a month to correct an
// unrelated figure must not quietly delete data that was recorded at the
// time and that the comparison for that month still depends on; the figure
// it produces would change for a reason the user never asked for. There's
// no UI to re-enter them either, so a drop would be unrecoverable.
const extractLegacyCashFlows = (savedCashFlows) => {
  if (!savedCashFlows || typeof savedCashFlows !== 'object') return {};
  return Object.entries(savedCashFlows).reduce((acc, [key, value]) => {
    if (MANUAL_ENTRY_CATEGORIES.includes(key)) return acc;
    if (Number.isFinite(value) && value !== 0) acc[key] = value;
    return acc;
  }, {});
};

function PortfolioAnalysisView({
  analysis,
  formatPriceWithSign,
  onBack,
  // Daily value snapshots are no longer what performance is computed from
  // (see the dynamic series below) - they're kept as a prop because the
  // benchmark comparison and the auto-snapshot mechanism still revolve
  // around them, and removing them from the API would be a larger change
  // than this section needs.
  americanStocks = [],
  israeliStocks = [],
  pensionFunds = [],
  // Needed by the dynamic performance series so the curve covers the whole
  // portfolio, not only the traded holdings (see
  // utils/historicalPortfolioValue.js).
  cashFunds = [],
  bankBalances = [],
  bankSavingsFunds = [],
  cpi = null,
  rebalanceTargets = null,
  rebalanceTargetsLoading = false,
  rebalanceSaving = false,
  rebalanceSaveError = '',
  onSaveRebalanceTargets,
  monthlySnapshots = [],
  monthlySnapshotsLoading = false,
  onSaveMonthlySnapshot,
  savingMonthly = false,
  saveMonthlyError = '',
  onUpdateMonthlySnapshot,
  updatingMonth = null,
  updateMonthlyError = '',
  onDeleteMonthlySnapshot,
  deletingMonth = null,
  deleteMonthlyError = '',
  onAddManualMonthlySnapshot,
  addingManual = false,
  addManualError = '',
  // Charts render SVG, whose presentation attributes can't read CSS
  // variables - so their colors are resolved from the active theme in JS
  // (see utils/chartTheme.js) and re-applied whenever it changes.
  theme = 'dark'
}) {
  const chart = useMemo(() => getChartTheme(theme), [theme]);
  const chartTooltip = useMemo(() => tooltipStyles(theme), [theme]);
  const SECTOR_COLORS = chart.categorical;
  // PERFORMANCE OVER TIME - computed on the fly, not read back from saved
  // snapshots.
  //
  // The whole section is driven by one date range, defaulting to the
  // portfolio's own inception (the earliest purchase/deposit date anywhere
  // in it) through today. For every sampled date in that range the
  // portfolio is valued from real historical closing prices for exactly
  // the holdings it contained on that date, plus the ledger-reconstructed
  // value of the non-traded accounts (see
  // utils/historicalPortfolioValue.js). Narrowing the range re-computes
  // it; nothing is stored, so there is no saved figure that can go stale
  // or disagree with the holdings.
  //
  // "תשואה מאז תחילת ההשקעה" and the annualized-volatility estimate below
  // are both read off this same series, which is what makes them
  // consistent with each other and with the chart.
  const portfolioInceptionDate = useMemo(() => {
    const dates = [
      ...israeliStocks.map((s) => s.purchaseDate),
      ...americanStocks.map((s) => s.purchaseDate),
      ...pensionFunds.flatMap((f) => (Array.isArray(f.deposits) ? f.deposits : []).map((d) => d.date)),
      ...bankSavingsFunds.flatMap((f) => (Array.isArray(f.deposits) ? f.deposits : []).map((d) => d.date))
    ].filter((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d));
    if (dates.length === 0) return '';
    return dates.sort()[0].slice(0, 10);
  }, [israeliStocks, americanStocks, pensionFunds, bankSavingsFunds]);

  const todayDate = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // '' means "use the default" - so the range keeps tracking inception and
  // today as holdings are added, until the user explicitly narrows it.
  const [performanceFrom, setPerformanceFrom] = useState('');
  const [performanceTo, setPerformanceTo] = useState('');

  // A date input is NOT a single-value control: it fires onChange on every
  // keystroke while the year is being typed. Typing "2023" emits "0002",
  // "0020" and "0202" first, so the raw input value is briefly a date
  // centuries in the past. Every one of those intermediate values used to
  // be committed straight through to the fetch + recompute below, which is
  // what froze the page (see buildSampleDates' own note).
  //
  // So a typed value is only accepted once it's actually a usable date.
  // Anything else leaves the previously committed range in place: the user
  // keeps typing, the chart keeps showing the last good range, and nothing
  // is recomputed until they've finished.
  const isCommittableDate = useCallback(
    (value) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
      const time = new Date(`${value}T00:00:00Z`).getTime();
      if (Number.isNaN(time)) return false;
      // No market data exists before this, and nothing after today can be
      // priced - both bounds also keep a half-typed year out.
      return value >= '1970-01-01' && value <= todayDate;
    },
    [todayDate]
  );

  const handlePerformanceFromChange = useCallback(
    (value) => {
      if (value === '') {
        setPerformanceFrom('');
        return;
      }
      if (isCommittableDate(value)) setPerformanceFrom(value);
    },
    [isCommittableDate]
  );

  const handlePerformanceToChange = useCallback(
    (value) => {
      if (value === '') {
        setPerformanceTo('');
        return;
      }
      if (isCommittableDate(value)) setPerformanceTo(value);
    },
    [isCommittableDate]
  );

  const effectivePerformanceFrom = performanceFrom || portfolioInceptionDate;
  // A range whose start is after its end produces nothing to chart, and is
  // easy to reach mid-edit (narrowing "from" before widening "to"). The
  // two are swapped rather than blanking the section out.
  const effectivePerformanceTo =
    performanceTo && performanceTo < effectivePerformanceFrom
      ? effectivePerformanceFrom
      : performanceTo || todayDate;

  const {
    series: performanceSeries,
    loading: performanceLoading,
    error: performanceError,
    breakdownAtDate: historicalBreakdownAtDate
  } = useHistoricalPortfolioValue({
    fromDate: effectivePerformanceFrom,
    toDate: effectivePerformanceTo,
    israeliStocks,
    americanStocks,
    pensionFunds,
    cashFunds,
    bankBalances,
    bankSavingsFunds
  });

  // Every dated deposit/purchase the app knows about, so the return figures
  // below measure the assets' own performance rather than how much money
  // was paid in (see utils/portfolioCashFlows.js).
  const portfolioCashFlows = useMemo(
    () =>
      buildPortfolioCashFlows({ israeliStocks, americanStocks, pensionFunds, cashFunds, bankSavingsFunds }),
    [israeliStocks, americanStocks, pensionFunds, cashFunds, bankSavingsFunds]
  );

  const stats = useMemo(
    () => computeStatsFromSeries(buildSeriesFromHistoricalValues(performanceSeries), portfolioCashFlows),
    [performanceSeries, portfolioCashFlows]
  );
  const performanceHasPartialPoints = useMemo(
    () => performanceSeries.some((p) => p.isPartial),
    [performanceSeries]
  );

  const harvesting = useMemo(
    () => computeTaxLossHarvestingOpportunities(israeliStocks, americanStocks, pensionFunds, cpi, bankSavingsFunds),
    [israeliStocks, americanStocks, pensionFunds, cpi, bankSavingsFunds]
  );

  const americanSymbols = useMemo(() => americanStocks.map((s) => s.stockName), [americanStocks]);
  const { sectorBySymbol, loading: sectorsLoading } = useStockSectors(americanSymbols);
  const sectorDistribution = useMemo(
    () => computeSectorDistribution(americanStocks, sectorBySymbol, israeliStocks),
    [americanStocks, sectorBySymbol, israeliStocks]
  );

  // One row per unique American ticker (a stock bought in several lots
  // shares the same live price/analyst data), sorted by current value so
  // the largest holdings show up first.
  const uniqueAmericanHoldings = useMemo(() => {
    const bySymbol = new Map();
    americanStocks.forEach((stock) => {
      const symbol = String(stock.stockName || '').trim().toUpperCase();
      if (!symbol) return;
      const existing = bySymbol.get(symbol);
      const valueILS = (stock.currentPrice || 0) * (stock.quantity || 0) * (stock.currentExchangeRate || stock.exchangeRate || 0);
      if (!existing) {
        bySymbol.set(symbol, { symbol, currentPrice: stock.currentPrice || null, valueILS });
      } else {
        existing.valueILS += valueILS;
        if (!existing.currentPrice && stock.currentPrice) existing.currentPrice = stock.currentPrice;
      }
    });
    return [...bySymbol.values()].sort((a, b) => b.valueILS - a.valueILS);
  }, [americanStocks]);

  const { recommendationsBySymbol, loading: analystLoading } = useAnalystRecommendations(americanSymbols);

  const uniqueAmericanSymbols = useMemo(() => uniqueAmericanHoldings.map((h) => h.symbol), [uniqueAmericanHoldings]);

  // Grouped by symbol (not deduped like uniqueAmericanHoldings) because
  // computeReceivedDividends needs each lot's own quantity/purchaseDate,
  // not just the aggregated current value.
  const lotsBySymbol = useMemo(() => {
    const map = new Map();
    americanStocks.forEach((stock) => {
      const symbol = String(stock.stockName || '').trim().toUpperCase();
      if (!symbol) return;
      if (!map.has(symbol)) map.set(symbol, []);
      map.get(symbol).push({ quantity: stock.quantity || 0, purchaseDate: stock.purchaseDate || null });
    });
    return map;
  }, [americanStocks]);

  const earliestAmericanPurchaseDate = useMemo(
    () =>
      americanStocks.reduce((earliest, stock) => {
        if (!stock.purchaseDate) return earliest;
        return !earliest || stock.purchaseDate < earliest ? stock.purchaseDate : earliest;
      }, null),
    [americanStocks]
  );

  const { dividendsBySymbol, loading: dividendsLoading } = useDividendData(
    uniqueAmericanSymbols,
    earliestAmericanPurchaseDate
  );

  const dividendRows = useMemo(
    () =>
      uniqueAmericanHoldings.map((holding) => {
        const data = dividendsBySymbol[holding.symbol];
        const lots = lotsBySymbol.get(holding.symbol) || [];
        const quantityHeld = lots.reduce((sum, lot) => sum + (lot.quantity || 0), 0);
        return {
          symbol: holding.symbol,
          dividendRate: data?.dividendRate ?? null,
          dividendYieldPercent: data?.dividendYieldPercent ?? null,
          payoutRatio: data?.payoutRatio ?? null,
          nextDate: data
            ? formatEpochDateISO(data.nextDividendDateEpoch) || formatEpochDateISO(data.exDividendDateEpoch)
            : null,
          receivedUSD: data ? computeReceivedDividends(data.history, lots) : 0,
          // Forward-looking, unlike receivedUSD above (historical/actual
          // payments already collected) - dividendRate (Yahoo's trailing
          // annual $/share) times the quantity currently held, not tied to
          // any particular past payment date.
          projectedAnnualUSD: data?.dividendRate != null ? data.dividendRate * quantityHeld : null
        };
      }),
    [uniqueAmericanHoldings, dividendsBySymbol, lotsBySymbol]
  );

  const totalProjectedAnnualUSD = useMemo(
    () => dividendRows.reduce((sum, row) => sum + (row.projectedAnnualUSD || 0), 0),
    [dividendRows]
  );

  const totalReceivedUSD = useMemo(
    () => dividendRows.reduce((sum, row) => sum + row.receivedUSD, 0),
    [dividendRows]
  );

  const upcomingDividends = useMemo(() => buildUpcomingDividendCalendar(dividendsBySymbol), [dividendsBySymbol]);
  const upcomingEarnings = useMemo(() => buildUpcomingEarningsCalendar(dividendsBySymbol), [dividendsBySymbol]);

  // The rebalancing PLAN used to be computed here purely to feed the
  // portfolio health score's allocation-drift sub-score. With the health
  // score removed, the only thing that needs a plan is RebalancingSection
  // below, which computes its own from the targets it's given (including
  // an in-progress edit draft this component can't see anyway).

  const [benchmarkKey, setBenchmarkKey] = useState('sp500');
  const {
    points: benchmarkPoints,
    loading: benchmarkLoading,
    error: benchmarkError
  } = useBenchmarkHistory(stats.hasHistory ? benchmarkKey : null, stats.firstDate);

  const comparisonSeries = useMemo(
    () => buildComparisonSeries(stats.series, benchmarkPoints),
    [stats.series, benchmarkPoints]
  );
  const comparisonLast = comparisonSeries.length ? comparisonSeries[comparisonSeries.length - 1] : null;
  const selectedBenchmarkLabel = BENCHMARK_OPTIONS.find((b) => b.key === benchmarkKey)?.label || '';

  const sectionRefs = useRef({});
  const scrollToSection = (key) => {
    sectionRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Monthly checkpoint comparison (see hooks/useMonthlySnapshots.js /
  // utils/monthlySnapshotComparison.js). monthlySnapshots comes back
  // sorted ascending by month from the server - '' selection means "use
  // the default", so the comparison keeps tracking the two most recent
  // months automatically as new ones get saved, unless the user has
  // explicitly picked something else.
  const [selectedBaseMonth, setSelectedBaseMonth] = useState('');
  const [selectedCompareMonth, setSelectedCompareMonth] = useState('');
  const defaultCompareMonth = monthlySnapshots.length ? monthlySnapshots[monthlySnapshots.length - 1].month : '';
  const defaultBaseMonth = monthlySnapshots.length >= 2 ? monthlySnapshots[monthlySnapshots.length - 2].month : '';
  const effectiveBaseMonth = selectedBaseMonth || defaultBaseMonth;
  const effectiveCompareMonth = selectedCompareMonth || defaultCompareMonth;
  const baseMonthlySnapshot = monthlySnapshots.find((s) => s.month === effectiveBaseMonth) || null;
  const compareMonthlySnapshot = monthlySnapshots.find((s) => s.month === effectiveCompareMonth) || null;
  // liveHoldings feeds the contribution adjustment (Modified Dietz) inside
  // compareMonthlySnapshots - it nets out deposits/purchases that fell
  // within the compared period (drawn from the *current* portfolio state,
  // since snapshots themselves never recorded a history of flows) so a
  // mid-period deposit isn't misread as investment growth. See that
  // function's own comment for the categories/limitations.
  const monthlyLiveHoldings = useMemo(
    () => ({ israeliStocks, americanStocks, pensionFunds, bankSavingsFunds }),
    [israeliStocks, americanStocks, pensionFunds, bankSavingsFunds]
  );
  const monthlyComparisonRows = useMemo(
    () => compareMonthlySnapshots(baseMonthlySnapshot, compareMonthlySnapshot, monthlyLiveHoldings, monthlySnapshots),
    [baseMonthlySnapshot, compareMonthlySnapshot, monthlyLiveHoldings, monthlySnapshots]
  );
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const currentMonthAlreadySaved = monthlySnapshots.some((s) => s.month === currentMonthKey);

  // "פתח פירוט מלא" / "קבץ לפי קטגוריות" - shared by the comparison table
  // and the history list below it, so toggling it once shows/hides
  // per-item detail (individual stocks/funds/accounts) everywhere in this
  // section consistently.
  const [detailedView, setDetailedView] = useState(false);

  // Editing a past monthly save - mirrors the Home page's inline-edit
  // editingMonth is which saved month (if any) is open for editing, and
  // editDraftBreakdown is a local copy of just that month's itemized
  // breakdown while it's being edited.
  //
  // EVERY DRAFT ROW CARRIES A STABLE rowId, and that - not its label or its
  // saved key - is what React keys the DOM by.
  //
  // This is the fix for the typing bug. The rows used to be keyed by
  // item.key, while renaming a row rewrote item.key to whatever had been
  // typed so far. So every keystroke changed the key React identified the
  // row by, React concluded the old row was gone and a new one had
  // appeared, and it destroyed and rebuilt the <input> - which is why the
  // caret jumped out of the field after a single character. A rowId that
  // is assigned once and never changes makes the row the same row for the
  // whole edit, so the input is preserved and typing is continuous.
  //
  // Values are held as RAW STRINGS while editing, too. Parsing on each
  // keystroke turned a half-typed "-" or "1." or an emptied field into
  // NaN, which then poisoned the category subtotal and the card total.
  // They're parsed once, at save.
  const [editingMonth, setEditingMonth] = useState(null);
  const [editDraftBreakdown, setEditDraftBreakdown] = useState(null);
  const [editDraftCashFlows, setEditDraftCashFlows] = useState(emptyCashFlows);
  // Carried through the edit untouched - see extractLegacyCashFlows.
  const [editLegacyCashFlows, setEditLegacyCashFlows] = useState({});

  const draftRowIdRef = useRef(0);
  const nextDraftRowId = () => {
    draftRowIdRef.current += 1;
    return `row-${draftRowIdRef.current}`;
  };

  // A saved { key, label, value } item -> an editable draft row.
  const toDraftRow = (item) => ({
    rowId: nextDraftRowId(),
    // Preserved so a row that is never renamed keeps matching the same
    // holding when two months are compared item-by-item.
    savedKey: item.key,
    label: item.label,
    valueText: Number.isFinite(item.value) ? String(item.value) : ''
  });

  const buildDraftFromBreakdown = (breakdown) =>
    MONTHLY_CATEGORY_KEYS.reduce((acc, key) => {
      acc[key] = normalizeCategoryItems(breakdown?.[key], key).map(toDraftRow);
      return acc;
    }, {});

  // Draft row -> the { key, label, value } shape a snapshot stores. A
  // renamed row takes its new label as its key; an untouched one keeps the
  // key it was saved under.
  const fromDraftRow = (row) => {
    const label = row.label.trim();
    const value = parseFloat(row.valueText);
    return {
      key: label && label !== row.savedKey ? label : row.savedKey || label,
      label,
      value: Number.isFinite(value) ? value : 0
    };
  };

  const draftCategoryTotal = (rows) =>
    (rows || []).reduce((sum, row) => {
      const value = parseFloat(row.valueText);
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);

  const startEditingMonth = (snapshot) => {
    const savedCashFlows = snapshot.breakdown?.cashFlows;
    setEditingMonth(snapshot.month);
    setEditDraftBreakdown(buildDraftFromBreakdown(snapshot.breakdown));
    // Only the categories that still have an input become editable...
    setEditDraftCashFlows(
      MANUAL_ENTRY_CATEGORIES.reduce((acc, key) => {
        const v = savedCashFlows?.[key];
        acc[key] = Number.isFinite(v) ? String(v) : '';
        return acc;
      }, {})
    );
    // ...and whatever a legacy month declared on the others rides along
    // unchanged.
    setEditLegacyCashFlows(extractLegacyCashFlows(savedCashFlows));
  };

  const cancelEditingMonth = () => {
    setEditingMonth(null);
    setEditDraftBreakdown(null);
    setEditDraftCashFlows(emptyCashFlows());
    setEditLegacyCashFlows({});
  };

  // Both editors update one field of one row, addressed by its stable
  // rowId - nothing about the row's identity changes as a result, so
  // nothing remounts.
  const updateDraftRow = (categoryKey, rowId, patch) => {
    setEditDraftBreakdown((prev) => ({
      ...prev,
      [categoryKey]: prev[categoryKey].map((row) => (row.rowId === rowId ? { ...row, ...patch } : row))
    }));
  };

  const handleEditItemValueChange = (categoryKey, rowId, rawValue) => {
    updateDraftRow(categoryKey, rowId, { valueText: rawValue });
  };

  const handleEditItemLabelChange = (categoryKey, rowId, rawLabel) => {
    updateDraftRow(categoryKey, rowId, { label: rawLabel });
  };

  // Free row management inside a saved month: a checkpoint may need a row
  // the portfolio no longer has (an account since closed), or be missing
  // one that existed at the time. Editing values alone couldn't express
  // either.
  const addEditItemRow = (categoryKey) => {
    setEditDraftBreakdown((prev) => ({
      ...prev,
      [categoryKey]: [...prev[categoryKey], { rowId: nextDraftRowId(), savedKey: '', label: '', valueText: '' }]
    }));
  };

  const removeEditItemRow = (categoryKey, rowId) => {
    setEditDraftBreakdown((prev) => ({
      ...prev,
      [categoryKey]: prev[categoryKey].filter((row) => row.rowId !== rowId)
    }));
  };

  // The last calendar day of a month, never later than today - the date a
  // month's checkpoint is valued at. A month still in progress is valued as
  // of today rather than at a future date with no prices.
  const monthEndDate = useCallback(
    (monthKey) => {
      if (!/^\d{4}-\d{2}$/.test(String(monthKey || ''))) return null;
      const [year, month] = monthKey.split('-').map(Number);
      const lastDay = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
      return lastDay > todayDate ? todayDate : lastDay;
    },
    [todayDate]
  );

  // AUTOMATIC FILL - the point of the monthly tracker no longer being a
  // typing exercise.
  //
  // Every row is derived from data the user already maintains in the main
  // tables: stocks from the real historical closing price on that month's
  // last trading day for the lots actually held then, and provident funds /
  // money-market funds / current accounts from their own value+deposit
  // ledgers (see utils/historicalPortfolioValue.js's
  // computeHistoricalBreakdownAtDate). Nothing here is typed in by hand.
  //
  // It returns null when the historical prices for that date haven't been
  // fetched yet, so the caller can say so instead of writing a row of
  // zeroes over the user's data.
  const buildAutoBreakdownForMonth = useCallback(
    (monthKey) => {
      const date = monthEndDate(monthKey);
      if (!date) return null;
      const breakdown = historicalBreakdownAtDate(date);
      const isEmpty = MONTHLY_CATEGORY_KEYS.every((key) => (breakdown[key] || []).length === 0);
      return isEmpty ? null : breakdown;
    },
    [historicalBreakdownAtDate, monthEndDate]
  );

  const [autoFillMessage, setAutoFillMessage] = useState('');

  const handleAutoFillEditedMonth = () => {
    const breakdown = buildAutoBreakdownForMonth(editingMonth);
    if (!breakdown) {
      setAutoFillMessage('לא נמצאו נתונים היסטוריים לחודש הזה - נסו שוב לאחר שהגרף "ביצועי התיק לאורך זמן" נטען.');
      return;
    }
    setAutoFillMessage('');
    // Rebuilt through the same draft factory as every other row, so
    // auto-filled rows are editable afterwards exactly like typed ones.
    setEditDraftBreakdown(buildDraftFromBreakdown(breakdown));
  };

  const handleEditCashFlowChange = (categoryKey, rawValue) => {
    setEditDraftCashFlows((prev) => ({ ...prev, [categoryKey]: rawValue }));
  };

  const draftTotal = editDraftBreakdown
    ? MONTHLY_CATEGORY_KEYS.reduce((sum, key) => sum + draftCategoryTotal(editDraftBreakdown[key]), 0)
    : 0;

  const handleSaveEditedMonth = async () => {
    if (!editingMonth || !editDraftBreakdown || !onUpdateMonthlySnapshot) return;
    // Draft rows become stored items here, once - not on every keystroke.
    // A row left completely blank is dropped rather than saved as a
    // nameless zero.
    const breakdown = MONTHLY_CATEGORY_KEYS.reduce((acc, key) => {
      acc[key] = editDraftBreakdown[key].map(fromDraftRow).filter((item) => item.key);
      return acc;
    }, {});
    // Legacy first, so an edited liquid category always wins over whatever
    // was stored for it - the two key sets are otherwise disjoint.
    breakdown.cashFlows = { ...editLegacyCashFlows, ...parseCashFlows(editDraftCashFlows) };
    const ok = await onUpdateMonthlySnapshot(editingMonth, draftTotal, breakdown);
    if (ok) cancelEditingMonth();
  };

  // The history section shows just one month at a time (defaulting to the
  // most recently saved one), picked via a dropdown - not a running list of
  // every saved month, which got long and repetitive once itemized detail
  // was added. '' means "use the default", same convention as the
  // comparison dropdowns above.
  const [selectedHistoryMonth, setSelectedHistoryMonth] = useState('');
  const defaultHistoryMonth = monthlySnapshots.length ? monthlySnapshots[monthlySnapshots.length - 1].month : '';
  const effectiveHistoryMonth = selectedHistoryMonth || defaultHistoryMonth;
  const historySnapshot = monthlySnapshots.find((s) => s.month === effectiveHistoryMonth) || null;

  const handleDeleteMonth = async (month) => {
    if (!onDeleteMonthlySnapshot) return;
    const ok = window.confirm(`למחוק לצמיתות את השמירה החודשית של ${formatMonthLabel(month)}? לא ניתן לשחזר לאחר המחיקה.`);
    if (!ok) return;
    const deleted = await onDeleteMonthlySnapshot(month);
    if (deleted) {
      // the deleted month may have been selected anywhere - drop back to
      // the (recomputed) defaults rather than pointing at a gone month
      if (editingMonth === month) cancelEditingMonth();
      if (selectedHistoryMonth === month) setSelectedHistoryMonth('');
      if (selectedBaseMonth === month) setSelectedBaseMonth('');
      if (selectedCompareMonth === month) setSelectedCompareMonth('');
    }
  };

  // "➕ הוספה ידנית" - backfills a past month the user never saved.
  //
  // Only the LIQUID categories are typed in here. Stocks and provident
  // funds are derived from the month's historical closes and the deposit
  // ledgers (manualAddAutoBreakdown below) and shown read-only: the app can
  // work those out exactly, so asking the user to remember and retype them
  // could only ever introduce a number that disagrees with the main tables.
  const [showManualAddForm, setShowManualAddForm] = useState(false);
  const [manualAddMonth, setManualAddMonth] = useState('');
  const emptyManualItems = () => MANUAL_ENTRY_CATEGORIES.reduce((acc, key) => ({ ...acc, [key]: [] }), {});
  const [manualAddItems, setManualAddItems] = useState(emptyManualItems);
  const [manualAddCashFlows, setManualAddCashFlows] = useState(emptyCashFlows);
  const manualAddIdRef = useRef(0);

  const openManualAddForm = () => {
    setShowManualAddForm(true);
    setManualAddMonth('');
    setManualAddItems(emptyManualItems());
    setManualAddCashFlows(emptyCashFlows());
    setAutoFillMessage('');
  };

  const handleManualAddCashFlowChange = (categoryKey, rawValue) => {
    setManualAddCashFlows((prev) => ({ ...prev, [categoryKey]: rawValue }));
  };

  const addManualItemRow = (catKey) => {
    manualAddIdRef.current += 1;
    const id = manualAddIdRef.current;
    setManualAddItems((prev) => ({ ...prev, [catKey]: [...prev[catKey], { id, label: '', value: '' }] }));
  };

  const removeManualItemRow = (catKey, id) => {
    setManualAddItems((prev) => ({ ...prev, [catKey]: prev[catKey].filter((it) => it.id !== id) }));
  };

  const updateManualItemRow = (catKey, id, field, value) => {
    setManualAddItems((prev) => ({
      ...prev,
      [catKey]: prev[catKey].map((it) => (it.id === id ? { ...it, [field]: value } : it))
    }));
  };

  // The derived half of the backfill form: recomputed whenever the chosen
  // month changes, never stored in state, so it can't drift from the main
  // tables it comes from.
  const manualAddAutoBreakdown = useMemo(
    () => (manualAddMonth ? buildAutoBreakdownForMonth(manualAddMonth) : null),
    [manualAddMonth, buildAutoBreakdownForMonth]
  );

  const manualAddAutoTotal = AUTO_DERIVED_CATEGORIES.reduce(
    (sum, key) =>
      sum + ((manualAddAutoBreakdown?.[key] || []).reduce((s, item) => s + (item.value || 0), 0)),
    0
  );

  // Prefills the liquid rows from the account ledgers, as a starting point
  // the user can then correct - unlike the derived categories above, these
  // stay editable.
  const handleAutoFillManualAdd = () => {
    const breakdown = buildAutoBreakdownForMonth(manualAddMonth);
    if (!breakdown) {
      setAutoFillMessage('לא נמצאו נתונים היסטוריים לחודש הזה - נסו שוב לאחר שהגרף "ביצועי התיק לאורך זמן" נטען.');
      return;
    }
    setAutoFillMessage('');
    setManualAddItems(
      MANUAL_ENTRY_CATEGORIES.reduce((acc, key) => {
        acc[key] = (breakdown[key] || []).map((item) => {
          manualAddIdRef.current += 1;
          return { id: manualAddIdRef.current, label: item.label, value: String(item.value) };
        });
        return acc;
      }, {})
    );
  };

  const manualAddMonthAlreadySaved = !!manualAddMonth && monthlySnapshots.some((s) => s.month === manualAddMonth);
  const manualAddManualTotal = MANUAL_ENTRY_CATEGORIES.reduce((sum, key) => {
    const catSum = manualAddItems[key].reduce((s, it) => {
      const v = parseFloat(it.value);
      return s + (Number.isFinite(v) ? v : 0);
    }, 0);
    return sum + catSum;
  }, 0);
  const manualAddTotal = manualAddAutoTotal + manualAddManualTotal;

  const handleSubmitManualAdd = async () => {
    if (!onAddManualMonthlySnapshot || !manualAddMonth || manualAddMonthAlreadySaved) return;
    const breakdown = {};
    // Derived categories go in exactly as computed.
    AUTO_DERIVED_CATEGORIES.forEach((key) => {
      breakdown[key] = (manualAddAutoBreakdown?.[key] || []).map((item) => ({ ...item }));
    });
    MANUAL_ENTRY_CATEGORIES.forEach((key) => {
      breakdown[key] = manualAddItems[key]
        .map((it) => ({ key: it.label.trim(), label: it.label.trim(), value: parseFloat(it.value) }))
        .filter((it) => it.key && Number.isFinite(it.value));
    });
    breakdown.cashFlows = parseCashFlows(manualAddCashFlows);
    const ok = await onAddManualMonthlySnapshot(manualAddMonth, manualAddTotal, breakdown);
    if (ok) setShowManualAddForm(false);
  };

  // Cash flows declared right before saving/updating *today's* month (the
  // "שמור שמירה חודשית"/"עדכן שמירה חודשית" button above the comparison
  // table - not to be confused with editingMonth's "ערוך" flow, which
  // corrects an already-saved past month).
  const [saveCashFlows, setSaveCashFlows] = useState(emptyCashFlows);
  const handleSaveCashFlowChange = (categoryKey, rawValue) => {
    setSaveCashFlows((prev) => ({ ...prev, [categoryKey]: rawValue }));
  };
  const handleSaveMonthlySnapshotClick = () => {
    // Re-saving this month REPLACES its stored row, so any flow it was
    // saved with on a category that no longer has a field would be lost
    // with it - the same silent drop the edit flow guards against. Carried
    // through here too, under whatever is declared in the form now.
    const existing = monthlySnapshots.find((snap) => snap.month === currentMonthKey);
    const legacy = extractLegacyCashFlows(existing?.breakdown?.cashFlows);
    onSaveMonthlySnapshot({ ...legacy, ...parseCashFlows(saveCashFlows) });
    setSaveCashFlows(emptyCashFlows());
  };

  const formatMoneyCell = (v) => (v != null ? `${formatPriceWithSign(v)} ₪` : '—');
  const formatPercentCell = (v) => (v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : '—');
  const percentCellClass = (v) => (v == null ? '' : v >= 0 ? 'profit-positive' : 'profit-negative');

  // Shared compact grid of one small labeled number input per LIQUID
  // category - reused by the save/edit/manual-add forms alike (see
  // emptyCashFlows' own comment for why stocks and provident funds have no
  // field here).
  const renderCashFlowInputs = (values, onChange, idPrefix) => (
    <div className="monthly-cashflow-inputs">
      <p className="monthly-cashflow-hint">
        תזרים חיצוני נטו בתקופה (₪, אופציונלי) - הפקדה = מספר חיובי, משיכה = מספר שלילי. רלוונטי רק לעו"ש, לקרנות
        כספיות ולקופות חיסכון, שאין להן שערי סגירה יומיים. עבור מניות וקופות גמל, ההפקדות והרכישות נלקחות אוטומטית
        מהתאריכים והסכומים שבטבלאות הראשיות - אין צורך (ואי אפשר) להזין אותן כאן.
      </p>
      <div className="monthly-cashflow-grid">
        {MANUAL_ENTRY_CATEGORIES.map((key) => (
          <div key={key} className="monthly-cashflow-item">
            <label htmlFor={`${idPrefix}-cashflow-${key}`}>{MONTHLY_CATEGORY_LABELS_HE[key]}</label>
            <input
              id={`${idPrefix}-cashflow-${key}`}
              type="number"
              step="0.01"
              placeholder="0"
              value={values[key]}
              onChange={(e) => onChange(key, e.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="App">
      <div className="analysis-container">
        <div className="analysis-content">
          <h1 className="analysis-title">ניתוח התיק</h1>

          <button className="back-button" onClick={onBack}>
            חזרה לדף הבית
          </button>

          <div className="sw-layout">
            <nav className="sw-sidebar">
              {NAV_GROUPS.map((group) => (
                <React.Fragment key={group.label}>
                  <div className="sw-sidebar-group-label">{group.label}</div>
                  {group.items.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className="sw-sidebar-item"
                      onClick={() => scrollToSection(item.key)}
                    >
                      {item.label}
                    </button>
                  ))}
                </React.Fragment>
              ))}
            </nav>

            <div className="sw-main">
          <div className="analysis-section" ref={(el) => (sectionRefs.current.summary = el)}>
            <h2 className="section-title">תקציר ניתוח</h2>
            <div className="distribution-grid">
              <div className="distribution-card">
                <h3>מספר פוזיציות</h3>
                <div className="distribution-value">{analysis.summaryMetrics.positionsCount}</div>
                <div className="distribution-percentage">
                  ישראליות: {analysis.summaryMetrics.israeliPositions} | אמריקאיות: {analysis.summaryMetrics.americanPositions}
                </div>
                <div className="distribution-percentage">
                  גמל: {analysis.summaryMetrics.pensionPositions} | כספית: {analysis.summaryMetrics.cashFundsPositions} | עו"ש: {analysis.summaryMetrics.bankPositions}
                </div>
              </div>
              <div className="distribution-card">
                <h3>שינוי יומי משוקלל</h3>
                <div className={`distribution-value ${analysis.summaryMetrics.weightedDailyChangePercent >= 0 ? 'profit-positive' : 'profit-negative'}`}>
                  {analysis.summaryMetrics.weightedDailyChangePercent.toFixed(2)}%
                </div>
                <div className="distribution-percentage">
                  תשואה שנתית משוקללת: {analysis.summaryMetrics.weightedAnnualizedReturnPercent.toFixed(2)}%
                </div>
              </div>
              <div className="distribution-card">
                <h3>ריכוזיות 3 פוזיציות</h3>
                <div className="distribution-value">
                  {analysis.summaryMetrics.concentrationTop3Percent.toFixed(1)}%
                </div>
                <div className="distribution-percentage">
                  זמן החזקה ממוצע: {analysis.summaryMetrics.averageHoldingDays} ימים
                </div>
              </div>
            </div>
          </div>

          <div className="analysis-section" ref={(el) => (sectionRefs.current.performance = el)}>
            <h2 className="section-title">ביצועי התיק לאורך זמן</h2>
            <p className="section-subtitle">
              מחושב בזמן אמת משערי הסגירה ההיסטוריים בפועל (בורסת תל אביב, וול סטריט ושער הדולר), לפי ההחזקות שהיו בתיק
              בכל תאריך - ולא מתוך שמירות שנשמרו מראש. שינוי בתאריך קנייה או בכמות משתקף בגרף מיידית. התשואה מחושבת
              בשיטה משוקללת-זמן (Time-Weighted) ומנוטרלת מהפקדות, משיכות ורכישות חדשות.
            </p>

            <div
              className="date-range-controls"
              style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}
            >
              <div className="form-group">
                <label htmlFor="performanceFrom">מתאריך</label>
                <input
                  type="date"
                  id="performanceFrom"
                  max={effectivePerformanceTo}
                  value={effectivePerformanceFrom}
                  onChange={(e) => handlePerformanceFromChange(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="performanceTo">עד תאריך</label>
                <input
                  type="date"
                  id="performanceTo"
                  min={effectivePerformanceFrom}
                  max={todayDate}
                  value={effectivePerformanceTo}
                  onChange={(e) => handlePerformanceToChange(e.target.value)}
                />
              </div>
              {(performanceFrom || performanceTo) && (
                <button
                  type="button"
                  className="monthly-toolbar-btn"
                  onClick={() => {
                    setPerformanceFrom('');
                    setPerformanceTo('');
                  }}
                >
                  חזרה לכל התקופה
                </button>
              )}
            </div>

            {!portfolioInceptionDate ? (
              <div className="history-empty-note">
                עדיין אין החזקות עם תאריך קנייה/הפקדה בתיק, ולכן אין ממה לחשב ביצועים לאורך זמן.
              </div>
            ) : performanceLoading && !stats.hasHistory ? (
              <div className="history-empty-note">מחשב את שווי התיק לאורך התקופה משערי סגירה היסטוריים…</div>
            ) : performanceError ? (
              <div className="history-empty-note">{performanceError}</div>
            ) : !stats.hasHistory ? (
              <div className="history-empty-note">
                לא נמצאו מספיק שערי סגירה היסטוריים בטווח הזה כדי לחשב ביצועים. נסו טווח תאריכים רחב יותר.
              </div>
            ) : (
              <>
                <div className="equity-chart-container">
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={stats.series} margin={{ top: 10, right: 24, left: 8, bottom: 0 }}>
                      {/* The fill fades to nothing at the baseline, so the
                          area reads as depth under the line rather than as a
                          solid block competing with it. */}
                      <defs>
                        <linearGradient id={AREA_GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={chart.accent} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={chart.accent} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(d) => formatDate(d)}
                        tick={{ fontSize: 12, fill: chart.axis }}
                        stroke={chart.grid}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                        tick={{ fontSize: 12, fill: chart.axis }}
                        stroke={chart.grid}
                        tickLine={false}
                        axisLine={false}
                        width={50}
                      />
                      <Tooltip
                        {...chartTooltip}
                        cursor={{ stroke: chart.accent, strokeWidth: 1, strokeDasharray: '4 4' }}
                        labelFormatter={(d) => formatDate(d)}
                        formatter={(value) => [`${formatPriceWithSign(value)} ₪`, 'שווי תיק']}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke={chart.accent}
                        strokeWidth={2.5}
                        fill={`url(#${AREA_GRADIENT_ID})`}
                        dot={false}
                        activeDot={{ r: 4, strokeWidth: 2, stroke: chart.tooltipBg }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="distribution-grid" style={{ marginTop: 16 }}>
                  <div className="distribution-card">
                    <h3>תשואה מאז תחילת ההשקעה</h3>
                    <div
                      className={`distribution-value ${
                        stats.totalReturnPercent >= 0 ? 'profit-positive' : 'profit-negative'
                      }`}
                    >
                      {stats.totalReturnPercent != null ? `${stats.totalReturnPercent.toFixed(1)}%` : '—'}
                    </div>
                    <div className="distribution-percentage">
                      {formatDate(stats.firstDate)} - {formatDate(stats.lastDate)}
                    </div>
                    {stats.isCashFlowNeutralized && (
                      <div
                        className="distribution-percentage"
                        title="תשואה משוקללת-זמן (Time-Weighted): כל הפקדה, משיכה ורכישה חדשה מנוטרלות, כך שהמספר משקף אך ורק את ביצועי הנכסים עצמם"
                      >
                        מנוטרל הפקדות ורכישות
                        {stats.netCashFlow
                          ? ` (${formatPriceWithSign(stats.netCashFlow)} ₪ נכנסו לתיק בתקופה)`
                          : ''}
                      </div>
                    )}
                  </div>
                  <div className="distribution-card">
                    <h3>תשואה שנתית ממוצעת</h3>
                    <div
                      className={`distribution-value ${
                        (stats.annualizedReturnPercent || 0) >= 0 ? 'profit-positive' : 'profit-negative'
                      }`}
                    >
                      {stats.annualizedReturnPercent != null
                        ? `${stats.annualizedReturnPercent.toFixed(1)}%`
                        : 'התקופה קצרה מדי'}
                    </div>
                    <div className="distribution-percentage">
                      תשואה שנתית מתואמת (CAGR) לאורך התקופה שנבחרה, מאותה תשואה מנוטרלת-הפקדות
                    </div>
                  </div>
                  <div className="distribution-card">
                    <h3>שווי בתחילת התקופה</h3>
                    <div className="distribution-value">
                      {formatPriceWithSign(stats.series[0].value)} ₪
                    </div>
                    <div className="distribution-percentage">{formatDate(stats.firstDate)}</div>
                  </div>
                  <div className="distribution-card">
                    <h3>שווי בסוף התקופה</h3>
                    <div className="distribution-value">
                      {formatPriceWithSign(stats.series[stats.series.length - 1].value)} ₪
                    </div>
                    <div className="distribution-percentage">{formatDate(stats.lastDate)}</div>
                  </div>
                  {/* Shown alongside the neutralized return on purpose: this
                      is the number people see in their account, and hiding it
                      would just make the (correctly) smaller return figure
                      look wrong. Labelled for what it is - a change in value,
                      not a return. */}
                  {stats.isCashFlowNeutralized && stats.naiveReturnPercent != null && (
                    <div className="distribution-card">
                      <h3>שינוי בשווי התיק (כולל הפקדות)</h3>
                      <div
                        className={`distribution-value ${
                          stats.naiveReturnPercent >= 0 ? 'profit-positive' : 'profit-negative'
                        }`}
                      >
                        {stats.naiveReturnPercent.toFixed(1)}%
                      </div>
                      <div className="distribution-percentage">
                        כמה גדל שווי התיק בפועל - כולל כסף חדש שהוכנס אליו, ולכן אינו מדד לתשואה
                      </div>
                    </div>
                  )}
                  <div className="distribution-card">
                    <h3>תנודתיות שנתית (משוערת)</h3>
                    <div className="distribution-value">
                      {stats.volatilityPercent != null
                        ? `${stats.volatilityPercent.toFixed(1)}%`
                        : 'עוד לא מספיק נתונים'}
                    </div>
                    <div className="distribution-percentage">
                      סטיית תקן שנתית של תשואות התיק, מחושבת משערי סגירה היסטוריים
                    </div>
                  </div>
                </div>
                {performanceHasPartialPoints && (
                  <p className="history-empty-note" style={{ marginTop: 8 }}>
                    שימו לב: בחלק מהתאריכים בטווח לא נמצא מחיר היסטורי לכל ההחזקות - התוצאה באותם תאריכים חלקית.
                  </p>
                )}
                {performanceLoading && (
                  <p className="history-empty-note" style={{ marginTop: 8 }}>מעדכן נתוני מחירים היסטוריים…</p>
                )}
              </>
            )}
          </div>

          <div className="analysis-section" ref={(el) => (sectionRefs.current.monthly = el)}>
            <h2 className="section-title">מעקב חודשי</h2>

            <div className="monthly-toolbar">
              <span className="monthly-status-text">
                {currentMonthAlreadySaved
                  ? `החודש (${formatMonthLabel(currentMonthKey)}) נשמר`
                  : `החודש (${formatMonthLabel(currentMonthKey)}) עדיין לא נשמר`}
              </span>
              <div className="monthly-toolbar-buttons">
                <button
                  type="button"
                  className="monthly-toolbar-btn"
                  onClick={handleSaveMonthlySnapshotClick}
                  disabled={savingMonthly}
                >
                  {savingMonthly ? 'שומר…' : currentMonthAlreadySaved ? 'עדכן שמירה חודשית' : 'שמור שמירה חודשית'}
                </button>
                {onAddManualMonthlySnapshot && (
                  <button
                    type="button"
                    className="monthly-toolbar-btn"
                    onClick={showManualAddForm ? () => setShowManualAddForm(false) : openManualAddForm}
                  >
                    ➕ הוספה ידנית
                  </button>
                )}
                {monthlySnapshots.length > 0 && (
                  <button type="button" className="monthly-toolbar-btn" onClick={() => setDetailedView((v) => !v)}>
                    {detailedView ? 'קבץ לפי קטגוריות' : 'פתח פירוט מלא'}
                  </button>
                )}
              </div>
            </div>
            {renderCashFlowInputs(saveCashFlows, handleSaveCashFlowChange, 'save')}
            {saveMonthlyError && <p className="history-empty-note">{saveMonthlyError}</p>}
            {addManualError && <p className="history-empty-note">{addManualError}</p>}

            {showManualAddForm && (
              <div className="monthly-manual-form">
                <div className="rebalance-input-item" style={{ maxWidth: 220 }}>
                  <label htmlFor="manual-add-month">חודש</label>
                  <input
                    id="manual-add-month"
                    type="month"
                    className="monthly-select"
                    max={currentMonthKey}
                    value={manualAddMonth}
                    onChange={(e) => setManualAddMonth(e.target.value)}
                  />
                </div>
                {manualAddMonthAlreadySaved && (
                  <p className="history-empty-note">
                    כבר קיימת שמירה לחודש זה - ניתן לערוך אותה למטה בהיסטוריית השמירות
                  </p>
                )}

                {/* Derived, not typed: stocks priced from the month's own
                    historical closes for the lots held then, provident funds
                    from their recorded values + deposit ledger. Read-only on
                    purpose - there is nothing here the user could correct
                    that wouldn't be a correction to the main tables instead. */}
                <div className="monthly-manual-auto-section">
                  <h4 className="monthly-manual-auto-title">נתונים שנמשכים אוטומטית מהטבלאות הראשיות</h4>
                  {!manualAddMonth ? (
                    <p className="history-empty-note">בחרו חודש כדי לראות את הנתונים שיימשכו אוטומטית.</p>
                  ) : !manualAddAutoBreakdown ? (
                    <p className="history-empty-note">
                      לא נמצאו נתונים היסטוריים לחודש הזה - נסו שוב לאחר שהגרף "ביצועי התיק לאורך זמן" נטען.
                    </p>
                  ) : (
                    AUTO_DERIVED_CATEGORIES.map((catKey) => {
                      const rows = manualAddAutoBreakdown[catKey] || [];
                      const catTotal = rows.reduce((sum, item) => sum + (item.value || 0), 0);
                      return (
                        <div key={catKey} className="monthly-manual-category">
                          <div className="monthly-manual-category-header">
                            <span>
                              {MONTHLY_CATEGORY_LABELS_HE[catKey]}
                              <span className="monthly-auto-derived-badge"> · נגזר אוטומטית</span>
                            </span>
                            <span>{formatMoneyCell(catTotal)}</span>
                          </div>
                          {rows.length === 0 ? (
                            <div className="monthly-history-item-row monthly-item-placeholder">
                              לא הוחזקו נכסים בקטגוריה זו בחודש שנבחר
                            </div>
                          ) : (
                            rows.map((item) => (
                              <div key={item.key} className="monthly-history-item-row">
                                <span className="monthly-item-label">↳ {item.label}</span>
                                <span>{formatMoneyCell(item.value)}</span>
                              </div>
                            ))
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Typed: only the accounts with no traded price to look up. */}
                <div className="monthly-manual-entry-section">
                  <h4 className="monthly-manual-auto-title">נתונים להזנה ידנית (נכסים נזילים)</h4>
                  <div className="monthly-toolbar-buttons" style={{ marginBottom: 8 }}>
                    <button
                      type="button"
                      className="monthly-toolbar-btn"
                      onClick={handleAutoFillManualAdd}
                      disabled={!manualAddMonth}
                    >
                      ⚡ מלא מהפנקסים
                    </button>
                    <span className="monthly-status-text">
                      ממלא את השורות שלמטה מתוך פנקסי ההפקדות והעדכונים של החשבונות - נקודת פתיחה שניתן לתקן.
                    </span>
                  </div>
                  {autoFillMessage && <p className="history-empty-note">{autoFillMessage}</p>}

                  {MANUAL_ENTRY_CATEGORIES.map((catKey) => (
                    <div key={catKey} className="monthly-manual-category">
                      <div className="monthly-manual-category-header">
                        <span>{MONTHLY_CATEGORY_LABELS_HE[catKey]}</span>
                        <button
                          type="button"
                          className="monthly-toolbar-btn"
                          onClick={() => addManualItemRow(catKey)}
                        >
                          + הוסף פריט
                        </button>
                      </div>
                      {manualAddItems[catKey].map((item) => (
                        <div key={item.id} className="monthly-manual-item-row">
                          <input
                            type="text"
                            className="edit-input"
                            placeholder='שם (למשל עו"ש)'
                            value={item.label}
                            onChange={(e) => updateManualItemRow(catKey, item.id, 'label', e.target.value)}
                          />
                          <input
                            type="number"
                            className="edit-input"
                            placeholder="שווי (₪)"
                            value={item.value}
                            step="0.01"
                            onChange={(e) => updateManualItemRow(catKey, item.id, 'value', e.target.value)}
                          />
                          <button
                            type="button"
                            className="monthly-toolbar-btn danger"
                            onClick={() => removeManualItemRow(catKey, item.id)}
                          >
                            הסר
                          </button>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                {renderCashFlowInputs(manualAddCashFlows, handleManualAddCashFlowChange, 'manual-add')}

                <div className="date-item" style={{ marginTop: 12 }}>
                  <span className="date-label">סה"כ: {formatMoneyCell(manualAddTotal)}</span>
                  <div className="monthly-toolbar-buttons">
                    <button
                      type="button"
                      className="monthly-toolbar-btn"
                      onClick={handleSubmitManualAdd}
                      disabled={addingManual || !manualAddMonth || manualAddMonthAlreadySaved}
                    >
                      {addingManual ? 'שומר…' : 'שמור'}
                    </button>
                    <button type="button" className="monthly-toolbar-btn" onClick={() => setShowManualAddForm(false)}>
                      ביטול
                    </button>
                  </div>
                </div>
              </div>
            )}

            {monthlySnapshotsLoading && monthlySnapshots.length === 0 ? (
              <p className="history-empty-note">טוען שמירות חודשיות…</p>
            ) : monthlySnapshots.length === 0 ? (
              <p className="history-empty-note">
                עדיין אין שמירות חודשיות. לחצו על "שמור שמירה חודשית" למעלה כדי לשמור את החודש הנוכחי, או על "הוספה
                ידנית" כדי למלא חודש עבר.
              </p>
            ) : (
              <>
                {monthlySnapshots.length >= 2 && (
                  <>
                    <h3 style={{ marginTop: 8 }}>השוואה בין חודשים</h3>
                    <div className="rebalance-inputs-grid">
                      <div className="rebalance-input-item">
                        <label htmlFor="monthly-compare-base">חודש בסיס</label>
                        <select
                          id="monthly-compare-base"
                          className="monthly-select"
                          value={effectiveBaseMonth}
                          onChange={(e) => setSelectedBaseMonth(e.target.value)}
                        >
                          {monthlySnapshots.map((s) => (
                            <option key={s.month} value={s.month}>
                              {formatMonthLabel(s.month)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="rebalance-input-item">
                        <label htmlFor="monthly-compare-target">חודש להשוואה</label>
                        <select
                          id="monthly-compare-target"
                          className="monthly-select"
                          value={effectiveCompareMonth}
                          onChange={(e) => setSelectedCompareMonth(e.target.value)}
                        >
                          {monthlySnapshots.map((s) => (
                            <option key={s.month} value={s.month}>
                              {formatMonthLabel(s.month)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="stocks-table-container">
                      <table className="analysis-table">
                        <thead>
                          <tr>
                            <th>קטגוריה{detailedView ? ' / נכס' : ''}</th>
                            <th>{formatMonthLabel(effectiveBaseMonth)}</th>
                            <th>{formatMonthLabel(effectiveCompareMonth)}</th>
                            <th title="כשיש היסטוריית הפקדות/רכישות לקטגוריה, השינוי מנוטרל מהשפעת כסף חדש שנכנס באמצע התקופה - הוא לא נספר כתשואה">
                              שינוי (מנוטרל הפקדות)
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {monthlyComparisonRows.map((row) => (
                            <React.Fragment key={row.key}>
                              <tr className={row.key === 'total' ? 'monthly-total-row' : 'monthly-category-row'}>
                                <td>{row.label}</td>
                                <td>{formatMoneyCell(row.baseValue)}</td>
                                <td>{formatMoneyCell(row.compareValue)}</td>
                                <td
                                  className={percentCellClass(row.changePercent)}
                                  title={
                                    row.contributionAdjusted
                                      ? `לפני נטרול הפקדות/רכישות: ${formatPercentCell(row.rawChangePercent)}${row.partiallyAdjusted ? ' (מבוסס רק על קטגוריות עם היסטוריית הפקדות מתועדת)' : ''}`
                                      : undefined
                                  }
                                >
                                  {formatPercentCell(row.changePercent)}
                                  {row.netCashFlow ? (
                                    <div className="monthly-cashflow-note">
                                      {row.netCashFlow > 0 ? '+' : ''}
                                      {formatMoneyCell(row.netCashFlow)} {row.netCashFlow > 0 ? 'הופקדו/נרכשו בתקופה' : 'נמשכו בתקופה'}
                                    </div>
                                  ) : null}
                                </td>
                              </tr>
                              {detailedView && row.key !== 'total' && isLegacyRollup(row.items, row.key) && (
                                <tr className="monthly-item-row">
                                  <td className="monthly-item-label" colSpan={4}>
                                    אין פירוט פריטים זמין להשוואה זו (אחד החודשים נשמר לפני שנוסף פירוט מלא)
                                  </td>
                                </tr>
                              )}
                              {detailedView &&
                                !isLegacyRollup(row.items, row.key) &&
                                row.items.map((item) => (
                                  <tr key={item.key} className="monthly-item-row">
                                    <td className="monthly-item-label">↳ {item.label}</td>
                                    <td>{formatMoneyCell(item.baseValue)}</td>
                                    <td>{formatMoneyCell(item.compareValue)}</td>
                                    <td
                                      className={percentCellClass(item.changePercent)}
                                      title={
                                        item.contributionAdjusted
                                          ? `לפני נטרול הפקדות/רכישות: ${formatPercentCell(item.rawChangePercent)}`
                                          : undefined
                                      }
                                    >
                                      {formatPercentCell(item.changePercent)}
                                      {item.netCashFlow ? (
                                        <div className="monthly-cashflow-note">
                                          {item.netCashFlow > 0 ? '+' : ''}
                                          {formatMoneyCell(item.netCashFlow)}
                                        </div>
                                      ) : null}
                                    </td>
                                  </tr>
                                ))}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                <h3 style={{ marginTop: 20 }}>היסטוריית שמירות</h3>
                <div className="rebalance-inputs-grid" style={{ marginBottom: 12 }}>
                  <div className="rebalance-input-item">
                    <label htmlFor="monthly-history-select">בחר חודש להצגה</label>
                    <select
                      id="monthly-history-select"
                      className="monthly-select"
                      value={effectiveHistoryMonth}
                      onChange={(e) => setSelectedHistoryMonth(e.target.value)}
                    >
                      {monthlySnapshots.map((s) => (
                        <option key={s.month} value={s.month}>
                          {formatMonthLabel(s.month)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {updateMonthlyError && <p className="history-empty-note">{updateMonthlyError}</p>}
                {deleteMonthlyError && <p className="history-empty-note">{deleteMonthlyError}</p>}

                {historySnapshot &&
                  (() => {
                    const isEditingThis = editingMonth === historySnapshot.month;
                    return (
                      <div className="monthly-history-list">
                        <div className="monthly-history-card">
                          <div className="date-item">
                            <span className="date-label">
                              {formatMonthLabel(historySnapshot.month)} — סה"כ{' '}
                              {formatMoneyCell(isEditingThis ? draftTotal : historySnapshot.totalValueILS)}
                            </span>
                            <div className="monthly-toolbar-buttons">
                              {isEditingThis ? (
                                <>
                                  <button
                                    type="button"
                                    className="monthly-toolbar-btn"
                                    onClick={handleAutoFillEditedMonth}
                                  >
                                    ⚡ מלא אוטומטית מהטבלאות
                                  </button>
                                  <button
                                    type="button"
                                    className="monthly-toolbar-btn"
                                    onClick={handleSaveEditedMonth}
                                    disabled={updatingMonth === historySnapshot.month}
                                  >
                                    {updatingMonth === historySnapshot.month ? 'שומר…' : 'שמור עריכה'}
                                  </button>
                                  <button type="button" className="monthly-toolbar-btn" onClick={cancelEditingMonth}>
                                    ביטול
                                  </button>
                                </>
                              ) : (
                                <>
                                  {onUpdateMonthlySnapshot && (
                                    <button
                                      type="button"
                                      className="monthly-toolbar-btn"
                                      onClick={() => startEditingMonth(historySnapshot)}
                                    >
                                      ערוך
                                    </button>
                                  )}
                                  {onDeleteMonthlySnapshot && (
                                    <button
                                      type="button"
                                      className="monthly-toolbar-btn danger"
                                      onClick={() => handleDeleteMonth(historySnapshot.month)}
                                      disabled={deletingMonth === historySnapshot.month}
                                    >
                                      {deletingMonth === historySnapshot.month ? 'מוחק…' : 'מחק'}
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>

                          {MONTHLY_CATEGORY_KEYS.map((catKey) => {
                            const savedItems = normalizeCategoryItems(historySnapshot.breakdown?.[catKey], catKey);
                            const draftRows = isEditingThis ? editDraftBreakdown[catKey] : [];
                            if (!isEditingThis && savedItems.length === 0) return null;
                            const catTotal = isEditingThis
                              ? draftCategoryTotal(draftRows)
                              : savedItems.reduce((sum, it) => sum + (it.value || 0), 0);
                            const showPlaceholder = !isEditingThis && isLegacyRollup(savedItems, catKey);
                            const isAutoDerived = AUTO_DERIVED_CATEGORIES.includes(catKey);
                            return (
                              <div key={catKey} className="monthly-history-category">
                                <div className="monthly-history-category-header">
                                  <span>
                                    {MONTHLY_CATEGORY_LABELS_HE[catKey]}
                                    {isEditingThis && isAutoDerived && (
                                      <span className="monthly-auto-derived-badge"> · נגזר אוטומטית</span>
                                    )}
                                  </span>
                                  <span className="monthly-history-category-actions">
                                    {formatMoneyCell(catTotal)}
                                    {isEditingThis && (
                                      <button
                                        type="button"
                                        className="monthly-toolbar-btn"
                                        onClick={() => addEditItemRow(catKey)}
                                      >
                                        + הוסף שורה
                                      </button>
                                    )}
                                  </span>
                                </div>
                                {/* Rows are always shown while editing, whatever the
                                    detail toggle says - otherwise there would be
                                    nothing to add a row to or remove one from. */}
                                {(detailedView || isEditingThis) && showPlaceholder && (
                                  <div className="monthly-history-item-row monthly-item-placeholder">
                                    אין פירוט פריטים לשמירה זו (נשמרה לפני שנוסף פירוט מלא)
                                  </div>
                                )}
                                {!isEditingThis &&
                                  detailedView &&
                                  !showPlaceholder &&
                                  savedItems.map((item) => (
                                    <div key={item.key} className="monthly-history-item-row">
                                      <span className="monthly-item-label">↳ {item.label}</span>
                                      <span>{formatMoneyCell(item.value)}</span>
                                    </div>
                                  ))}
                                {/* While editing, both fields are plain always-on
                                    inputs keyed by the row's own stable rowId. No
                                    click-to-edit cell to open and close, and nothing
                                    about a row's identity changes as it's typed into,
                                    so the inputs are never remounted mid-keystroke. */}
                                {isEditingThis &&
                                  draftRows.map((row) => (
                                    <div key={row.rowId} className="monthly-history-item-row">
                                      <input
                                        type="text"
                                        className="edit-input monthly-item-label-input"
                                        value={row.label}
                                        placeholder="שם הפריט"
                                        aria-label={`שם הפריט ב${MONTHLY_CATEGORY_LABELS_HE[catKey]}`}
                                        onChange={(e) => handleEditItemLabelChange(catKey, row.rowId, e.target.value)}
                                      />
                                      <input
                                        type="number"
                                        className="edit-input"
                                        value={row.valueText}
                                        step="0.01"
                                        placeholder="שווי (₪)"
                                        aria-label={`שווי הפריט ב${MONTHLY_CATEGORY_LABELS_HE[catKey]}`}
                                        onChange={(e) => handleEditItemValueChange(catKey, row.rowId, e.target.value)}
                                      />
                                      <button
                                        type="button"
                                        className="monthly-toolbar-btn danger"
                                        onClick={() => removeEditItemRow(catKey, row.rowId)}
                                      >
                                        הסר
                                      </button>
                                    </div>
                                  ))}
                              </div>
                            );
                          })}
                          {isEditingThis && autoFillMessage && (
                            <p className="history-empty-note">{autoFillMessage}</p>
                          )}
                          {isEditingThis && renderCashFlowInputs(editDraftCashFlows, handleEditCashFlowChange, 'edit')}
                        </div>
                      </div>
                    );
                  })()}
              </>
            )}
          </div>

          {stats.hasHistory && (
            <div className="analysis-section" ref={(el) => (sectionRefs.current.benchmark = el)}>
              <h2 className="section-title">השוואה מול מדד ייחוס</h2>
              <div className="benchmark-toggle-row">
                {BENCHMARK_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    className={`benchmark-toggle-button ${benchmarkKey === option.key ? 'active' : ''}`}
                    onClick={() => setBenchmarkKey(option.key)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {benchmarkLoading ? (
                <p className="history-empty-note">טוען נתוני {selectedBenchmarkLabel}…</p>
              ) : benchmarkError ? (
                <p className="history-empty-note">{benchmarkError}</p>
              ) : comparisonSeries.length < 2 ? (
                <p className="history-empty-note">
                  עדיין אין מספיק חפיפה בין ההיסטוריה של התיק שלכם לנתוני {selectedBenchmarkLabel} כדי להציג השוואה.
                </p>
              ) : (
                <>
                  <div className="equity-chart-container">
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={comparisonSeries} margin={{ top: 10, right: 24, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(d) => formatDate(d)}
                          tick={{ fontSize: 12, fill: chart.axis }}
                          stroke={chart.grid}
                          tickLine={false}
                        />
                        <YAxis
                          tickFormatter={(v) => v.toFixed(0)}
                          tick={{ fontSize: 12, fill: chart.axis }}
                          stroke={chart.grid}
                          tickLine={false}
                          axisLine={false}
                          width={45}
                        />
                        <Tooltip
                          {...chartTooltip}
                          labelFormatter={(d) => formatDate(d)}
                          formatter={(value, name) => [
                            `${Number(value).toFixed(1)}`,
                            name === 'portfolioIndexed' ? 'התיק שלי' : selectedBenchmarkLabel
                          ]}
                        />
                        <Legend
                          formatter={(name) => (name === 'portfolioIndexed' ? 'התיק שלי' : selectedBenchmarkLabel)}
                        />
                        <Line
                          type="monotone"
                          dataKey="portfolioIndexed"
                          stroke={chart.accent}
                          strokeWidth={2.5}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="benchmarkIndexed"
                          stroke={chart.benchmark}
                          strokeWidth={2.5}
                          dot={false}
                          strokeDasharray="5 3"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  {comparisonLast && (
                    <p className="section-subtitle" style={{ marginTop: 10 }}>
                      מאז {formatDate(comparisonSeries[0].date)}: התיק שלי{' '}
                      <span className={comparisonLast.portfolioIndexed >= 100 ? 'profit-positive' : 'profit-negative'}>
                        {(comparisonLast.portfolioIndexed - 100).toFixed(1)}%
                      </span>{' '}
                      לעומת {selectedBenchmarkLabel}{' '}
                      <span className={comparisonLast.benchmarkIndexed >= 100 ? 'profit-positive' : 'profit-negative'}>
                        {(comparisonLast.benchmarkIndexed - 100).toFixed(1)}%
                      </span>
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          <div className="analysis-section" ref={(el) => (sectionRefs.current.pie = el)}>
            <h2 className="section-title">גרף עוגה - פיזור התיק</h2>
            <div className="pie-chart-container">
              <div className="pie-chart-wrapper">
                <ResponsiveContainer width="60%" height={400}>
                  <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }} key="pie-chart">
                    <Pie
                      key="pie-data"
                      data={[
                        {
                          name: 'בורסה ישראלית',
                          value: analysis.exchangeDistribution.israeli.value,
                          percentage: analysis.exchangeDistribution.israeli.percentage
                        },
                        {
                          name: 'בורסה אמריקאית',
                          value: analysis.exchangeDistribution.american.value,
                          percentage: analysis.exchangeDistribution.american.percentage
                        },
                        {
                          name: 'קופות גמל',
                          value: analysis.exchangeDistribution.pension.value,
                          percentage: analysis.exchangeDistribution.pension.percentage
                        },
                        {
                          name: 'קרנות כספיות',
                          value: analysis.exchangeDistribution.cashFunds.value,
                          percentage: analysis.exchangeDistribution.cashFunds.percentage
                        },
                        {
                          name: 'עו"ש',
                          value: analysis.exchangeDistribution.bank.value,
                          percentage: analysis.exchangeDistribution.bank.percentage
                        },
                        {
                          name: 'קופת חיסכון בבנק',
                          value: analysis.exchangeDistribution.bankSavings.value,
                          percentage: analysis.exchangeDistribution.bankSavings.percentage
                        }
                      ]}
                      cx="50%"
                      cy="50%"
                      outerRadius={120}
                      fill={chart.accent}
                      dataKey="value"
                    >
                      {chart.categorical.slice(0, 6).map((color) => (
                        <Cell key={color} fill={color} stroke={chart.tooltipBg} strokeWidth={2} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>

                <div className="pie-labels-side">
                  <div className="pie-label-item">
                    <div className="label-color" style={{ backgroundColor: '#667eea' }}></div>
                    <div className="label-content">
                      <div className="label-name">בורסה ישראלית</div>
                      <div className="label-value">{formatPriceWithSign(analysis.exchangeDistribution.israeli.value)} ₪</div>
                      <div className="label-percentage">{analysis.exchangeDistribution.israeli.percentage.toFixed(1)}%</div>
                    </div>
                  </div>
                  <div className="pie-label-item">
                    <div className="label-color" style={{ backgroundColor: '#764ba2' }}></div>
                    <div className="label-content">
                      <div className="label-name">בורסה אמריקאית</div>
                      <div className="label-value">{formatPriceWithSign(analysis.exchangeDistribution.american.value)} ₪</div>
                      <div className="label-percentage">{analysis.exchangeDistribution.american.percentage.toFixed(1)}%</div>
                    </div>
                  </div>
                  <div className="pie-label-item">
                    <div className="label-color" style={{ backgroundColor: '#16a34a' }}></div>
                    <div className="label-content">
                      <div className="label-name">קופות גמל</div>
                      <div className="label-value">{formatPriceWithSign(analysis.exchangeDistribution.pension.value)} ₪</div>
                      <div className="label-percentage">{analysis.exchangeDistribution.pension.percentage.toFixed(1)}%</div>
                    </div>
                  </div>
                  <div className="pie-label-item">
                    <div className="label-color" style={{ backgroundColor: '#f59e0b' }}></div>
                    <div className="label-content">
                      <div className="label-name">קרנות כספיות</div>
                      <div className="label-value">{formatPriceWithSign(analysis.exchangeDistribution.cashFunds.value)} ₪</div>
                      <div className="label-percentage">{analysis.exchangeDistribution.cashFunds.percentage.toFixed(1)}%</div>
                    </div>
                  </div>
                  <div className="pie-label-item">
                    <div className="label-color" style={{ backgroundColor: '#0ea5e9' }}></div>
                    <div className="label-content">
                      <div className="label-name">עו"ש</div>
                      <div className="label-value">{formatPriceWithSign(analysis.exchangeDistribution.bank.value)} ₪</div>
                      <div className="label-percentage">{analysis.exchangeDistribution.bank.percentage.toFixed(1)}%</div>
                    </div>
                  </div>
                  <div className="pie-label-item">
                    <div className="label-color" style={{ backgroundColor: '#ec4899' }}></div>
                    <div className="label-content">
                      <div className="label-name">קופת חיסכון בבנק</div>
                      <div className="label-value">{formatPriceWithSign(analysis.exchangeDistribution.bankSavings.value)} ₪</div>
                      <div className="label-percentage">{analysis.exchangeDistribution.bankSavings.percentage.toFixed(1)}%</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="analysis-section" ref={(el) => (sectionRefs.current.byStock = el)}>
            <h2 className="section-title">פיזור לפי מניות</h2>
            <div className="stocks-table-container">
              <table className="analysis-table">
                <thead>
                  <tr>
                    <th>מנייה</th>
                    <th>בורסה</th>
                    <th>שווי נוכחי</th>
                    <th>אחוז מהתיק</th>
                    <th>רווח/הפסד</th>
                    <th>אחוז רווח/הפסד</th>
                    <th>זמן החזקה</th>
                    <th>תשואה שנתית</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.stockDistribution.map((stock, index) => (
                    <tr key={index}>
                      <td>{stock.displayName || stock.name}</td>
                      <td>{stock.exchange === 'israeli' ? 'ישראלית' : 'אמריקאית'}</td>
                      <td>{formatPriceWithSign(stock.value)} ₪</td>
                      <td>{stock.percentage.toFixed(1)}%</td>
                      <td className={stock.profit >= 0 ? 'profit-positive' : 'profit-negative'}>
                        {formatPriceWithSign(stock.profit)} ₪
                      </td>
                      <td className={stock.profitPercentage >= 0 ? 'profit-positive' : 'profit-negative'}>
                        {stock.profitPercentage.toFixed(1)}%
                      </td>
                      <td>{stock.daysHeld > 365 ? `${stock.yearsHeld.toFixed(1)} שנים` : `${stock.daysHeld} ימים`}</td>
                      <td className={stock.annualizedReturn >= 0 ? 'profit-positive' : 'profit-negative'}>
                        {(stock.annualizedReturn * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="analysis-section" ref={(el) => (sectionRefs.current.byDate = el)}>
            <h2 className="section-title">פיזור לפי תאריכי קנייה והפקדה</h2>
            <p className="section-subtitle">
              כולל גם הפקדות לקופות גמל, לקופות חיסכון ולקרנות כספיות - כל הפקדה משויכת לחודש שבו בוצעה בפועל, לצד
              רכישות המניות.
            </p>
            <div className="date-distribution-grid">
              <div className="date-distribution-card">
                <h3>פיזור חודשי</h3>
                <div className="date-list">
                  {analysis.monthlyDistribution.map((item, index) => (
                    <div key={index} className="date-item">
                      <span className="date-label">{formatMonthLabel(item.month)}</span>
                      <span className="date-value">{formatPriceWithSign(item.value)} ₪</span>
                      <span className="date-count">({item.count} רכישות/הפקדות)</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="date-distribution-card">
                <h3>פיזור שנתי</h3>
                <div className="date-list">
                  {analysis.yearlyDistribution.map((item, index) => (
                    <div key={index} className="date-item">
                      <span className="date-label">{item.year}</span>
                      <span className="date-value">{formatPriceWithSign(item.value)} ₪</span>
                      <span className="date-count">({item.count} רכישות/הפקדות)</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="analysis-section" ref={(el) => (sectionRefs.current.sector = el)}>
            <h2 className="section-title">פיזור לפי סקטור</h2>
            {americanStocks.length === 0 && israeliStocks.length === 0 ? (
              <p className="history-empty-note">אין מניות בתיק כרגע.</p>
            ) : sectorsLoading && !sectorDistribution.hasData ? (
              <p className="history-empty-note">טוען נתוני סקטור…</p>
            ) : !sectorDistribution.hasData ? (
              <p className="history-empty-note">לא ניתן היה לטעון נתוני סקטור כרגע.</p>
            ) : (
              <>
                <div className="pie-chart-container">
                  <div className="pie-chart-wrapper">
                    <ResponsiveContainer width="55%" height={340}>
                      <PieChart>
                        <Pie
                          data={sectorDistribution.sectors.map((s) => ({
                            name: sectorLabelHe(s.sectorKey),
                            value: s.value
                          }))}
                          cx="50%"
                          cy="50%"
                          outerRadius={110}
                          dataKey="value"
                        >
                          {sectorDistribution.sectors.map((s, i) => (
                            <Cell key={s.sectorKey} fill={SECTOR_COLORS[i % SECTOR_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => [`${formatPriceWithSign(value)} ₪`, 'שווי']} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pie-labels-side">
                      {sectorDistribution.sectors.map((s, i) => (
                        <div className="pie-label-item" key={s.sectorKey}>
                          <div
                            className="label-color"
                            style={{ backgroundColor: SECTOR_COLORS[i % SECTOR_COLORS.length] }}
                          ></div>
                          <div className="label-content">
                            <div className="label-name">{sectorLabelHe(s.sectorKey)}</div>
                            <div className="label-value">
                              {formatPriceWithSign(s.value)} ₪ ({s.symbolCount} מניות)
                            </div>
                            <div className="label-percentage">{s.percentage.toFixed(1)}%</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {sectorDistribution.topSectorPercent > 40 && (
                  <p className="section-subtitle" style={{ marginTop: 10 }}>
                    שימו לב: {sectorDistribution.topSectorPercent.toFixed(0)}% מהרכיב האמריקאי מרוכז בסקטור אחד (
                    {sectorLabelHe(sectorDistribution.sectors[0].sectorKey)}) — ריכוזיות מסוג הזה לא נראית בפיזור
                    "ישראלי מול אמריקאי" הרגיל.
                  </p>
                )}
              </>
            )}
          </div>

          <div className="analysis-section" ref={(el) => (sectionRefs.current.dividends = el)}>
            <h2 className="section-title">מעקב דיבידנדים (מניות אמריקאיות)</h2>
            {americanStocks.length === 0 ? (
              <p className="history-empty-note">אין מניות אמריקאיות בתיק כרגע.</p>
            ) : dividendsLoading && Object.keys(dividendsBySymbol).length === 0 ? (
              <p className="history-empty-note">טוען נתוני דיבידנד…</p>
            ) : (
              <>
                <div className="distribution-grid">
                  <div className="distribution-card">
                    <h3>סה"כ דיבידנדים שהתקבלו</h3>
                    <div className="distribution-value profit-positive">${totalReceivedUSD.toFixed(2)}</div>
                    <div className="distribution-percentage">מצטבר, מאז תאריך הרכישה של כל פוזיציה</div>
                  </div>
                  <div className="distribution-card">
                    <h3>הכנסת דיבידנד שנתית צפויה</h3>
                    <div className="distribution-value">${totalProjectedAnnualUSD.toFixed(2)}</div>
                    <div className="distribution-percentage">
                      דיבידנד שנתי למניה (לפי הנתון הידוע היום) × כמות מוחזקת כרגע - תחזית, לא סכום שכבר התקבל
                    </div>
                  </div>
                </div>

                <div className="stocks-table-container" style={{ marginTop: 16 }}>
                  <table className="analysis-table">
                    <thead>
                      <tr>
                        <th>מנייה</th>
                        <th>דיבידנד שנתי ($/מניה)</th>
                        <th>תשואת דיבידנד</th>
                        <th>יחס חלוקה (Payout)</th>
                        <th>תאריך תשלום קרוב</th>
                        <th>הכנסה שנתית צפויה ($)</th>
                        <th>סה"כ שהתקבל ($)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dividendRows.map((row) => (
                        <tr key={row.symbol}>
                          <td>{row.symbol}</td>
                          <td>{row.dividendRate != null ? `$${row.dividendRate.toFixed(2)}` : '—'}</td>
                          <td>{row.dividendYieldPercent != null ? `${row.dividendYieldPercent.toFixed(2)}%` : '—'}</td>
                          <td>{row.payoutRatio != null ? `${(row.payoutRatio * 100).toFixed(0)}%` : '—'}</td>
                          <td>{row.nextDate ? formatDate(row.nextDate) : '—'}</td>
                          <td>{row.projectedAnnualUSD != null ? `$${row.projectedAnnualUSD.toFixed(2)}` : '—'}</td>
                          <td>${row.receivedUSD.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {upcomingDividends.length > 0 && (
                  <>
                    <h3 style={{ marginTop: 20 }}>לוח דיבידנדים קרובים</h3>
                    <div className="date-list">
                      {upcomingDividends.map((row) => (
                        <div key={row.symbol} className="date-item">
                          <span className="date-label">{row.symbol}</span>
                          <span className="date-value">{formatDate(row.date)}</span>
                          <span className="date-count">
                            {row.dividendRate != null ? `$${row.dividendRate.toFixed(2)}/מניה` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          <div className="analysis-section" ref={(el) => (sectionRefs.current.earnings = el)}>
            <h2 className="section-title">לוח רבעונים (מניות אמריקאיות)</h2>
            {americanStocks.length === 0 ? (
              <p className="history-empty-note">אין מניות אמריקאיות בתיק כרגע.</p>
            ) : dividendsLoading && Object.keys(dividendsBySymbol).length === 0 ? (
              <p className="history-empty-note">טוען נתוני דוחות…</p>
            ) : upcomingEarnings.length === 0 ? (
              <p className="history-empty-note">אין כרגע תאריכי דוח עתידיים ידועים עבור המניות בתיק.</p>
            ) : (
              <div className="date-list">
                {upcomingEarnings.map((row) => (
                  <div key={row.symbol} className="date-item">
                    <span className="date-label">{row.symbol}</span>
                    <span className="date-value">{formatDate(row.date)}</span>
                    <span className="date-count">
                      {row.epsEstimateAverage != null ? `EPS משוער: $${row.epsEstimateAverage.toFixed(2)}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="analysis-section" ref={(el) => (sectionRefs.current.analysts = el)}>
            <h2 className="section-title">המלצות אנליסטים (מניות אמריקאיות)</h2>
            {americanStocks.length === 0 ? (
              <p className="history-empty-note">אין מניות אמריקאיות בתיק כרגע.</p>
            ) : analystLoading && uniqueAmericanHoldings.every((h) => !recommendationsBySymbol[h.symbol]) ? (
              <p className="history-empty-note">טוען נתוני אנליסטים…</p>
            ) : (
              <div className="stocks-table-container">
                <table className="analysis-table">
                  <thead>
                    <tr>
                      <th>מנייה</th>
                      <th>המלצה</th>
                      <th>מס' אנליסטים</th>
                      <th>יעד מחיר ממוצע</th>
                      <th>מרחק מהיעד</th>
                      <th>שדרוג/הורדה אחרונים</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uniqueAmericanHoldings.map((holding) => {
                      const rec = recommendationsBySymbol[holding.symbol];
                      const upside = rec ? computeUpsidePercent(holding.currentPrice, rec.targetMeanPrice) : null;
                      const sentiment = rec ? recommendationSentiment(rec.recommendationKey) : null;
                      const lastUpgrade = rec && rec.upgradeHistory && rec.upgradeHistory[0];
                      const lastUpgradeDate = lastUpgrade ? formatEpochDateISO(lastUpgrade.epochGradeDate) : null;
                      return (
                        <tr key={holding.symbol}>
                          <td>{holding.symbol}</td>
                          <td className={sentiment ? `profit-${sentiment}` : ''}>
                            {rec ? recommendationLabelHe(rec.recommendationKey) : 'לא זמין'}
                          </td>
                          <td>{rec && rec.numberOfAnalystOpinions != null ? rec.numberOfAnalystOpinions : '—'}</td>
                          <td>{rec && rec.targetMeanPrice != null ? `$${rec.targetMeanPrice.toFixed(2)}` : '—'}</td>
                          <td className={upside != null ? (upside >= 0 ? 'profit-positive' : 'profit-negative') : ''}>
                            {upside != null ? `${upside.toFixed(1)}%` : '—'}
                          </td>
                          <td>
                            {lastUpgrade
                              ? `${actionLabelHe(lastUpgrade.action)} · ${lastUpgrade.firm || ''}${
                                  lastUpgradeDate ? ` · ${formatDate(lastUpgradeDate)}` : ''
                                }`
                              : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="analysis-section" ref={(el) => (sectionRefs.current.rebalancing = el)}>
            <h2 className="section-title">איזון מחדש (Rebalancing)</h2>
            <RebalancingSection
              exchangeDistribution={analysis.exchangeDistribution}
              formatPriceWithSign={formatPriceWithSign}
              targets={rebalanceTargets}
              targetsLoading={rebalanceTargetsLoading}
              saving={rebalanceSaving}
              saveError={rebalanceSaveError}
              onSaveTargets={onSaveRebalanceTargets}
            />
          </div>

          <div className="analysis-section" ref={(el) => (sectionRefs.current.taxLoss = el)}>
            <h2 className="section-title">הזדמנויות לקיזוז מס (Tax-Loss Harvesting)</h2>
            <div className="distribution-grid">
              <div className="distribution-card">
                <h3>סה"כ הפסד ריאלי הניתן למימוש</h3>
                <div className="distribution-value profit-negative">
                  {formatPriceWithSign(harvesting.totalHarvestableLoss)} ₪
                </div>
                <div className="distribution-percentage">{harvesting.lossPositions.length} פוזיציות</div>
              </div>
              <div className="distribution-card">
                <h3>שווי מס פוטנציאלי</h3>
                <div className="distribution-value profit-positive">
                  עד {formatPriceWithSign(harvesting.totalPotentialTaxValue)} ₪
                </div>
                <div className="distribution-percentage">אם ימומש מול רווחים באותו שיעור מס</div>
              </div>
              <div className="distribution-card">
                <h3>רווחים ריאליים פתוחים כרגע</h3>
                <div className="distribution-value profit-positive">
                  {formatPriceWithSign(harvesting.totalCurrentGains)} ₪
                </div>
                <div className="distribution-percentage">
                  מס משוער: {formatPriceWithSign(harvesting.totalGainsTax)} ₪
                </div>
              </div>
            </div>

            {!harvesting.hasLossPositions ? (
              <p className="history-empty-note">אין כרגע פוזיציות בהפסד ריאלי בתיק.</p>
            ) : (
              <div className="stocks-table-container" style={{ marginTop: 16 }}>
                <table className="analysis-table">
                  <thead>
                    <tr>
                      <th>פוזיציה</th>
                      <th>קטגוריה</th>
                      <th>הפסד ריאלי</th>
                      <th>שווי מס פוטנציאלי</th>
                    </tr>
                  </thead>
                  <tbody>
                    {harvesting.lossPositions.map((position) => (
                      <tr key={`${position.category}-${position.id}`}>
                        <td>{position.name}</td>
                        <td>{position.categoryLabel}</td>
                        <td className="profit-negative">{formatPriceWithSign(position.harvestableLoss)} ₪</td>
                        <td className="profit-positive">{formatPriceWithSign(position.taxValue)} ₪</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="analysis-section" ref={(el) => (sectionRefs.current.reports = el)}>
            <h2 className="section-title">דוחות מפורטים</h2>
            <div className="reports-grid">
              <div className="report-card">
                <h3>המניות הכי רווחיות</h3>
                <div className="report-list">
                  {analysis.reports.topPerformers.length === 0 ? (
                    <div className="report-item">
                      <span className="report-name">אין כרגע מניות ברווח</span>
                    </div>
                  ) : (
                    analysis.reports.topPerformers.map((stock, index) => (
                      <div key={index} className="report-item">
                        <span className="report-name">{stock.displayName || stock.name}</span>
                        <span className="report-profit profit-positive">
                          {formatPriceWithSign(stock.profit)} ₪
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="report-card">
                <h3>המניות הכי מפסידות</h3>
                <div className="report-list">
                  {analysis.reports.worstPerformers.length === 0 ? (
                    <div className="report-item">
                      <span className="report-name">אין כרגע מניות בהפסד</span>
                    </div>
                  ) : (
                    analysis.reports.worstPerformers.map((stock, index) => (
                      <div key={index} className="report-item">
                        <span className="report-name">{stock.displayName || stock.name}</span>
                        <span className="report-profit profit-negative">
                          {formatPriceWithSign(stock.profit)} ₪
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="report-card">
                <h3>הפוזיציות הכי גדולות</h3>
                <div className="report-list">
                  {analysis.reports.largestPositions.map((stock, index) => (
                    <div key={index} className="report-item">
                      <span className="report-name">{stock.displayName || stock.name}</span>
                      <span className="report-value">
                        {formatPriceWithSign(stock.value)} ₪
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PortfolioAnalysisView;
