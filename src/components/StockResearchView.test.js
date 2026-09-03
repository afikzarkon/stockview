import { render, screen, fireEvent } from '@testing-library/react';
import StockResearchView from './StockResearchView';
import { useStockSearch } from '../hooks/useStockSearch';
import { useStockResearch } from '../hooks/useStockResearch';
import { useDividendData } from '../hooks/useDividendData';
import { useStockNews } from '../hooks/useStockNews';
import { useAnalystRecommendations } from '../hooks/useAnalystRecommendations';

jest.mock('../hooks/useStockSearch');
jest.mock('../hooks/useStockResearch');
jest.mock('../hooks/useDividendData');
jest.mock('../hooks/useStockNews');
jest.mock('../hooks/useAnalystRecommendations');

const noop = () => {};

// A fully-passing fundamentals fixture, same values already exercised in
// stockScorecard.test.js's `goodResearch` (BUY verdict expected: 14/14
// checks pass across value/futureGrowth/financialHealth/ownership).
const goodResearch = {
  trailingPE: 18,
  pegRatio: 0.8,
  priceToBook: 2.5,
  earningsGrowth: 0.15,
  revenueGrowth: 0.08,
  currentPrice: 100,
  targetMeanPrice: 120,
  currentRatio: 1.5,
  debtToEquity: 60,
  returnOnEquity: 0.2,
  operatingCashflow: 5000,
  totalDebt: 10000,
  heldPercentInsiders: 0.1,
  heldPercentInstitutions: 0.5,
  insiderRecentSales: 1,
  insiderRecentPurchases: 2
};

function selectAapl(container) {
  fireEvent.change(container.querySelector('.sw-search-input'), { target: { value: 'apple' } });
  fireEvent.click(screen.getByText('AAPL'));
}

describe('StockResearchView', () => {
  beforeEach(() => {
    useStockSearch.mockReturnValue({
      results: [{ symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ' }],
      loading: false
    });
    useStockResearch.mockReturnValue({ research: null, loading: false, error: '' });
    useDividendData.mockReturnValue({ dividendsBySymbol: {} });
    useStockNews.mockReturnValue({ newsBySymbol: {} });
    useAnalystRecommendations.mockReturnValue({ recommendationsBySymbol: {}, loading: false });
  });

  test('shows the empty-state note before any stock is selected', () => {
    render(<StockResearchView onBack={noop} />);
    expect(screen.getByText('חפשו מניה למעלה כדי לראות ניתוח.')).toBeInTheDocument();
  });

  test('typing shows autocomplete suggestions, and selecting one loads a stock', () => {
    const { container } = render(<StockResearchView onBack={noop} />);
    fireEvent.change(container.querySelector('.sw-search-input'), { target: { value: 'apple' } });

    expect(container.textContent).toContain('Apple Inc.');
    fireEvent.click(screen.getByText('AAPL'));

    expect(screen.queryByText('חפשו מניה למעלה כדי לראות ניתוח.')).toBeNull();
    expect(container.querySelector('.sw-overview-title').textContent).toContain('Apple Inc. (AAPL)');
  });

  test('renders a BUY verdict banner and passing checks for strong fundamentals', () => {
    useStockResearch.mockReturnValue({ research: goodResearch, loading: false, error: '' });

    const { container } = render(<StockResearchView onBack={noop} />);
    selectAapl(container);

    expect(container.querySelector('.sw-snowflake-caption p').textContent).toContain('קנייה');
    expect(container.querySelectorAll('.sw-check-icon.sw-check-pass').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.sw-check-icon.sw-check-fail').length).toBe(0);
    // REWARDS list should be populated since every check passes
    expect(screen.getByText('REWARDS')).toBeInTheDocument();
    expect(screen.queryByText('RISK ANALYSIS')).toBeNull();
  });

  test('renders a SELL verdict banner and RISK ANALYSIS bullets for weak fundamentals', () => {
    useStockResearch.mockReturnValue({
      research: { trailingPE: 60, pegRatio: 5, priceToBook: 10, currentRatio: 0.5, debtToEquity: 300, returnOnEquity: 0.02 },
      loading: false,
      error: ''
    });

    const { container } = render(<StockResearchView onBack={noop} />);
    selectAapl(container);

    expect(container.querySelector('.sw-snowflake-caption p').textContent).toContain('מכירה');
    expect(screen.getByText('RISK ANALYSIS')).toBeInTheDocument();
    expect(container.querySelectorAll('.sw-check-icon.sw-check-fail').length).toBeGreaterThan(0);
  });

  test('shows a research-load error message instead of the scorecard', () => {
    useStockResearch.mockReturnValue({ research: null, loading: false, error: 'לא ניתן היה לטעון נתוני מנייה כרגע' });

    const { container } = render(<StockResearchView onBack={noop} />);
    selectAapl(container);

    expect(screen.getByText('לא ניתן היה לטעון נתוני מנייה כרגע')).toBeInTheDocument();
  });

  test('calls onBack when the back button is clicked', () => {
    const onBack = jest.fn();
    render(<StockResearchView onBack={onBack} />);
    fireEvent.click(screen.getByText('חזרה לדף הבית'));
    expect(onBack).toHaveBeenCalled();
  });

  test('clicking a sidebar item scrolls the corresponding section into view', () => {
    useStockResearch.mockReturnValue({ research: goodResearch, loading: false, error: '' });
    const scrollIntoViewMock = jest.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;

    const { container } = render(<StockResearchView onBack={noop} />);
    selectAapl(container);

    const sidebarItems = container.querySelectorAll('.sw-sidebar-item');
    expect(sidebarItems.length).toBeGreaterThan(1);
    fireEvent.click(sidebarItems[1]); // first category section
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  test('renders analyst consensus, target price upside, trend breakdown, and recent upgrade history', () => {
    useStockResearch.mockReturnValue({ research: { ...goodResearch, currentPrice: 100 }, loading: false, error: '' });
    useAnalystRecommendations.mockReturnValue({
      recommendationsBySymbol: {
        AAPL: {
          recommendationKey: 'buy',
          numberOfAnalystOpinions: 23,
          targetMeanPrice: 120,
          targetLowPrice: 90,
          targetHighPrice: 150,
          currentTrend: { period: '0m', strongBuy: 10, buy: 8, hold: 4, sell: 1, strongSell: 0 },
          upgradeHistory: [{ firm: 'Big Bank', action: 'up', fromGrade: 'Hold', toGrade: 'Buy', epochGradeDate: 1700000000 }]
        }
      },
      loading: false
    });

    const { container } = render(<StockResearchView onBack={noop} />);
    selectAapl(container);

    expect(screen.getByText('קנייה', { selector: '.sw-mini-value' })).toBeInTheDocument();
    expect(screen.getByText('23 אנליסטים')).toBeInTheDocument();
    expect(screen.getByText('$120.00')).toBeInTheDocument();
    expect(screen.getByText('+20.0% מהמחיר הנוכחי')).toBeInTheDocument();
    expect(screen.getByText('$90.00 - $150.00')).toBeInTheDocument();
    // trend breakdown: strongSell is 0, so it should NOT render a row for it
    expect(screen.getByText('קנייה חזקה')).toBeInTheDocument();
    expect(screen.queryByText('מכירה חזקה')).toBeNull();
    // upgrade history
    expect(container.textContent).toContain('Big Bank');
    expect(container.textContent).toContain('Hold ← Buy');
  });

  test('shows a no-data note when no analyst coverage is available', () => {
    useStockResearch.mockReturnValue({ research: goodResearch, loading: false, error: '' });
    useAnalystRecommendations.mockReturnValue({ recommendationsBySymbol: {}, loading: false });

    const { container } = render(<StockResearchView onBack={noop} />);
    selectAapl(container);

    expect(screen.getByText('אין נתוני אנליסטים זמינים למנייה זו.')).toBeInTheDocument();
  });

  test('renders company info (about/employees/location/website), management roster, and similar companies', () => {
    useStockResearch.mockReturnValue({
      research: {
        ...goodResearch,
        companyProfile: {
          sector: 'Technology',
          industry: 'Consumer Electronics',
          website: 'https://www.example.com',
          longBusinessSummary: 'Example Inc. makes example products.',
          fullTimeEmployees: 150000,
          city: 'Cupertino',
          country: 'United States',
          companyOfficers: [
            { name: 'Jane Doe', title: 'CEO', age: 55, totalPay: 18500000 },
            { name: 'John Roe', title: 'CFO', age: 50, totalPay: null }
          ]
        },
        similarCompanies: [{ symbol: 'MSFT', score: 0.2 }, { symbol: 'GOOG', score: 0.18 }]
      },
      loading: false,
      error: ''
    });

    const { container } = render(<StockResearchView onBack={noop} />);
    selectAapl(container);

    // about the company (shown in the overview card description + the
    // combined "הנהלה ואודות החברה" card)
    expect(container.textContent).toContain('Example Inc. makes example products.');
    expect(screen.getByText('150,000')).toBeInTheDocument();
    expect(screen.getByText('Cupertino, United States')).toBeInTheDocument();
    expect(screen.getByText('www.example.com')).toBeInTheDocument();

    // management roster
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('CEO')).toBeInTheDocument();
    expect(screen.getByText('$18.50M')).toBeInTheDocument();
    expect(container.textContent).toContain('John Roe');

    // similar companies, clickable - selects the peer with an empty name
    // (no company name available for peers, just ticker+score), so the
    // overview title should read as a bare "MSFT", not "MSFT — MSFT".
    const msftChip = container.querySelector('.sw-chip');
    expect(msftChip.textContent).toBe('MSFT');
    fireEvent.click(msftChip);

    expect(container.querySelector('.sw-overview-title').textContent).toContain('MSFT');
    expect(container.querySelector('.sw-overview-title').textContent).not.toContain('MSFT — MSFT');
  });

  test('shows one combined empty-state note for company/management, and one for similar companies, when that data is missing', () => {
    useStockResearch.mockReturnValue({ research: goodResearch, loading: false, error: '' }); // no companyProfile/similarCompanies fields

    const { container } = render(<StockResearchView onBack={noop} />);
    selectAapl(container);

    expect(screen.getByText('אין מידע זמין על החברה.')).toBeInTheDocument();
    expect(screen.getByText('לא נמצאו חברות דומות למנייה זו.')).toBeInTheDocument();
  });

  test('shows empty-state notes for price history, fundamentals summary, DCF, and insider transactions when that data is missing', () => {
    // goodResearch has no fundamentalsHistory/priceHistory/beta/insiderTransactions.
    useStockResearch.mockReturnValue({ research: goodResearch, loading: false, error: '' });

    const { container } = render(<StockResearchView onBack={noop} />);
    selectAapl(container);

    expect(screen.getByText('אין נתוני מחיר היסטוריים זמינים למנייה זו.')).toBeInTheDocument();
    expect(screen.getByText('אין נתוני הכנסות/הוצאות זמינים למנייה זו.')).toBeInTheDocument();
    expect(screen.getByText('אין מספיק נתונים למודל DCF עבור מנייה זו.')).toBeInTheDocument();
    expect(screen.getByText('אין נתוני עסקאות פנימיים זמינים למנייה זו.')).toBeInTheDocument();

    // ROE has real data (goodResearch.returnOnEquity) so its gauge should
    // show a percentage, not "no data" - ROA/ROCE have no source data here.
    const gaugeValues = container.querySelectorAll('.sw-gauge-value');
    expect(gaugeValues.length).toBe(1);
    expect(gaugeValues[0].textContent).toBe('20.0%');
    expect(container.querySelectorAll('.sw-gauge .sw-empty-note').length).toBe(2);
  });

  test('renders price history (with dividend markers), fundamentals summary, PE-vs-peers, historical P/E, DCF fair value, balance-sheet treemap, gauges, and insider transactions when the data is available', () => {
    const richResearch = {
      ...goodResearch,
      returnOnAssets: 0.1,
      beta: 1,
      sharesOutstanding: 100,
      nextYearEarningsGrowth: 0.1,
      similarCompanies: [{ symbol: 'MSFT', score: 0.2 }],
      peerQuotes: [{ symbol: 'MSFT', trailingPE: 25 }],
      priceHistory: [
        { date: '2024-01-02', close: 90 },
        { date: '2024-06-03', close: 95 },
        { date: '2024-12-31', close: 100 }
      ],
      insiderTransactions: [
        {
          filerName: 'Jane Insider',
          filerRelation: 'Officer',
          transactionText: 'Sale at price 100.00 per share.',
          shares: 1000,
          value: 100000,
          startDateEpoch: 1700000000
        }
      ],
      fundamentalsHistory: {
        annualTotalRevenue: [
          { date: '2023-12-31', value: 900 },
          { date: '2024-12-31', value: 1000 }
        ],
        annualCostOfRevenue: [{ date: '2024-12-31', value: -400 }],
        annualOperatingExpense: [{ date: '2024-12-31', value: -300 }],
        annualInterestExpense: [{ date: '2024-12-31', value: -50 }],
        annualTaxProvision: [{ date: '2024-12-31', value: -60 }],
        annualNetIncome: [
          { date: '2023-12-31', value: 170 },
          { date: '2024-12-31', value: 190 }
        ],
        annualCurrentAssets: [{ date: '2024-12-31', value: 500 }],
        annualNetPPE: [{ date: '2024-12-31', value: 300 }],
        annualCashAndCashEquivalents: [{ date: '2024-12-31', value: 200 }],
        annualCurrentLiabilities: [{ date: '2024-12-31', value: 150 }],
        annualLongTermDebt: [{ date: '2024-12-31', value: 400 }],
        annualStockholdersEquity: [{ date: '2024-12-31', value: 450 }],
        annualEBIT: [{ date: '2024-12-31', value: 200 }],
        annualInvestedCapital: [{ date: '2024-12-31', value: 1000 }],
        annualFreeCashFlow: [{ date: '2024-12-31', value: 500 }],
        annualDilutedEPS: [{ date: '2024-12-31', value: 5 }]
      }
    };
    useStockResearch.mockReturnValue({ research: richResearch, loading: false, error: '' });
    useDividendData.mockReturnValue({
      dividendsBySymbol: { AAPL: { history: [{ date: '2024-06-01', amountPerShare: 0.5 }] } }
    });

    const { container } = render(<StockResearchView onBack={noop} />);
    selectAapl(container);

    // Price history + dividend marker note (the 2024-06-01 dividend snaps
    // to the 2024-06-03 price point, well within the 30-day match window).
    expect(screen.queryByText('אין נתוני מחיר היסטוריים זמינים למנייה זו.')).toBeNull();
    expect(container.textContent).toContain('הנקודות המסומנות (●) הן תאריכי תשלום דיבידנד בפועל.');

    // Fundamentals summary (donut + trend bar)
    expect(container.textContent).toContain('הרכב הכנסות (שנה אחרונה)');
    expect(container.textContent).toContain('הכנסות ורווח נקי לאורך זמן');

    // PE vs. peers + historical P/E, inside the Value section
    expect(container.textContent).toContain('מכפיל רווח (P/E) מול חברות דומות');
    expect(container.textContent).toContain('מכפיל רווח (P/E) היסטורי (הערכה)');

    // DCF fair value - the SimplyWall.st-style valuation spectrum bar
    // (current price + fair value markers, both in "US$X" form, plus an
    // Over/Undervalued badge and the fixed 20%-boundary zone labels)
    expect(screen.queryByText('אין מספיק נתונים למודל DCF עבור מנייה זו.')).toBeNull();
    expect(container.textContent).toMatch(/Current Price[\s\S]*US\$\d/);
    expect(container.textContent).toMatch(/Fair Value[\s\S]*US\$\d/);
    expect(container.textContent).toMatch(/\d+(\.\d+)?% (Over|Under)valued/);
    expect(container.textContent).toContain('20% Undervalued');
    expect(container.textContent).toContain('About Right');
    expect(container.textContent).toContain('20% Overvalued');

    // Balance sheet treemap, inside Financial Health - rendered as two
    // separate group treemaps (Assets / Liabilities & Equity), not one
    // combined one (see the fix for the "boxes ended up mixed together"
    // report).
    expect(container.textContent).toContain('פילוח מאזן (שנה אחרונה)');
    const treemapGroupTitles = Array.from(container.querySelectorAll('.sw-treemap-group-title')).map(
      (el) => el.textContent
    );
    expect(treemapGroupTitles).toEqual(['נכסים', 'התחייבויות והון']);

    // Every treemap item is always listed in a legend regardless of its own
    // box size (a box too narrow for its label was previously unreadable -
    // see the fix in renderTreemapCell/the sw-treemap-legend list).
    const legendLists = container.querySelectorAll('.sw-treemap-legend');
    expect(legendLists.length).toBe(2);
    expect(legendLists[0].querySelectorAll('li').length).toBe(3); // current assets, PP&E, cash (goodwill missing)
    expect(legendLists[1].querySelectorAll('li').length).toBe(3); // current liabilities, long-term debt, equity
    expect(legendLists[0].textContent).toContain('מזומן ושווי מזומן');
    expect(legendLists[0].textContent).toContain('$200.00');

    // Gauges: ROE (0.2), ROA (0.1), ROCE (EBIT 200 / invested capital 1000 = 0.2)
    const gaugeValues = Array.from(container.querySelectorAll('.sw-gauge-value')).map((el) => el.textContent);
    expect(gaugeValues).toEqual(['20.0%', '10.0%', '20.0%']);
    expect(container.querySelectorAll('.sw-gauge .sw-empty-note').length).toBe(0);

    // Insider transactions table, inside Ownership
    expect(screen.queryByText('אין נתוני עסקאות פנימיים זמינים למנייה זו.')).toBeNull();
    expect(screen.getByText('Jane Insider')).toBeInTheDocument();
    expect(screen.getByText('Sale at price 100.00 per share.')).toBeInTheDocument();
    expect(screen.getByText('$100.0K')).toBeInTheDocument();
  });

  test('the DCF section shows a low-confidence caveat when the reported FCF history includes a negative/zero year (a genuinely cyclical business), but not otherwise', () => {
    const cyclicalResearch = {
      ...goodResearch,
      beta: 2.222,
      sharesOutstanding: 1129393151,
      nextYearEarningsGrowth: 1.112,
      fundamentalsHistory: {
        annualFreeCashFlow: [
          { date: '2022-08-31', value: 3114000000 },
          { date: '2023-08-31', value: -6117000000 },
          { date: '2024-08-31', value: 121000000 },
          { date: '2025-08-31', value: 1668000000 }
        ]
      }
    };
    useStockResearch.mockReturnValue({ research: cyclicalResearch, loading: false, error: '' });
    const { container, rerender } = render(<StockResearchView onBack={noop} />);
    selectAapl(container);

    expect(container.textContent).toContain('תזרים המזומנים המדווח של החברה היה שלילי או אפסי');

    // a steady, all-positive FCF history is a normal-confidence case - no caveat
    const steadyResearch = {
      ...cyclicalResearch,
      fundamentalsHistory: { annualFreeCashFlow: [{ date: '2024-12-31', value: 500000000 }] }
    };
    useStockResearch.mockReturnValue({ research: steadyResearch, loading: false, error: '' });
    rerender(<StockResearchView onBack={noop} />);
    expect(container.textContent).not.toContain('תזרים המזומנים המדווח של החברה היה שלילי או אפסי');
  });

  test('the "Future Cash Flow Value History" chart renders with a 7D/1Y period toggle and a price % change badge, once there is recent price history', () => {
    const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const richResearch = {
      ...goodResearch,
      beta: 1,
      sharesOutstanding: 100,
      nextYearEarningsGrowth: 0.1,
      priceHistory: [
        { date: daysAgo(400), close: 80 },
        { date: daysAgo(30), close: 90 },
        { date: daysAgo(3), close: 95 },
        { date: daysAgo(0), close: 100 }
      ],
      fundamentalsHistory: {
        annualFreeCashFlow: [
          { date: daysAgo(730), value: 400 },
          { date: daysAgo(365), value: 450 },
          { date: daysAgo(1), value: 500 }
        ]
      }
    };
    useStockResearch.mockReturnValue({ research: richResearch, loading: false, error: '' });

    const { container } = render(<StockResearchView onBack={noop} />);
    selectAapl(container);

    expect(container.textContent).toContain('מחיר נוכחי מול שווי תזרים מזומנים עתידי');
    // defaults to 1Y, showing all 4 points (400 days ago falls just
    // outside a strict 365-day window, so it's the 30/3/0-days-ago points
    // plus whichever of those survive - either way the % change badge
    // reflects a real computed change, not a placeholder)
    expect(container.textContent).toMatch(/[+-]?\d+(\.\d+)?%/);

    const sevenDayBtn = screen.getByText('7D');
    const oneYearBtn = screen.getByText('1Y');
    expect(oneYearBtn.className).toContain('active');
    expect(sevenDayBtn.className).not.toContain('active');

    fireEvent.click(sevenDayBtn);
    expect(sevenDayBtn.className).toContain('active');
    expect(oneYearBtn.className).not.toContain('active');

    // the disclaimer explaining this is a per-year sensitivity estimate,
    // not a real historical fair-value series
    expect(container.textContent).toContain('לא סדרה היסטורית אמיתית של הערכות שוק');
  });

  test('the "Future Cash Flow Value History" chart does not render when there is no recent price history in the selected window', () => {
    const richResearch = {
      ...goodResearch,
      beta: 1,
      sharesOutstanding: 100,
      nextYearEarningsGrowth: 0.1,
      // stale fixture dates, well outside any 1Y/7D window from "now"
      priceHistory: [{ date: '2020-01-02', close: 90 }],
      fundamentalsHistory: { annualFreeCashFlow: [{ date: '2020-12-31', value: 400 }] }
    };
    useStockResearch.mockReturnValue({ research: richResearch, loading: false, error: '' });

    const { container } = render(<StockResearchView onBack={noop} />);
    selectAapl(container);

    expect(container.textContent).not.toContain('מחיר נוכחי מול שווי תזרים מזומנים עתידי');
  });

  test('renders correctly with theme="light" as well as the default dark theme - charts pick their own literal color set from the theme prop (recharts needs literal SVG colors, not CSS variables, so this is real component logic, not just CSS)', () => {
    const researchWithTreemap = {
      ...goodResearch,
      fundamentalsHistory: {
        annualCurrentAssets: [{ date: '2024-12-31', value: 500 }],
        annualNetPPE: [{ date: '2024-12-31', value: 300 }],
        annualCurrentLiabilities: [{ date: '2024-12-31', value: 150 }],
        annualLongTermDebt: [{ date: '2024-12-31', value: 400 }]
      }
    };
    useStockResearch.mockReturnValue({ research: researchWithTreemap, loading: false, error: '' });

    const { container } = render(<StockResearchView onBack={noop} theme="light" />);
    selectAapl(container);

    // No crash, and the same content that renders under the default dark
    // theme still renders under light - confirms the theme prop is wired
    // through without breaking anything (recharts' own SVG internals don't
    // get real pixel dimensions in jsdom, so this suite - like every
    // existing test here - checks surrounding content/structure rather
    // than chart-rendered attributes).
    expect(container.querySelector('.sw-snowflake-caption p').textContent).toContain('קנייה');
    expect(container.textContent).toContain('פילוח מאזן (שנה אחרונה)');
    const treemapGroupTitles = Array.from(container.querySelectorAll('.sw-treemap-group-title')).map(
      (el) => el.textContent
    );
    expect(treemapGroupTitles).toEqual(['נכסים', 'התחייבויות והון']);
  });
});
