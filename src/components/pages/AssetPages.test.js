import { render, screen, fireEvent, within } from '@testing-library/react';
import IsraeliStocksPage from './IsraeliStocksPage';
import UsStocksPage from './UsStocksPage';
import ProvidentFundsPage from './ProvidentFundsPage';
import CashAndCheckingPage from './CashAndCheckingPage';
import BankSavingsPage from './BankSavingsPage';
import { calculatePortfolioSummary } from '../../utils/portfolioSummary';

// One page per asset class, carved out of the old single-page dashboard.
// What matters here is the split itself: each page shows its own holdings
// and only its own, and each still carries the shared portfolio controls -
// a page whose table you cannot edit or save is a regression.

const noop = () => {};

const israeliStocks = [
  { id: 1, stockName: 'TEVA', purchaseDate: '2023-01-15', purchasePrice: 30, quantity: 100, currentPrice: 3500, dailyChangePercent: 1.2 }
];
const americanStocks = [
  { id: 10, stockName: 'AAPL', purchaseDate: '2022-03-01', purchasePrice: 150, quantity: 10, currentPrice: 190, exchangeRate: 3.6, currentExchangeRate: 3.7, dailyChangePercent: 0.8 }
];
const pensionFunds = [{ id: 100, fundName: 'קופה א', initialInvestment: 10000, currentValue: 12000, previousValue: 11500, updateDate: '2024-01-01' }];
const cashFunds = [{ id: 200, fundName: 'קרן כספית', updateDate: '2024-01-01', amount: 5000 }];
const bankBalances = [{ id: 300, updateDate: '2024-01-01', amount: 20000 }];
const bankSavingsFunds = [
  { id: 400, fundName: 'חיסכון בנק', updateDate: '2024-01-01', deposits: [{ date: '2023-01-01', amount: 1000 }], interestRate: 3 }
];

const summary = calculatePortfolioSummary(israeliStocks, americanStocks, pensionFunds, cashFunds, bankBalances);

function makeProps(overrides = {}) {
  return {
    summary,
    israeliStocks,
    americanStocks,
    pensionFunds,
    cashFunds,
    bankBalances,
    bankSavingsFunds,
    cpi: null,
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

const PAGES = [
  { name: 'בורסה ישראלית', Page: IsraeliStocksPage, shows: 'TEVA', hides: ['AAPL', 'קרן כספית', 'חיסכון בנק'] },
  { name: 'בורסה אמריקאית', Page: UsStocksPage, shows: 'AAPL', hides: ['TEVA', 'קרן כספית', 'חיסכון בנק'] },
  { name: 'קופות גמל להשקעה', Page: ProvidentFundsPage, shows: 'קופה א', hides: ['TEVA', 'AAPL', 'קרן כספית'] },
  { name: 'כספית שקלית ועו"ש', Page: CashAndCheckingPage, shows: 'קרן כספית', hides: ['TEVA', 'AAPL', 'קופה א'] },
  { name: 'קופת חיסכון בבנק', Page: BankSavingsPage, shows: 'חיסכון בנק', hides: ['TEVA', 'AAPL', 'קופה א'] }
];

describe.each(PAGES)('$name page', ({ name, Page, shows, hides }) => {
  test('titles itself and shows only its own holdings', () => {
    const { container } = render(<Page {...makeProps()} />);
    expect(screen.getByText(name, { selector: '.page-toolbar-title' })).toBeInTheDocument();
    expect(container.textContent).toContain(shows);
    hides.forEach((other) => expect(container.textContent).not.toContain(other));
  });

  test('carries the shared portfolio controls, so its table is editable and savable', () => {
    const { container } = render(<Page {...makeProps()} />);
    const toolbar = container.querySelector('.page-toolbar');
    expect(toolbar).not.toBeNull();
    ['+ הוספת מידע', 'מצב עריכה', 'נתונים מורחבים'].forEach((label) => {
      expect(toolbar).toHaveTextContent(label);
    });
  });

  test('the edit toggle carries its own pressed state, and edit mode is announced', () => {
    const setIsEditMode = jest.fn();
    const { rerender } = render(<Page {...makeProps({ isEditMode: false, setIsEditMode })} />);
    expect(screen.getByText('מצב עריכה')).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByText('מצב עריכה'));
    expect(setIsEditMode).toHaveBeenCalledWith(true);

    rerender(<Page {...makeProps({ isEditMode: true, setIsEditMode })} />);
    expect(screen.getByText('✓ מצב עריכה')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/מצב עריכה פעיל/)).toBeInTheDocument();
  });
});

describe('empty states', () => {
  const EMPTY = {
    israeliStocks: [],
    americanStocks: [],
    pensionFunds: [],
    cashFunds: [],
    bankBalances: [],
    bankSavingsFunds: []
  };

  test.each(PAGES)('$name says the page is empty instead of rendering an empty table', ({ Page }) => {
    const { container } = render(<Page {...makeProps(EMPTY)} />);
    expect(container.querySelector('.no-data-message')).not.toBeNull();
    expect(container.querySelectorAll('table').length).toBe(0);
  });

  // A card of zeroes reads as a real position worth nothing rather than as
  // an account that does not exist yet.
  test.each(PAGES)('$name shows no summary card while it is empty', ({ Page }) => {
    const { container } = render(<Page {...makeProps(EMPTY)} />);
    expect(container.querySelector('.summary-section')).toBeNull();
  });
});

describe('summary cards', () => {
  test('the Israeli page carries the Israeli figures, not the American ones', () => {
    const { container } = render(<IsraeliStocksPage {...makeProps()} />);
    const card = container.querySelector('.summary-section');
    expect(within(card).getByText(/בורסה ישראל/)).toBeInTheDocument();
  });

  test('the US page carries the American figures', () => {
    const { container } = render(<UsStocksPage {...makeProps()} />);
    const card = container.querySelector('.summary-section');
    expect(within(card).getByText(/בורסה אמריקאית/)).toBeInTheDocument();
  });

  test('the provident-funds page carries the provident figures', () => {
    const { container } = render(<ProvidentFundsPage {...makeProps()} />);
    const card = container.querySelector('.summary-section');
    expect(within(card).getByText(/קופות גמל/)).toBeInTheDocument();
  });

  test('the bank-savings page carries the savings figures', () => {
    const { container } = render(<BankSavingsPage {...makeProps()} />);
    const card = container.querySelector('.summary-section');
    expect(within(card).getByText(/קופת חיסכון בבנק/)).toBeInTheDocument();
  });

  test('the cash page carries the liquid figures', () => {
    const { container } = render(<CashAndCheckingPage {...makeProps()} />);
    const card = container.querySelector('.summary-section');
    expect(within(card).getByText(/כספית שקלית ועו"ש/)).toBeInTheDocument();
  });
});

// The two liquid categories are one page because they are one thing to the
// user: money available right now.
test('the cash page shows the money-market funds and the current accounts together', () => {
  const { container } = render(<CashAndCheckingPage {...makeProps()} />);
  const titles = Array.from(container.querySelectorAll('.section-title')).map((el) => el.textContent);
  expect(titles).toEqual(expect.arrayContaining(['כספית שקלית', 'עו"ש']));
});
