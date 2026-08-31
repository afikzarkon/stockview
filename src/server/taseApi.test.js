/**
 * @jest-environment node
 */
const mockAxios = { get: jest.fn() };
jest.mock('axios', () => mockAxios);

describe('taseApi', () => {
  const originalEnv = process.env.TASE_API_KEY;

  afterEach(() => {
    process.env.TASE_API_KEY = originalEnv;
    mockAxios.get.mockReset();
  });

  test('isTaseApiConfigured reflects whether TASE_API_KEY is set', () => {
    jest.resetModules();
    delete process.env.TASE_API_KEY;
    // eslint-disable-next-line global-require
    let { isTaseApiConfigured } = require('./taseApi');
    expect(isTaseApiConfigured()).toBe(false);

    jest.resetModules();
    process.env.TASE_API_KEY = 'test-key';
    // eslint-disable-next-line global-require
    ({ isTaseApiConfigured } = require('./taseApi'));
    expect(isTaseApiConfigured()).toBe(true);
  });

  test('fetchTaseQuoteFromApi throws immediately if no key is configured (never calls axios)', async () => {
    jest.resetModules();
    delete process.env.TASE_API_KEY;
    // eslint-disable-next-line global-require
    const { fetchTaseQuoteFromApi } = require('./taseApi');

    await expect(fetchTaseQuoteFromApi('1159250')).rejects.toThrow('TASE_API_KEY not configured');
    expect(mockAxios.get).not.toHaveBeenCalled();
  });

  test('parses a successful response into {currentPrice, changePercent}, already in agorot', async () => {
    jest.resetModules();
    process.env.TASE_API_KEY = 'test-key';
    // eslint-disable-next-line global-require
    const { fetchTaseQuoteFromApi } = require('./taseApi');

    mockAxios.get.mockResolvedValueOnce({
      data: {
        securitiesLastUpdate: {
          result: [{ securityId: 1159250, securityLastPrice: 1538, securityPercentageChange: -1.42 }],
          total: 1
        }
      }
    });

    const result = await fetchTaseQuoteFromApi('1159250');
    expect(result).toEqual({ currentPrice: 1538, changePercent: -1.42 });

    // Sends the API key and securityId correctly
    const callArgs = mockAxios.get.mock.calls[0];
    expect(callArgs[1].params).toEqual({ securityId: '1159250' });
    expect(callArgs[1].headers.apikey).toBe('test-key');
  });

  test('retries once after a 429 and succeeds on the second attempt', async () => {
    jest.resetModules();
    process.env.TASE_API_KEY = 'test-key';
    // eslint-disable-next-line global-require
    const { fetchTaseQuoteFromApi } = require('./taseApi');

    mockAxios.get
      .mockRejectedValueOnce({ response: { status: 429 } })
      .mockResolvedValueOnce({
        data: {
          securitiesLastUpdate: { result: [{ securityLastPrice: 100, securityPercentageChange: 0.5 }], total: 1 }
        }
      });

    const result = await fetchTaseQuoteFromApi('1159250');
    expect(result).toEqual({ currentPrice: 100, changePercent: 0.5 });
    expect(mockAxios.get).toHaveBeenCalledTimes(2);
  }, 10000);

  test('a non-429 error (e.g. 401 while the product is still pending approval) propagates without retry', async () => {
    jest.resetModules();
    process.env.TASE_API_KEY = 'test-key';
    // eslint-disable-next-line global-require
    const { fetchTaseQuoteFromApi } = require('./taseApi');

    mockAxios.get.mockRejectedValue({ response: { status: 401 } });

    await expect(fetchTaseQuoteFromApi('1159250')).rejects.toBeTruthy();
    expect(mockAxios.get).toHaveBeenCalledTimes(1);
  });

  test('an empty/malformed result array throws rather than returning bogus data', async () => {
    jest.resetModules();
    process.env.TASE_API_KEY = 'test-key';
    // eslint-disable-next-line global-require
    const { fetchTaseQuoteFromApi } = require('./taseApi');

    mockAxios.get.mockResolvedValueOnce({ data: { securitiesLastUpdate: { result: [], total: 0 } } });

    await expect(fetchTaseQuoteFromApi('1159250')).rejects.toThrow('missing data in TASE API response');
  });

  test('non-numeric price/change fields throw rather than returning NaN', async () => {
    jest.resetModules();
    process.env.TASE_API_KEY = 'test-key';
    // eslint-disable-next-line global-require
    const { fetchTaseQuoteFromApi } = require('./taseApi');

    mockAxios.get.mockResolvedValueOnce({
      data: {
        securitiesLastUpdate: { result: [{ securityLastPrice: null, securityPercentageChange: 'n/a' }], total: 1 }
      }
    });

    await expect(fetchTaseQuoteFromApi('1159250')).rejects.toThrow('non-numeric price/change');
  });
});
