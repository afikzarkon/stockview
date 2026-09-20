/**
 * @jest-environment node
 */
const mockAxios = { post: jest.fn() };
jest.mock('axios', () => mockAxios);

const { fetchTaseHistoricalCloses, fetchTaseQuoteFromEod, taseDateToIso } = require('./taseHistoryApi');

describe('taseDateToIso', () => {
  test('converts TASE\'s DD/MM/YYYY format to YYYY-MM-DD', () => {
    expect(taseDateToIso('16/09/2026')).toBe('2026-09-16');
  });

  test('returns null for an unrecognized format', () => {
    expect(taseDateToIso('2026-09-16')).toBeNull();
    expect(taseDateToIso('')).toBeNull();
    expect(taseDateToIso(undefined)).toBeNull();
  });
});

describe('fetchTaseHistoricalCloses', () => {
  beforeEach(() => {
    mockAxios.post.mockReset();
  });

  // Real shape captured from TASE's public historyeod endpoint for
  // Teva (security id 629014) during development.
  function page(dates, totalRec) {
    return {
      data: {
        TotalRec: totalRec,
        Items: dates.map(([tradeDate, closeRate]) => ({ TradeDate: tradeDate, CloseRate: closeRate }))
      }
    };
  }

  test('requests the zero-padded 8-digit oId and pType 6 (3-year window)', async () => {
    mockAxios.post.mockResolvedValue(page([['16/09/2026', 11800]], 1));
    await fetchTaseHistoricalCloses('629014', '2026-09-01');
    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://api.tase.co.il/api/security/historyeod',
      expect.objectContaining({ pType: 6, oId: '00629014', pageNum: 1 }),
      expect.any(Object)
    );
  });

  test('returns closes ascending by date, converted to YYYY-MM-DD, in agorot as-is (no scaling)', async () => {
    mockAxios.post.mockResolvedValueOnce(
      page(
        [
          ['16/09/2026', 11800],
          ['15/09/2026', 11710],
          ['14/09/2026', 11540]
        ],
        3
      )
    );
    const result = await fetchTaseHistoricalCloses('629014', '2026-09-14');
    expect(result).toEqual([
      { date: '2026-09-14', close: 11540 },
      { date: '2026-09-15', close: 11710 },
      { date: '2026-09-16', close: 11800 }
    ]);
  });

  test('pages backward until fromDateStr is reached, not requesting more pages than needed', async () => {
    mockAxios.post
      .mockResolvedValueOnce(page([['16/09/2026', 100], ['15/09/2026', 99]], 4))
      .mockResolvedValueOnce(page([['14/09/2026', 98], ['13/09/2026', 97]], 4));
    const result = await fetchTaseHistoricalCloses('629014', '2026-09-14');
    // Stops as soon as a page CONTAINS fromDateStr (not mid-page) - so the
    // whole second page is kept, including one date earlier than asked
    // for, rather than fetching a third page it doesn't need.
    expect(mockAxios.post).toHaveBeenCalledTimes(2);
    expect(result.map((r) => r.date)).toEqual(['2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16']);
  });

  test('stops once the server-reported TotalRec is exhausted, even if fromDateStr is further back', async () => {
    mockAxios.post.mockResolvedValueOnce(page([['16/09/2026', 100], ['15/09/2026', 99]], 2));
    const result = await fetchTaseHistoricalCloses('629014', '2000-01-01');
    expect(mockAxios.post).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(2);
  });

  test('stops once a page comes back empty, regardless of TotalRec', async () => {
    mockAxios.post
      .mockResolvedValueOnce(page([['16/09/2026', 100]], 100))
      .mockResolvedValueOnce({ data: { TotalRec: 100, Items: [] } });
    const result = await fetchTaseHistoricalCloses('629014', '2000-01-01');
    expect(mockAxios.post).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
  });

  test('deduplicates a date that appears on two pages instead of throwing off the caller', async () => {
    mockAxios.post
      .mockResolvedValueOnce(page([['16/09/2026', 100], ['15/09/2026', 99]], 4))
      .mockResolvedValueOnce(page([['15/09/2026', 99], ['14/09/2026', 98]], 4));
    const result = await fetchTaseHistoricalCloses('629014', '2026-09-14');
    expect(result.filter((r) => r.date === '2026-09-15')).toHaveLength(1);
  });

  test('ignores an entry with a non-numeric CloseRate instead of throwing', async () => {
    mockAxios.post.mockResolvedValueOnce({
      data: { TotalRec: 2, Items: [{ TradeDate: '16/09/2026', CloseRate: 100 }, { TradeDate: '15/09/2026', CloseRate: null }] }
    });
    const result = await fetchTaseHistoricalCloses('629014', '2026-09-15');
    expect(result).toEqual([{ date: '2026-09-16', close: 100 }]);
  });
});

// The second source in quotesRoutes.js's quote chain - same endpoint as
// above, asked for a single day instead of a window.
describe('fetchTaseQuoteFromEod', () => {
  beforeEach(() => {
    mockAxios.post.mockReset();
  });

  // Real row captured from the live endpoint for Teva with pType 0.
  const TEVA_TODAY = {
    TradeDate: '17/09/2026',
    CloseRate: 11960,
    Change: 1.36,
    OpenRate: 11780,
    IfTraded: true
  };

  test('asks for pType 0 (today only) and the zero-padded 8-digit oId', async () => {
    mockAxios.post.mockResolvedValue({ data: { TotalRec: 1, Items: [TEVA_TODAY] } });
    await fetchTaseQuoteFromEod('629014');
    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://api.tase.co.il/api/security/historyeod',
      expect.objectContaining({ pType: 0, oId: '00629014', pageNum: 1 }),
      expect.any(Object)
    );
  });

  test('maps the latest row to the quote payload shape, in agorot as-is (no scaling)', async () => {
    mockAxios.post.mockResolvedValue({ data: { TotalRec: 1, Items: [TEVA_TODAY] } });
    const result = await fetchTaseQuoteFromEod('629014');
    expect(result).toMatchObject({ currentPrice: 11960, changePercent: 1.36 });
  });

  test('preserves a negative daily change', async () => {
    mockAxios.post.mockResolvedValue({
      data: { TotalRec: 1, Items: [{ ...TEVA_TODAY, CloseRate: 7811, Change: -1.72 }] }
    });
    const result = await fetchTaseQuoteFromEod('604611');
    expect(result).toMatchObject({ currentPrice: 7811, changePercent: -1.72 });
  });

  test('an empty Items array (unknown or untraded security) yields nulls instead of throwing', async () => {
    mockAxios.post.mockResolvedValue({ data: { TotalRec: 0, Items: [] } });
    await expect(fetchTaseQuoteFromEod('99999999')).resolves.toEqual({
      currentPrice: null,
      changePercent: null
    });
  });

  test('a missing Items field yields nulls instead of throwing', async () => {
    mockAxios.post.mockResolvedValue({ data: {} });
    await expect(fetchTaseQuoteFromEod('629014')).resolves.toEqual({
      currentPrice: null,
      changePercent: null
    });
  });

  // Number(null) is 0, not NaN - checking isFinite on the raw value is what
  // stops a null rate from being reported as a real price of 0, the same
  // trap fetchTaseHistoricalCloses guards against above.
  test('a null CloseRate becomes null, not a price of 0', async () => {
    mockAxios.post.mockResolvedValue({
      data: { TotalRec: 1, Items: [{ ...TEVA_TODAY, CloseRate: null }] }
    });
    const result = await fetchTaseQuoteFromEod('629014');
    expect(result.currentPrice).toBeNull();
  });

  test('a network error propagates so the chain can move to the next source', async () => {
    mockAxios.post.mockRejectedValue(new Error('ETIMEDOUT'));
    await expect(fetchTaseQuoteFromEod('629014')).rejects.toThrow('ETIMEDOUT');
  });
});
