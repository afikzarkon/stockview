import { render } from '@testing-library/react';
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

const israeliStocks = [
  { id: 1, stockName: 'TEVA', purchaseDate: '2023-01-15', purchasePrice: 30, quantity: 100, currentPrice: 3500, dailyChangePercent: 1.2 },
  { id: 2, stockName: 'ICL', purchaseDate: '2023-02-01', purchasePrice: 20, quantity: 50, currentPrice: 2200, dailyChangePercent: -0.5 },
  { id: 3, stockName: 'ICL', purchaseDate: '2023-05-01', purchasePrice: 22, quantity: 30, currentPrice: 2200, dailyChangePercent: -0.5 }
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
      <IsraeliStocksTable {...baseProps} isEditMode={true} expandedGroups={{ 'israeli-ICL': true }} editingField={null} />
    );
    expect(container.querySelectorAll('.detail-row').length).toBe(2); // ICL has 2 lots
    expect(container.querySelectorAll('.delete-button').length).toBeGreaterThan(0);
  });

  test('renders nothing (empty fragment) when there are no stocks', () => {
    const { container } = render(
      <IsraeliStocksTable {...baseProps} israeliStocks={[]} isEditMode={false} expandedGroups={{}} editingField={null} />
    );
    expect(container.querySelector('table')).toBeNull();
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
});
