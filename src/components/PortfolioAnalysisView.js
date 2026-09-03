import React, { useMemo, useRef, useState } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import { computePortfolioStats } from '../utils/portfolioStats';
import { buildComparisonSeries } from '../utils/benchmarkComparison';
import { computeSectorDistribution } from '../utils/sectorAnalysis';
import { sectorLabelHe } from '../utils/sectorLabels';
import { buildCorrelationMatrix, highestCorrelatedPairs } from '../utils/correlationAnalysis';
import { computeReceivedDividends, buildUpcomingDividendCalendar } from '../utils/dividendAnalysis';
import { buildUpcomingEarningsCalendar } from '../utils/earningsCalendar';
import { buildNewsFeed } from '../utils/newsFeed';
import { isValidTargetAllocation, computeRebalancingPlan } from '../utils/rebalancing';
import {
  computePortfolioHealthScore,
  healthScoreLabelHe,
  HEALTH_SCORE_SUBSCORE_LABELS_HE
} from '../utils/portfolioHealthScore';
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
import { useHoldingsPriceHistory } from '../hooks/useHoldingsPriceHistory';
import { useDividendData } from '../hooks/useDividendData';
import { useStockNews } from '../hooks/useStockNews';
import { formatDate } from '../utils/formatters';
import { computeTaxLossHarvestingOpportunities } from '../utils/taxLossHarvesting';
import {
  compareMonthlySnapshots,
  normalizeCategoryItems,
  isLegacyRollup,
  MONTHLY_CATEGORY_KEYS,
  MONTHLY_CATEGORY_LABELS_HE
} from '../utils/monthlySnapshotComparison';
import RebalancingSection from './RebalancingSection';

const SECTOR_COLORS = ['#667eea', '#f59e0b', '#16a34a', '#0ea5e9', '#dc2626', '#8b5cf6', '#0d9488', '#ea580c', '#64748b', '#c026d3'];

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
      { key: 'health', label: 'ציון בריאות תיק' },
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
      { key: 'correlation', label: 'קורלציה בין אחזקות' },
      { key: 'dividends', label: 'מעקב דיבידנדים' },
      { key: 'earnings', label: 'לוח רבעונים' },
      { key: 'news', label: 'חדשות רלוונטיות' },
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

// Red for positive correlation (moves together - less real diversification
// than it looks), green for negative (moves oppositely - real
// diversification). Intensity scales with |value|; null (not enough
// shared history) gets no fill.
function correlationCellColor(value) {
  if (value === null || value === undefined) return 'transparent';
  const intensity = Math.min(Math.abs(value), 1) * 0.55;
  return value >= 0 ? `rgba(220, 38, 38, ${intensity})` : `rgba(22, 163, 74, ${intensity})`;
}

function PortfolioAnalysisView({
  analysis,
  formatPriceWithSign,
  onBack,
  snapshots = [],
  snapshotsLoading = false,
  americanStocks = [],
  israeliStocks = [],
  pensionFunds = [],
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
  addManualError = ''
}) {
  const stats = useMemo(() => computePortfolioStats(snapshots), [snapshots]);

  const harvesting = useMemo(
    () => computeTaxLossHarvestingOpportunities(israeliStocks, americanStocks, pensionFunds, cpi, bankSavingsFunds),
    [israeliStocks, americanStocks, pensionFunds, cpi, bankSavingsFunds]
  );

  const americanSymbols = useMemo(() => americanStocks.map((s) => s.stockName), [americanStocks]);
  const { sectorBySymbol, loading: sectorsLoading } = useStockSectors(americanSymbols);
  const sectorDistribution = useMemo(
    () => computeSectorDistribution(americanStocks, sectorBySymbol),
    [americanStocks, sectorBySymbol]
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
  const { historyBySymbol, loading: historyLoading } = useHoldingsPriceHistory(uniqueAmericanSymbols);
  const correlationMatrix = useMemo(() => buildCorrelationMatrix(historyBySymbol), [historyBySymbol]);
  const topCorrelatedPairs = useMemo(
    () => highestCorrelatedPairs(correlationMatrix.symbols, correlationMatrix.matrix, 3),
    [correlationMatrix]
  );

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
        return {
          symbol: holding.symbol,
          dividendRate: data?.dividendRate ?? null,
          dividendYieldPercent: data?.dividendYieldPercent ?? null,
          payoutRatio: data?.payoutRatio ?? null,
          nextDate: data
            ? formatEpochDateISO(data.nextDividendDateEpoch) || formatEpochDateISO(data.exDividendDateEpoch)
            : null,
          receivedUSD: data ? computeReceivedDividends(data.history, lots) : 0
        };
      }),
    [uniqueAmericanHoldings, dividendsBySymbol, lotsBySymbol]
  );

  const totalReceivedUSD = useMemo(
    () => dividendRows.reduce((sum, row) => sum + row.receivedUSD, 0),
    [dividendRows]
  );

  const upcomingDividends = useMemo(() => buildUpcomingDividendCalendar(dividendsBySymbol), [dividendsBySymbol]);
  const upcomingEarnings = useMemo(() => buildUpcomingEarningsCalendar(dividendsBySymbol), [dividendsBySymbol]);

  const { newsBySymbol, loading: newsLoading } = useStockNews(uniqueAmericanSymbols);
  const newsFeed = useMemo(() => buildNewsFeed(newsBySymbol, 15), [newsBySymbol]);

  // Uses the persisted rebalanceTargets prop (not RebalancingSection's own
  // in-progress edit draft, which this component has no access to) - the
  // health score reflects saved targets, not an unsaved edit.
  const rebalancingPlan = useMemo(() => {
    if (!rebalanceTargets || !isValidTargetAllocation(rebalanceTargets)) return null;
    return computeRebalancingPlan(analysis.exchangeDistribution, rebalanceTargets);
  }, [rebalanceTargets, analysis.exchangeDistribution]);

  const healthScore = useMemo(
    () =>
      computePortfolioHealthScore({
        concentrationTop3Percent: analysis.summaryMetrics.concentrationTop3Percent,
        topSectorPercent: sectorDistribution.hasData ? sectorDistribution.topSectorPercent : null,
        correlationSymbols: correlationMatrix.symbols,
        correlationMatrix: correlationMatrix.matrix,
        volatilityPercent: stats.hasHistory ? stats.volatilityPercent : null,
        maxDrawdownPercent: stats.hasHistory ? stats.maxDrawdownPercent : null,
        allocationMaxAbsDiffPercent: rebalancingPlan ? rebalancingPlan.maxAbsDiffPercent : null
      }),
    [analysis.summaryMetrics.concentrationTop3Percent, sectorDistribution, correlationMatrix, stats, rebalancingPlan]
  );

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
  const monthlyComparisonRows = useMemo(
    () => compareMonthlySnapshots(baseMonthlySnapshot, compareMonthlySnapshot),
    [baseMonthlySnapshot, compareMonthlySnapshot]
  );
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const currentMonthAlreadySaved = monthlySnapshots.some((s) => s.month === currentMonthKey);

  // "פתח פירוט מלא" / "קבץ לפי קטגוריות" - shared by the comparison table
  // and the history list below it, so toggling it once shows/hides
  // per-item detail (individual stocks/funds/accounts) everywhere in this
  // section consistently.
  const [detailedView, setDetailedView] = useState(false);

  // Editing a past monthly save - mirrors the Home page's inline-edit
  // pattern (App.js's editingField/handleCellClick/handleInlineEdit):
  // editingMonth is which saved month (if any) is open for editing,
  // editDraftBreakdown is a local mutable copy of just that month's
  // itemized breakdown (categoryKey -> array of {key,label,value}), and
  // editingCell is which single item's value currently shows an <input>
  // ("categoryKey-itemKey"-ish) - same click-one-cell-at-a-time affordance
  // as the Home tables, not a whole-row/whole-card edit mode.
  const [editingMonth, setEditingMonth] = useState(null);
  const [editDraftBreakdown, setEditDraftBreakdown] = useState(null);
  const [editingCell, setEditingCell] = useState(null);

  const startEditingMonth = (snapshot) => {
    setEditingMonth(snapshot.month);
    setEditDraftBreakdown(
      MONTHLY_CATEGORY_KEYS.reduce((acc, key) => {
        acc[key] = normalizeCategoryItems(snapshot.breakdown?.[key], key).map((item) => ({ ...item }));
        return acc;
      }, {})
    );
    setEditingCell(null);
  };

  const cancelEditingMonth = () => {
    setEditingMonth(null);
    setEditDraftBreakdown(null);
    setEditingCell(null);
  };

  const handleEditItemValueChange = (categoryKey, itemKey, rawValue) => {
    const numValue = parseFloat(rawValue);
    setEditDraftBreakdown((prev) => ({
      ...prev,
      [categoryKey]: prev[categoryKey].map((item) => (item.key === itemKey ? { ...item, value: numValue } : item))
    }));
  };

  const draftTotal = editDraftBreakdown
    ? MONTHLY_CATEGORY_KEYS.reduce(
        (sum, key) => sum + editDraftBreakdown[key].reduce((s, it) => s + (it.value || 0), 0),
        0
      )
    : 0;

  const handleSaveEditedMonth = async () => {
    if (!editingMonth || !editDraftBreakdown || !onUpdateMonthlySnapshot) return;
    const ok = await onUpdateMonthlySnapshot(editingMonth, draftTotal, editDraftBreakdown);
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

  // "➕ הוספה ידנית" - lets the user deliberately backfill a past month
  // they forgot to save, typing in their own remembered per-item values
  // (not derived from the live portfolio) - a real feature available to
  // everyone, unlike the old dev-only mock-seed button this replaced.
  const [showManualAddForm, setShowManualAddForm] = useState(false);
  const [manualAddMonth, setManualAddMonth] = useState('');
  const emptyManualItems = () => MONTHLY_CATEGORY_KEYS.reduce((acc, key) => ({ ...acc, [key]: [] }), {});
  const [manualAddItems, setManualAddItems] = useState(emptyManualItems);
  const manualAddIdRef = useRef(0);

  const openManualAddForm = () => {
    setShowManualAddForm(true);
    setManualAddMonth('');
    setManualAddItems(emptyManualItems());
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

  const manualAddMonthAlreadySaved = !!manualAddMonth && monthlySnapshots.some((s) => s.month === manualAddMonth);
  const manualAddTotal = MONTHLY_CATEGORY_KEYS.reduce((sum, key) => {
    const catSum = manualAddItems[key].reduce((s, it) => {
      const v = parseFloat(it.value);
      return s + (Number.isFinite(v) ? v : 0);
    }, 0);
    return sum + catSum;
  }, 0);

  const handleSubmitManualAdd = async () => {
    if (!onAddManualMonthlySnapshot || !manualAddMonth || manualAddMonthAlreadySaved) return;
    const breakdown = {};
    MONTHLY_CATEGORY_KEYS.forEach((key) => {
      breakdown[key] = manualAddItems[key]
        .map((it) => ({ key: it.label.trim(), label: it.label.trim(), value: parseFloat(it.value) }))
        .filter((it) => it.key && Number.isFinite(it.value));
    });
    const ok = await onAddManualMonthlySnapshot(manualAddMonth, manualAddTotal, breakdown);
    if (ok) setShowManualAddForm(false);
  };

  const formatMoneyCell = (v) => (v != null ? `${formatPriceWithSign(v)} ₪` : '—');
  const formatPercentCell = (v) => (v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : '—');
  const percentCellClass = (v) => (v == null ? '' : v >= 0 ? 'profit-positive' : 'profit-negative');

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
          <div className="analysis-section" ref={(el) => (sectionRefs.current.health = el)}>
            <h2 className="section-title">ציון בריאות תיק</h2>
            {healthScore.overallScore === null ? (
              <p className="history-empty-note">
                עדיין אין מספיק נתונים לחשב ציון - נדרשת היסטוריית שווי תיק, נתוני מניות אמריקאיות, או יעדי איזון
                שמורים.
              </p>
            ) : (
              <div className="distribution-grid">
                <div className="distribution-card">
                  <h3>ציון כולל</h3>
                  <div
                    className={`distribution-value ${
                      healthScore.overallScore >= 60
                        ? 'profit-positive'
                        : healthScore.overallScore >= 40
                        ? ''
                        : 'profit-negative'
                    }`}
                  >
                    {healthScore.overallScore}/100
                  </div>
                  <div className="distribution-percentage">{healthScoreLabelHe(healthScore.overallScore)}</div>
                </div>
                {Object.entries(healthScore.breakdown).map(([key, value]) => (
                  <div className="distribution-card" key={key}>
                    <h3>{HEALTH_SCORE_SUBSCORE_LABELS_HE[key]}</h3>
                    <div className="distribution-value">{value !== null ? value : '—'}</div>
                    <div className="distribution-percentage">{value !== null ? healthScoreLabelHe(value) : 'אין נתונים'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

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
            {!stats.hasHistory ? (
              <div className="history-empty-note">
                {snapshotsLoading
                  ? 'טוען היסטוריית שווי תיק…'
                  : 'עדיין אין מספיק נקודות מדידה כדי להציג מגמה. האפליקציה שומרת את שווי התיק אוטומטית בכל יום שבו אתם נכנסים - חזרו לכאן בעוד כמה ימים כדי לראות גרף, ירידה מקסימלית (drawdown) ותנודתיות אמיתית.'}
              </div>
            ) : (
              <>
                <div className="equity-chart-container">
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={stats.series} margin={{ top: 10, right: 24, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(102,126,234,0.15)" />
                      <XAxis dataKey="date" tickFormatter={(d) => formatDate(d)} tick={{ fontSize: 12 }} />
                      <YAxis
                        tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                        tick={{ fontSize: 12 }}
                        width={50}
                      />
                      <Tooltip
                        labelFormatter={(d) => formatDate(d)}
                        formatter={(value) => [`${formatPriceWithSign(value)} ₪`, 'שווי תיק']}
                      />
                      <Line type="monotone" dataKey="value" stroke="#667eea" strokeWidth={2.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="distribution-grid" style={{ marginTop: 16 }}>
                  <div className="distribution-card">
                    <h3>תשואה מאז תחילת המעקב</h3>
                    <div className={`distribution-value ${stats.totalReturnPercent >= 0 ? 'profit-positive' : 'profit-negative'}`}>
                      {stats.totalReturnPercent != null ? `${stats.totalReturnPercent.toFixed(1)}%` : '—'}
                    </div>
                    <div className="distribution-percentage">
                      {formatDate(stats.firstDate)} - {formatDate(stats.lastDate)}
                    </div>
                  </div>
                  <div className="distribution-card">
                    <h3>ירידה מקסימלית (Drawdown)</h3>
                    <div className="distribution-value profit-negative">
                      -{stats.maxDrawdownPercent.toFixed(1)}%
                    </div>
                    <div className="distribution-percentage">
                      {stats.drawdownPeakDate && stats.drawdownTroughDate
                        ? `${formatDate(stats.drawdownPeakDate)} ← ${formatDate(stats.drawdownTroughDate)}`
                        : 'אין ירידה עדיין'}
                    </div>
                  </div>
                  <div className="distribution-card">
                    <h3>תנודתיות שנתית (משוערת)</h3>
                    <div className="distribution-value">
                      {stats.volatilityPercent != null ? `${stats.volatilityPercent.toFixed(1)}%` : 'עוד לא מספיק נתונים'}
                    </div>
                    <div className="distribution-percentage">סטיית תקן שנתית של תשואות התיק</div>
                  </div>
                  <div className="distribution-card">
                    <h3>Sharpe Ratio (משוער)</h3>
                    <div className="distribution-value">
                      {stats.sharpeRatio != null ? stats.sharpeRatio.toFixed(2) : 'עוד לא מספיק נתונים'}
                    </div>
                    <div className="distribution-percentage">תשואה עודפת ביחס לתנודתיות (ריבית חסרת סיכון = 0%)</div>
                  </div>
                </div>
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
                  onClick={onSaveMonthlySnapshot}
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

                {MONTHLY_CATEGORY_KEYS.map((catKey) => (
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
                          placeholder="שם (למשל TEVA)"
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
                            <th>שינוי</th>
                          </tr>
                        </thead>
                        <tbody>
                          {monthlyComparisonRows.map((row) => (
                            <React.Fragment key={row.key}>
                              <tr className={row.key === 'total' ? 'monthly-total-row' : 'monthly-category-row'}>
                                <td>{row.label}</td>
                                <td>{formatMoneyCell(row.baseValue)}</td>
                                <td>{formatMoneyCell(row.compareValue)}</td>
                                <td className={percentCellClass(row.changePercent)}>
                                  {formatPercentCell(row.changePercent)}
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
                                    <td className={percentCellClass(item.changePercent)}>
                                      {formatPercentCell(item.changePercent)}
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
                            const items = isEditingThis
                              ? editDraftBreakdown[catKey]
                              : normalizeCategoryItems(historySnapshot.breakdown?.[catKey], catKey);
                            if (!isEditingThis && items.length === 0) return null;
                            const catTotal = items.reduce((sum, it) => sum + (it.value || 0), 0);
                            const showPlaceholder = !isEditingThis && isLegacyRollup(items, catKey);
                            return (
                              <div key={catKey} className="monthly-history-category">
                                <div className="monthly-history-category-header">
                                  <span>{MONTHLY_CATEGORY_LABELS_HE[catKey]}</span>
                                  <span>{formatMoneyCell(catTotal)}</span>
                                </div>
                                {detailedView && showPlaceholder && (
                                  <div className="monthly-history-item-row monthly-item-placeholder">
                                    אין פירוט פריטים לשמירה זו (נשמרה לפני שנוסף פירוט מלא)
                                  </div>
                                )}
                                {detailedView &&
                                  !showPlaceholder &&
                                  items.map((item) => {
                                    const cellKey = `${catKey}-${item.key}`;
                                    return (
                                      <div key={item.key} className="monthly-history-item-row">
                                        <span className="monthly-item-label">↳ {item.label}</span>
                                        {isEditingThis && editingCell === cellKey ? (
                                          <input
                                            type="number"
                                            className="edit-input"
                                            value={item.value}
                                            autoFocus
                                            step="0.01"
                                            onChange={(e) =>
                                              handleEditItemValueChange(catKey, item.key, e.target.value)
                                            }
                                            onBlur={() => setEditingCell(null)}
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') setEditingCell(null);
                                            }}
                                          />
                                        ) : (
                                          <span
                                            className={isEditingThis ? 'editable-cell' : ''}
                                            onClick={() => isEditingThis && setEditingCell(cellKey)}
                                          >
                                            {formatMoneyCell(item.value)}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                              </div>
                            );
                          })}
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
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(102,126,234,0.15)" />
                        <XAxis dataKey="date" tickFormatter={(d) => formatDate(d)} tick={{ fontSize: 12 }} />
                        <YAxis tickFormatter={(v) => v.toFixed(0)} tick={{ fontSize: 12 }} width={45} />
                        <Tooltip
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
                          stroke="#667eea"
                          strokeWidth={2.5}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="benchmarkIndexed"
                          stroke="#f59e0b"
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
                      fill="#8884d8"
                      dataKey="value"
                    >
                      <Cell fill="#667eea" />
                      <Cell fill="#764ba2" />
                      <Cell fill="#16a34a" />
                      <Cell fill="#f59e0b" />
                      <Cell fill="#0ea5e9" />
                      <Cell fill="#ec4899" />
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
                      <td>{stock.name}</td>
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
            <h2 className="section-title">פיזור לפי תאריכי קנייה</h2>
            <div className="date-distribution-grid">
              <div className="date-distribution-card">
                <h3>פיזור חודשי</h3>
                <div className="date-list">
                  {analysis.monthlyDistribution.map((item, index) => (
                    <div key={index} className="date-item">
                      <span className="date-label">{formatMonthLabel(item.month)}</span>
                      <span className="date-value">{formatPriceWithSign(item.value)} ₪</span>
                      <span className="date-count">({item.count} מניות)</span>
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
                      <span className="date-count">({item.count} מניות)</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="analysis-section" ref={(el) => (sectionRefs.current.sector = el)}>
            <h2 className="section-title">פיזור לפי סקטור (מניות אמריקאיות)</h2>
            {americanStocks.length === 0 ? (
              <p className="history-empty-note">אין מניות אמריקאיות בתיק כרגע.</p>
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

          <div className="analysis-section" ref={(el) => (sectionRefs.current.correlation = el)}>
            <h2 className="section-title">קורלציה בין אחזקות (מניות אמריקאיות)</h2>
            {uniqueAmericanSymbols.length < 2 ? (
              <p className="history-empty-note">נדרשות לפחות 2 מניות אמריקאיות שונות כדי לחשב קורלציה.</p>
            ) : historyLoading && correlationMatrix.symbols.length < 2 ? (
              <p className="history-empty-note">טוען היסטוריית מחירים…</p>
            ) : correlationMatrix.symbols.length < 2 ? (
              <p className="history-empty-note">לא נמצאה מספיק היסטוריית מחירים חופפת כדי לחשב קורלציה.</p>
            ) : (
              <>
                <div className="stocks-table-container" style={{ overflowX: 'auto' }}>
                  <table className="analysis-table correlation-matrix-table">
                    <thead>
                      <tr>
                        <th></th>
                        {correlationMatrix.symbols.map((symbol) => (
                          <th key={symbol}>{symbol}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {correlationMatrix.symbols.map((rowSymbol, i) => (
                        <tr key={rowSymbol}>
                          <th>{rowSymbol}</th>
                          {correlationMatrix.symbols.map((colSymbol, j) => {
                            const value = correlationMatrix.matrix[i][j];
                            return (
                              <td key={colSymbol} style={{ backgroundColor: correlationCellColor(value) }}>
                                {value === null || value === undefined ? '—' : value.toFixed(2)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {topCorrelatedPairs.length > 0 && (
                  <p className="section-subtitle" style={{ marginTop: 10 }}>
                    הזוגות הקשורים ביותר:{' '}
                    {topCorrelatedPairs
                      .map((p) => `${p.a} ↔ ${p.b} (${p.correlation.toFixed(2)})`)
                      .join(' · ')}
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

          <div className="analysis-section" ref={(el) => (sectionRefs.current.news = el)}>
            <h2 className="section-title">חדשות רלוונטיות (מניות אמריקאיות)</h2>
            {americanStocks.length === 0 ? (
              <p className="history-empty-note">אין מניות אמריקאיות בתיק כרגע.</p>
            ) : newsLoading && newsFeed.length === 0 ? (
              <p className="history-empty-note">טוען חדשות…</p>
            ) : newsFeed.length === 0 ? (
              <p className="history-empty-note">לא נמצאו חדשות עדכניות עבור המניות בתיק.</p>
            ) : (
              <div className="news-list">
                {newsFeed.map((story) => (
                  <div className="news-item" key={story.uuid}>
                    <a className="news-title" href={story.link} target="_blank" rel="noopener noreferrer">
                      {story.title}
                    </a>
                    <div className="news-meta">
                      {[story.publisher, story.date ? formatDate(story.date) : null, story.relatedSymbols.join(', ')]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
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
                        <span className="report-name">{stock.name}</span>
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
                        <span className="report-name">{stock.name}</span>
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
                      <span className="report-name">{stock.name}</span>
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
