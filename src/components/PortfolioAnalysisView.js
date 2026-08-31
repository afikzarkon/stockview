import React, { useMemo, useState } from 'react';
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
import { formatDate } from '../utils/formatters';
import RebalancingSection from './RebalancingSection';

const SECTOR_COLORS = ['#667eea', '#f59e0b', '#16a34a', '#0ea5e9', '#dc2626', '#8b5cf6', '#0d9488', '#ea580c', '#64748b', '#c026d3'];

const BENCHMARK_OPTIONS = [
  { key: 'sp500', label: 'S&P 500' },
  { key: 'ta125', label: 'TA-125' }
];

function PortfolioAnalysisView({
  analysis,
  formatPriceWithSign,
  onBack,
  snapshots = [],
  snapshotsLoading = false,
  americanStocks = [],
  rebalanceTargets = null,
  rebalanceTargetsLoading = false,
  rebalanceSaving = false,
  rebalanceSaveError = '',
  onSaveRebalanceTargets
}) {
  const stats = useMemo(() => computePortfolioStats(snapshots), [snapshots]);

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

  return (
    <div className="App">
      <div className="analysis-container">
        <div className="analysis-content">
          <h1 className="analysis-title">ניתוח התיק</h1>

          <button className="back-button" onClick={onBack}>
            חזרה לדף הבית
          </button>

          <div className="analysis-section">
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
                <h3>רווח/הפסד לא ממומש</h3>
                <div className={`distribution-value ${analysis.summaryMetrics.totalProfitILS >= 0 ? 'profit-positive' : 'profit-negative'}`}>
                  {formatPriceWithSign(analysis.summaryMetrics.totalProfitILS)} ₪
                </div>
                <div className="distribution-percentage">
                  מול השקעה כוללת של {formatPriceWithSign(analysis.summaryMetrics.totalPurchaseILS)} ₪
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
              <div className="distribution-card">
                <h3>השפעת מט"ח על רכיב ארה"ב</h3>
                <div className={`distribution-value ${analysis.summaryMetrics.americanFxImpactILS >= 0 ? 'profit-positive' : 'profit-negative'}`}>
                  {formatPriceWithSign(analysis.summaryMetrics.americanFxImpactILS)} ₪
                </div>
                <div className="distribution-percentage">
                  מחושב על שווי נוכחי של הפוזיציות האמריקאיות
                </div>
              </div>
              <div className="distribution-card">
                <h3>סה"כ שווי תיק מלא</h3>
                <div className="distribution-value">
                  {formatPriceWithSign(analysis.summaryMetrics.overallTotalValueILS)} ₪
                </div>
                <div className="distribution-percentage">
                  לא מנייתי: {formatPriceWithSign(analysis.summaryMetrics.nonStockTotalValueILS)} ₪
                </div>
              </div>
            </div>
          </div>

          <div className="analysis-section">
            <h2 className="section-title">ביצועי התיק לאורך זמן</h2>
            <p className="section-subtitle">
              מבוסס על נקודות מדידה שנשמרות אוטומטית (אחת ליום) מהרגע שהפיצ'ר הזה עלה - לא נתונים רטרואקטיביים.
            </p>
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

          {stats.hasHistory && (
            <div className="analysis-section">
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

          <div className="analysis-section">
            <h2 className="section-title">פיזור לפי רכיבי תיק</h2>
            <div className="distribution-grid">
              <div className="distribution-card">
                <h3>בורסה ישראלית</h3>
                <div className="distribution-value">
                  {formatPriceWithSign(analysis.exchangeDistribution.israeli.value)} ₪
                </div>
                <div className="distribution-percentage">
                  {analysis.exchangeDistribution.israeli.percentage.toFixed(1)}%
                </div>
              </div>
              <div className="distribution-card">
                <h3>בורסה אמריקאית</h3>
                <div className="distribution-value">
                  {formatPriceWithSign(analysis.exchangeDistribution.american.value)} ₪
                </div>
                <div className="distribution-percentage">
                  {analysis.exchangeDistribution.american.percentage.toFixed(1)}%
                </div>
              </div>
              <div className="distribution-card">
                <h3>קופות גמל</h3>
                <div className="distribution-value">
                  {formatPriceWithSign(analysis.exchangeDistribution.pension.value)} ₪
                </div>
                <div className="distribution-percentage">
                  {analysis.exchangeDistribution.pension.percentage.toFixed(1)}%
                </div>
              </div>
              <div className="distribution-card">
                <h3>קרנות כספיות</h3>
                <div className="distribution-value">
                  {formatPriceWithSign(analysis.exchangeDistribution.cashFunds.value)} ₪
                </div>
                <div className="distribution-percentage">
                  {analysis.exchangeDistribution.cashFunds.percentage.toFixed(1)}%
                </div>
              </div>
              <div className="distribution-card">
                <h3>עו"ש</h3>
                <div className="distribution-value">
                  {formatPriceWithSign(analysis.exchangeDistribution.bank.value)} ₪
                </div>
                <div className="distribution-percentage">
                  {analysis.exchangeDistribution.bank.percentage.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>

          <div className="analysis-section">
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
                </div>
              </div>
            </div>
          </div>

          <div className="analysis-section">
            <h2 className="section-title">איזון מחדש (Rebalancing)</h2>
            <p className="section-subtitle">
              הגדירו הקצאת יעד (%) לכל רכיב, ותקבלו השוואה מול ההקצאה בפועל והצעה כמה לקנות/למכור כדי לחזור ליעד.
              היעדים נשמרים עבורכם ונטענים אוטומטית בפעם הבאה.
            </p>
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

          <div className="analysis-section">
            <h2 className="section-title">פיזור לפי סקטור (מניות אמריקאיות)</h2>
            <p className="section-subtitle">
              מבוסס על סיווג הסקטור של Yahoo Finance לפי הטיקר של כל מניה אמריקאית. לא כולל מניות ישראליות, קופות גמל, קרנות כספיות או עו"ש — לאלו אין כרגע מיפוי סקטור זמין.
            </p>
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

          <div className="analysis-section">
            <h2 className="section-title">המלצות אנליסטים (מניות אמריקאיות)</h2>
            <p className="section-subtitle">
              דירוג ומחיר יעד ממוצעים מכלל האנליסטים שמסקרים כל מניה, לפי Yahoo Finance. לא כולל את הנימוק המלא של
              כל דוח — זה בדרך כלל תוכן בתשלום אצל בית ההשקעות שהנפיק אותו.
            </p>
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

          <div className="analysis-section">
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

          <div className="analysis-section">
            <h2 className="section-title">פיזור לפי תאריכי קנייה</h2>
            <div className="date-distribution-grid">
              <div className="date-distribution-card">
                <h3>פיזור חודשי</h3>
                <div className="date-list">
                  {analysis.monthlyDistribution.map((item, index) => (
                    <div key={index} className="date-item">
                      <span className="date-label">{item.month}</span>
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

          <div className="analysis-section">
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
  );
}

export default PortfolioAnalysisView;
