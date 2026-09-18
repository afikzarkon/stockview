/**
 * @jest-environment node
 */
const mockAxios = { get: jest.fn() };
jest.mock('axios', () => mockAxios);

const { fetchTaseQuoteFromApi } = require('./taseQuoteApi');

describe('fetchTaseQuoteFromApi', () => {
  beforeEach(() => {
    mockAxios.get.mockReset();
  });

  // Real response shape captured from TASE's public securitydata endpoint
  // for Teva (security id 629014) during development, trimmed to the fields
  // this module reads plus a couple that document the surrounding payload.
  const TEVA = {
    LastRate: 11960,
    Change: 1.36,
    TradeDate: '17/09/2026',
    CompanyName: 'טבע',
    Symbol: 'טבע',
    ISIN: 'IL0006290147',
    isTrading: false
  };

  test('requests securitydata with the security id and the Hebrew lang code', async () => {
    mockAxios.get.mockResolvedValue({ data: TEVA });
    await fetchTaseQuoteFromApi('629014');
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://api.tase.co.il/api/company/securitydata',
      expect.objectContaining({ params: { securityId: '629014', lang: 0 } })
    );
  });

  // Confirmed by testing each header in isolation against the live API: no
  // headers at all -> 403, a browser User-Agent alone -> 403, this Referer
  // alone -> 200. Dropping it silently breaks every Israeli quote, so it is
  // pinned by a test rather than left as a comment.
  test('sends the Referer header the endpoint requires', async () => {
    mockAxios.get.mockResolvedValue({ data: TEVA });
    await fetchTaseQuoteFromApi('629014');
    const options = mockAxios.get.mock.calls[0][1];
    expect(options.headers.Referer).toBe('https://market.tase.co.il/');
  });

  test('accepts a numeric security id, not just a string', async () => {
    mockAxios.get.mockResolvedValue({ data: TEVA });
    await fetchTaseQuoteFromApi(629014);
    expect(mockAxios.get.mock.calls[0][1].params.securityId).toBe('629014');
  });

  test('maps LastRate/Change to the payload shape the quote chain expects, in agorot as-is (no scaling)', async () => {
    mockAxios.get.mockResolvedValue({ data: TEVA });
    const result = await fetchTaseQuoteFromApi('629014');
    expect(result.currentPrice).toBe(11960);
    expect(result.changePercent).toBe(1.36);
  });

  test('preserves a negative daily change rather than dropping its sign', async () => {
    mockAxios.get.mockResolvedValue({ data: { ...TEVA, LastRate: 7811, Change: -1.72 } });
    const result = await fetchTaseQuoteFromApi('604611');
    expect(result).toMatchObject({ currentPrice: 7811, changePercent: -1.72 });
  });

  // The scraper's negative-change handling needs a colour-based heuristic
  // because the rendered page can lose the minus sign; the API returns a
  // real signed number, so a flat 0.00% stays 0 and is still a usable
  // quote rather than being mistaken for "no data".
  test('treats a zero change as a real value, not as missing data', async () => {
    mockAxios.get.mockResolvedValue({ data: { ...TEVA, LastRate: 37260, Change: 0 } });
    const result = await fetchTaseQuoteFromApi('1159235');
    expect(result).toMatchObject({ currentPrice: 37260, changePercent: 0 });
  });

  // Confirmed live: an unknown security id answers HTTP 200 with a literal
  // `null` body, NOT a 404. Without the guard in the module this threw
  // "Cannot read properties of null" instead of letting quotesRoutes.js
  // fall through to the next source.
  test('a null body (unknown security id, still HTTP 200) yields nulls instead of throwing', async () => {
    mockAxios.get.mockResolvedValue({ data: null });
    await expect(fetchTaseQuoteFromApi('99999999')).resolves.toEqual({
      currentPrice: null,
      changePercent: null
    });
  });

  test('a non-object body (e.g. an HTML error page) yields nulls instead of throwing', async () => {
    mockAxios.get.mockResolvedValue({ data: '<html>Request Rejected</html>' });
    await expect(fetchTaseQuoteFromApi('629014')).resolves.toEqual({
      currentPrice: null,
      changePercent: null
    });
  });

  test('a present-but-non-numeric rate or change becomes null rather than being passed through', async () => {
    mockAxios.get.mockResolvedValue({ data: { ...TEVA, LastRate: null, Change: undefined } });
    const result = await fetchTaseQuoteFromApi('629014');
    expect(result.currentPrice).toBeNull();
    expect(result.changePercent).toBeNull();
  });

  // A transport-level failure must propagate: quotesRoutes.js's chain
  // advances to the next source on a thrown error, so swallowing it here
  // would return a null payload as if it were an answer.
  test('a network error propagates so the chain can move to the next source', async () => {
    mockAxios.get.mockRejectedValue(new Error('ETIMEDOUT'));
    await expect(fetchTaseQuoteFromApi('629014')).rejects.toThrow('ETIMEDOUT');
  });

  test('reports which field produced the price, for the success log', async () => {
    mockAxios.get.mockResolvedValue({ data: TEVA });
    const result = await fetchTaseQuoteFromApi('629014');
    expect(result._debugPriceMatch.matchedLabel).toBe('API LastRate');
    expect(result._debugPriceMatch.rawToken).toBe('11960');
  });
});
