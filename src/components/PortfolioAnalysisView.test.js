import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import PortfolioAnalysisView from './PortfolioAnalysisView';
import { calculatePortfolioAnalysis } from '../utils/portfolioAnalysis';
import { useBenchmarkHistory } from '../hooks/useBenchmarkHistory';
import { useStockSectors } from '../hooks/useStockSectors';
import { useAnalystRecommendations } from '../hooks/useAnalystRecommendations';
import { useHoldingsPriceHistory } from '../hooks/useHoldingsPriceHistory';
import { useDividendData } from '../hooks/useDividendData';
import { useStockNews } from '../hooks/useStockNews';

jest.mock('../hooks/useBenchmarkHistory');
jest.mock('../hooks/useStockSectors');
jest.mock('../hooks/useAnalystRecommendations');
jest.mock('../hooks/useHoldingsPriceHistory');
jest.mock('../hooks/useDividendData');
jest.mock('../hooks/useStockNews');

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
    useHoldingsPriceHistory.mockReturnValue({ historyBySymbol: {}, loading: false });
    useDividendData.mockReturnValue({ dividendsBySymbol: {}, loading: false });
    useStockNews.mockReturnValue({ newsBySymbol: {}, loading: false });
  });

  test('renders without crashing, with the sidebar nav grouped into 5 labeled groups', () => {
    const { container } = render(<PortfolioAnalysisView {...makeProps()} />);
    const groupLabels = Array.from(container.querySelectorAll('.sw-sidebar-group-label')).map((el) => el.textContent);
    expect(groupLabels).toEqual(['סקירה כללית', 'הרכב התיק', 'מניות אמריקאיות', 'כלים', 'דוחות']);
    // 17 sections total (16 from before, plus the new "מעקב חודשי")
    expect(container.querySelectorAll('.sw-sidebar-item').length).toBe(17);
  });

  test('clicking a sidebar item scrolls the corresponding section into view', () => {
    const scrollIntoViewMock = jest.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;

    render(<PortfolioAnalysisView {...makeProps()} />);
    fireEvent.click(screen.getByText('קורלציה בין אחזקות'));
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
      'ציון בריאות תיק',
      'תקציר ניתוח',
      'ביצועי התיק לאורך זמן',
      'מעקב חודשי',
      'גרף עוגה - פיזור התיק',
      'פיזור לפי מניות',
      'פיזור לפי תאריכי קנייה',
      'פיזור לפי סקטור (מניות אמריקאיות)',
      'קורלציה בין אחזקות (מניות אמריקאיות)',
      'מעקב דיבידנדים (מניות אמריקאיות)',
      'לוח רבעונים (מניות אמריקאיות)',
      'חדשות רלוונטיות (מניות אמריקאיות)',
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

  test('the static "how this is computed" explanations under section titles are gone (dynamic result callouts like the benchmark/correlation summaries stay)', () => {
    const { container } = render(<PortfolioAnalysisView {...makeProps()} />);
    expect(container.textContent).not.toContain('מבוסס על סיווג הסקטור');
    expect(container.textContent).not.toContain('מבוסס על תשואות יומיות היסטוריות');
    expect(container.textContent).not.toContain('תשואת דיבידנד ותאריך תשלום קרוב');
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

      test('clicking the button opens the form (month picker + a section per category), clicking again closes it', () => {
        render(<PortfolioAnalysisView {...makeProps({ onAddManualMonthlySnapshot: jest.fn() })} />);
        expect(screen.queryByLabelText('חודש')).toBeNull();

        fireEvent.click(screen.getByText('➕ הוספה ידנית'));
        expect(screen.getByLabelText('חודש')).toBeInTheDocument();
        // { selector: 'span' } disambiguates from the new per-category
        // cash-flow <label> below, which reuses the same category name text
        expect(within(manualForm()).getByText('בורסה ישראלית', { selector: 'span' })).toBeInTheDocument();
        expect(within(manualForm()).getByText('עו"ש', { selector: 'span' })).toBeInTheDocument();

        fireEvent.click(screen.getByText('➕ הוספה ידנית'));
        expect(screen.queryByLabelText('חודש')).toBeNull();
      });

      test('adding item rows, filling them in, and submitting calls onAddManualMonthlySnapshot with the typed month/total/breakdown, then closes the form', async () => {
        const onAddManualMonthlySnapshot = jest.fn().mockResolvedValue(true);
        render(<PortfolioAnalysisView {...makeProps({ onAddManualMonthlySnapshot })} />);
        fireEvent.click(screen.getByText('➕ הוספה ידנית'));

        fireEvent.change(screen.getByLabelText('חודש'), { target: { value: '2026-03' } });

        const israeliSection = within(manualForm())
          .getByText('בורסה ישראלית', { selector: 'span' })
          .closest('.monthly-manual-category');
        fireEvent.click(within(israeliSection).getByText('+ הוסף פריט'));
        fireEvent.change(within(israeliSection).getByPlaceholderText('שם (למשל TEVA)'), {
          target: { value: 'TEVA' }
        });
        fireEvent.change(within(israeliSection).getByPlaceholderText('שווי (₪)'), { target: { value: '15000' } });

        const bankSection = within(manualForm())
          .getByText('עו"ש', { selector: 'span' })
          .closest('.monthly-manual-category');
        fireEvent.click(within(bankSection).getByText('+ הוסף פריט'));
        fireEvent.change(within(bankSection).getByPlaceholderText('שם (למשל TEVA)'), { target: { value: 'עו"ש' } });
        fireEvent.change(within(bankSection).getByPlaceholderText('שווי (₪)'), { target: { value: '3000' } });

        fireEvent.change(document.getElementById('manual-add-cashflow-cashFunds'), { target: { value: '-500' } });

        fireEvent.click(screen.getByText('שמור'));
        expect(onAddManualMonthlySnapshot).toHaveBeenCalledTimes(1);
        const [month, totalValueILS, breakdown] = onAddManualMonthlySnapshot.mock.calls[0];
        expect(month).toBe('2026-03');
        expect(totalValueILS).toBe(18000);
        expect(breakdown.israeli).toEqual([{ key: 'TEVA', label: 'TEVA', value: 15000 }]);
        expect(breakdown.american).toEqual([]);
        expect(breakdown.cashFlows).toEqual({ cashFunds: -500 });

        // the await inside handleSubmitManualAdd resolves asynchronously and
        // then closes the form - wait for that state update to flush
        // (inside act) rather than asserting on it synchronously
        await waitFor(() => expect(screen.queryByLabelText('חודש')).toBeNull());
      });

      test('a row with no value entered yet is dropped, not saved as a fake 0', async () => {
        const onAddManualMonthlySnapshot = jest.fn().mockResolvedValue(true);
        render(<PortfolioAnalysisView {...makeProps({ onAddManualMonthlySnapshot })} />);
        fireEvent.click(screen.getByText('➕ הוספה ידנית'));
        fireEvent.change(screen.getByLabelText('חודש'), { target: { value: '2026-03' } });

        const israeliSection = within(manualForm())
          .getByText('בורסה ישראלית', { selector: 'span' })
          .closest('.monthly-manual-category');
        fireEvent.click(within(israeliSection).getByText('+ הוסף פריט'));
        fireEvent.change(within(israeliSection).getByPlaceholderText('שם (למשל TEVA)'), {
          target: { value: 'TEVA' }
        });
        // value left empty

        fireEvent.click(screen.getByText('שמור'));
        const [, totalValueILS, breakdown] = onAddManualMonthlySnapshot.mock.calls[0];
        expect(totalValueILS).toBe(0);
        expect(breakdown.israeli).toEqual([]);

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

    test('editing the shown month: "ערוך" makes items editable, changing a value and saving calls onUpdateMonthlySnapshot with the updated breakdown/total, then exits edit mode', async () => {
      const onUpdateMonthlySnapshot = jest.fn().mockResolvedValue(true);
      render(<PortfolioAnalysisView {...makeProps({ monthlySnapshots: [july, august], onUpdateMonthlySnapshot })} />);
      const scope = monthlyScope();
      fireEvent.click(scope.getByText('פתח פירוט מלא'));

      const card = historyCards()[0]; // defaults to august
      fireEvent.click(within(card).getByText('ערוך'));

      // the PLTR value in the august card is now a click-to-edit cell
      fireEvent.click(within(card).getByText('27000.00 ₪', { selector: '.editable-cell' }));
      const input = within(card).getByDisplayValue('27000');
      fireEvent.change(input, { target: { value: '29000' } });
      fireEvent.blur(input);

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
});

function formatMonthLabelForTest(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
}
