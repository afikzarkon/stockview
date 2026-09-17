/**
 * @jest-environment node
 */
const mockAxios = { get: jest.fn(), post: jest.fn() };
jest.mock('axios', () => mockAxios);

const { searchIsraeliSecuritiesByName, invalidateBizportalCookie } = require('./bizportalSearch');

const REAL_TEVA_RESPONSE = [
  {
    PaperId: '629014',
    PaperName: 'טבע',
    PaperSymbol: 'TEVA',
    PaperLink: 'https://www.bizportal.co.il/biomed/quote/generalview/629014',
    PaperType: 'מניות',
    IS_foreign: '0'
  },
  {
    PaperId: '0',
    PaperName: 'טבע תעשיות פרמצבטיות',
    PaperSymbol: 'TEVA',
    PaperLink: 'https://www.bizportal.co.il/foreign/stock/generalview/TEVA',
    PaperType: 'מניה חו"ל',
    IS_foreign: '1'
  },
  {
    PaperId: '5006',
    PaperName: 'מדד יציבות מטבעות קריפטו - ביטקוין',
    PaperSymbol: '',
    PaperLink: 'https://www.bizportal.co.il/capitalmarket/indices/generalview/5006',
    PaperType: 'מדדי ת"א',
    IS_foreign: '0'
  }
];

// Captured live from the real endpoint (query "קסם S&P 500") - covers both
// the ETF shape that should now be included and the mutual-fund shape
// ("קרנות נאמנות") that must still be excluded, since it shares the same
// underlying index/name text as its ETF sibling.
const REAL_ETF_RESPONSE = [
  {
    PaperId: '1146471',
    PaperName: 'קסם S&P 500 ETF',
    PaperSymbol: 'KSM ETF (4D) S&P 500',
    PaperLink: 'https://www.bizportal.co.il/tradedfund/quote/generalview/1146471',
    PaperType: 'קרנות סל',
    IS_foreign: '0'
  },
  {
    PaperId: '5124482',
    PaperName: 'קסם S&P 500 KTF',
    PaperSymbol: 'KSM KTF (4D) S&P 500',
    PaperLink: 'https://www.bizportal.co.il/mutualfunds/quote/generalview/5124482',
    PaperType: 'קרנות נאמנות',
    IS_foreign: '0'
  }
];

describe('searchIsraeliSecuritiesByName', () => {
  beforeEach(() => {
    mockAxios.get.mockReset();
    mockAxios.post.mockReset();
    invalidateBizportalCookie();
  });

  test('returns an empty array without any network call for a blank query', async () => {
    const results = await searchIsraeliSecuritiesByName('   ');
    expect(results).toEqual([]);
    expect(mockAxios.get).not.toHaveBeenCalled();
    expect(mockAxios.post).not.toHaveBeenCalled();
  });

  test('fetches a session cookie once, then filters the response down to domestic stocks only', async () => {
    mockAxios.get.mockResolvedValue({ headers: { 'set-cookie': ['BizCookieName=abc123; Path=/'] } });
    mockAxios.post.mockResolvedValue({ data: REAL_TEVA_RESPONSE });

    const results = await searchIsraeliSecuritiesByName('טבע');

    expect(results).toEqual([{ securityId: '629014', officialName: 'טבע', symbol: 'TEVA' }]);
    expect(mockAxios.get).toHaveBeenCalledTimes(1);
    expect(mockAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('papers_auto_suggest.ashx?QueryString='),
      null,
      expect.objectContaining({ headers: expect.objectContaining({ Cookie: 'BizCookieName=abc123' }) })
    );
  });

  test('reuses the cached cookie for a second search instead of fetching it again', async () => {
    mockAxios.get.mockResolvedValue({ headers: { 'set-cookie': ['BizCookieName=abc123; Path=/'] } });
    mockAxios.post.mockResolvedValue({ data: REAL_TEVA_RESPONSE });

    await searchIsraeliSecuritiesByName('טבע');
    await searchIsraeliSecuritiesByName('פועלים');

    expect(mockAxios.get).toHaveBeenCalledTimes(1);
    expect(mockAxios.post).toHaveBeenCalledTimes(2);
  });

  test('treats an empty-array response as a possibly-stale cookie and retries once with a fresh one', async () => {
    mockAxios.get
      .mockResolvedValueOnce({ headers: { 'set-cookie': ['BizCookieName=stale; Path=/'] } })
      .mockResolvedValueOnce({ headers: { 'set-cookie': ['BizCookieName=fresh; Path=/'] } });
    mockAxios.post.mockResolvedValueOnce({ data: [] }).mockResolvedValueOnce({ data: REAL_TEVA_RESPONSE });

    const results = await searchIsraeliSecuritiesByName('טבע');

    expect(results).toEqual([{ securityId: '629014', officialName: 'טבע', symbol: 'TEVA' }]);
    expect(mockAxios.get).toHaveBeenCalledTimes(2);
    expect(mockAxios.post).toHaveBeenCalledTimes(2);
    expect(mockAxios.post.mock.calls[1][2].headers.Cookie).toBe('BizCookieName=fresh');
  });

  test('returns an empty array (not throwing) if a real search still comes back empty after the retry', async () => {
    mockAxios.get.mockResolvedValue({ headers: { 'set-cookie': ['BizCookieName=abc123; Path=/'] } });
    mockAxios.post.mockResolvedValue({ data: [] });

    const results = await searchIsraeliSecuritiesByName('שגיאת-איות-שלא-קיימת');
    expect(results).toEqual([]);
  });

  test('excludes entries with PaperId "0" (no real TASE security id)', async () => {
    mockAxios.get.mockResolvedValue({ headers: { 'set-cookie': ['BizCookieName=abc123; Path=/'] } });
    mockAxios.post.mockResolvedValue({
      data: [{ PaperId: '0', PaperName: 'x', PaperSymbol: '', PaperType: 'מניות', IS_foreign: '0' }]
    });
    const results = await searchIsraeliSecuritiesByName('x');
    expect(results).toEqual([]);
  });

  test('includes a TASE-listed ETF ("קרנות סל") but excludes its mutual-fund sibling ("קרנות נאמנות")', async () => {
    mockAxios.get.mockResolvedValue({ headers: { 'set-cookie': ['BizCookieName=abc123; Path=/'] } });
    mockAxios.post.mockResolvedValue({ data: REAL_ETF_RESPONSE });

    const results = await searchIsraeliSecuritiesByName('קסם S&P 500');

    expect(results).toEqual([
      { securityId: '1146471', officialName: 'קסם S&P 500 ETF', symbol: 'KSM ETF (4D) S&P 500' }
    ]);
  });
});
