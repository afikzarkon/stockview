import { render, screen, within } from '@testing-library/react';
import IsraeliStocksTable from './IsraeliStocksTable';
import AmericanStocksTable from './AmericanStocksTable';
import { groupStocksByName, calculateGroupSummary } from '../utils/stockGrouping';
import {
  formatDate,
  formatPrice,
  formatPriceWithSign,
  normalizeIsraeliPrice,
  calculateProfitPercentage
} from '../utils/formatters';
import { TAX_RATE, calculateAmericanStockMetrics } from '../utils/portfolioMath';

const noop = () => {};

// For an Israeli holding, stockName IS the numeric TASE security id - the
// readable name lives in officialName, and the classification fields come
// from the exchange's own security lookup.
const israeliStocks = [
  {
    id: 1,
    stockName: '629014',
    officialName: 'טבע',
    securityType: ' מניות',
    branch: 'הייטק-ביומד-פארמה',
    purchaseDate: '2023-01-15',
    purchasePrice: 30,
    quantity: 100,
    currentPrice: 3500,
    dailyChangePercent: 1.2
  },
  {
    id: 2,
    stockName: '1159250',
    officialName: 'איישרס.חוץ P 500&S',
    securityType: 'קרן חוץ נסחרת',
    isForeignETF: true,
    purchaseDate: '2023-02-01',
    purchasePrice: 20,
    quantity: 50,
    currentPrice: 2200,
    dailyChangePercent: -0.5
  },
  {
    id: 3,
    stockName: '1159250',
    officialName: 'איישרס.חוץ P 500&S',
    securityType: 'קרן חוץ נסחרת',
    isForeignETF: true,
    purchaseDate: '2023-05-01',
    purchasePrice: 22,
    quantity: 30,
    currentPrice: 2200,
    dailyChangePercent: -0.5
  }
];

const americanStocks = [
  { id: 10, stockName: 'AAPL', purchaseDate: '2022-03-01', purchasePrice: 150, quantity: 10, currentPrice: 190, exchangeRate: 3.6, currentExchangeRate: 3.7, dailyChangePercent: 0.8 },
  { id: 11, stockName: 'MSFT', purchaseDate: '2021-06-01', purchasePrice: 250, quantity: 5, currentPrice: 420, exchangeRate: 3.5, currentExchangeRate: 3.7, dailyChangePercent: 1.1 },
  { id: 12, stockName: 'MSFT', purchaseDate: '2022-01-01', purchasePrice: 300, quantity: 5, currentPrice: 420, exchangeRate: 3.4, currentExchangeRate: 3.7, dailyChangePercent: 1.1 }
];

describe('IsraeliStocksTable', () => {
  const baseProps = {
    israeliStocks,
    groupStocksByName,
    calculateGroupSummary,
    normalizeIsraeliPrice,
    calculateProfitPercentage,
    TAX_RATE,
    handleCellClick: noop,
    handleInlineEdit: noop,
    finishInlineEdit: noop,
    handleKeyDown: noop,
    formatDate,
    formatPrice,
    formatPriceWithSign,
    handleDelete: noop,
    toggleGroup: noop
  };

  test('renders single and grouped rows in view mode', () => {
    const { container } = render(
      <IsraeliStocksTable {...baseProps} isEditMode={false} expandedGroups={{}} editingField={null} />
    );
    expect(container.querySelectorAll('tbody tr').length).toBeGreaterThan(0);
  });

  test('renders an editable input when a field is being edited', () => {
    const { container } = render(
      <IsraeliStocksTable {...baseProps} isEditMode={true} expandedGroups={{}} editingField="1-stockName" />
    );
    expect(container.querySelector('input[type="text"]')).not.toBeNull();
  });

  test('renders expanded group detail rows and a delete button in edit mode', () => {
    const { container } = render(
      <IsraeliStocksTable {...baseProps} isEditMode={true} expandedGroups={{ 'israeli-1159250': true }} editingField={null} />
    );
    expect(container.querySelectorAll('.detail-row').length).toBe(2); // the ETF has 2 lots
    expect(container.querySelectorAll('.delete-button').length).toBeGreaterThan(0);
  });

  test('renders nothing (empty fragment) when there are no stocks', () => {
    const { container } = render(
      <IsraeliStocksTable {...baseProps} israeliStocks={[]} isEditMode={false} expandedGroups={{}} editingField={null} />
    );
    expect(container.querySelector('table')).toBeNull();
  });

  // Requirement: show the security id ("מספר נייר") alongside the name.
  // A bare 7-digit number identifies nothing to a reader, and a bare name
  // doesn't say which security it is.
  test('shows each security\'s name together with its security id', () => {
    render(<IsraeliStocksTable {...baseProps} isEditMode={false} expandedGroups={{}} editingField={null} />);
    expect(screen.getByText('טבע (629014)')).toBeInTheDocument();
    expect(screen.getByText('איישרס.חוץ P 500&S (1159250)')).toBeInTheDocument();
  });

  test('labels a holding whose name has not been resolved rather than showing a bare number', () => {
    render(
      <IsraeliStocksTable
        {...baseProps}
        israeliStocks={[{ id: 9, stockName: '1234567', purchaseDate: '2023-01-01', purchasePrice: 1, quantity: 1, currentPrice: 1 }]}
        isEditMode={false}
        expandedGroups={{}}
        editingField={null}
      />
    );
    expect(screen.getByText('נייר 1234567')).toBeInTheDocument();
  });

  // The "נכס זר?" column is gone - the classification is derived from the
  // security's name and instrument type now, not asked of the user.
  test('has no "נכס זר?" column, and shows the derived sector instead', () => {
    const { container } = render(
      <IsraeliStocksTable {...baseProps} isEditMode={true} showAdditionalData expandedGroups={{}} editingField={null} />
    );
    const headers = Array.from(container.querySelectorAll('th')).map((el) => el.textContent);
    expect(headers).not.toContain('נכס זר?');
    expect(headers).toContain('סקטור');
    // No dropdown to set it by hand any more.
    expect(container.querySelector('select')).toBeNull();
  });

  test('derives the sector automatically: a fund is classified as a fund, a share from its exchange branch', () => {
    const { container } = render(
      <IsraeliStocksTable {...baseProps} isEditMode={false} showAdditionalData expandedGroups={{}} editingField={null} />
    );
    const rows = Array.from(container.querySelectorAll('tbody tr'));
    const tevaRow = rows.find((r) => within(r).queryByText('טבע (629014)'));
    const etfRow = rows.find((r) => within(r).queryByText(/איישרס/));

    expect(within(tevaRow).getByText('בריאות')).toBeInTheDocument();
    expect(within(etfRow).getByText('קרנות סל / מחקות מדד')).toBeInTheDocument();
    // The derived foreign-exposure classification is still visible, as a
    // badge rather than an input.
    expect(within(etfRow).getByText(/נכס חוץ/)).toBeInTheDocument();
    expect(within(tevaRow).queryByText(/נכס חוץ/)).toBeNull();
  });

  // Skeletons, not confident zeroes, for holdings with no price yet.
  test('shows a skeleton for a price that has not loaded yet, and a real value once one is known', () => {
    const { container } = render(
      <IsraeliStocksTable
        {...baseProps}
        israeliStocks={[{ id: 9, stockName: '1234567', officialName: 'חדש', purchaseDate: '2023-01-01', purchasePrice: 1, quantity: 1, currentPrice: 0 }]}
        isEditMode={false}
        expandedGroups={{}}
        editingField={null}
        pricesPending
      />
    );
    expect(container.querySelectorAll('.value-skeleton').length).toBeGreaterThan(0);

    const { container: loaded } = render(
      <IsraeliStocksTable {...baseProps} isEditMode={false} expandedGroups={{}} editingField={null} pricesPending />
    );
    // Every holding here has a persisted price, so nothing is skeletonized -
    // the page shows real numbers immediately instead of waiting.
    expect(loaded.querySelectorAll('.value-skeleton').length).toBe(0);
  });
});

describe('AmericanStocksTable', () => {
  const baseProps = {
    americanStocks,
    groupStocksByName,
    calculateGroupSummary,
    calculateAmericanStockMetrics,
    calculateProfitPercentage,
    TAX_RATE,
    handleCellClick: noop,
    handleInlineEdit: noop,
    finishInlineEdit: noop,
    handleKeyDown: noop,
    formatDate,
    formatPrice,
    formatPriceWithSign,
    handleDelete: noop,
    toggleGroup: noop
  };

  test('renders single and grouped rows with all columns shown', () => {
    const { container } = render(
      <AmericanStocksTable {...baseProps} isEditMode={false} showAdditionalData={true} expandedGroups={{}} editingField={null} />
    );
    expect(container.querySelectorAll('tbody tr').length).toBeGreaterThan(0);
  });

  test('hides the optional columns when showAmericanColumns is false', () => {
    const { container: withCols } = render(
      <AmericanStocksTable {...baseProps} isEditMode={false} showAdditionalData={true} expandedGroups={{}} editingField={null} />
    );
    const { container: withoutCols } = render(
      <AmericanStocksTable {...baseProps} isEditMode={false} showAdditionalData={false} expandedGroups={{}} editingField={null} />
    );
    const headersWith = withCols.querySelectorAll('th').length;
    const headersWithout = withoutCols.querySelectorAll('th').length;
    expect(headersWithout).toBeLessThan(headersWith);
  });

  test('renders an editable exchangeRate input when that field is being edited', () => {
    const { container } = render(
      <AmericanStocksTable {...baseProps} isEditMode={true} showAdditionalData={true} expandedGroups={{}} editingField="10-exchangeRate" />
    );
    expect(container.querySelector('input[type="number"]')).not.toBeNull();
  });

  test('renders expanded group detail rows for a multi-lot stock', () => {
    const { container } = render(
      <AmericanStocksTable {...baseProps} isEditMode={false} showAdditionalData={true} expandedGroups={{ 'american-MSFT': true }} editingField={null} />
    );
    expect(container.querySelectorAll('.detail-row').length).toBe(2); // MSFT has 2 lots
  });

  test('renders nothing (empty fragment) when there are no stocks', () => {
    const { container } = render(
      <AmericanStocksTable {...baseProps} americanStocks={[]} isEditMode={false} showAdditionalData={true} expandedGroups={{}} editingField={null} />
    );
    expect(container.querySelector('table')).toBeNull();
  });

  test('shows a skeleton for a price that has not loaded yet, rather than a confident 0.00', () => {
    const { container } = render(
      <AmericanStocksTable
        {...baseProps}
        americanStocks={[{ id: 99, stockName: 'NEW', purchaseDate: '2024-01-01', purchasePrice: 10, quantity: 1, currentPrice: 0, exchangeRate: 3.6 }]}
        isEditMode={false}
        showAdditionalData={true}
        expandedGroups={{}}
        editingField={null}
        pricesPending
      />
    );
    expect(container.querySelectorAll('.value-skeleton').length).toBeGreaterThan(0);
  });

  test('shows the persisted prices immediately, without skeletons, while a refresh runs', () => {
    const { container } = render(
      <AmericanStocksTable {...baseProps} isEditMode={false} showAdditionalData={true} expandedGroups={{}} editingField={null} pricesPending />
    );
    expect(container.querySelectorAll('.value-skeleton').length).toBe(0);
  });
});
