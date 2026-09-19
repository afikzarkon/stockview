import { render, fireEvent, waitFor } from '@testing-library/react';
import HomeView from './HomeView';
import { calculatePortfolioSummary } from '../utils/portfolioSummary';
import * as exportReport from '../utils/exportReport';

const noop = () => {};

const israeliStocks = [
  { id: 1, stockName: 'TEVA', purchaseDate: '2023-01-15', purchasePrice: 30, quantity: 100, currentPrice: 3500, dailyChangePercent: 1.2 }
];
const americanStocks = [
  { id: 10, stockName: 'AAPL', purchaseDate: '2022-03-01', purchasePrice: 150, quantity: 10, currentPrice: 190, exchangeRate: 3.6, currentExchangeRate: 3.7, dailyChangePercent: 0.8 }
];
const pensionFunds = [{ id: 100, fundName: 'Pension A', initialInvestment: 10000, currentValue: 12000, previousValue: 11500, updateDate: '2024-01-01' }];
const cashFunds = [{ id: 200, fundName: 'Cash Fund', updateDate: '2024-01-01', amount: 5000 }];
const bankBalances = [{ id: 300, updateDate: '2024-01-01', amount: 20000 }];

const summary = calculatePortfolioSummary(israeliStocks, americanStocks, pensionFunds, cashFunds, bankBalances);

function makeProps(overrides = {}) {
  return {
    showLegacyImportButton: false,
    legacyImportLoading: false,
    handleLegacyImportOnce: noop,
    savePortfolio: noop,
    hasUnsavedChanges: false,
    saveLoading: false,
    lastSavedAt: null,
    saveError: '',
    snapshotSaveError: '',
    lastSnapshotSavedAt: null,
    legacyImportBanner: '',
    summary,
    israeliStocks,
    americanStocks,
    pensionFunds,
    cashFunds,
    bankBalances,
    handleAddInfo: noop,
    isEditMode: false,
    setIsEditMode: noop,
    showAmericanColumns: true,
    setShowAmericanColumns: noop,
    expandedGroups: {},
    editingField: null,
    handleCellClick: noop,
    handleInlineEdit: noop,
    finishInlineEdit: noop,
    handleKeyDown: noop,
    handleDelete: noop,
    toggleGroup: noop,
    ...overrides
  };
}

test('renders the portfolio summary and tables for a populated portfolio', () => {
  const { container } = render(<HomeView {...makeProps()} />);
  expect(container.querySelectorAll('table').length).toBeGreaterThan(0);
});

test('shows the no-data message for an empty portfolio', () => {
  const emptySummary = calculatePortfolioSummary([], [], [], [], []);
  const { getByText, container } = render(
    <HomeView
      {...makeProps({
        israeliStocks: [],
        americanStocks: [],
        pensionFunds: [],
        cashFunds: [],
        bankBalances: [],
        summary: emptySummary
      })}
    />
  );
  expect(getByText('עדיין לא נוספו מניות לתיק ההשקעות שלך')).toBeInTheDocument();
  expect(container.querySelectorAll('table').length).toBe(0);
});

test('always shows the detailed portfolio summary (no collapse toggle)', () => {
  const { getByText, queryByText } = render(<HomeView {...makeProps()} />);
  expect(getByText('סיכום התיק')).toBeInTheDocument();
  expect(queryByText('הצג סיכום מפורט ▼')).toBeNull();
});

test('there is no manual "save daily info" button - the daily snapshot is taken silently (see useAutoSnapshot.js) - only a passive status line reflects it', () => {
  const { queryByText, getByText, rerender } = render(<HomeView {...makeProps()} />);

  expect(queryByText('שמור מידע יומי עדכני')).toBeNull();
  expect(queryByText('שומר…')).toBeNull();

  const savedAt = new Date('2024-06-01T10:00:00');
  rerender(<HomeView {...makeProps({ lastSnapshotSavedAt: savedAt })} />);
  expect(getByText(`מידע יומי נשמר: ${savedAt.toLocaleTimeString('he-IL')}`)).toBeInTheDocument();

  rerender(<HomeView {...makeProps({ snapshotSaveError: 'שמירת תמונת המצב נכשלה, נסה שוב' })} />);
  expect(getByText('שמירת תמונת המצב נכשלה, נסה שוב')).toBeInTheDocument();
});

test('shows the legacy import button only when showLegacyImportButton is true', () => {
  const { queryByText, rerender } = render(<HomeView {...makeProps({ showLegacyImportButton: false })} />);
  expect(queryByText('ייבוא מהדפדפן')).toBeNull();

  rerender(<HomeView {...makeProps({ showLegacyImportButton: true })} />);
  expect(queryByText('ייבוא מהדפדפן')).not.toBeNull();
});

test('save button reflects hasUnsavedChanges and saveLoading state', () => {
  const { getByText, rerender } = render(<HomeView {...makeProps({ hasUnsavedChanges: false })} />);
  expect(getByText('נשמר')).toBeInTheDocument();

  rerender(<HomeView {...makeProps({ hasUnsavedChanges: true })} />);
  expect(getByText('שמור שינויים')).toBeInTheDocument();

  rerender(<HomeView {...makeProps({ hasUnsavedChanges: true, saveLoading: true })} />);
  expect(getByText('שומר…')).toBeInTheDocument();
});

test('shows the save error message when present', () => {
  const { getByText } = render(<HomeView {...makeProps({ saveError: 'שמירה נכשלה. בדוק התחברות/רשת ונסה שוב.' })} />);
  expect(getByText('שמירה נכשלה. בדוק התחברות/רשת ונסה שוב.')).toBeInTheDocument();
});

test('shows the legacy import banner when present', () => {
  const { getByText } = render(<HomeView {...makeProps({ legacyImportBanner: 'ייבוא מהדפדפן הושלם — הנתונים נשמרו בשרת.' })} />);
  expect(getByText('ייבוא מהדפדפן הושלם — הנתונים נשמרו בשרת.')).toBeInTheDocument();
});

test('shows export buttons for a populated portfolio and wires them to downloadPortfolioExcel/Pdf', async () => {
  const excelSpy = jest.spyOn(exportReport, 'downloadPortfolioExcel').mockResolvedValue(undefined);
  const pdfSpy = jest.spyOn(exportReport, 'downloadPortfolioPdf').mockImplementation(() => {});

  const { getByText } = render(<HomeView {...makeProps()} />);

  fireEvent.click(getByText('ייצוא Excel'));
  fireEvent.click(getByText('ייצוא PDF'));

  // Both handlers dynamically import('../utils/exportReport') now (code
  // splitting - see the comment in HomeView.js), which resolves on a later
  // microtask than a plain sync call would, so the spies aren't called yet
  // synchronously after fireEvent.click.
  await waitFor(() => {
    expect(pdfSpy).toHaveBeenCalledWith({ summary, israeliStocks, americanStocks, pensionFunds, cashFunds, bankBalances, bankSavingsFunds: [] });
    expect(excelSpy).toHaveBeenCalledWith({ summary, israeliStocks, americanStocks, pensionFunds, cashFunds, bankBalances, bankSavingsFunds: [] });
  });

  excelSpy.mockRestore();
  pdfSpy.mockRestore();
});

test('hides export buttons for an empty portfolio', () => {
  const emptySummary = calculatePortfolioSummary([], [], [], [], []);
  const { queryByText } = render(
    <HomeView
      {...makeProps({
        israeliStocks: [],
        americanStocks: [],
        pensionFunds: [],
        cashFunds: [],
        bankBalances: [],
        summary: emptySummary
      })}
    />
  );
  expect(queryByText('ייצוא Excel')).toBeNull();
  expect(queryByText('ייצוא PDF')).toBeNull();
});

test('shows an error message if the PDF export throws', async () => {
  const pdfSpy = jest.spyOn(exportReport, 'downloadPortfolioPdf').mockImplementation(() => {
    throw new Error('boom');
  });

  const { findByText } = render(<HomeView {...makeProps()} />);
  fireEvent.click(await findByText('ייצוא PDF'));

  expect(await findByText('שגיאה בייצוא ל-PDF, נסה שוב')).toBeInTheDocument();
  pdfSpy.mockRestore();
});

test('reflects edit mode in the toolbar - as the toggle\'s own pressed state and a subtitle', () => {
  const { queryByText, getByText, rerender } = render(<HomeView {...makeProps({ isEditMode: false })} />);
  expect(queryByText(/מצב עריכה פעיל/)).toBeNull();
  // The edit toggle specifically - other toggles in the cluster have their
  // own independent pressed state.
  expect(getByText('מצב עריכה')).toHaveAttribute('aria-pressed', 'false');

  rerender(<HomeView {...makeProps({ isEditMode: true })} />);
  expect(queryByText(/מצב עריכה פעיל/)).not.toBeNull();
  // The state is carried by the control itself, not only by a banner -
  // and is exposed to assistive tech rather than by styling alone.
  expect(getByText('✓ מצב עריכה')).toHaveAttribute('aria-pressed', 'true');
});

test('puts every page action in one toolbar, split into primary and secondary', () => {
  const { container } = render(<HomeView {...makeProps()} />);

  // Exactly one filled primary action - the thing the page is for.
  const primary = container.querySelectorAll('.page-toolbar-primary .toolbar-btn-primary');
  expect(primary.length).toBe(1);
  expect(primary[0]).toHaveTextContent('הוספת מידע');

  // View/export controls live together in the quieter secondary cluster.
  const secondary = container.querySelector('.page-toolbar-secondary');
  expect(secondary).not.toBeNull();
  ['מצב עריכה', 'נתונים מורחבים', 'ייצוא Excel', 'ייצוא PDF'].forEach((label) => {
    expect(secondary).toHaveTextContent(label);
  });

  // And no page action is left stranded outside it.
  expect(container.querySelector('.control-buttons')).toBeNull();
  expect(container.querySelector('.page-header-actions')).toBeNull();
});

test('surfaces the headline figures as KPI tiles above the detailed summary', () => {
  const { container, getByText } = render(<HomeView {...makeProps()} />);
  const tiles = container.querySelectorAll('.kpi-tile');
  expect(tiles.length).toBe(4);
  ['שווי התיק', 'רווח/הפסד כולל', 'שינוי יומי', 'מס צפוי'].forEach((label) => {
    expect(getByText(label)).toBeInTheDocument();
  });
  // The full breakdown is still there, below them.
  expect(getByText('סיכום התיק')).toBeInTheDocument();
});

test('an empty portfolio shows no KPI tiles rather than a row of zeroes', () => {
  const { container } = render(
    <HomeView
      {...makeProps({ israeliStocks: [], americanStocks: [], pensionFunds: [], cashFunds: [], bankBalances: [] })}
    />
  );
  expect(container.querySelectorAll('.kpi-tile').length).toBe(0);
});
