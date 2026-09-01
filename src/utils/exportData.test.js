import {
  buildIsraeliStocksExportRows,
  buildAmericanStocksExportRows,
  buildPensionFundsExportRows,
  buildCashFundsExportRows,
  buildBankBalancesExportRows,
  buildSummaryExportRows
} from './exportData';

describe('buildIsraeliStocksExportRows', () => {
  test('computes purchase/current/profit from currentPrice as already stored (₪, not agorot)', () => {
    // currentPrice is already in ₪ by the time it's in state - every write
    // path already converts agorot->₪ itself (see App.js/usePriceRefresh.js
    // and the project note against re-dividing by 100 here).
    const rows = buildIsraeliStocksExportRows([
      { stockName: 'TEVA', purchaseDate: '2023-01-15', purchasePrice: 30, quantity: 100, currentPrice: 35 }
    ]);
    expect(rows).toEqual([
      {
        'שם מנייה': 'TEVA',
        'תאריך קנייה': '2023-01-15',
        'מחיר קנייה (₪)': 30,
        'כמות': 100,
        'מחיר נוכחי (₪)': 35,
        'סה"כ רכישה (₪)': 3000,
        'סה"כ שווי נוכחי (₪)': 3500,
        'רווח/הפסד (₪)': 500
      }
    ]);
  });

  test('handles an empty/missing list without throwing', () => {
    expect(buildIsraeliStocksExportRows([])).toEqual([]);
    expect(buildIsraeliStocksExportRows(null)).toEqual([]);
  });
});

describe('buildAmericanStocksExportRows', () => {
  test('reports both USD and ILS value/profit using calculateAmericanStockMetrics', () => {
    const rows = buildAmericanStocksExportRows([
      {
        stockName: 'AAPL',
        purchaseDate: '2022-03-01',
        purchasePrice: 150,
        quantity: 10,
        currentPrice: 190,
        exchangeRate: 3.6,
        currentExchangeRate: 3.7
      }
    ]);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row['שם מנייה']).toBe('AAPL');
    expect(row['סה"כ שווי נוכחי ($)']).toBe(1900); // 190 * 10
    expect(row['סה"כ שווי נוכחי (₪)']).toBe(7030); // 1900 * 3.7
    expect(row['רווח/הפסד ($)']).toBe(400); // (190-150)*10
  });

  test('handles an empty/missing list without throwing', () => {
    expect(buildAmericanStocksExportRows([])).toEqual([]);
    expect(buildAmericanStocksExportRows(undefined)).toEqual([]);
  });
});

describe('buildPensionFundsExportRows', () => {
  test('computes period return % only when a previous value exists', () => {
    const rows = buildPensionFundsExportRows([
      { fundName: 'קופה א', currentValue: 111000, currentValueDate: '2024-06-30', previousValue: 100000, previousValueDate: '2024-01-01' },
      { fundName: 'קופה חדשה', currentValue: 5000, currentValueDate: '2024-06-30' } // no previous value yet
    ]);
    expect(rows[0]['שם קופה']).toBe('קופה א');
    expect(rows[0]['תשואת תקופה (%)']).toBeCloseTo(11, 5);
    expect(rows[1]['תשואת תקופה (%)']).toBe('');
  });

  test('falls back to amount when currentValue is missing (legacy shape)', () => {
    const rows = buildPensionFundsExportRows([{ fundName: 'ישן', amount: 20000 }]);
    expect(rows[0]['שווי נוכחי (₪)']).toBe(20000);
  });

  test('handles an empty/missing list without throwing', () => {
    expect(buildPensionFundsExportRows([])).toEqual([]);
    expect(buildPensionFundsExportRows(null)).toEqual([]);
  });
});

describe('buildCashFundsExportRows / buildBankBalancesExportRows', () => {
  test('shapes cash fund rows', () => {
    expect(buildCashFundsExportRows([{ fundName: 'קרן א', securityId: '12345', updateDate: '2024-01-01', amount: 5000.456 }])).toEqual([
      { 'שם קרן': 'קרן א', 'מספר נייר': '12345', 'תאריך עדכון': '2024-01-01', 'סכום (₪)': 5000.46 }
    ]);
  });

  test('shapes bank balance rows', () => {
    expect(buildBankBalancesExportRows([{ updateDate: '2024-01-01', amount: 1000 }])).toEqual([
      { 'תאריך עדכון': '2024-01-01', 'יתרה (₪)': 1000 }
    ]);
  });

  test('handle an empty/missing list without throwing', () => {
    expect(buildCashFundsExportRows(null)).toEqual([]);
    expect(buildBankBalancesExportRows(undefined)).toEqual([]);
  });
});

describe('buildSummaryExportRows', () => {
  test('extracts the headline totals as metric/value pairs', () => {
    const rows = buildSummaryExportRows({
      totalCurrentValueILS: 100000.456,
      totalPurchaseILS: 90000,
      totalProfitILS: 10000.456,
      weightedDailyChange: 1.2345,
      dailyProfitILS: 500
    });
    expect(rows).toEqual([
      { 'מדד': 'סה"כ שווי תיק (₪)', 'ערך': 100000.46 },
      { 'מדד': 'סה"כ השקעה (₪)', 'ערך': 90000 },
      { 'מדד': 'סה"כ רווח/הפסד (₪)', 'ערך': 10000.46 },
      { 'מדד': 'שינוי יומי משוקלל (%)', 'ערך': 1.23 },
      { 'מדד': 'רווח/הפסד יומי (₪)', 'ערך': 500 }
    ]);
  });

  test('returns an empty array for missing summary', () => {
    expect(buildSummaryExportRows(null)).toEqual([]);
    expect(buildSummaryExportRows(undefined)).toEqual([]);
  });
});
