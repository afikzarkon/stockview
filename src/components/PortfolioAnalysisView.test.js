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
    onBack: noop,
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

  test('renders without crashing, with the sidebar nav grouped into 5 labeled groups', () => {
    const { container } = render(<PortfolioAnalysisView {...makeProps()} />);
    const groupLabels = Array.from(container.querySelectorAll('.sw-sidebar-group-label')).map((el) => el.textContent);
    expect(groupLabels).toEqual(['סקירה כללית', 'הרכב התיק', 'מניות אמריקאיות', 'כלים', 'דוחות']);
    // 14 sections: 15 before, minus the portfolio health score, which was
    // removed from the analysis module entirely.
    expect(container.querySelectorAll('.sw-sidebar-item').length).toBe(14);
    expect(screen.queryByText('ציון בריאות תיק')).toBeNull();
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

  test('renders the sections in the new grouped order: overview, then composition, then US-stocks, then tools, then reports', () => {
    const { container } = render(<PortfolioAnalysisView {...makeProps()} />);
    const titles = Array.from(container.querySelectorAll('.section-title')).map((el) => el.textContent);
    expect(titles).toEqual([
      'תקציר ניתוח',
      'ביצועי התיק לאורך זמן',
      'מעקב חודשי',
      'גרף עוגה - פיזור התיק',
      'פיזור לפי מניות',
      'פיזור לפי תאריכי קנייה והפקדה',
      'פיזור לפי סקטור',
      'מעקב דיבידנדים (מניות אמריקאיות)',
      'לוח רבעונים (מניות אמריקאיות)',
      'המלצות אנליסטים (מניות אמריקאיות)',
      'איזון מחדש (Rebalancing)',
      'הזדמנויות לקיזוז מס (Tax-Loss Harvesting)',
      'דוחות מפורטים'
    ]);
    // "השוואה מול מדד ייחוס" isn't in the list above since it's gated
    // behind stats.hasHistory (empty snapshots here -> not rendered) -
    // asserted separately below rather than baked into the fixed order,
    // since its presence is data-dependent, not a section-order concern.
  });

  test('calls onBack when the back button is clicked', () => {
    const onBack = jest.fn();
    render(<PortfolioAnalysisView {...makeProps({ onBack })} />);
    fireEvent.click(screen.getByText('חזרה לדף הבית'));
    expect(onBack).toHaveBeenCalled();
  });

  test('"פיזור חודשי" shows a Hebrew month name + year, not the raw "YYYY-MM" sort key', () => {
    const { container } = render(<PortfolioAnalysisView {...makeProps()} />);
    const monthlyCard = Array.from(container.querySelectorAll('.date-distribution-card')).find(
      (el) => el.querySelector('h3')?.textContent === 'פיזור חודשי'
    );
    expect(monthlyCard).toBeTruthy();
    const labels = Array.from(monthlyCard.querySelectorAll('.date-label')).map((el) => el.textContent);
    expect(labels.length).toBeGreaterThan(0);
    labels.forEach((label) => expect(label).not.toMatch(/^\d{4}-\d{2}$/));
    // israeliStocks has a 2023-01-15 purchase -> "ינואר 2023" should appear
    expect(labels).toContain('ינואר 2023');
  });

  test('the static "how this is computed" explanations under section titles are gone (dynamic result callouts like the benchmark summary stay)', () => {
    const { container } = render(<PortfolioAnalysisView {...makeProps()} />);
    expect(container.textContent).not.toContain('מבוסס על סיווג הסקטור');
    expect(container.textContent).not.toContain('מבוסס על תשואות יומיות היסטוריות');
    expect(container.textContent).not.toContain('תשואת דיבידנד ותאריך תשלום קרוב');
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

  describe('"מעקב חודשי" section', () => {
    const currentMonthKey = new Date().toISOString().slice(0, 7);
    const july = {
      month: '2026-07',
      totalValueILS: 100000,
      breakdown: {
        israeli: [{ key: 'TEVA', label: 'TEVA', value: 20000 }],
        american: [{ key: 'PLTR', label: 'PLTR', value: 30000 }],
        pension: [{ key: 'קופה א', label: 'קופה א', value: 40000 }],
        cashFunds: [{ key: 'קרן X', label: 'קרן X', value: 5000 }],
        bank: [{ key: 'bank-1', label: 'עו"ש', value: 5000 }]
      }
    };
    const august = {
      month: '2026-08',
      totalValueILS: 110000,
      breakdown: {
        israeli: [{ key: 'TEVA', label: 'TEVA', value: 22000 }],
        american: [{ key: 'PLTR', label: 'PLTR', value: 27000 }],
        pension: [{ key: 'קופה א', label: 'קופה א', value: 44000 }],
        cashFunds: [{ key: 'קרן X', label: 'קרן X', value: 5000 }],
        bank: [{ key: 'bank-1', label: 'עו"ש', value: 12000 }]
      }
    };

    // Scopes queries to just this section, so "TEVA"/"בורסה ישראלית" etc.
    // here can't collide with the same text appearing in other sections of
    // this large page (e.g. the "TEVA" fixture stock used at the top of
    // this file also shows up under "פיזור לפי מניות").
    function monthlyScope() {
      return within(screen.getByText('מעקב חודשי', { selector: '.section-title' }).closest('.analysis-section'));
    }

    function historyCards() {
      return Array.from(document.body.querySelectorAll('.monthly-history-card'));
    }

    function manualForm() {
      return document.body.querySelector('.monthly-manual-form');
    }

    test('with no saved months, shows the empty-state note instead of comparison/history', () => {
      render(<PortfolioAnalysisView {...makeProps()} />);
      expect(screen.getByText(/עדיין אין שמירות חודשיות/)).toBeInTheDocument();
      expect(screen.queryByText('השוואה בין חודשים')).toBeNull();
      expect(screen.queryByText('היסטוריית שמירות')).toBeNull();
    });

    test('clicking the save button calls onSaveMonthlySnapshot with an empty cash-flows object when nothing was entered, and reflects the saving/error state', () => {
      const onSaveMonthlySnapshot = jest.fn();
      const { rerender } = render(<PortfolioAnalysisView {...makeProps({ onSaveMonthlySnapshot })} />);
      fireEvent.click(screen.getByText('שמור שמירה חודשית'));
      expect(onSaveMonthlySnapshot).toHaveBeenCalledWith({});

      rerender(<PortfolioAnalysisView {...makeProps({ onSaveMonthlySnapshot, savingMonthly: true })} />);
      expect(screen.getByText('שומר…')).toBeInTheDocument();

      rerender(
        <PortfolioAnalysisView
          {...makeProps({ onSaveMonthlySnapshot, saveMonthlyError: 'שמירת השמירה החודשית נכשלה, נסה שוב' })}
        />
      );
      expect(screen.getByText('שמירת השמירה החודשית נכשלה, נסה שוב')).toBeInTheDocument();
    });

    test('a declared cash flow next to the save button is included (parsed to a number, blank/zero categories dropped) when saving', () => {
      const onSaveMonthlySnapshot = jest.fn();
      render(<PortfolioAnalysisView {...makeProps({ onSaveMonthlySnapshot })} />);
      fireEvent.change(document.getElementById('save-cashflow-bank'), { target: { value: '6000' } });
      fireEvent.click(screen.getByText('שמור שמירה חודשית'));
      expect(onSaveMonthlySnapshot).toHaveBeenCalledWith({ bank: 6000 });
    });

    test('shows whether the current month is already saved', () => {
      const { rerender } = render(<PortfolioAnalysisView {...makeProps()} />);
      expect(screen.getByText(`החודש (${formatMonthLabelForTest(currentMonthKey)}) עדיין לא נשמר`)).toBeInTheDocument();

      rerender(
        <PortfolioAnalysisView
          {...makeProps({ monthlySnapshots: [{ month: currentMonthKey, totalValueILS: 1, breakdown: {} }] })}
        />
      );
      expect(screen.getByText(`החודש (${formatMonthLabelForTest(currentMonthKey)}) נשמר`)).toBeInTheDocument();
      expect(screen.getByText('עדכן שמירה חודשית')).toBeInTheDocument();
    });

    describe('"➕ הוספה ידנית" (manual backfill of a forgotten past month)', () => {
      test('is not rendered when onAddManualMonthlySnapshot is not provided', () => {
        render(<PortfolioAnalysisView {...makeProps({ onAddManualMonthlySnapshot: undefined })} />);
        expect(screen.queryByText('➕ הוספה ידנית')).toBeNull();
      });

      test('clicking the button opens the form (month picker + the two sections), clicking again closes it', () => {
        render(<PortfolioAnalysisView {...makeProps({ onAddManualMonthlySnapshot: jest.fn() })} />);
        expect(screen.queryByLabelText('חודש')).toBeNull();

        fireEvent.click(screen.getByText('➕ הוספה ידנית'));
        expect(screen.getByLabelText('חודש')).toBeInTheDocument();
        // The form is split in two: what the app works out for itself, and
        // what only the user can know.
        expect(within(manualForm()).getByText('נתונים שנמשכים אוטומטית מהטבלאות הראשיות')).toBeInTheDocument();
        expect(within(manualForm()).getByText('נתונים להזנה ידנית (נכסים נזילים)')).toBeInTheDocument();
        expect(within(manualForm()).getByText('עו"ש', { selector: 'span' })).toBeInTheDocument();

        fireEvent.click(screen.getByText('➕ הוספה ידנית'));
        expect(screen.queryByLabelText('חודש')).toBeNull();
      });

      // The refactor: stocks and provident funds can be worked out exactly
      // from the main tables, so the backfill form no longer offers a place
      // to retype them - a second source for one number could only ever
      // disagree with the first.
      test('offers NO typed rows for stocks or provident funds - only for the liquid accounts', () => {
        render(<PortfolioAnalysisView {...makeProps({ onAddManualMonthlySnapshot: jest.fn() })} />);
        fireEvent.click(screen.getByText('➕ הוספה ידנית'));

        const manualSection = within(manualForm())
          .getByText('נתונים להזנה ידנית (נכסים נזילים)')
          .closest('.monthly-manual-entry-section');
        const typedCategories = Array.from(
          manualSection.querySelectorAll('.monthly-manual-category-header > span:first-child')
        ).map((el) => el.textContent);

        expect(typedCategories).toEqual(['קרנות כספיות', 'עו"ש', 'קופת חיסכון בבנק']);
        expect(typedCategories).not.toContain('בורסה ישראלית');
        expect(typedCategories).not.toContain('בורסה אמריקאית');
        expect(typedCategories).not.toContain('קופות גמל');
      });

      test('the auto-derived section lists the stock and provident-fund categories, read-only', async () => {
        global.fetch.mockImplementation((url) => {
          const u = String(url);
          if (u.includes('israeli-stocks-history')) {
            return Promise.resolve({
              ok: true,
              json: async () => ({ history: { TEVA: [{ date: '2023-01-15', close: 10000 }] } })
            });
          }
          return Promise.resolve({
            ok: true,
            json: async () => ({ history: u.includes('exchange-rate') ? [] : {} })
          });
        });

        render(
          <PortfolioAnalysisView
            {...makeProps({ americanStocks: [], onAddManualMonthlySnapshot: jest.fn() })}
          />
        );
        await waitFor(() => expect(document.getElementById('performanceFrom').value).toBe('2023-01-15'));

        fireEvent.click(screen.getByText('➕ הוספה ידנית'));
        fireEvent.change(screen.getByLabelText('חודש'), { target: { value: '2024-03' } });

        const autoSection = within(manualForm())
          .getByText('נתונים שנמשכים אוטומטית מהטבלאות הראשיות')
          .closest('.monthly-manual-auto-section');

        // 100 shares at a carried-forward 10,000-agorot close = 10,000 ILS -
        // shown twice (the row and its category total), and as text with no
        // input anywhere to retype it.
        expect(within(autoSection).getAllByText('10000.00 ₪').length).toBe(2);
        expect(autoSection.querySelectorAll('input').length).toBe(0);
        expect(within(autoSection).getAllByText('· נגזר אוטומטית').length).toBe(3);
      });

      test('filling in the liquid rows and submitting sends them together with the derived stock/pension rows, then closes the form', async () => {
        const onAddManualMonthlySnapshot = jest.fn().mockResolvedValue(true);
        render(<PortfolioAnalysisView {...makeProps({ onAddManualMonthlySnapshot })} />);
        fireEvent.click(screen.getByText('➕ הוספה ידנית'));

        fireEvent.change(screen.getByLabelText('חודש'), { target: { value: '2026-03' } });

        const bankSection = within(manualForm())
          .getByText('עו"ש', { selector: 'span' })
          .closest('.monthly-manual-category');
        fireEvent.click(within(bankSection).getByText('+ הוסף פריט'));
        fireEvent.change(within(bankSection).getByPlaceholderText('שם (למשל עו"ש)'), { target: { value: 'עו"ש' } });
        fireEvent.change(within(bankSection).getByPlaceholderText('שווי (₪)'), { target: { value: '3000' } });

        fireEvent.change(document.getElementById('manual-add-cashflow-cashFunds'), { target: { value: '-500' } });

        fireEvent.click(screen.getByText('שמור'));
        expect(onAddManualMonthlySnapshot).toHaveBeenCalledTimes(1);
        const [month, totalValueILS, breakdown] = onAddManualMonthlySnapshot.mock.calls[0];
        expect(month).toBe('2026-03');
        expect(totalValueILS).toBe(3000);
        expect(breakdown.bank).toEqual([{ key: 'עו"ש', label: 'עו"ש', value: 3000 }]);
        // The derived categories are still present in the saved shape -
        // they're just filled from the tables, not from the form. No
        // historical prices resolve in this test, so they come back empty
        // rather than fabricated.
        expect(breakdown.israeli).toEqual([]);
        expect(breakdown.american).toEqual([]);
        expect(breakdown.pension).toEqual([]);
        // Only the liquid categories can carry a declared flow now.
        expect(breakdown.cashFlows).toEqual({ cashFunds: -500 });

        // the await inside handleSubmitManualAdd resolves asynchronously and
        // then closes the form - wait for that state update to flush
        // (inside act) rather than asserting on it synchronously
        await waitFor(() => expect(screen.queryByLabelText('חודש')).toBeNull());
      });

      test('there is no cash-flow field for stocks or provident funds - those flows come from the main tables', () => {
        render(<PortfolioAnalysisView {...makeProps({ onAddManualMonthlySnapshot: jest.fn() })} />);
        fireEvent.click(screen.getByText('➕ הוספה ידנית'));

        expect(document.getElementById('manual-add-cashflow-cashFunds')).not.toBeNull();
        expect(document.getElementById('manual-add-cashflow-bank')).not.toBeNull();
        expect(document.getElementById('manual-add-cashflow-bankSavings')).not.toBeNull();

        expect(document.getElementById('manual-add-cashflow-israeli')).toBeNull();
        expect(document.getElementById('manual-add-cashflow-american')).toBeNull();
        expect(document.getElementById('manual-add-cashflow-pension')).toBeNull();
      });

      test('a row with no value entered yet is dropped, not saved as a fake 0', async () => {
        const onAddManualMonthlySnapshot = jest.fn().mockResolvedValue(true);
        render(<PortfolioAnalysisView {...makeProps({ onAddManualMonthlySnapshot })} />);
        fireEvent.click(screen.getByText('➕ הוספה ידנית'));
        fireEvent.change(screen.getByLabelText('חודש'), { target: { value: '2026-03' } });

        const bankSection = within(manualForm())
          .getByText('עו"ש', { selector: 'span' })
          .closest('.monthly-manual-category');
        fireEvent.click(within(bankSection).getByText('+ הוסף פריט'));
        fireEvent.change(within(bankSection).getByPlaceholderText('שם (למשל עו"ש)'), { target: { value: 'עו"ש' } });
        // value left empty

        fireEvent.click(screen.getByText('שמור'));
        const [, totalValueILS, breakdown] = onAddManualMonthlySnapshot.mock.calls[0];
        expect(totalValueILS).toBe(0);
        expect(breakdown.bank).toEqual([]);

        // let the mocked promise's resolution (and the resulting
        // setShowManualAddForm) settle inside act before the test ends,
        // instead of leaking into whichever test runs next
        await waitFor(() => expect(screen.queryByLabelText('חודש')).toBeNull());
      });

      test('submit is disabled until a month is chosen, and once that month already has a save (shows a warning instead)', () => {
        const onAddManualMonthlySnapshot = jest.fn();
        render(
          <PortfolioAnalysisView
            {...makeProps({
              onAddManualMonthlySnapshot,
              monthlySnapshots: [{ month: '2026-03', totalValueILS: 1000, breakdown: {} }]
            })}
          />
        );
        fireEvent.click(screen.getByText('➕ הוספה ידנית'));
        expect(screen.getByText('שמור')).toBeDisabled();

        fireEvent.change(screen.getByLabelText('חודש'), { target: { value: '2026-03' } });
        expect(screen.getByText(/כבר קיימת שמירה לחודש זה/)).toBeInTheDocument();
        expect(screen.getByText('שמור')).toBeDisabled();

        fireEvent.click(screen.getByText('שמור'));
        expect(onAddManualMonthlySnapshot).not.toHaveBeenCalled();
      });

      test('shows addManualError when present', () => {
        render(
          <PortfolioAnalysisView
            {...makeProps({
              onAddManualMonthlySnapshot: jest.fn(),
              addManualError: 'הוספת השמירה החודשית נכשלה, נסה שוב'
            })}
          />
        );
        expect(screen.getByText('הוספת השמירה החודשית נכשלה, נסה שוב')).toBeInTheDocument();
      });
    });

    test('the comparison table defaults to category subtotals only - per-item rows are hidden until "פתח פירוט מלא" is clicked', () => {
      render(<PortfolioAnalysisView {...makeProps({ monthlySnapshots: [july, august] })} />);
      const scope = monthlyScope();

      expect(scope.getByText('השוואה בין חודשים')).toBeInTheDocument();
      const israeliRow = scope.getByText('בורסה ישראלית', { selector: 'td' }).closest('tr');
      expect(israeliRow.textContent).toContain('20000.00');
      expect(israeliRow.textContent).toContain('22000.00');
      expect(israeliRow.textContent).toContain('+10.0%');

      const bankRow = scope.getByText('עו"ש', { selector: 'td' }).closest('tr');
      expect(bankRow.textContent).toContain('+140.0%');

      const totalRow = scope.getByText('סה"כ תיק').closest('tr');
      expect(totalRow.textContent).toContain('+10.0%');

      // per-item detail not shown yet
      expect(scope.queryByText(/TEVA/)).toBeNull();
      expect(scope.queryByText(/PLTR/)).toBeNull();
    });

    test('a mid-period stock purchase is netted out of the naive % change, with the net contribution shown', () => {
      // A live TEVA lot purchased mid-period (2026-08-15, inside the
      // compare month) - the saved breakdown values themselves
      // (20,000 -> 22,000) are unchanged, but the comparison should net
      // this 1,000 ILS purchase out of the naive +10% instead of counting
      // it as growth. (A purchase dated within the *base* month instead
      // would already be reflected in the base snapshot's own value and
      // must NOT be netted out again - see monthlySnapshotComparison.js's
      // periodStart comment.)
      const israeliStocksWithMidPeriodPurchase = [
        ...israeliStocks,
        { stockName: 'TEVA', quantity: 10, purchasePrice: 100, currentPrice: 3500, purchaseDate: '2026-08-15' }
      ];
      render(
        <PortfolioAnalysisView
          {...makeProps({ monthlySnapshots: [july, august], israeliStocks: israeliStocksWithMidPeriodPurchase })}
        />
      );
      const scope = monthlyScope();
      const israeliRow = scope.getByText('בורסה ישראלית', { selector: 'td' }).closest('tr');
      expect(israeliRow.textContent).not.toContain('+10.0%');
      expect(israeliRow.textContent).toContain('1000.00 ₪');
      expect(israeliRow.textContent).toMatch(/הופקדו\/נרכשו בתקופה/);
    });

    test('"פתח פירוט מלא" reveals per-item rows in the comparison table (e.g. individual stocks), and toggles its own label', () => {
      render(<PortfolioAnalysisView {...makeProps({ monthlySnapshots: [july, august] })} />);
      const scope = monthlyScope();

      fireEvent.click(scope.getByText('פתח פירוט מלא'));
      expect(scope.getByText('קבץ לפי קטגוריות')).toBeInTheDocument();

      // the toggle is shared with the history section below, so "TEVA" now
      // shows up there too - scope to the comparison <table> specifically
      const comparisonTable = scope.getByText('השוואה בין חודשים').parentElement.querySelector('table');
      const tevaRow = within(comparisonTable).getByText(/TEVA/).closest('tr');
      expect(tevaRow.textContent).toContain('20000.00');
      expect(tevaRow.textContent).toContain('22000.00');
      expect(tevaRow.textContent).toContain('+10.0%');

      fireEvent.click(scope.getByText('קבץ לפי קטגוריות'));
      expect(scope.queryByText(/TEVA/)).toBeNull();
    });

    test('the history section shows only one month at a time - defaulting to the most recently saved one - with category subtotals, and reveals items when detailed view is on', () => {
      render(<PortfolioAnalysisView {...makeProps({ monthlySnapshots: [july, august] })} />);
      const scope = monthlyScope();

      expect(scope.getByText('היסטוריית שמירות')).toBeInTheDocument();
      const cards = historyCards();
      expect(cards).toHaveLength(1);
      expect(cards[0].textContent).toContain('אוגוסט 2026'); // most recent by default
      expect(cards[0].textContent).not.toContain('יולי 2026');
      expect(cards[0].textContent).toContain('בורסה ישראלית');
      expect(cards[0].textContent).not.toContain('TEVA');

      fireEvent.click(scope.getByText('פתח פירוט מלא'));
      expect(cards[0].textContent).toContain('TEVA');
    });

    test('picking a different month from the history selector shows only that month - no other months are shown', () => {
      render(<PortfolioAnalysisView {...makeProps({ monthlySnapshots: [july, august] })} />);
      fireEvent.change(screen.getByLabelText('בחר חודש להצגה'), { target: { value: '2026-07' } });

      const cards = historyCards();
      expect(cards).toHaveLength(1);
      expect(cards[0].textContent).toContain('יולי 2026');
      expect(cards[0].textContent).not.toContain('אוגוסט 2026');
    });

    test('without onUpdateMonthlySnapshot, the history card shows no "ערוך" button', () => {
      render(<PortfolioAnalysisView {...makeProps({ monthlySnapshots: [july, august], onUpdateMonthlySnapshot: undefined })} />);
      expect(monthlyScope().queryByText('ערוך')).toBeNull();
    });

    test('editing the shown month: "ערוך" turns every row into inputs, and saving sends the updated breakdown/total, then exits edit mode', async () => {
      const onUpdateMonthlySnapshot = jest.fn().mockResolvedValue(true);
      render(<PortfolioAnalysisView {...makeProps({ monthlySnapshots: [july, august], onUpdateMonthlySnapshot })} />);

      const card = historyCards()[0]; // defaults to august
      fireEvent.click(within(card).getByText('ערוך'));

      // Rows are plain always-on inputs while editing - no cell to open
      // first, which is what removed the focus-juggling entirely.
      const input = within(card).getByDisplayValue('27000');
      fireEvent.change(input, { target: { value: '29000' } });

      fireEvent.change(document.getElementById('edit-cashflow-bank'), { target: { value: '7000' } });

      fireEvent.click(within(card).getByText('שמור עריכה'));
      expect(onUpdateMonthlySnapshot).toHaveBeenCalledTimes(1);
      const [month, totalValueILS, breakdown] = onUpdateMonthlySnapshot.mock.calls[0];
      expect(month).toBe('2026-08');
      expect(breakdown.american.find((i) => i.key === 'PLTR').value).toBe(29000);
      // total recomputed as the sum of all (possibly edited) items
      expect(totalValueILS).toBe(22000 + 29000 + 44000 + 5000 + 12000);
      expect(breakdown.cashFlows).toEqual({ bank: 7000 });

      // the await inside handleSaveEditedMonth resolves asynchronously and
      // then exits edit mode - wait for that state update to flush (inside
      // act) rather than asserting on it synchronously
      await waitFor(() => expect(within(card).queryByText('שמור עריכה')).toBeNull());
      expect(within(card).getByText('ערוך')).toBeInTheDocument();
    });

    // THE TYPING BUG. Rows used to be keyed by item.key while renaming a row
    // rewrote item.key to whatever had been typed so far - so every
    // keystroke changed the key React identified the row by, React tore the
    // <input> down and built a new one, and the caret was thrown out of the
    // field after a single character. These two tests pin both halves: the
    // element must survive typing, and the typed text must accumulate.
    test('typing into a row name keeps focus on the same input across keystrokes', () => {
      render(
        <PortfolioAnalysisView
          {...makeProps({ monthlySnapshots: [july, august], onUpdateMonthlySnapshot: jest.fn() })}
        />
      );
      const card = historyCards()[0];
      fireEvent.click(within(card).getByText('ערוך'));

      const input = within(card).getByDisplayValue('PLTR');
      input.focus();
      expect(document.activeElement).toBe(input);

      'PLTR-NEW'.split('').forEach((_, i) => {
        fireEvent.change(document.activeElement, { target: { value: 'PLTR-NEW'.slice(0, i + 1) } });
        // Same DOM node throughout: never unmounted and replaced.
        expect(document.activeElement).toBe(input);
      });

      expect(input.value).toBe('PLTR-NEW');
    });

    test('typing into a row value keeps focus, and a half-typed value never poisons the total with NaN', () => {
      render(
        <PortfolioAnalysisView
          {...makeProps({ monthlySnapshots: [july, august], onUpdateMonthlySnapshot: jest.fn() })}
        />
      );
      const card = historyCards()[0];
      fireEvent.click(within(card).getByText('ערוך'));

      const input = within(card).getByDisplayValue('27000');
      input.focus();

      // An emptied field and a lone "-" are both states a number input
      // passes through while being typed into. Parsing on every keystroke
      // turned them into NaN, which spread to the category subtotal and the
      // card total.
      ['', '-', '-3', '-35000'].forEach((value) => {
        fireEvent.change(document.activeElement, { target: { value } });
        expect(document.activeElement).toBe(input);
        expect(within(card).queryByText(/NaN/)).toBeNull();
      });

      expect(input.value).toBe('-35000');
    });

    // Row MANAGEMENT, not just revaluing: a saved checkpoint may need a row
    // the portfolio no longer has (an account since closed), or be missing
    // one that existed at the time. Editing values alone couldn't express
    // either.
    test('editing a month can ADD a row to any category, and the new row is included in the saved breakdown/total', async () => {
      const onUpdateMonthlySnapshot = jest.fn().mockResolvedValue(true);
      render(<PortfolioAnalysisView {...makeProps({ monthlySnapshots: [july, august], onUpdateMonthlySnapshot })} />);

      const card = historyCards()[0]; // august
      fireEvent.click(within(card).getByText('ערוך'));

      // One "+ הוסף שורה" button per category, in the category headers.
      const addButtons = within(card).getAllByText('+ הוסף שורה');
      expect(addButtons.length).toBe(6);

      // The Israeli category is the first one. A new row starts blank.
      fireEvent.click(addButtons[0]);

      const israeliCategory = within(card).getAllByText('בורסה ישראלית')[0].closest('.monthly-history-category');
      const blankRow = within(israeliCategory)
        .getAllByPlaceholderText('שם הפריט')
        .find((el) => el.value === '');
      fireEvent.change(blankRow, { target: { value: 'ICL' } });

      const blankValue = within(israeliCategory)
        .getAllByPlaceholderText('שווי (₪)')
        .find((el) => el.value === '');
      fireEvent.change(blankValue, { target: { value: '3000' } });

      fireEvent.click(within(card).getByText('שמור עריכה'));

      const [, totalValueILS, breakdown] = onUpdateMonthlySnapshot.mock.calls[0];
      expect(breakdown.israeli).toEqual([
        { key: 'TEVA', label: 'TEVA', value: 22000 },
        { key: 'ICL', label: 'ICL', value: 3000 }
      ]);
      expect(totalValueILS).toBe(22000 + 3000 + 27000 + 44000 + 5000 + 12000);
      await waitFor(() => expect(within(card).queryByText('שמור עריכה')).toBeNull());
    });

    test('editing a month can REMOVE a row, and the total drops by exactly that row', async () => {
      const onUpdateMonthlySnapshot = jest.fn().mockResolvedValue(true);
      render(<PortfolioAnalysisView {...makeProps({ monthlySnapshots: [july, august], onUpdateMonthlySnapshot })} />);

      const card = historyCards()[0];
      fireEvent.click(within(card).getByText('ערוך'));

      // Remove the cash-fund row (קרן X, 5000).
      const cashRow = within(card).getByDisplayValue('קרן X').closest('.monthly-history-item-row');
      fireEvent.click(within(cashRow).getByText('הסר'));

      fireEvent.click(within(card).getByText('שמור עריכה'));

      const [, totalValueILS, breakdown] = onUpdateMonthlySnapshot.mock.calls[0];
      expect(breakdown.cashFunds).toEqual([]);
      expect(totalValueILS).toBe(22000 + 27000 + 44000 + 12000);
      await waitFor(() => expect(within(card).queryByText('שמור עריכה')).toBeNull());
    });

    test('renaming a row re-keys it, so it still matches the same holding when two months are compared', async () => {
      const onUpdateMonthlySnapshot = jest.fn().mockResolvedValue(true);
      render(<PortfolioAnalysisView {...makeProps({ monthlySnapshots: [july, august], onUpdateMonthlySnapshot })} />);

      const card = historyCards()[0];
      fireEvent.click(within(card).getByText('ערוך'));
      fireEvent.change(within(card).getByDisplayValue('קופה א'), { target: { value: 'קופת גמל מור' } });
      fireEvent.click(within(card).getByText('שמור עריכה'));

      const [, , breakdown] = onUpdateMonthlySnapshot.mock.calls[0];
      expect(breakdown.pension).toEqual([{ key: 'קופת גמל מור', label: 'קופת גמל מור', value: 44000 }]);
      await waitFor(() => expect(within(card).queryByText('שמור עריכה')).toBeNull());
    });

    // Rows must be visible while editing regardless of the detail toggle -
    // otherwise there is nothing to add to or remove from.
    test('rows are shown while editing even when the detail view is collapsed', () => {
      const onUpdateMonthlySnapshot = jest.fn();
      render(<PortfolioAnalysisView {...makeProps({ monthlySnapshots: [july, august], onUpdateMonthlySnapshot })} />);

      const card = historyCards()[0];
      // Detail view is off by default.
      expect(within(card).queryByText('↳ TEVA')).toBeNull();

      fireEvent.click(within(card).getByText('ערוך'));
      expect(within(card).getByDisplayValue('TEVA')).toBeInTheDocument();
    });

    test('the categories whose figures are derived are marked as such while editing', () => {
      render(
        <PortfolioAnalysisView
          {...makeProps({ monthlySnapshots: [july, august], onUpdateMonthlySnapshot: jest.fn() })}
        />
      );
      const card = historyCards()[0];
      fireEvent.click(within(card).getByText('ערוך'));
      // israeli / american / pension
      expect(within(card).getAllByText('· נגזר אוטומטית').length).toBe(3);
    });

    // A month saved before stock/pension flows became derived still carries
    // the flows that were declared at the time. Opening it to correct an
    // unrelated figure must not quietly throw them away - the comparison
    // that month feeds has to keep producing the number it always did.
    test('editing a legacy month preserves its declared stock/pension flows, which no longer have a field', async () => {
      const onUpdateMonthlySnapshot = jest.fn().mockResolvedValue(true);
      const legacyAugust = {
        ...august,
        breakdown: { ...august.breakdown, cashFlows: { israeli: 5000, pension: 2000, bank: 1000 } }
      };
      render(
        <PortfolioAnalysisView
          {...makeProps({ monthlySnapshots: [july, legacyAugust], onUpdateMonthlySnapshot })}
        />
      );

      const card = historyCards()[0];
      fireEvent.click(within(card).getByText('ערוך'));

      // Correct something unrelated.
      fireEvent.change(within(card).getByDisplayValue('27000'), { target: { value: '28000' } });
      fireEvent.click(within(card).getByText('שמור עריכה'));

      const [, , breakdown] = onUpdateMonthlySnapshot.mock.calls[0];
      expect(breakdown.cashFlows).toEqual({ israeli: 5000, pension: 2000, bank: 1000 });

      await waitFor(() => expect(within(card).queryByText('שמור עריכה')).toBeNull());
    });

    test('a legacy flow on a liquid category is still editable, and the edit wins over the stored value', async () => {
      const onUpdateMonthlySnapshot = jest.fn().mockResolvedValue(true);
      const legacyAugust = {
        ...august,
        breakdown: { ...august.breakdown, cashFlows: { israeli: 5000, bank: 1000 } }
      };
      render(
        <PortfolioAnalysisView
          {...makeProps({ monthlySnapshots: [july, legacyAugust], onUpdateMonthlySnapshot })}
        />
      );

      fireEvent.click(within(historyCards()[0]).getByText('ערוך'));
      expect(document.getElementById('edit-cashflow-bank').value).toBe('1000');
      fireEvent.change(document.getElementById('edit-cashflow-bank'), { target: { value: '4000' } });

      fireEvent.click(within(historyCards()[0]).getByText('שמור עריכה'));
      const [, , breakdown] = onUpdateMonthlySnapshot.mock.calls[0];
      expect(breakdown.cashFlows).toEqual({ israeli: 5000, bank: 4000 });

      await waitFor(() => expect(within(historyCards()[0]).queryByText('שמור עריכה')).toBeNull());
    });

    test('re-saving the current month also preserves its legacy declared flows', () => {
      const onSaveMonthlySnapshot = jest.fn();
      const thisMonth = new Date().toISOString().slice(0, 7);
      render(
        <PortfolioAnalysisView
          {...makeProps({
            onSaveMonthlySnapshot,
            monthlySnapshots: [
              {
                month: thisMonth,
                totalValueILS: 1000,
                breakdown: { cashFlows: { american: 7000, bank: 100 } }
              }
            ]
          })}
        />
      );

      fireEvent.change(document.getElementById('save-cashflow-bank'), { target: { value: '250' } });
      fireEvent.click(monthlyScope().getByText('עדכן שמירה חודשית'));

      // The legacy American flow survives; the freshly declared bank figure
      // replaces the stored one.
      expect(onSaveMonthlySnapshot).toHaveBeenCalledWith({ american: 7000, bank: 250 });
    });

    test('the edit form offers a cash-flow field only for the liquid categories', () => {
      render(
        <PortfolioAnalysisView
          {...makeProps({ monthlySnapshots: [july, august], onUpdateMonthlySnapshot: jest.fn() })}
        />
      );
      fireEvent.click(within(historyCards()[0]).getByText('ערוך'));

      expect(document.getElementById('edit-cashflow-bank')).not.toBeNull();
      expect(document.getElementById('edit-cashflow-cashFunds')).not.toBeNull();
      expect(document.getElementById('edit-cashflow-bankSavings')).not.toBeNull();

      expect(document.getElementById('edit-cashflow-israeli')).toBeNull();
      expect(document.getElementById('edit-cashflow-american')).toBeNull();
      expect(document.getElementById('edit-cashflow-pension')).toBeNull();
    });

    // AUTOMATIC FILL: the monthly tracker stops being a typing exercise.
    test('an automatic fill is offered in both the edit and the manual-backfill flow', () => {
      render(
        <PortfolioAnalysisView
          {...makeProps({
            monthlySnapshots: [july, august],
            onUpdateMonthlySnapshot: jest.fn(),
            onAddManualMonthlySnapshot: jest.fn()
          })}
        />
      );

      const card = historyCards()[0];
      fireEvent.click(within(card).getByText('ערוך'));
      expect(within(card).getByText('⚡ מלא אוטומטית מהטבלאות')).toBeInTheDocument();

      fireEvent.click(within(card).getByText('ביטול'));
      fireEvent.click(monthlyScope().getByText('➕ הוספה ידנית'));
      // In the backfill form only the liquid rows are fillable - the rest
      // are derived and shown read-only, so the button says what it does.
      expect(monthlyScope().getByText('⚡ מלא מהפנקסים')).toBeInTheDocument();
    });

    test('auto-fill says so plainly when the historical prices for that month are not available, instead of writing zeroes over the saved data', () => {
      const onUpdateMonthlySnapshot = jest.fn();
      render(<PortfolioAnalysisView {...makeProps({ monthlySnapshots: [july, august], onUpdateMonthlySnapshot })} />);

      const card = historyCards()[0];
      fireEvent.click(within(card).getByText('ערוך'));
      // global.fetch rejects in this suite's default set-up, so no
      // historical data is available.
      fireEvent.click(within(card).getByText('⚡ מלא אוטומטית מהטבלאות'));

      expect(
        within(card).getByText(/לא נמצאו נתונים היסטוריים לחודש הזה/)
      ).toBeInTheDocument();
      // The saved values are untouched.
      expect(within(card).getByDisplayValue('22000')).toBeInTheDocument();
    });

    test('auto-fill replaces the rows with values derived from the historical closes and the account ledgers', async () => {
      global.fetch.mockImplementation((url) => {
        const u = String(url);
        if (u.includes('israeli-stocks-history')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ history: { TEVA: [{ date: '2023-01-15', close: 10000 }] } })
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ history: u.includes('exchange-rate') ? [] : {} })
        });
      });

      const onUpdateMonthlySnapshot = jest.fn().mockResolvedValue(true);
      render(
        <PortfolioAnalysisView
          {...makeProps({
            americanStocks: [],
            monthlySnapshots: [july, august],
            onUpdateMonthlySnapshot
          })}
        />
      );

      // Wait for the performance range to load its historical prices - the
      // auto-fill reads from the same fetched data.
      await waitFor(() =>
        expect(document.getElementById('performanceFrom').value).toBe('2023-01-15')
      );

      const card = historyCards()[0];
      fireEvent.click(within(card).getByText('ערוך'));
      fireEvent.click(within(card).getByText('⚡ מלא אוטומטית מהטבלאות'));

      // 100 shares at a 10000-agorot close = 10,000 ILS, derived rather
      // than typed - replacing the 22,000 that was saved for this month.
      expect(within(card).getByDisplayValue('10000')).toBeInTheDocument();
      expect(within(card).queryByDisplayValue('22000')).toBeNull();
      expect(within(card).getByDisplayValue('TEVA')).toBeInTheDocument();
    });

    test('editing the shown month: "ביטול" discards changes without calling onUpdateMonthlySnapshot', () => {
      const onUpdateMonthlySnapshot = jest.fn();
      render(<PortfolioAnalysisView {...makeProps({ monthlySnapshots: [july, august], onUpdateMonthlySnapshot })} />);
      const scope = monthlyScope();
      fireEvent.click(scope.getByText('פתח פירוט מלא'));

      const card = historyCards()[0];
      fireEvent.click(within(card).getByText('ערוך'));
      fireEvent.click(within(card).getByText('ביטול'));

      expect(onUpdateMonthlySnapshot).not.toHaveBeenCalled();
      expect(within(card).getByText('ערוך')).toBeInTheDocument();
    });

    test('editing a month that already has declared cash flows pre-fills the inputs, and resubmitting without changing them round-trips the same values', async () => {
      const augustWithCashFlows = { ...august, breakdown: { ...august.breakdown, cashFlows: { bank: 6000 } } };
      const onUpdateMonthlySnapshot = jest.fn().mockResolvedValue(true);
      render(
        <PortfolioAnalysisView
          {...makeProps({ monthlySnapshots: [july, augustWithCashFlows], onUpdateMonthlySnapshot })}
        />
      );
      const card = historyCards()[0];
      fireEvent.click(within(card).getByText('ערוך'));

      expect(document.getElementById('edit-cashflow-bank').value).toBe('6000');

      fireEvent.click(within(card).getByText('שמור עריכה'));
      const [, , breakdown] = onUpdateMonthlySnapshot.mock.calls[0];
      expect(breakdown.cashFlows).toEqual({ bank: 6000 });

      // let the async handleSaveEditedMonth's post-await state updates
      // (exiting edit mode) flush before the test ends, same as the other
      // edit-and-save test above
      await waitFor(() => expect(within(card).queryByText('שמור עריכה')).toBeNull());
    });

    test('shows updateMonthlyError and the "שומר…" state for the month currently being updated', () => {
      const { rerender } = render(
        <PortfolioAnalysisView
          {...makeProps({
            monthlySnapshots: [july, august],
            onUpdateMonthlySnapshot: jest.fn(),
            updateMonthlyError: 'עדכון השמירה החודשית נכשל, נסה שוב'
          })}
        />
      );
      expect(screen.getByText('עדכון השמירה החודשית נכשל, נסה שוב')).toBeInTheDocument();

      const card = historyCards()[0];
      fireEvent.click(within(card).getByText('ערוך'));
      rerender(
        <PortfolioAnalysisView
          {...makeProps({
            monthlySnapshots: [july, august],
            onUpdateMonthlySnapshot: jest.fn(),
            updatingMonth: '2026-08'
          })}
        />
      );
      // re-render replaces the tree, but the "ערוך" click above set local
      // editing state that survives re-render (same component instance)
      const cardAfter = historyCards()[0];
      expect(within(cardAfter).getByText('שומר…')).toBeInTheDocument();
    });

    test('without onDeleteMonthlySnapshot, the history card shows no "מחק" button', () => {
      render(<PortfolioAnalysisView {...makeProps({ monthlySnapshots: [july, august], onDeleteMonthlySnapshot: undefined })} />);
      expect(monthlyScope().queryByText('מחק')).toBeNull();
    });

    test('"מחק" asks for confirmation and, once confirmed, calls onDeleteMonthlySnapshot with the shown month', () => {
      const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
      const onDeleteMonthlySnapshot = jest.fn().mockResolvedValue(true);
      render(<PortfolioAnalysisView {...makeProps({ monthlySnapshots: [july, august], onDeleteMonthlySnapshot })} />);

      fireEvent.click(within(historyCards()[0]).getByText('מחק'));
      expect(confirmSpy).toHaveBeenCalled();
      expect(onDeleteMonthlySnapshot).toHaveBeenCalledWith('2026-08');
      confirmSpy.mockRestore();
    });

    test('declining the confirmation does not call onDeleteMonthlySnapshot', () => {
      const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
      const onDeleteMonthlySnapshot = jest.fn();
      render(<PortfolioAnalysisView {...makeProps({ monthlySnapshots: [july, august], onDeleteMonthlySnapshot })} />);

      fireEvent.click(within(historyCards()[0]).getByText('מחק'));
      expect(onDeleteMonthlySnapshot).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });

    test('shows the "מוחק…" loading state and deleteMonthlyError', () => {
      render(
        <PortfolioAnalysisView
          {...makeProps({
            monthlySnapshots: [july, august],
            onDeleteMonthlySnapshot: jest.fn(),
            deletingMonth: '2026-08',
            deleteMonthlyError: 'מחיקת השמירה החודשית נכשלה, נסה שוב'
          })}
        />
      );
      expect(within(historyCards()[0]).getByText('מוחק…')).toBeInTheDocument();
      expect(screen.getByText('מחיקת השמירה החודשית נכשלה, נסה שוב')).toBeInTheDocument();
    });

    test('a month saved before itemized detail existed (a flat category number) shows a friendly "no detail" note instead of a fake single item, in both the comparison table and the history card', () => {
      // both months legacy (flat numbers, no per-item detail) - the case
      // from the screenshot this was reported from. A legacy-vs-itemized
      // mix is a separate, intentionally different case (see
      // monthlySnapshotComparison.test.js's backward-compat test): there,
      // the itemized side's real items still show normally.
      const legacyJuly = {
        month: '2026-07',
        totalValueILS: 100000,
        breakdown: { israeli: 20000, american: 30000, pension: 40000, cashFunds: 5000, bank: 5000 }
      };
      const legacyAugust = {
        month: '2026-08',
        totalValueILS: 110000,
        breakdown: { israeli: 22000, american: 27000, pension: 44000, cashFunds: 5000, bank: 12000 }
      };
      render(<PortfolioAnalysisView {...makeProps({ monthlySnapshots: [legacyJuly, legacyAugust] })} />);
      const scope = monthlyScope();
      fireEvent.click(scope.getByText('פתח פירוט מלא'));

      const note = 'אין פירוט פריטים זמין להשוואה זו (אחד החודשים נשמר לפני שנוסף פירוט מלא)';
      expect(scope.getAllByText(note).length).toBeGreaterThan(0);

      fireEvent.change(screen.getByLabelText('בחר חודש להצגה'), { target: { value: '2026-07' } });
      expect(
        within(historyCards()[0]).getAllByText('אין פירוט פריטים לשמירה זו (נשמרה לפני שנוסף פירוט מלא)').length
      ).toBeGreaterThan(0);
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
    test('the return since inception is labelled as neutralized, and the raw value change is shown separately', async () => {
      mockHistoryFetch();
      render(<PortfolioAnalysisView {...makeProps({ americanStocks: [] })} />);

      await waitFor(() => expect(screen.getByText('תשואה מאז תחילת ההשקעה')).toBeInTheDocument());
      expect(screen.getByText(/מנוטרל הפקדות ורכישות/)).toBeInTheDocument();
      // The number people see in their account is still shown - just
      // labelled for what it is, so the smaller return figure doesn't look
      // like an error.
      expect(screen.getByText('שינוי בשווי התיק (כולל הפקדות)')).toBeInTheDocument();
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
