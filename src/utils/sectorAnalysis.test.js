import { computeSectorDistribution } from './sectorAnalysis';
import { UNCLASSIFIED_SECTOR_KEY } from './sectorLabels';

const baseStock = (overrides) => ({
  stockName: 'AAPL',
  purchasePrice: 100,
  quantity: 10,
  exchangeRate: 3.5,
  currentPrice: 100,
  currentExchangeRate: 3.5,
  ...overrides
});

describe('computeSectorDistribution', () => {
  test('groups stocks by sector and computes value/percentage', () => {
    const stocks = [
      baseStock({ stockName: 'AAPL', currentPrice: 100, quantity: 10 }), // 1000 * 3.5 = 3500 ILS
      baseStock({ stockName: 'MSFT', currentPrice: 100, quantity: 10 }), // same sector as AAPL
      baseStock({ stockName: 'JPM', currentPrice: 100, quantity: 10 }) // different sector
    ];
    const sectorBySymbol = {
      AAPL: { sector: 'Technology' },
      MSFT: { sector: 'Technology' },
      JPM: { sector: 'Financial Services' }
    };
    const result = computeSectorDistribution(stocks, sectorBySymbol);

    expect(result.hasData).toBe(true);
    expect(result.sectors).toHaveLength(2);
    const tech = result.sectors.find((s) => s.sectorKey === 'Technology');
    const fin = result.sectors.find((s) => s.sectorKey === 'Financial Services');
    expect(tech.symbolCount).toBe(2);
    expect(fin.symbolCount).toBe(1);
    // tech is 2/3 of total value
    expect(tech.percentage).toBeCloseTo((2 / 3) * 100, 5);
    expect(fin.percentage).toBeCloseTo((1 / 3) * 100, 5);
  });

  test('sorts sectors by value descending', () => {
    const stocks = [
      baseStock({ stockName: 'SMALL', currentPrice: 10, quantity: 1 }),
      baseStock({ stockName: 'BIG', currentPrice: 1000, quantity: 10 })
    ];
    const sectorBySymbol = {
      SMALL: { sector: 'Energy' },
      BIG: { sector: 'Technology' }
    };
    const result = computeSectorDistribution(stocks, sectorBySymbol);
    expect(result.sectors[0].sectorKey).toBe('Technology');
    expect(result.topSectorPercent).toBeCloseTo(result.sectors[0].percentage, 10);
  });

  test('stocks with no known sector are grouped as unclassified', () => {
    const stocks = [baseStock({ stockName: 'UNKNOWN' })];
    const result = computeSectorDistribution(stocks, {});
    expect(result.sectors).toHaveLength(1);
    expect(result.sectors[0].sectorKey).toBe(UNCLASSIFIED_SECTOR_KEY);
  });

  test('empty portfolio returns hasData=false', () => {
    const result = computeSectorDistribution([], {});
    expect(result.hasData).toBe(false);
    expect(result.sectors).toEqual([]);
    expect(result.topSectorPercent).toBe(0);
  });

  test('handles missing/undefined sectorBySymbol gracefully', () => {
    const stocks = [baseStock({ stockName: 'AAPL' })];
    expect(() => computeSectorDistribution(stocks, undefined)).not.toThrow();
    const result = computeSectorDistribution(stocks, undefined);
    expect(result.sectors[0].sectorKey).toBe(UNCLASSIFIED_SECTOR_KEY);
  });

  describe('Israeli holdings (manual sector tag, third argument)', () => {
    test('a manually-tagged Israeli stock consolidates into the same sector bucket as an American one', () => {
      const americanStocks = [baseStock({ stockName: 'JPM', currentPrice: 100, quantity: 10 })]; // 3500 ILS, Financial Services
      const sectorBySymbol = { JPM: { sector: 'Financial Services' } };
      const israeliStocks = [
        { stockName: 'פועלים', currentPrice: 3500, quantity: 1, sector: 'Financial Services' } // 3500 ILS
      ];
      const result = computeSectorDistribution(americanStocks, sectorBySymbol, israeliStocks);
      const fin = result.sectors.find((s) => s.sectorKey === 'Financial Services');
      expect(fin.value).toBeCloseTo(7000, 5); // 3500 (JPM, ILS) + 3500 (פועlim)
      expect(fin.symbolCount).toBe(2);
      expect(result.totalValueILS).toBeCloseTo(7000, 5);
    });

    test('an Israeli stock with no sector tag at all falls into unclassified, same as an untagged American one', () => {
      const israeliStocks = [{ stockName: 'טבע', currentPrice: 1000, quantity: 1 }];
      const result = computeSectorDistribution([], {}, israeliStocks);
      expect(result.sectors).toHaveLength(1);
      expect(result.sectors[0].sectorKey).toBe(UNCLASSIFIED_SECTOR_KEY);
    });

    test('omitting the israeliStocks argument entirely still works (backward compatible with existing call sites)', () => {
      const americanStocks = [baseStock({ stockName: 'AAPL' })];
      expect(() => computeSectorDistribution(americanStocks, { AAPL: { sector: 'Technology' } })).not.toThrow();
    });
  });
});
