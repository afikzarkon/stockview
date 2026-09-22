import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import PortfolioAnalysisView from './PortfolioAnalysisView';
import { calculatePortfolioAnalysis } from '../utils/portfolioAnalysis';
import { useBenchmarkHistory } from '../hooks/useBenchmarkHistory';
import { useStockSectors } from '../hooks/useStockSectors';
import { useAnalystRecommendations } from '../hooks/useAnalystRecommendations';
import { useDividendData } from '../hooks/useDividendData';

jest.mock('../hooks/useBenchmarkHistory');
jest.mock('../hooks/useStockSectors');
jest.mock('../hooks/useAnalystRecommendations');
jest.mock('../hooks/useDividendData');

const noop = () => {};

const israeliStocks = [
  { stockName: 'TEVA', quantity: 100, purchasePrice: 30, currentPrice: 3500, dailyChangePercent: 1.2, purchaseDate: '2023-01-15' }
];
const americanStocks = [
  {
    stockName: 'AAPL',
    quantity: 10,
    purchasePrice: 150,
    currentPrice: 190,
    exchangeRate: 3.6,
    currentExchangeRate: 3.7,
    dailyChangePercent: 0.8,
    purchaseDate: '2022-03-01'
  }
];
const pensionFunds = [{ initialInvestment: 1000, currentValue: 1100, previousValue: 1050, updateDate: '2023-01-01' }];
const cashFunds = [{ amount: 500, updateDate: '2023-01-01' }];
const bankBalances = [{ amount: 2000, updateDate: '2023-01-01' }];

const analysis = calculatePortfolioAnalysis(israeliStocks, americanStocks, pensionFunds, cashFunds, bankBalances);

function makeProps(overrides = {}) {
  return {
    analysis,
    formatPriceWithSign: (v) => (v ?? 0).toFixed(2),
    snapshots: [],
    snapshotsLoading: false,
    americanStocks,
    israeliStocks,
    pensionFunds,
    cpi: null,
    rebalanceTargets: null,
    rebalanceTargetsLoading: false,
    rebalanceSaving: false,
    rebalanceSaveError: '',
    onSaveRebalanceTargets: noop,
    monthlySnapshots: [],
    monthlySnapshotsLoading: false,
    onSaveMonthlySnapshot: noop,
    savingMonthly: false,
    saveMonthlyError: '',
    onUpdateMonthlySnapshot: undefined,
    updatingMonth: null,
    updateMonthlyError: '',
    onDeleteMonthlySnapshot: undefined,
    deletingMonth: null,
    deleteMonthlyError: '',
    onAddManualMonthlySnapshot: undefined,
    addingManual: false,
    addManualError: '',
    ...overrides
  };
}

describe('PortfolioAnalysisView', () => {
  beforeEach(() => {
    useBenchmarkHistory.mockReturnValue({ points: [], loading: false, error: '' });
    useStockSectors.mockReturnValue({ sectorBySymbol: {}, loading: false });
    useAnalystRecommendations.mockReturnValue({ recommendationsBySymbol: {}, loading: false });
    useDividendData.mockReturnValue({ dividendsBySymbol: {}, loading: false });
    // Backs the custom date-range picker's useHistoricalPortfolioValue call
    // - real network calls (not mocked at the hook level, unlike the
    // hooks above) since it's not jest.mock()'d, matching how the rest of
    // this suite exercises it as a real dependency.
    global.fetch = jest.fn().mockRejectedValue(new Error('network unavailable in test'));
  });

  afterEach(() => {
    delete global.fetch;
  });

  test('renders without crashing, with the sidebar nav grouped into 4 labeled groups', () => {
    const { container } = render(<PortfolioAnalysisView {...makeProps()} />);
    const groupLabels = Array.from(container.querySelectorAll('.sw-sidebar-group-label')).map((el) => el.textContent);
    expect(groupLabels).toEqual(['ביצועים', 'פיזור התיק', 'מניות אמריקאיות', 'כלים ודוחות']);
    // 10 destinations. The monthly tracker and the tax-loss calculator left
    // for their own pages, the quarterly earnings board was removed, and the
    // benchmark comparison is now an overlay on the performance chart rather
    // than a section to navigate to.
    expect(container.querySelectorAll('.sw-sidebar-item').length).toBe(10);
    expect(screen.queryByText('ציון בריאות תיק')).toBeNull();
  });

  // Both are tasks rather than read-outs, and each is now a page of its own
  // reached from the app's main sidebar (see router/routes.js).
  test('no longer carries the monthly tracker or the tax-loss calculator', () => {
    const { container } = render(<PortfolioAnalysisView {...makeProps()} />);
    const titles = Array.from(container.querySelectorAll('.section-title')).map((el) => el.textContent);
    expect(titles).not.toContain('מעקב חודשי');
    expect(titles).not.toContain('הזדמנויות לקיזוז מס (Tax-Loss Harvesting)');
  });

  // Removed outright, not moved: the board listed upcoming US earnings
  // dates, which is calendar data about companies rather than anything
  // about this portfolio.
  test('the quarterly earnings board is gone from the page entirely', () => {
    const { container } = render(<PortfolioAnalysisView {...makeProps()} />);
    expect(container.textContent).not.toContain('לוח רבעונים');
    expect(screen.queryByText('לוח רבעונים (מניות אמריקאיות)')).toBeNull();
  });

  test('clicking a sidebar item scrolls the corresponding section into view', () => {
    const scrollIntoViewMock = jest.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;

    render(<PortfolioAnalysisView {...makeProps()} />);
    fireEvent.click(screen.getByText('מעקב דיבידנדים'));
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  test('the duplicate "פיזור לפי רכיבי תיק" section is gone (its numbers already live on Home and are repeated by the pie chart right below it)', () => {
    render(<PortfolioAnalysisView {...makeProps()} />);
    expect(screen.queryByText('פיזור לפי רכיבי תיק')).toBeNull();
    // the pie chart section (the non-duplicate one) is still there - text
    // appears twice (sidebar nav item + section heading), so disambiguate
    // to the heading specifically
    expect(screen.getByText('גרף עוגה - פיזור התיק', { selector: '.section-title' })).toBeInTheDocument();
  });

  test('"תקציר ניתוח" is trimmed to the 3 metrics not already shown on Home - the other 3 (total P&L, forex impact, total portfolio value) are cut', () => {
    render(<PortfolioAnalysisView {...makeProps()} />);
    expect(screen.getByText('מספר פוזיציות')).toBeInTheDocument();
    expect(screen.getByText('שינוי יומי משוקלל')).toBeInTheDocument();
    expect(screen.getByText('ריכוזיות 3 פוזיציות')).toBeInTheDocument();
    expect(screen.queryByText('רווח/הפסד לא ממומש')).toBeNull();
    expect(screen.queryByText('השפעת מט"ח על רכיב ארה"ב')).toBeNull();
    expect(screen.queryByText('סה"כ שווי תיק מלא')).toBeNull();
  });

  test('renders the sections grouped: performance, then composition, then US-stocks, then tools and reports', () => {
    const { container } = render(<PortfolioAnalysisView {...makeProps()} />);
    const titles = Array.from(container.querySelectorAll('.section-title')).map((el) => el.textContent);
    expect(titles).toEqual([
      'תקציר ניתוח',
      'ביצועי התיק לאורך זמן',
      'גרף עוגה - פיזור התיק',
      'פיזור לפי מניות',
      'פיזור לפי תאריכי קנייה והפקדה',
      'פיזור לפי סקטור',
      'מעקב דיבידנדים (מניות אמריקאיות)',
      'המלצות אנליסטים (מניות אמריקאיות)',
      'איזון מחדש (Rebalancing)',
      'דוחות מפורטים'
    ]);
    // "השוואה מול מדד ייחוס" isn't in the list above since it's gated
    // behind stats.hasHistory (empty snapshots here -> not rendered) -
    // asserted separately below rather than baked into the fixed order,
    // since its presence is data-dependent, not a section-order concern.
  });

  // The page's own title bar comes from PageToolbar now, like every other
  // page - the sidebar is how you leave, so there is no bespoke back link.
  test('titles itself through the shared page toolbar, with no bespoke back button', () => {
    const { container } = render(<PortfolioAnalysisView {...makeProps()} />);
    expect(container.querySelector('.page-toolbar')).not.toBeNull();
    expect(screen.getByText('ניתוח תיק', { selector: '.page-toolbar-title' })).toBeInTheDocument();
    expect(screen.queryByText('חזרה לדף הבית')).toBeNull();
  });

  // The purchase/deposit history is a year-level summary that drills into
  // months, rather than two flat lists side by side - the monthly one grew
  // by twelve rows a year and was the longest thing on the page.
  describe('purchase/deposit history accordion', () => {
    function yearRow(year) {
      return screen.getByText(year, { selector: '.year-accordion-year' }).closest('.year-accordion-item');
    }

    test('lists the years, with every year collapsed to begin with', () => {
      const { container } = render(<PortfolioAnalysisView {...makeProps()} />);
      const years = Array.from(container.querySelectorAll('.year-accordion-year')).map((el) => el.textContent);
      // The fixture buys in 2022 (AAPL) and 2023 (TEVA).
      expect(years).toEqual(expect.arrayContaining(['2022', '2023']));

      container.querySelectorAll('.year-accordion-body').forEach((body) => {
        expect(body).toHaveAttribute('hidden');
      });
      expect(container.querySelectorAll('.year-accordion-item.is-open').length).toBe(0);
    });

    test('expanding a year reveals that year\u2019s months, and only that year\u2019s', () => {
      render(<PortfolioAnalysisView {...makeProps()} />);
      const row2023 = yearRow('2023');

      fireEvent.click(within(row2023).getByRole('button'));

      expect(row2023.querySelector('.year-accordion-body')).not.toHaveAttribute('hidden');
      const labels = Array.from(row2023.querySelectorAll('.date-label')).map((el) => el.textContent);
      // A Hebrew month name and year, never the raw "YYYY-MM" sort key.
      expect(labels).toContain('ינואר 2023');
      labels.forEach((label) => expect(label).not.toMatch(/^\d{4}-\d{2}$/));

      // The other year stayed shut - expanding is per year, not a
      // page-wide "show everything".
      expect(yearRow('2022').querySelector('.year-accordion-body')).toHaveAttribute('hidden');
    });

    test('states whether a year is expanded, rather than only styling it', () => {
      render(<PortfolioAnalysisView {...makeProps()} />);
      const toggle = within(yearRow('2023')).getByRole('button');
      expect(toggle).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');

      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
    });
  });

  test('the static "how this is computed" explanations under section titles are gone (dynamic result callouts like the benchmark summary stay)', () => {
    const { container } = render(<PortfolioAnalysisView {...makeProps()} />);
    expect(container.textContent).not.toContain('מבוסס על סיווג הסקטור');
    expect(container.textContent).not.toContain('מבוסס על תשואות יומיות היסטוריות');
    expect(container.textContent).not.toContain('תשואת דיבידנד ותאריך תשלום קרוב');
  });

  // The standalone upcoming-dividend board was removed: every figure it
  // carried (the next payment date, the rate per share) is already a column
  // of the table above it, for the same holdings.
  test('no longer carries a separate upcoming-dividend board', () => {
    useDividendData.mockReturnValue({
      dividendsBySymbol: {
        AAPL: { dividendRate: 1.5, nextDividendDateEpoch: 4102444800, history: [] }
      },
      loading: false
    });
    const { container } = render(<PortfolioAnalysisView {...makeProps()} />);
    expect(container.textContent).not.toContain('לוח דיבידנדים קרובים');
    // The data itself is still shown - as a column of the tracker table.
    const dividends = screen.getByText('מעקב דיבידנדים (מניות אמריקאיות)').closest('.analysis-section');
    expect(within(dividends).getByText('תאריך תשלום קרוב')).toBeInTheDocument();
  });

  // Which holdings the performance curve is about - see
  // utils/portfolioSegments.js.
  describe('market selection and the FX toggle', () => {
    function segmentButton(label) {
      return within(document.querySelector('.segment-controls')).getByText(label);
    }

    test('offers the three market views above the chart', () => {
      render(<PortfolioAnalysisView {...makeProps()} />);
      ['כלל המניות', 'בורסה ישראלית', 'בורסה אמריקאית'].forEach((label) => {
        expect(segmentButton(label)).toBeInTheDocument();
      });
    });

    // A net-worth return is a different question from an investment
    // return; the balance-sheet figures live on the home dashboard.
    test('no longer offers a net-worth scope', () => {
      const { container } = render(<PortfolioAnalysisView {...makeProps()} />);
      expect(container.textContent).not.toContain('סה"כ הון נטו');
      expect(container.querySelector('.segment-summary').textContent).toContain('מניות בלבד');
    });

    // The default is the whole point of the change: cash, savings and
    // provident funds do not move with the market but would sit in both
    // ends of every sub-period and drag each percentage toward zero.
    test('defaults to all equities', () => {
      render(<PortfolioAnalysisView {...makeProps()} />);
      expect(segmentButton('כלל המניות')).toHaveAttribute('aria-pressed', 'true');
      expect(segmentButton('בורסה ישראלית')).toHaveAttribute('aria-pressed', 'false');
    });

    test('selecting a market marks it, and unmarks the others', () => {
      render(<PortfolioAnalysisView {...makeProps()} />);
      fireEvent.click(segmentButton('בורסה ישראלית'));
      expect(segmentButton('בורסה ישראלית')).toHaveAttribute('aria-pressed', 'true');
      expect(segmentButton('כלל המניות')).toHaveAttribute('aria-pressed', 'false');
    });

    // Two toggles read separately do not say what their combination means.
    test('states in words what the current selection covers', () => {
      const { container } = render(<PortfolioAnalysisView {...makeProps()} />);
      const summary = () => container.querySelector('.segment-summary').textContent;
      expect(summary()).toContain('כלל המניות');
      expect(summary()).toContain('מניות בלבד');

      fireEvent.click(segmentButton('בורסה אמריקאית'));
      expect(summary()).toContain('בורסה אמריקאית');
    });

    // The US view's headline question: did the stocks go up, or the dollar?
    describe('FX impact toggle', () => {
      const fxToggle = () => document.querySelector('.fx-toggle input');

      test('appears only for the US view', () => {
        render(<PortfolioAnalysisView {...makeProps()} />);
        expect(fxToggle()).toBeNull();

        fireEvent.click(segmentButton('בורסה ישראלית'));
        expect(fxToggle()).toBeNull();

        fireEvent.click(segmentButton('בורסה אמריקאית'));
        expect(fxToggle()).not.toBeNull();
      });

      test('starts off, so the US view defaults to the pure dollar return', () => {
        const { container } = render(<PortfolioAnalysisView {...makeProps()} />);
        fireEvent.click(segmentButton('בורסה אמריקאית'));
        expect(fxToggle().checked).toBe(false);
        expect(container.querySelector('.segment-summary').textContent).toContain('דולרית');
      });

      test('switching it on says the currency move is now included', () => {
        const { container } = render(<PortfolioAnalysisView {...makeProps()} />);
        fireEvent.click(segmentButton('בורסה אמריקאית'));
        fireEvent.click(fxToggle());
        expect(fxToggle().checked).toBe(true);
        expect(container.querySelector('.segment-summary').textContent).toContain('שער הדולר');
      });

      // The amounts stay in shekels under both modes - only the basis of
      // the RETURN changes.
      test('says the amounts are in shekels either way', () => {
        const { container } = render(<PortfolioAnalysisView {...makeProps()} />);
        fireEvent.click(segmentButton('בורסה אמריקאית'));
        expect(container.querySelector('.segment-summary').textContent).toContain('בשקלים');
      });
    });

    // A portfolio can be full and still have nothing in the chosen market;
    // the generic "no holdings" note would be misleading.
    test('names the filter that emptied the chart, rather than claiming no holdings', () => {
      render(<PortfolioAnalysisView {...makeProps({ americanStocks: [] })} />);
      fireEvent.click(segmentButton('בורסה אמריקאית'));
      expect(screen.getByText(/אין החזקות בבחירה הנוכחית/)).toBeInTheDocument();
    });
  });

  describe('benchmarks follow the selected market', () => {
    function segmentButton(label) {
      return within(document.querySelector('.segment-controls')).getByText(label);
    }
    // Scoped to the benchmark section: RebalancingSection reuses the
    // .benchmark-toggle-button class for its own save button.
    function benchmarkLabels() {
      const group = document.querySelector('[aria-label="בחירת מדד ייחוס"]');
      if (!group) return [];
      return Array.from(group.querySelectorAll('.benchmark-toggle-button')).map((b) => b.textContent);
    }

    // The section only renders once there is a usable portfolio series
    // behind it, so the price fetch has to return real closes - mocking
    // the benchmark alone is not enough.
    function renderWithHistory(props) {
      global.fetch.mockImplementation((url) => {
        const u = String(url);
        if (u.includes('israeli-stocks-history')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              history: {
                TEVA: [
                  { date: '2023-01-15', close: 10000 },
                  { date: '2024-01-01', close: 11000 },
                  { date: '2024-06-01', close: 12000 }
                ]
              }
            })
          });
        }
        if (u.includes('american-stocks-history')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ history: { AAPL: [{ date: '2023-01-15', close: 150 }] } })
          });
        }
        if (u.includes('exchange-rate-history')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ history: [{ date: '2023-01-15', close: 3.6 }] })
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });
      useBenchmarkHistory.mockReturnValue({
        points: [
          { date: '2023-01-15', close: 100 },
          { date: '2024-01-15', close: 120 }
        ],
        loading: false,
        error: ''
      });
      return render(<PortfolioAnalysisView {...makeProps(props)} />);
    }

    // The comparison is an overlay on the performance chart rather than a
    // section of its own, and it starts off - so the index buttons do not
    // exist until it is switched on.
    async function enableBenchmark() {
      const toggle = await screen.findByLabelText('השוואה מול מדד ייחוס');
      fireEvent.click(toggle);
      await waitFor(() => expect(benchmarkLabels().length).toBeGreaterThan(0));
    }

    test('offers no index buttons until the comparison is switched on', async () => {
      renderWithHistory();
      expect(await screen.findByLabelText('השוואה מול מדד ייחוס')).not.toBeChecked();
      expect(benchmarkLabels()).toEqual([]);
    });

    test('an Israeli portfolio is offered TASE indices, not the S&P', async () => {
      renderWithHistory();
      await enableBenchmark();
      fireEvent.click(segmentButton('בורסה ישראלית'));
      await waitFor(() => expect(benchmarkLabels().length).toBeGreaterThan(0));
      expect(benchmarkLabels()).toEqual(['תל אביב 125', 'תל אביב 35', 'תל אביב 90', 'תל אביב בנקים']);
    });

    test('a US portfolio is offered US indices', async () => {
      renderWithHistory();
      await enableBenchmark();
      fireEvent.click(segmentButton('בורסה אמריקאית'));
      await waitFor(() => expect(benchmarkLabels().length).toBeGreaterThan(0));
      expect(benchmarkLabels()).toEqual(['S&P 500', 'NASDAQ Composite', 'NASDAQ 100', 'Russell 2000']);
    });

    test('a combined portfolio is offered an anchor from each market', async () => {
      renderWithHistory();
      await enableBenchmark();
      expect(benchmarkLabels()).toContain('S&P 500');
      expect(benchmarkLabels()).toContain('תל אביב 125');
    });

    // Switching market must not silently reset a comparison the user set
    // up, when the new market offers the same index.
    test('keeps the chosen index across a market change that still offers it', async () => {
      renderWithHistory();
      await enableBenchmark();
      fireEvent.click(screen.getByText('S&P 500'));
      fireEvent.click(segmentButton('בורסה אמריקאית'));
      await waitFor(() =>
        expect(screen.getByText('S&P 500')).toHaveAttribute('aria-pressed', 'true')
      );
    });

    test('falls back to the new market primary index when it does not', async () => {
      renderWithHistory();
      await enableBenchmark();
      fireEvent.click(screen.getByText('S&P 500'));
      fireEvent.click(segmentButton('בורסה ישראלית'));
      await waitFor(() =>
        expect(screen.getByText('תל אביב 125')).toHaveAttribute('aria-pressed', 'true')
      );
    });

    test('says that US indices are shown in shekels', async () => {
      renderWithHistory();
      await enableBenchmark();
      expect(screen.getByText(/מוצגים בשקלים/)).toBeInTheDocument();
    });
  });

  // The working behind the performance curve - see utils/performanceAudit.js.
  describe('performance data inspection panel', () => {
    function openAudit() {
      const { container } = render(<PortfolioAnalysisView {...makeProps()} />);
      const toggle = screen.getByText(/בדיקת נתונים/);
      return { container, toggle };
    }

    test('is offered, and starts closed so it does not crowd the chart', () => {
      const { container, toggle } = openAudit();
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(container.querySelector('.audit-body')).toHaveAttribute('hidden');
    });

    test('opens and closes, stating which it is rather than only showing it', () => {
      const { container, toggle } = openAudit();

      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(container.querySelector('.audit-body')).not.toHaveAttribute('hidden');

      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
    });

    test('shows a column for every asset class, plus the flows and both return figures', () => {
      const { container, toggle } = openAudit();
      fireEvent.click(toggle);
      const headers = Array.from(container.querySelectorAll('.audit-table th')).map((th) => th.textContent);
      [
        'תאריך',
        'שווי התיק (₪)',
        'בורסה ישראלית',
        'בורסה אמריקאית',
        'קופות גמל',
        'כספית שקלית',
        'עו"ש',
        'חיסכון בבנק',
        'תזרים בתקופה (₪)',
        'תזרים מצטבר (₪)',
        'שינוי נאיבי (%)',
        'תשואת התקופה (%)',
        'TWR מצטבר (%)'
      ].forEach((label) => expect(headers).toContain(label));
    });

    test('offers the data as a file and to the console, not only on screen', () => {
      const { toggle } = openAudit();
      fireEvent.click(toggle);
      expect(screen.getByText('הורדת CSV')).toBeInTheDocument();
      expect(screen.getByText('הורדת JSON')).toBeInTheDocument();
      expect(screen.getByText('הדפסה לקונסול')).toBeInTheDocument();
    });

// Requirement: the inspection table has to describe the SAME portfolio
    // the chart above it is drawing, or the two disagree silently.
    test('states which selection its rows describe', () => {
      const { container, toggle } = openAudit();
      fireEvent.click(toggle);
      const body = container.querySelector('.audit-body');
      expect(body.textContent).toContain('מניות בלבד');

      fireEvent.click(within(container.querySelector('.segment-controls')).getByText('בורסה אמריקאית'));
      expect(container.querySelector('.audit-body').textContent).toContain('דולרית');
    });

    test('recomputes its rows when the market changes', async () => {
      global.fetch.mockImplementation((url) => {
        const u = String(url);
        if (u.includes('israeli-stocks-history')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              history: {
                TEVA: [
                  { date: '2023-01-15', close: 10000 },
                  { date: '2024-06-01', close: 12000 }
                ]
              }
            })
          });
        }
        if (u.includes('american-stocks-history')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ history: { AAPL: [{ date: '2023-01-15', close: 150 }] } })
          });
        }
        if (u.includes('exchange-rate-history')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ history: [{ date: '2023-01-15', close: 3.6 }] })
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      const { container } = render(<PortfolioAnalysisView {...makeProps()} />);
      fireEvent.click(screen.getByText(/בדיקת נתונים/));

      const valuesFor = () =>
        Array.from(container.querySelectorAll('.audit-table tbody tr')).map(
          (tr) => tr.querySelectorAll('td')[1].textContent
        );

      await waitFor(() => expect(valuesFor().length).toBeGreaterThan(0));
      const combined = valuesFor();

      // Israeli only: the same dates, but a smaller portfolio behind them.
      fireEvent.click(within(container.querySelector('.segment-controls')).getByText('בורסה ישראלית'));
      await waitFor(() => expect(valuesFor()).not.toEqual(combined));
    });

    test('printing to the console emits the rows as a table', () => {
      const table = jest.spyOn(console, 'table').mockImplementation(() => {});
      const group = jest.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
      jest.spyOn(console, 'groupEnd').mockImplementation(() => {});
      jest.spyOn(console, 'log').mockImplementation(() => {});

      const { toggle } = openAudit();
      fireEvent.click(toggle);
      fireEvent.click(screen.getByText('הדפסה לקונסול'));

      expect(group).toHaveBeenCalled();
      expect(table).toHaveBeenCalled();
      jest.restoreAllMocks();
    });
  });

  describe('dividend table - projected annual income column', () => {
    test('shows dividendRate × quantity held (not the historical "received" amount) for a known holding', () => {
      // americanStocks (top-level fixture) has one AAPL lot with quantity 10.
      useDividendData.mockReturnValue({
        dividendsBySymbol: { AAPL: { dividendRate: 1.5, dividendYieldPercent: 0.8, payoutRatio: 0.2, history: [] } },
        loading: false
      });
      const { getByText } = render(<PortfolioAnalysisView {...makeProps()} />);
      const dividendsSection = getByText('מעקב דיבידנדים (מניות אמריקאיות)').closest('.analysis-section');
      // 1.5 * 10 = 15.00, distinct from receivedUSD (0, no history entries) -
      // appears twice (the summary card + the table cell), both correct.
      expect(within(dividendsSection).getAllByText('$15.00').length).toBe(2);
    });

    test('shows "—" when no dividend rate is known for a holding, instead of a fabricated $0.00', () => {
      useDividendData.mockReturnValue({ dividendsBySymbol: {}, loading: false });
      const { getByText } = render(<PortfolioAnalysisView {...makeProps()} />);
      const dividendsSection = getByText('מעקב דיבידנדים (מניות אמריקאיות)').closest('.analysis-section');
      const row = within(dividendsSection).getByText('AAPL').closest('tr');
      // Last-but-one column is the new projected-income column; last is "סה"כ שהתקבל" - both "-" here.
      const cells = within(row).getAllByRole('cell');
      expect(cells[cells.length - 2].textContent).toBe('—');
    });
  });

  // Performance over time is now computed on the fly from real historical
  // closing prices for whatever the portfolio held on each date, instead of
  // being read back from saved daily snapshots. The section therefore works
  // with `snapshots: []`, which is what every fixture here passes.
  describe('performance over time (computed from historical closes)', () => {
    const mockHistoryFetch = () => {
      global.fetch.mockImplementation((url) => {
        const u = String(url);
        if (u.includes('israeli-stocks-history')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              history: {
                TEVA: [
                  { date: '2023-01-15', close: 10000 },
                  { date: '2024-01-01', close: 11000 },
                  { date: '2024-06-01', close: 12000 }
                ]
              }
            })
          });
        }
        if (u.includes('american-stocks-history') || u.includes('exchange-rate-history')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ history: u.includes('exchange-rate') ? [] : {} })
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });
    };

    test('defaults the range to the portfolio inception date, with no snapshots saved at all', async () => {
      mockHistoryFetch();
      const { container } = render(<PortfolioAnalysisView {...makeProps({ americanStocks: [] })} />);

      // The earliest purchase date across the holdings (TEVA, 2023-01-15).
      await waitFor(() => expect(container.querySelector('#performanceFrom').value).toBe('2023-01-15'));
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/israeli-stocks-history'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    test('computes the return since inception from the historical closes', async () => {
      mockHistoryFetch();
      const { getByText } = render(<PortfolioAnalysisView {...makeProps({ americanStocks: [] })} />);
      await waitFor(() => expect(getByText('תשואה מאז תחילת ההשקעה')).toBeInTheDocument());
      // The old label measured from the first saved snapshot instead.
      expect(screen.queryByText('תשואה מאז תחילת המעקב')).toBeNull();
    });

    test('narrowing the range re-fetches and recomputes, rather than reading a stored figure', async () => {
      mockHistoryFetch();
      const { container } = render(<PortfolioAnalysisView {...makeProps({ americanStocks: [] })} />);
      await waitFor(() => expect(container.querySelector('#performanceFrom').value).toBe('2023-01-15'));

      const callsBefore = global.fetch.mock.calls.length;
      fireEvent.change(container.querySelector('#performanceFrom'), { target: { value: '2024-01-01' } });

      await waitFor(() => expect(global.fetch.mock.calls.length).toBeGreaterThan(callsBefore));
      expect(container.querySelector('#performanceFrom').value).toBe('2024-01-01');
    });

    // Everything in the section is scoped to the chosen range, so the
    // headline cannot keep naming a start date it is no longer measured
    // from.
    test('the headline stops claiming "since inception" once the range is narrowed', async () => {
      mockHistoryFetch();
      const { container } = render(<PortfolioAnalysisView {...makeProps({ americanStocks: [] })} />);
      await waitFor(() => expect(screen.getByText('תשואה מאז תחילת ההשקעה')).toBeInTheDocument());

      fireEvent.change(container.querySelector('#performanceFrom'), { target: { value: '2024-01-01' } });

      await waitFor(() => expect(screen.getByText('תשואה בתקופה שנבחרה')).toBeInTheDocument());
      expect(screen.queryByText('תשואה מאז תחילת ההשקעה')).toBeNull();
    });

    test('surfaces an error message instead of a fake/blank result when the underlying fetch fails', async () => {
      const { getByText } = render(<PortfolioAnalysisView {...makeProps()} />);
      await waitFor(() =>
        expect(getByText('לא ניתן היה לטעון נתוני מחירים היסטוריים כרגע')).toBeInTheDocument()
      );
    });

    // THE DATE-PICKER FREEZE. A date input fires onChange on every keystroke
    // while the year is typed, so "2024" arrives as "0002", "0020", "0202"
    // and only then "2024". Those intermediate values used to be committed
    // straight through: a range starting in year 2 is ~105,000 weekly
    // sample points, each pricing every holding, and the page stopped
    // responding. Half-typed values are now ignored outright.
    test('ignores the half-typed year values a date input emits while being typed into', async () => {
      mockHistoryFetch();
      const { container } = render(<PortfolioAnalysisView {...makeProps({ americanStocks: [] })} />);
      await waitFor(() => expect(container.querySelector('#performanceFrom').value).toBe('2023-01-15'));

      const fromInput = container.querySelector('#performanceFrom');
      const callsBefore = global.fetch.mock.calls.length;

      // Everything a browser emits while "2024-03-01" is being typed.
      ['0002-03-01', '0020-03-01', '0202-03-01'].forEach((partial) => {
        fireEvent.change(fromInput, { target: { value: partial } });
        // Not committed: the input keeps showing the last good range.
        expect(fromInput.value).toBe('2023-01-15');
      });

      // And nothing was refetched or recomputed for any of them.
      expect(global.fetch.mock.calls.length).toBe(callsBefore);

      // The completed date is accepted normally.
      fireEvent.change(fromInput, { target: { value: '2024-03-01' } });
      await waitFor(() => expect(fromInput.value).toBe('2024-03-01'));
    });

    test('ignores a future date, which has no prices to value the portfolio at', async () => {
      mockHistoryFetch();
      const { container } = render(<PortfolioAnalysisView {...makeProps({ americanStocks: [] })} />);
      await waitFor(() => expect(container.querySelector('#performanceFrom').value).toBe('2023-01-15'));

      const toInput = container.querySelector('#performanceTo');
      const committed = toInput.value;
      fireEvent.change(toInput, { target: { value: '2099-01-01' } });
      expect(toInput.value).toBe(committed);
    });

    test('a start date after the end date collapses to a valid range instead of blanking the section', async () => {
      mockHistoryFetch();
      const { container } = render(<PortfolioAnalysisView {...makeProps({ americanStocks: [] })} />);
      await waitFor(() => expect(container.querySelector('#performanceFrom').value).toBe('2023-01-15'));

      fireEvent.change(container.querySelector('#performanceTo'), { target: { value: '2024-01-01' } });
      fireEvent.change(container.querySelector('#performanceFrom'), { target: { value: '2025-01-01' } });

      await waitFor(() => {
        const from = container.querySelector('#performanceFrom').value;
        const to = container.querySelector('#performanceTo').value;
        expect(to >= from).toBe(true);
      });
    });

    // Requirement: the headline return must exclude money paid in.
    // Every percentage in this section is cash-flow-neutralized. The raw
    // "how much bigger is the portfolio now" figure used to sit beside the
    // real return, which invited the two to be read as alternatives - it is
    // not a return at all, since a portfolio that grew only because money
    // was paid into it shows a large positive number for doing nothing.
    test('the return is labelled as neutralized, and the raw value change is not offered beside it', async () => {
      mockHistoryFetch();
      const { container } = render(<PortfolioAnalysisView {...makeProps({ americanStocks: [] })} />);

      await waitFor(() => expect(screen.getByText('תשואה מאז תחילת ההשקעה')).toBeInTheDocument());
      expect(screen.getByText(/מנוטרל הפקדות ורכישות/)).toBeInTheDocument();
      expect(screen.queryByText('שינוי בשווי התיק (כולל הפקדות)')).toBeNull();

      // Scoped to the headline cards. The audit panel below still carries a
      // "naive change" column, which is the evidence for the neutralization
      // rather than a return presented as performance.
      const metricCards = Array.from(container.querySelectorAll('.distribution-card h3')).map(
        (el) => el.textContent
      );
      expect(metricCards.some((label) => /כולל הפקדות/.test(label))).toBe(false);
    });

    test('the removed metrics are gone: no health score, no max drawdown, no Sharpe ratio', async () => {
      mockHistoryFetch();
      render(<PortfolioAnalysisView {...makeProps({ americanStocks: [] })} />);
      await waitFor(() => expect(screen.getByText('תשואה מאז תחילת ההשקעה')).toBeInTheDocument());

      expect(screen.queryByText('ציון בריאות תיק')).toBeNull();
      expect(screen.queryByText('ירידה מקסימלית (Drawdown)')).toBeNull();
      expect(screen.queryByText('Sharpe Ratio (משוער)')).toBeNull();
      // Annualized volatility stays - it was audited, not removed.
      expect(screen.getByText('תנודתיות שנתית (משוערת)')).toBeInTheDocument();
    });
  });

  // Requirement: provident-fund deposits belong in the purchase-date
  // breakdown, at the date each deposit was actually made - not lumped onto
  // whatever date the fund's value happened to last be updated.
  describe('breakdown by purchase/deposit date', () => {
    test('places each provident-fund deposit in the month it was made, alongside the stock purchases', () => {
      const pensionWithLedger = [
        {
          fundName: 'קופת גמל',
          currentValue: 5000,
          currentValueDate: '2024-06-01',
          deposits: [
            { date: '2023-03-10', amount: 1000 },
            { date: '2023-09-10', amount: 2000 }
          ]
        }
      ];
      const analysisWithPension = calculatePortfolioAnalysis(
        israeliStocks,
        [],
        pensionWithLedger,
        [],
        [],
        []
      );
      const months = analysisWithPension.monthlyDistribution.map((m) => m.month);

      expect(months).toContain('2023-03');
      expect(months).toContain('2023-09');
      // Not collapsed onto the fund's last-updated month.
      expect(months).not.toContain('2024-06');

      const march = analysisWithPension.monthlyDistribution.find((m) => m.month === '2023-03');
      expect(march.value).toBe(1000);
    });
  });
});

function formatMonthLabelForTest(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
}
