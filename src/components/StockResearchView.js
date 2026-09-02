import React, { useMemo, useRef, useState } from 'react';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
  AreaChart,
  Area,
  ReferenceDot,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Treemap,
  RadialBarChart,
  RadialBar
} from 'recharts';
import { useStockSearch } from '../hooks/useStockSearch';
import { useStockResearch } from '../hooks/useStockResearch';
import { useDividendData } from '../hooks/useDividendData';
import { useStockNews } from '../hooks/useStockNews';
import { useAnalystRecommendations } from '../hooks/useAnalystRecommendations';
import { buildNewsFeed } from '../utils/newsFeed';
import { sectorLabelHe } from '../utils/sectorLabels';
import { formatDate } from '../utils/formatters';
import { buildStockScorecard, categoryPercent, CATEGORY_LABELS_HE, VERDICT_LABELS_HE } from '../utils/stockScorecard';
import {
  recommendationLabelHe,
  recommendationSentiment,
  computeUpsidePercent,
  actionLabelHe,
  formatEpochDateISO
} from '../utils/analystData';
import { computeDcfFairValue } from '../utils/dcfValuation';
import {
  buildRevenueBreakdown,
  buildRevenueTrend,
  buildBalanceSheetTreemap,
  computeLatestRoce,
  buildHistoricalPeSeries,
  findNearestPricePoint
} from '../utils/financialVisuals';

// A new, standalone page (not tied to portfolio holdings) for researching
// ANY stock, modeled on SimplyWall.st's "Snowflake" checks-based analysis
// and (as of this redesign) its dark visual language too - see the plan
// doc for the research behind this. Wired into App.js the same way
// PortfolioAnalysisView.js is (boolean view-switch state, no react-router
// in this app). The dark theme below is scoped to this page only (via the
// .sw-page wrapper class) - a deliberate scope decision, not app-wide dark
// mode, which is a separate, bigger backlog item.

const TREND_LABELS_HE = [
  ['strongBuy', 'קנייה חזקה'],
  ['buy', 'קנייה'],
  ['hold', 'החזקה'],
  ['sell', 'מכירה'],
  ['strongSell', 'מכירה חזקה']
];

// One short question per scorecard category, styled after SimplyWall.st's
// section subtitles ("Is X undervalued...?") - phrased to match what our
// own checks actually test (see stockScorecard.js), not a literal
// translation of theirs.
const CATEGORY_QUESTIONS_HE = {
  value: 'האם המנייה מתומחרת בסבירות ביחס למכפילים ולתחזיות האנליסטים?',
  futureGrowth: 'האם צפויה צמיחה ברווחים ובהכנסות בהמשך?',
  pastPerformance: 'האם החברה הראתה ביצועים היסטוריים טובים בפועל?',
  financialHealth: 'האם המאזן הפיננסי של החברה בריא?',
  dividend: 'האם הדיבידנד משתלם ובר-קיימא?',
  ownership: 'מי מחזיק במנייה, ומה מגמת הפעילות הפנימית לאחרונה?'
};

const VERDICT_SUMMARY_HE = {
  BUY: 'פוטנציאל חיובי, עם תמחור שנראה סביר.',
  HOLD: 'תמונה מעורבת בין הקטגוריות - שווה מעקב.',
  SELL: 'מספר סימני אזהרה משמעותיים בבדיקות.'
};

// Collects the passing checks (REWARDS) and failing checks (RISK ANALYSIS)
// across every category into two flat, capped lists - a display arrangement
// of data the scorecard already computed, not a new calculation.
// Compact $ formatter for large financial-statement figures (e.g.
// $47.94B) - matches the inline "$18.50M" style already used for officer
// pay below, just generalized across magnitudes.
function formatUsdCompact(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

const DONUT_COLORS = ['#a3c936', '#22c55e', '#d4a017', '#ef4444', '#9ca3af', '#3b82f6'];
const TREEMAP_COLORS = ['#a3c936', '#22c55e', '#3b82f6', '#d4a017'];

function collectRewardsAndRisks(categories, limit) {
  const rewards = [];
  const risks = [];
  Object.values(categories || {}).forEach((cat) => {
    (cat.checks || []).forEach((check) => {
      if (check.passed === true) rewards.push(check);
      else if (check.passed === false) risks.push(check);
    });
  });
  return { rewards: rewards.slice(0, limit), risks: risks.slice(0, limit) };
}

function StockResearchView({ onBack }) {
  const [query, setQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const [selectedName, setSelectedName] = useState('');
  const sectionRefs = useRef({});

  const { results: searchResults, loading: searchLoading } = useStockSearch(query);
  const { research, loading: researchLoading, error: researchError } = useStockResearch(selectedSymbol);
  const searchSymbols = useMemo(() => (selectedSymbol ? [selectedSymbol] : []), [selectedSymbol]);
  const { dividendsBySymbol } = useDividendData(searchSymbols);
  const { newsBySymbol } = useStockNews(searchSymbols);
  const { recommendationsBySymbol, loading: analystLoading } = useAnalystRecommendations(searchSymbols);

  const newsFeed = useMemo(() => buildNewsFeed(newsBySymbol, 8), [newsBySymbol]);
  const rec = selectedSymbol ? recommendationsBySymbol[selectedSymbol] : null;
  const analystUpside = rec ? computeUpsidePercent(research?.currentPrice, rec.targetMeanPrice) : null;
  const analystSentiment = rec ? recommendationSentiment(rec.recommendationKey) : null;

  const scorecard = useMemo(() => {
    if (!research) return null;
    return buildStockScorecard(research, selectedSymbol ? dividendsBySymbol[selectedSymbol] : null);
  }, [research, dividendsBySymbol, selectedSymbol]);

  const categoryEntries = useMemo(() => (scorecard ? Object.entries(scorecard.categories) : []), [scorecard]);

  const radarData = useMemo(() => {
    if (!scorecard) return [];
    return Object.entries(scorecard.categories).map(([key, cat]) => ({
      category: CATEGORY_LABELS_HE[key],
      percent: categoryPercent(cat) ?? 0
    }));
  }, [scorecard]);

  const { rewards, risks } = useMemo(
    () => (scorecard ? collectRewardsAndRisks(scorecard.categories, 5) : { rewards: [], risks: [] }),
    [scorecard]
  );

  // "Phase 2" data-depth visualizations - see src/utils/dcfValuation.js and
  // src/utils/financialVisuals.js for the underlying pure builder functions
  // (every one returns null/[] rather than a fabricated value when its
  // inputs are missing).
  const dcfResult = useMemo(
    () => (research ? computeDcfFairValue(research, research.fundamentalsHistory) : null),
    [research]
  );
  const revenueBreakdown = useMemo(
    () => (research ? buildRevenueBreakdown(research.fundamentalsHistory) : null),
    [research]
  );
  const revenueTrend = useMemo(() => (research ? buildRevenueTrend(research.fundamentalsHistory) : null), [research]);
  const balanceSheetTreemap = useMemo(
    () => (research ? buildBalanceSheetTreemap(research.fundamentalsHistory) : null),
    [research]
  );
  // Assigns a display color per treemap leaf here (a UI concern) rather
  // than in the pure financialVisuals.js builder.
  const treemapDataWithColors = useMemo(() => {
    if (!balanceSheetTreemap) return null;
    let colorIndex = 0;
    return balanceSheetTreemap.map((group) => ({
      ...group,
      children: group.children.map((c) => ({ ...c, fill: TREEMAP_COLORS[colorIndex++ % TREEMAP_COLORS.length] }))
    }));
  }, [balanceSheetTreemap]);
  const latestRoce = useMemo(() => (research ? computeLatestRoce(research.fundamentalsHistory) : null), [research]);
  const historicalPe = useMemo(
    () =>
      research ? buildHistoricalPeSeries(research.fundamentalsHistory?.annualDilutedEPS, research.priceHistory) : null,
    [research]
  );
  const priceHistoryData = research?.priceHistory || [];
  const dividendMarkers = useMemo(() => {
    if (!selectedSymbol || priceHistoryData.length === 0) return [];
    const history = dividendsBySymbol[selectedSymbol]?.history || [];
    const seen = new Set();
    return history
      .map((d) => {
        const point = findNearestPricePoint(priceHistoryData, d.date);
        if (!point || seen.has(point.date)) return null;
        seen.add(point.date);
        return { date: point.date, close: point.close, amountPerShare: d.amountPerShare };
      })
      .filter(Boolean);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSymbol, dividendsBySymbol, priceHistoryData.length]);

  const handleSelectSymbol = (symbol, name) => {
    setSelectedSymbol(symbol);
    setSelectedName(name);
    setQuery('');
    setShowSuggestions(false);
    sectionRefs.current = {};
  };

  const scrollToSection = (key) => {
    sectionRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const companyProfile = research?.companyProfile || null;
  const similarCompanies = research?.similarCompanies || [];

  // PE-vs-peers chart data: the selected stock's own trailing P/E (already
  // fetched) plus each similar company's, from research.peerQuotes (see
  // fetchYahooPeerQuotes in server/yahooQuotes.js) - matched by symbol.
  // This compares against a handful of real, named similar companies, not
  // an industry-wide distribution (no dataset exists for that - see the
  // plan doc).
  const peerQuotes = research?.peerQuotes || [];
  const peerPeChartData = similarCompanies
    .map((c) => {
      const q = peerQuotes.find((p) => p.symbol === c.symbol);
      return q && typeof q.trailingPE === 'number' && Number.isFinite(q.trailingPE) && q.trailingPE > 0
        ? { symbol: c.symbol, pe: q.trailingPE, isSelected: false }
        : null;
    })
    .filter(Boolean);
  if (
    selectedSymbol &&
    typeof research?.trailingPE === 'number' &&
    Number.isFinite(research.trailingPE) &&
    research.trailingPE > 0
  ) {
    peerPeChartData.unshift({ symbol: selectedSymbol, pe: research.trailingPE, isSelected: true });
  }

  // A small radial gauge for a 0-1 fraction ratio (ROE/ROA/ROCE) - the
  // fill is clamped to the visible 0-100% arc, but the displayed number
  // is the real, uncapped percentage (some companies genuinely report an
  // ROE well above 100%, e.g. from large buybacks - clamping the *number*
  // would misrepresent it, only the gauge arc needs clamping).
  const renderGauge = (label, rawFraction, color) => {
    const hasValue = typeof rawFraction === 'number' && Number.isFinite(rawFraction);
    const percent = hasValue ? rawFraction * 100 : null;
    const clamped = hasValue ? Math.max(0, Math.min(100, percent)) : 0;
    return (
      <div className="sw-gauge" key={label}>
        <h5 className="sw-gauge-label">{label}</h5>
        {!hasValue ? (
          <p className="sw-empty-note">אין נתון</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={110}>
              <RadialBarChart
                innerRadius="70%"
                outerRadius="100%"
                data={[{ value: clamped, fill: color }]}
                startAngle={90}
                endAngle={-270}
              >
                <RadialBar background dataKey="value" cornerRadius={8} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="sw-gauge-value">{percent.toFixed(1)}%</div>
          </>
        )}
      </div>
    );
  };

  const navItems = [
    { key: 'overview', label: 'סקירה כללית' },
    { key: 'priceHistory', label: 'היסטוריית מחיר' },
    { key: 'fundamentals', label: 'תמצית פיננסית' },
    ...categoryEntries.map(([key], i) => ({ key, label: `${i + 1}. ${CATEGORY_LABELS_HE[key]}` })),
    { key: 'management', label: 'הנהלה' },
    { key: 'similar', label: 'חברות דומות' },
    { key: 'news', label: 'חדשות' }
  ];

  return (
    <div className="App sw-page">
      <div className="analysis-container">
        <div className="analysis-content">
          <h1 className="analysis-title">חקר מניות</h1>

          <button className="back-button" onClick={onBack}>
            חזרה לדף הבית
          </button>

          <div className="sw-search-box" onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setShowSuggestions(false);
          }}>
            <input
              type="text"
              className="sw-search-input"
              placeholder="חפש טיקר או שם חברה (למשל AAPL או Apple)…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
            />
            {showSuggestions && query.trim().length >= 2 && (
              <div className="sw-search-suggestions">
                {searchLoading ? (
                  <div className="sw-search-suggestion-empty">מחפש…</div>
                ) : searchResults.length === 0 ? (
                  <div className="sw-search-suggestion-empty">לא נמצאו תוצאות</div>
                ) : (
                  searchResults.map((r) => (
                    <button
                      key={r.symbol}
                      type="button"
                      className="sw-search-suggestion"
                      onClick={() => handleSelectSymbol(r.symbol, r.name)}
                    >
                      <strong>{r.symbol}</strong> — {r.name}
                      {r.exchange && <span className="sw-search-exchange">{r.exchange}</span>}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {!selectedSymbol ? (
            <p className="sw-empty-note">חפשו מניה למעלה כדי לראות ניתוח.</p>
          ) : researchLoading && !research ? (
            <p className="sw-empty-note">טוען נתונים…</p>
          ) : researchError ? (
            <p className="sw-empty-note">{researchError}</p>
          ) : (
            <div className="sw-layout">
              <nav className="sw-sidebar">
                {navItems.map((item) => (
                  <button key={item.key} type="button" className="sw-sidebar-item" onClick={() => scrollToSection(item.key)}>
                    {item.label}
                  </button>
                ))}
              </nav>

              <div className="sw-main">
                {/* Overview card */}
                <div className="sw-card sw-overview-card" ref={(el) => (sectionRefs.current.overview = el)}>
                  <div className="sw-overview-left">
                    <h2 className="sw-overview-title">
                      {selectedName ? `${selectedName} (${selectedSymbol})` : selectedSymbol} סקירת מנייה
                    </h2>
                    {companyProfile?.longBusinessSummary && (
                      <p className="sw-overview-desc">
                        {companyProfile.longBusinessSummary.length > 220
                          ? `${companyProfile.longBusinessSummary.slice(0, 220)}…`
                          : companyProfile.longBusinessSummary}
                      </p>
                    )}
                    {companyProfile && (companyProfile.sector || companyProfile.industry) && (
                      <p className="sw-overview-sector">
                        {companyProfile.sector ? sectorLabelHe(companyProfile.sector) : ''}
                        {companyProfile.industry ? ` · ${companyProfile.industry}` : ''}
                      </p>
                    )}
                    <button type="button" className="sw-more-details-link" onClick={() => scrollToSection('management')}>
                      עוד פרטים ›
                    </button>

                    {rewards.length > 0 && (
                      <>
                        <div className="sw-list-title">REWARDS</div>
                        <ul className="sw-bullet-list">
                          {rewards.map((r) => (
                            <li key={r.key} className="sw-bullet-reward">
                              <span className="sw-bullet-icon">★</span>
                              {r.label}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    {risks.length > 0 && (
                      <>
                        <div className="sw-list-title">RISK ANALYSIS</div>
                        <ul className="sw-bullet-list">
                          {risks.map((r) => (
                            <li key={r.key} className="sw-bullet-risk">
                              <span className="sw-bullet-icon">●</span>
                              {r.label}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>

                  <div className="sw-overview-right">
                    <ResponsiveContainer width="100%" height={260}>
                      <RadarChart data={radarData}>
                        <PolarGrid stroke="#2a2e35" />
                        <PolarAngleAxis dataKey="category" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                        <Radar dataKey="percent" stroke="#a3c936" fill="#a3c936" fillOpacity={0.55} />
                        <Tooltip formatter={(value) => `${Number(value).toFixed(0)}%`} />
                      </RadarChart>
                    </ResponsiveContainer>
                    <div className="sw-snowflake-caption">
                      <strong>Snowflake Analysis</strong>
                      {scorecard?.verdict?.verdict && (
                        <p>
                          {VERDICT_SUMMARY_HE[scorecard.verdict.verdict]} ({VERDICT_LABELS_HE[scorecard.verdict.verdict]})
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <p className="sw-disclaimer">
                  ציון מבוסס על בדיקות אוטומטיות על נתונים ציבוריים (Yahoo Finance) — היוריסטיקה שקופה שהאפליקציה
                  מחשבת בעצמה, לא ייעוץ השקעות. בדיקה שאין לה מספיק נתון מסומנת "אין נתון" ולא נכללת בציון.
                </p>

                {/* Price history, with dividend-payment markers */}
                <div className="sw-card" ref={(el) => (sectionRefs.current.priceHistory = el)}>
                  <h3 className="sw-section-title">היסטוריית מחיר</h3>
                  {priceHistoryData.length === 0 ? (
                    <p className="sw-empty-note">אין נתוני מחיר היסטוריים זמינים למנייה זו.</p>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={260}>
                        <AreaChart data={priceHistoryData}>
                          <CartesianGrid stroke="#2a2e35" strokeDasharray="3 3" />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} minTickGap={40} />
                          <YAxis
                            tick={{ fontSize: 10, fill: '#9ca3af' }}
                            domain={['auto', 'auto']}
                            width={50}
                          />
                          <Tooltip formatter={(value) => `$${Number(value).toFixed(2)}`} />
                          <Area type="monotone" dataKey="close" stroke="#a3c936" fill="#a3c936" fillOpacity={0.25} />
                          {dividendMarkers.map((m) => (
                            <ReferenceDot key={m.date} x={m.date} y={m.close} r={4} fill="#d4a017" stroke="none" />
                          ))}
                        </AreaChart>
                      </ResponsiveContainer>
                      {dividendMarkers.length > 0 && (
                        <p className="sw-section-question">
                          הנקודות המסומנות (●) הן תאריכי תשלום דיבידנד בפועל.
                        </p>
                      )}
                    </>
                  )}
                </div>

                {/* Fundamentals Summary: revenue composition donut + revenue/net income trend */}
                <div className="sw-card" ref={(el) => (sectionRefs.current.fundamentals = el)}>
                  <h3 className="sw-section-title">תמצית פיננסית</h3>
                  {!revenueBreakdown && !revenueTrend ? (
                    <p className="sw-empty-note">אין נתוני הכנסות/הוצאות זמינים למנייה זו.</p>
                  ) : (
                    <div className="sw-fundamentals-grid">
                      {revenueBreakdown && (
                        <div>
                          <h4 className="sw-subsection-title">הרכב הכנסות (שנה אחרונה)</h4>
                          <ResponsiveContainer width="100%" height={220}>
                            <PieChart>
                              <Pie
                                data={revenueBreakdown.slices}
                                dataKey="value"
                                nameKey="label"
                                innerRadius={50}
                                outerRadius={80}
                              >
                                {revenueBreakdown.slices.map((s, i) => (
                                  <Cell key={s.key} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip formatter={(value) => formatUsdCompact(Number(value))} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                      {revenueTrend && (
                        <div>
                          <h4 className="sw-subsection-title">הכנסות ורווח נקי לאורך זמן</h4>
                          <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={revenueTrend}>
                              <CartesianGrid stroke="#2a2e35" strokeDasharray="3 3" />
                              <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#9ca3af' }} />
                              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={formatUsdCompact} width={60} />
                              <Tooltip formatter={(value) => formatUsdCompact(Number(value))} />
                              <Bar dataKey="revenue" name="הכנסות" fill="#a3c936" />
                              <Bar dataKey="netIncome" name="רווח נקי" fill="#d4a017" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Numbered category sections */}
                {categoryEntries.map(([key, cat], i) => (
                  <div className="sw-card sw-section" key={key} ref={(el) => (sectionRefs.current[key] = el)}>
                    <div className="sw-section-header">
                      <span className="sw-section-number">{i + 1}</span>
                      <div>
                        <h3 className="sw-section-title">{CATEGORY_LABELS_HE[key]}</h3>
                        <p className="sw-section-question">{CATEGORY_QUESTIONS_HE[key]}</p>
                      </div>
                    </div>

                    <div className="sw-checks-badge-row">
                      <span className="sw-checks-badge-label">
                        {CATEGORY_LABELS_HE[key]} Score {cat.total > 0 ? `${cat.passed}/${cat.total}` : 'אין נתון'}
                      </span>
                      {cat.checks.map((check) => (
                        <span
                          key={check.key}
                          className={`sw-check-circle ${
                            check.passed === null ? 'sw-check-na' : check.passed ? 'sw-check-pass' : 'sw-check-fail'
                          }`}
                        >
                          {check.passed === null ? '—' : check.passed ? '✓' : '✗'}
                        </span>
                      ))}
                    </div>

                    <ul className="sw-checks-list">
                      {cat.checks.map((check, j) => (
                        <li key={check.key} className="sw-check-row">
                          <span
                            className={`sw-check-icon ${
                              check.passed === null ? 'sw-check-na' : check.passed ? 'sw-check-pass' : 'sw-check-fail'
                            }`}
                          >
                            {check.passed === null ? '—' : check.passed ? '✓' : '✗'}
                          </span>
                          <span className="sw-check-index">
                            {i + 1}.{j + 1}
                          </span>
                          <span className="sw-check-label">{check.label}</span>
                          {check.detail && <span className="sw-check-detail">{check.detail}</span>}
                        </li>
                      ))}
                    </ul>

                    {key === 'value' && (
                      <div className="sw-value-extra">
                        {peerPeChartData.length > 0 && (
                          <div>
                            <h4 className="sw-subsection-title">מכפיל רווח (P/E) מול חברות דומות</h4>
                            <ResponsiveContainer width="100%" height={Math.max(120, peerPeChartData.length * 32)}>
                              <BarChart data={peerPeChartData} layout="vertical">
                                <CartesianGrid stroke="#2a2e35" strokeDasharray="3 3" />
                                <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} />
                                <YAxis
                                  type="category"
                                  dataKey="symbol"
                                  tick={{ fontSize: 11, fill: '#e5e7eb' }}
                                  width={60}
                                />
                                <Tooltip formatter={(value) => Number(value).toFixed(1)} />
                                <Bar dataKey="pe" name="P/E">
                                  {peerPeChartData.map((d) => (
                                    <Cell key={d.symbol} fill={d.isSelected ? '#d4a017' : '#a3c936'} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        )}

                        {historicalPe && (
                          <div>
                            <h4 className="sw-subsection-title">מכפיל רווח (P/E) היסטורי (הערכה)</h4>
                            <p className="sw-section-question">
                              מבוסס על מחיר סוף שנה חלקי EPS מדווח בפועל לאותה שנה — קירוב, לא סדרת P/E רשמית.
                            </p>
                            <ResponsiveContainer width="100%" height={160}>
                              <BarChart data={historicalPe}>
                                <CartesianGrid stroke="#2a2e35" strokeDasharray="3 3" />
                                <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#9ca3af' }} />
                                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} width={40} />
                                <Tooltip formatter={(value) => Number(value).toFixed(1)} />
                                <Bar dataKey="pe" fill="#a3c936" />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        )}

                        <div>
                          <h4 className="sw-subsection-title">שווי הוגן משוער (DCF)</h4>
                          {!dcfResult ? (
                            <p className="sw-empty-note">אין מספיק נתונים למודל DCF עבור מנייה זו.</p>
                          ) : (
                            <>
                              <ResponsiveContainer width="100%" height={130}>
                                <BarChart
                                  layout="vertical"
                                  data={[
                                    { name: 'מחיר נוכחי', value: dcfResult.currentPrice },
                                    { name: 'שווי הוגן משוער', value: dcfResult.fairValuePerShare }
                                  ]}
                                >
                                  <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} />
                                  <YAxis
                                    type="category"
                                    dataKey="name"
                                    tick={{ fontSize: 11, fill: '#e5e7eb' }}
                                    width={110}
                                  />
                                  <Tooltip formatter={(value) => `$${Number(value).toFixed(2)}`} />
                                  <Bar dataKey="value">
                                    <Cell fill="#9ca3af" />
                                    <Cell fill="#a3c936" />
                                  </Bar>
                                </BarChart>
                              </ResponsiveContainer>
                              <p className="sw-section-question">
                                שווי הוגן משוער: ${dcfResult.fairValuePerShare.toFixed(2)}
                                {dcfResult.marginOfSafetyPercent != null &&
                                  ` (${dcfResult.marginOfSafetyPercent >= 0 ? '+' : ''}${dcfResult.marginOfSafetyPercent.toFixed(
                                    1
                                  )}% מהמחיר הנוכחי)`}
                              </p>
                              <p className="sw-disclaimer">
                                מודל DCF פשוט משל StockView (לא של SimplyWall.st) — צמיחת תזרים מזומנים חופשי ל-5 שנים
                                לפי הערכת אנליסטים (מוגבלת ל-20%- עד 30%+), ערך טרמינלי בצמיחה של{' '}
                                {(dcfResult.assumptions.terminalGrowthRate * 100).toFixed(1)}%, מהוון בריבית{' '}
                                {(dcfResult.assumptions.discountRate * 100).toFixed(1)}% (ריבית חסרת סיכון{' '}
                                {(dcfResult.assumptions.riskFreeRate * 100).toFixed(1)}% + בטא × פרמיית סיכון{' '}
                                {(dcfResult.assumptions.equityRiskPremium * 100).toFixed(1)}%). הנחות מאקרו קבועות,
                                לא נתון בזמן אמת — הערכה גסה, לא ייעוץ השקעות.
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {key === 'financialHealth' && (
                      <div className="sw-financial-health-extra">
                        {treemapDataWithColors && (
                          <div>
                            <h4 className="sw-subsection-title">פילוח מאזן (שנה אחרונה)</h4>
                            <ResponsiveContainer width="100%" height={220}>
                              <Treemap data={treemapDataWithColors} dataKey="size" stroke="#131518" fill="#a3c936" />
                            </ResponsiveContainer>
                          </div>
                        )}
                        <div className="sw-gauge-row">
                          {renderGauge('תשואה להון עצמי (ROE)', research?.returnOnEquity, '#a3c936')}
                          {renderGauge('תשואה על הנכסים (ROA)', research?.returnOnAssets, '#22c55e')}
                          {renderGauge('תשואה על ההון המושקע (ROCE)', latestRoce, '#d4a017')}
                        </div>
                      </div>
                    )}

                    {key === 'ownership' && (
                      <div className="sw-ownership-extra">
                        <h4 className="sw-subsection-title">עסקאות פנימיים אחרונות</h4>
                        {!research?.insiderTransactions || research.insiderTransactions.length === 0 ? (
                          <p className="sw-empty-note">אין נתוני עסקאות פנימיים זמינים למנייה זו.</p>
                        ) : (
                          <div className="sw-table-wrap">
                            <table className="sw-table">
                              <thead>
                                <tr>
                                  <th>שם</th>
                                  <th>תפקיד</th>
                                  <th>פירוט</th>
                                  <th>שווי</th>
                                  <th>תאריך</th>
                                </tr>
                              </thead>
                              <tbody>
                                {research.insiderTransactions.map((t, idx) => {
                                  const isoDate = formatEpochDateISO(t.startDateEpoch);
                                  return (
                                    <tr key={idx}>
                                      <td>{t.filerName || '—'}</td>
                                      <td>{t.filerRelation || '—'}</td>
                                      <td>{t.transactionText || '—'}</td>
                                      <td>{t.value != null ? formatUsdCompact(t.value) : '—'}</td>
                                      <td>{isoDate ? formatDate(isoDate) : '—'}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {/* Analyst recommendations */}
                <div className="sw-card" ref={(el) => (sectionRefs.current.analysts = el)}>
                  <h3 className="sw-section-title">המלצות אנליסטים</h3>
                  {analystLoading && !rec ? (
                    <p className="sw-empty-note">טוען נתוני אנליסטים…</p>
                  ) : !rec || rec.recommendationKey == null ? (
                    <p className="sw-empty-note">אין נתוני אנליסטים זמינים למנייה זו.</p>
                  ) : (
                    <>
                      <div className="sw-card-grid">
                        <div className="sw-mini-card">
                          <h4>המלצה מוסכמת</h4>
                          <div className={`sw-mini-value ${analystSentiment ? `sw-sentiment-${analystSentiment}` : ''}`}>
                            {recommendationLabelHe(rec.recommendationKey)}
                          </div>
                          <div className="sw-mini-sub">
                            {rec.numberOfAnalystOpinions != null ? `${rec.numberOfAnalystOpinions} אנליסטים` : ''}
                          </div>
                        </div>
                        <div className="sw-mini-card">
                          <h4>יעד מחיר ממוצע</h4>
                          <div className="sw-mini-value">
                            {rec.targetMeanPrice != null ? `$${rec.targetMeanPrice.toFixed(2)}` : '—'}
                          </div>
                          <div className="sw-mini-sub">
                            {analystUpside != null
                              ? `${analystUpside >= 0 ? '+' : ''}${analystUpside.toFixed(1)}% מהמחיר הנוכחי`
                              : ''}
                          </div>
                        </div>
                        <div className="sw-mini-card">
                          <h4>טווח יעדי מחיר</h4>
                          <div className="sw-mini-value">
                            {rec.targetLowPrice != null && rec.targetHighPrice != null
                              ? `$${rec.targetLowPrice.toFixed(2)} - $${rec.targetHighPrice.toFixed(2)}`
                              : '—'}
                          </div>
                        </div>
                      </div>

                      {rec.currentTrend && (
                        <>
                          <h4 className="sw-subsection-title">פילוח המלצות (חודש נוכחי)</h4>
                          <ul className="sw-checks-list">
                            {TREND_LABELS_HE.filter(
                              ([field]) => rec.currentTrend[field] != null && rec.currentTrend[field] > 0
                            ).map(([field, label]) => (
                              <li key={field} className="sw-check-row">
                                <span className="sw-check-label">{label}</span>
                                <span className="sw-check-detail">{rec.currentTrend[field]}</span>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}

                      {rec.upgradeHistory && rec.upgradeHistory.length > 0 && (
                        <>
                          <h4 className="sw-subsection-title">שדרוגים/הורדות אחרונים</h4>
                          <ul className="sw-checks-list">
                            {rec.upgradeHistory.slice(0, 5).map((u, i) => {
                              const date = formatEpochDateISO(u.epochGradeDate);
                              return (
                                <li key={i} className="sw-check-row">
                                  <span className="sw-check-label">
                                    {actionLabelHe(u.action)} · {u.firm || ''}
                                    {u.fromGrade && u.toGrade ? ` (${u.fromGrade} ← ${u.toGrade})` : ''}
                                  </span>
                                  {date && <span className="sw-check-detail">{formatDate(date)}</span>}
                                </li>
                              );
                            })}
                          </ul>
                        </>
                      )}
                    </>
                  )}
                </div>

                {/* Management + company info (unscored, display-only) */}
                <div className="sw-card" ref={(el) => (sectionRefs.current.management = el)}>
                  <h3 className="sw-section-title">הנהלה ואודות החברה</h3>
                  {!companyProfile ? (
                    <p className="sw-empty-note">אין מידע זמין על החברה.</p>
                  ) : (
                    <>
                      <div className="sw-card-grid">
                        {companyProfile.fullTimeEmployees != null && (
                          <div className="sw-mini-card">
                            <h4>עובדים</h4>
                            <div className="sw-mini-value">{companyProfile.fullTimeEmployees.toLocaleString()}</div>
                          </div>
                        )}
                        {(companyProfile.city || companyProfile.country) && (
                          <div className="sw-mini-card">
                            <h4>מיקום</h4>
                            <div className="sw-mini-value sw-mini-value-small">
                              {[companyProfile.city, companyProfile.country].filter(Boolean).join(', ')}
                            </div>
                          </div>
                        )}
                        {companyProfile.website && (
                          <div className="sw-mini-card">
                            <h4>אתר</h4>
                            <a href={companyProfile.website} target="_blank" rel="noopener noreferrer" className="sw-link">
                              {companyProfile.website.replace(/^https?:\/\//, '')}
                            </a>
                          </div>
                        )}
                      </div>

                      {companyProfile.companyOfficers.length > 0 && (
                        <>
                          <h4 className="sw-subsection-title">הנהלה בכירה</h4>
                          <div className="sw-table-wrap">
                            <table className="sw-table">
                              <thead>
                                <tr>
                                  <th>שם</th>
                                  <th>תפקיד</th>
                                  <th>גיל</th>
                                  <th>תגמול שנתי</th>
                                </tr>
                              </thead>
                              <tbody>
                                {companyProfile.companyOfficers.slice(0, 8).map((officer, i) => (
                                  <tr key={i}>
                                    <td>{officer.name || '—'}</td>
                                    <td>{officer.title || '—'}</td>
                                    <td>{officer.age != null ? officer.age : '—'}</td>
                                    <td>{officer.totalPay != null ? `$${(officer.totalPay / 1e6).toFixed(2)}M` : '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>

                {/* Similar companies */}
                <div className="sw-card" ref={(el) => (sectionRefs.current.similar = el)}>
                  <h3 className="sw-section-title">חברות דומות</h3>
                  <p className="sw-section-question">דירוג דמיון של Yahoo Finance. לחיצה על מנייה עוברת לניתוח שלה.</p>
                  {similarCompanies.length === 0 ? (
                    <p className="sw-empty-note">לא נמצאו חברות דומות למנייה זו.</p>
                  ) : (
                    <div className="sw-chip-list">
                      {similarCompanies.map((c) => (
                        <button
                          key={c.symbol}
                          type="button"
                          className="sw-chip"
                          onClick={() => handleSelectSymbol(c.symbol, '')}
                        >
                          {c.symbol}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* News */}
                <div className="sw-card" ref={(el) => (sectionRefs.current.news = el)}>
                  <h3 className="sw-section-title">חדשות אחרונות</h3>
                  {newsFeed.length === 0 ? (
                    <p className="sw-empty-note">אין חדשות עדכניות עבור המנייה הזו כרגע.</p>
                  ) : (
                    <div className="sw-news-grid">
                      {newsFeed.map((story) => (
                        <div className="sw-news-card" key={story.uuid}>
                          <a className="sw-link sw-news-title" href={story.link} target="_blank" rel="noopener noreferrer">
                            {story.title}
                          </a>
                          <div className="sw-mini-sub">
                            {[story.publisher, story.date ? formatDate(story.date) : null].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default StockResearchView;
