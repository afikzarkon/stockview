import { computeTaxLossHarvestingOpportunities } from './taxLossHarvesting';

describe('computeTaxLossHarvestingOpportunities', () => {
  test('empty portfolio returns empty, zeroed-out result without throwing', () => {
    const result = computeTaxLossHarvestingOpportunities([], [], [], null);
    expect(result.lossPositions).toEqual([]);
    expect(result.gainPositions).toEqual([]);
    expect(result.totalHarvestableLoss).toBe(0);
    expect(result.totalPotentialTaxValue).toBe(0);
    expect(result.hasLossPositions).toBe(false);
    expect(result.hasGainPositions).toBe(false);
  });

  test('an Israeli stock at a nominal loss (no CPI data) is classified as a loss position', () => {
    const israeliStocks = [
      { id: 1, stockName: 'TEVA', quantity: 100, purchasePrice: 50, currentPrice: 35, purchaseDate: '2023-01-15' }
    ];
    const result = computeTaxLossHarvestingOpportunities(israeliStocks, [], [], null);
    expect(result.lossPositions).toHaveLength(1);
    expect(result.lossPositions[0].name).toBe('TEVA');
    expect(result.lossPositions[0].category).toBe('israeli');
    // loss = (35-50)*100 = -1500 -> harvestable loss = 1500
    expect(result.lossPositions[0].harvestableLoss).toBeCloseTo(1500, 5);
    expect(result.lossPositions[0].taxValue).toBeCloseTo(1500 * 0.25, 5);
  });

  test('does not double-divide a legitimately high shekel price (currentPrice is always already in shekels)', () => {
    // Regression coverage for the fix in formatters.js:normalizeIsraeliPrice -
    // a real ₪2,457/share holding must not be silently divided by 100 to
    // ₪24.57 just because the number happens to be large.
    const israeliStocks = [
      { id: 1, stockName: 'EXPENSIVE', quantity: 10, purchasePrice: 2500, currentPrice: 2457, purchaseDate: '2023-01-15' }
    ];
    const result = computeTaxLossHarvestingOpportunities(israeliStocks, [], [], null);
    expect(result.lossPositions).toHaveLength(1);
    // loss = (2457-2500)*10 = -430 -> harvestable loss = 430, NOT 429970-ish from a bogus 100x-off calc
    expect(result.lossPositions[0].harvestableLoss).toBeCloseTo(430, 5);
  });

  test('a profitable Israeli stock is classified as a gain position, not a loss', () => {
    const israeliStocks = [
      { id: 1, stockName: 'TEVA', quantity: 100, purchasePrice: 30, currentPrice: 35, purchaseDate: '2023-01-15' }
    ];
    const result = computeTaxLossHarvestingOpportunities(israeliStocks, [], [], null);
    expect(result.lossPositions).toHaveLength(0);
    expect(result.gainPositions).toHaveLength(1);
    expect(result.gainPositions[0].realGain).toBeCloseTo(500, 5);
  });

  test('an American stock at a real loss is included, using the same calculateAmericanStockMetrics numbers shown elsewhere', () => {
    const americanStocks = [
      {
        id: 1,
        stockName: 'AAPL',
        quantity: 10,
        purchasePrice: 200,
        currentPrice: 150,
        exchangeRate: 3.6,
        currentExchangeRate: 3.6,
        purchaseDate: '2023-01-01'
      }
    ];
    const result = computeTaxLossHarvestingOpportunities([], americanStocks, [], null);
    expect(result.lossPositions).toHaveLength(1);
    expect(result.lossPositions[0].category).toBe('american');
    // no FX movement here (same exchange rate), so real loss = nominal loss = (150-200)*10*3.6 = -1800
    expect(result.lossPositions[0].harvestableLoss).toBeCloseTo(1800, 5);
  });

  test('a pension fund not linked to the index uses the 15% flat rate', () => {
    const pensionFunds = [
      {
        id: 1,
        fundName: 'קופת דוגמה',
        isLinkedToIndex: false,
        currentValue: 8000,
        deposits: [{ date: '2022-01-01', amount: 10000 }]
      }
    ];
    const result = computeTaxLossHarvestingOpportunities([], [], pensionFunds, null);
    expect(result.lossPositions).toHaveLength(1);
    expect(result.lossPositions[0].category).toBe('pension');
    expect(result.lossPositions[0].harvestableLoss).toBeCloseTo(2000, 5);
    expect(result.lossPositions[0].taxRate).toBe(0.15);
  });

  test('a pension fund linked to the index uses the 25% rate', () => {
    const pensionFunds = [
      {
        id: 1,
        fundName: 'קופה מוצמדת',
        isLinkedToIndex: true,
        currentValue: 8000,
        deposits: [{ date: '2022-01-01', amount: 10000 }]
      }
    ];
    const result = computeTaxLossHarvestingOpportunities([], [], pensionFunds, null);
    expect(result.lossPositions[0].taxRate).toBe(0.25);
  });

  test('loss positions are sorted largest loss first', () => {
    const israeliStocks = [
      { id: 1, stockName: 'SMALL_LOSS', quantity: 10, purchasePrice: 51, currentPrice: 50, purchaseDate: '2023-01-01' },
      { id: 2, stockName: 'BIG_LOSS', quantity: 10, purchasePrice: 100, currentPrice: 50, purchaseDate: '2023-01-01' }
    ];
    const result = computeTaxLossHarvestingOpportunities(israeliStocks, [], [], null);
    expect(result.lossPositions[0].name).toBe('BIG_LOSS');
    expect(result.lossPositions[1].name).toBe('SMALL_LOSS');
  });

  test('totals aggregate correctly across mixed loss and gain positions', () => {
    const israeliStocks = [
      { id: 1, stockName: 'LOSS_STOCK', quantity: 10, purchasePrice: 100, currentPrice: 50, purchaseDate: '2023-01-01' },
      { id: 2, stockName: 'GAIN_STOCK', quantity: 10, purchasePrice: 50, currentPrice: 100, purchaseDate: '2023-01-01' }
    ];
    const result = computeTaxLossHarvestingOpportunities(israeliStocks, [], [], null);
    expect(result.totalHarvestableLoss).toBeCloseTo(500, 5); // (100-50)*10
    expect(result.totalPotentialTaxValue).toBeCloseTo(500 * 0.25, 5);
    expect(result.totalCurrentGains).toBeCloseTo(500, 5); // (100-50)*10
    expect(result.totalGainsTax).toBeCloseTo(500 * 0.25, 5);
    expect(result.hasLossPositions).toBe(true);
    expect(result.hasGainPositions).toBe(true);
  });

  test('with CPI data, an Israeli stock loss reflects the real (index-linked) gain, not the raw nominal one', () => {
    const cpi = { currentIndex: 110, indexByMonth: { '2023-01': 100 } };
    // Nominal: bought at 100, now worth 105 -> nominal gain +5 per share.
    // But the index rose 10% (100->110), so the exempt "inflationary"
    // portion is min(linkage=10, nominalGain=5)=5, leaving a REAL gain of
    // 0, not a loss - included here mainly to confirm CPI data changes the
    // classification versus the nominal-only fallback.
    const israeliStocks = [
      { id: 1, stockName: 'TEVA', quantity: 1, purchasePrice: 100, currentPrice: 105, purchaseDate: '2023-01-15' }
    ];
    const withCpi = computeTaxLossHarvestingOpportunities(israeliStocks, [], [], cpi);
    const withoutCpi = computeTaxLossHarvestingOpportunities(israeliStocks, [], [], null);
    // Nominal-only fallback: gain of 5, no loss.
    expect(withoutCpi.lossPositions).toHaveLength(0);
    // With CPI: real gain is fully offset by the exempt inflationary
    // amount, so it should not appear as a gain position needing tax either.
    expect(withCpi.gainPositions).toHaveLength(0);
  });
});
