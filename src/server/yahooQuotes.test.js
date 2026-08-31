/**
 * @jest-environment node
 */
// Regression test for a real bug: Yahoo's quoteSummary endpoint returns
// numeric fields either as a plain number (when formatted=false is
// respected) or as a { raw, fmt, longFmt } display-ready object. Treating
// the second shape as a plain number silently produced `null` for every
// analyst price target while recommendationKey (a plain string field)
// worked fine — exactly what showed up in production before this fix.
const mockAxios = { get: jest.fn() };
jest.mock('axios', () => mockAxios);
jest.mock('./yahooCrumb', () => ({
  getYahooCrumbAndCookie: jest.fn().mockResolvedValue({ crumb: 'test-crumb', cookie: 'test-cookie' }),
  invalidateYahooCrumb: jest.fn()
}));

const { unwrapYahooNumber, fetchYahooAssetProfile } = require('./yahooQuotes');

describe('unwrapYahooNumber', () => {
  test('passes through a plain finite number', () => {
    expect(unwrapYahooNumber(150.5)).toBe(150.5);
    expect(unwrapYahooNumber(0)).toBe(0);
  });

  test('unwraps the { raw, fmt } shape Yahoo uses when formatted=false is not honored', () => {
    expect(unwrapYahooNumber({ raw: 150.5, fmt: '150.50' })).toBe(150.5);
    expect(unwrapYahooNumber({ raw: 12, fmt: '12', longFmt: '12' })).toBe(12);
  });

  test('null/undefined input returns null', () => {
    expect(unwrapYahooNumber(null)).toBeNull();
    expect(unwrapYahooNumber(undefined)).toBeNull();
  });

  test('non-finite plain number returns null', () => {
    expect(unwrapYahooNumber(NaN)).toBeNull();
  });

  test('object without a finite raw value returns null rather than throwing', () => {
    expect(unwrapYahooNumber({})).toBeNull();
    expect(unwrapYahooNumber({ raw: null })).toBeNull();
    expect(unwrapYahooNumber({ fmt: '150.50' })).toBeNull(); // raw missing
  });

  test('string input (unexpected shape) returns null rather than a bogus value', () => {
    expect(unwrapYahooNumber('150.5')).toBeNull();
  });
});

// Regression test for a second real production bug: sectorRoutes.js and
// analystRoutes.js each resolve every US ticker in a portfolio via
// Promise.all, so a portfolio with several holdings fires many
// near-simultaneous quoteSummary requests and gets rate-limited by Yahoo
// (429) - seen in production logs as
// "[sectors] failed to resolve symbol ... status code 429" for every
// symbol at once.
describe('fetchYahooQuoteSummary 429 handling (via fetchYahooAssetProfile)', () => {
  const validQuoteSummaryResponse = {
    data: { quoteSummary: { result: [{ assetProfile: { sector: 'Technology', industry: 'Software' } }] } }
  };

  let fetchYahooAssetProfileFresh;

  beforeEach(() => {
    // The request-throttling queue in yahooQuotes.js is module-level
    // state (by design - it needs to serialize requests across every
    // caller, not just within one test). Re-requiring the module after
    // resetModules() gives each test a clean queue instead of chaining
    // onto whatever the previous test's queue was doing.
    jest.resetModules();
    mockAxios.get.mockReset();
    // eslint-disable-next-line global-require
    fetchYahooAssetProfileFresh = require('./yahooQuotes').fetchYahooAssetProfile;
  });

  test('retries once after a 429 and succeeds on the second attempt', async () => {
    const rateLimitError = { response: { status: 429 } };
    mockAxios.get.mockRejectedValueOnce(rateLimitError).mockResolvedValueOnce(validQuoteSummaryResponse);

    const result = await fetchYahooAssetProfileFresh('NVDA');

    expect(result).toEqual({ sector: 'Technology', industry: 'Software' });
    expect(mockAxios.get).toHaveBeenCalledTimes(2);
  }, 10000);

  test('a persistent 429 (fails twice) still surfaces as an error, not an infinite retry', async () => {
    const rateLimitError = { response: { status: 429 } };
    mockAxios.get.mockRejectedValue(rateLimitError);

    await expect(fetchYahooAssetProfileFresh('NVDA')).rejects.toBeTruthy();
    expect(mockAxios.get).toHaveBeenCalledTimes(2); // one initial attempt + exactly one retry
  }, 10000);

  test('a non-429/401/403 error propagates immediately without the 429 backoff delay', async () => {
    mockAxios.get.mockRejectedValue({ response: { status: 500 } });

    const start = Date.now();
    await expect(fetchYahooAssetProfileFresh('NVDA')).rejects.toBeTruthy();
    const elapsed = Date.now() - start;

    expect(mockAxios.get).toHaveBeenCalledTimes(1); // no retry attempted
    expect(elapsed).toBeLessThan(1000); // well under the 1500ms 429 backoff
  });

  test('two concurrent requests are paced through the shared queue even when both fail (not fired back-to-back)', async () => {
    // Regression test for a real bug in the queue itself: the spacing
    // delay was originally only applied after a *successful* request, so
    // a burst of failures (exactly what 429s look like) went through the
    // queue with no pacing at all - defeating the point of the queue for
    // the one case it exists to help with.
    mockAxios.get.mockRejectedValue({ response: { status: 500 } });

    const start = Date.now();
    await Promise.allSettled([fetchYahooAssetProfileFresh('NVDA'), fetchYahooAssetProfileFresh('PLTR')]);
    const elapsed = Date.now() - start;

    // Two requests through the queue = at least one spacing gap between
    // them (~350ms), so two near-instant local mock failures should still
    // take noticeably longer than either one alone.
    expect(elapsed).toBeGreaterThanOrEqual(300);
  }, 10000);
});
