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
    user: { email: 'test@example.com' },
    showLegacyImportButton: false,
    legacyImportLoading: false,
    handleLegacyImportOnce: noop,
    handleLogout: noop,
    savePortfolio: noop,
    hasUnsavedChanges: false,
    saveLoading: false,
    lastSavedAt: null,
    saveError: '',
    legacyImportBanner: '',
    summary,
    israeliStocks,
    americanStocks,
    pensionFunds,
    cashFunds,
    bankBalances,
    handleAddInfo: noop,
    setShowAnalysis: noop,
    setShowStockResearch: noop,
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

test('renders the user email and portfolio summary for a populated portfolio', () => {
  const { getByText, container } = render(<HomeView {...makeProps()} />);
  expect(getByText('test@example.com')).toBeInTheDocument();
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

test('shows the legacy import button only when showLegacyImportButton is true', () => {
  const { queryByText, rerender } = render(<HomeView {...makeProps({ showLegacyImportButton: false })} />);
  expect(queryByText('ייבוא חד-פעמי מהדפדפן')).toBeNull();

  rerender(<HomeView {...makeProps({ showLegacyImportButton: true })} />);
  expect(queryByText('ייבוא חד-פעמי מהדפדפן')).not.toBeNull();
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

  fireEvent.click(getByText('ייצוא ל-Excel'));
  fireEvent.click(getByText('ייצוא ל-PDF'));

  // Both handlers dynamically import('../utils/exportReport') now (code
  // splitting - see the comment in HomeView.js), which resolves on a later
  // microtask than a plain sync call would, so the spies aren't called yet
  // synchronously after fireEvent.click.
  await waitFor(() => {
    expect(pdfSpy).toHaveBeenCalledWith({ summary, israeliStocks, americanStocks, pensionFunds, cashFunds, bankBalances });
    expect(excelSpy).toHaveBeenCalledWith({ summary, israeliStocks, americanStocks, pensionFunds, cashFunds, bankBalances });
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
  expect(queryByText('ייצוא ל-Excel')).toBeNull();
  expect(queryByText('ייצוא ל-PDF')).toBeNull();
});

test('shows an error message if the PDF export throws', async () => {
  const pdfSpy = jest.spyOn(exportReport, 'downloadPortfolioPdf').mockImplementation(() => {
    throw new Error('boom');
  });

  const { findByText } = render(<HomeView {...makeProps()} />);
  fireEvent.click(await findByText('ייצוא ל-PDF'));

  expect(await findByText('שגיאה בייצוא ל-PDF, נסה שוב')).toBeInTheDocument();
  pdfSpy.mockRestore();
});

test('shows the edit-mode notice only in edit mode', () => {
  const { queryByText, rerender } = render(<HomeView {...makeProps({ isEditMode: false })} />);
  expect(queryByText('מצב עריכה פעיל - לחץ על תאים לעריכה')).toBeNull();

  rerender(<HomeView {...makeProps({ isEditMode: true })} />);
  expect(queryByText('מצב עריכה פעיל - לחץ על תאים לעריכה')).not.toBeNull();
});
