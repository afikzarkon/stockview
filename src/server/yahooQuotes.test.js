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

const { unwrapYahooNumber, fetchYahooAssetProfile, getYahooPayload } = require('./yahooQuotes');

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

// fetchYahooDividendSummary parses both dividend AND earnings-date fields
// out of one quoteSummary response (see the "why" comment on the function
// itself in yahooQuotes.js). The response shape below is captured from a
// real KO (Coca-Cola) quoteSummary call made during development, not
// invented - real Yahoo responses nest fields in ways that are easy to get
// wrong from memory (e.g. dividendYield is a fraction, but
// fiveYearAvgDividendYield in the same module is already a percent).
describe('fetchYahooDividendSummary', () => {
  let fetchYahooDividendSummaryFresh;

  beforeEach(() => {
    // Same reasoning as the 429-handling describe block above: resetModules
    // gives a clean module graph (and re-runs the './yahooCrumb' mock
    // factory, restoring its .mockResolvedValue) instead of reusing
    // whichever stale instance an earlier describe block's resetModules()
    // call left cached.
    jest.resetModules();
    mockAxios.get.mockReset();
    // eslint-disable-next-line global-require
    fetchYahooDividendSummaryFresh = require('./yahooQuotes').fetchYahooDividendSummary;
  });

  const realKoQuoteSummaryResponse = {
    data: {
      quoteSummary: {
        result: [
          {
            summaryDetail: {
              dividendRate: 2.12,
              dividendYield: 0.023599999,
              exDividendDate: 1789430400,
              payoutRatio: 0.6246,
              fiveYearAvgDividendYield: 2.87 // deliberately not used - already a percent, unlike dividendYield above
            },
            calendarEvents: {
              earnings: {
                earningsDate: [1792499400],
                earningsCallDate: [1785241800],
                isEarningsDateEstimate: false,
                earningsAverage: 0.87893,
                earningsLow: 0.85077,
                earningsHigh: 0.89022,
                revenueAverage: 12901487840,
                revenueLow: 12813800000,
                revenueHigh: 13029000000
              },
              exDividendDate: 1789430400,
              dividendDate: 1790812800
            }
          }
        ]
      }
    }
  };

  test('parses dividend fields, converting dividendYield from a fraction to a percent', async () => {
    mockAxios.get.mockResolvedValueOnce(realKoQuoteSummaryResponse);
    const result = await fetchYahooDividendSummaryFresh('KO');
    expect(result.dividendRate).toBe(2.12);
    expect(result.dividendYieldPercent).toBeCloseTo(2.36, 2); // 0.0236 -> 2.36, not 0.0236
    expect(result.payoutRatio).toBe(0.6246);
    expect(result.exDividendDateEpoch).toBe(1789430400);
    expect(result.nextDividendDateEpoch).toBe(1790812800);
  });

  test('parses earnings fields, taking the first entry of the earningsDate array', async () => {
    mockAxios.get.mockResolvedValueOnce(realKoQuoteSummaryResponse);
    const result = await fetchYahooDividendSummaryFresh('KO');
    expect(result.earningsDateEpoch).toBe(1792499400);
    expect(result.isEarningsDateEstimate).toBe(false);
    expect(result.epsEstimateAverage).toBeCloseTo(0.87893, 5);
    expect(result.revenueEstimateAverage).toBe(12901487840);
  });

  test('returns nulls (not throwing) when summaryDetail/calendarEvents/earnings are all missing', async () => {
    mockAxios.get.mockResolvedValueOnce({ data: { quoteSummary: { result: [{}] } } });
    const result = await fetchYahooDividendSummaryFresh('NODATA');
    expect(result).toEqual({
      dividendRate: null,
      dividendYieldPercent: null,
      payoutRatio: null,
      exDividendDateEpoch: null,
      nextDividendDateEpoch: null,
      earningsDateEpoch: null,
      isEarningsDateEstimate: null,
      epsEstimateAverage: null,
      revenueEstimateAverage: null
    });
  });
});

// Regression tests for a real production bug: getYahooPayload used to
// trust meta.regularMarketChangePercent / changePercent /
// regularMarketChange / change when present, blindly multiplying whatever
// it found by 100. regularMarketChange/change are absolute currency
// amounts (not percentages), and even the *ChangePercent fields' scale
// wasn't consistent - so when Yahoo's v8 chart response happened to
// include one of these (they're often absent entirely, per real sample
// responses), the computed "change %" had no real relationship to the
// actual daily move. Fixed by always computing the % change directly from
// two unambiguous prices (regularMarketPrice vs previousClose).
describe('getYahooPayload change-percent calculation', () => {
  beforeEach(() => {
    mockAxios.get.mockReset();
  });

  const chartResponse = (meta) => ({ data: { chart: { result: [{ meta }] } } });

  test('computes change % directly from regularMarketPrice vs previousClose when no change fields are present (the common real-world case)', async () => {
    mockAxios.get.mockResolvedValueOnce(
      chartResponse({ regularMarketPrice: 114.28, previousClose: 115.26 })
    );
    const result = await getYahooPayload('TEST_SYMBOL_1');
    expect(result.currentPrice).toBe(114.28);
    expect(result.changePercent).toBeCloseTo(((114.28 - 115.26) / 115.26) * 100, 5);
  });

  test('ignores a misleading regularMarketChange field (an absolute currency amount, not a percent) - the exact bug that was in production', async () => {
    // regularMarketChange here is -3.42 (dollars), which the old buggy
    // code would have multiplied by 100 to get a nonsensical -342%.
    mockAxios.get.mockResolvedValueOnce(
      chartResponse({
        regularMarketPrice: 100,
        previousClose: 103.42,
        regularMarketChange: -3.42
      })
    );
    const result = await getYahooPayload('TEST_SYMBOL_2');
    // Correct answer, computed only from the two prices:
    expect(result.changePercent).toBeCloseTo(((100 - 103.42) / 103.42) * 100, 5);
    expect(result.changePercent).not.toBeCloseTo(-342, 0); // the old bug's output
  });

  test('ignores a misleading regularMarketChangePercent field of ambiguous scale - same fix covers this shape too', async () => {
    mockAxios.get.mockResolvedValueOnce(
      chartResponse({
        regularMarketPrice: 100,
        previousClose: 101.42,
        regularMarketChangePercent: -1.42 // could be a fraction or already a percent - ambiguous either way
      })
    );
    const result = await getYahooPayload('TEST_SYMBOL_3');
    expect(result.changePercent).toBeCloseTo(((100 - 101.42) / 101.42) * 100, 5);
  });

  test('falls back to chartPreviousClose when previousClose is missing', async () => {
    mockAxios.get.mockResolvedValueOnce(
      chartResponse({ regularMarketPrice: 50, chartPreviousClose: 49 })
    );
    const result = await getYahooPayload('TEST_SYMBOL_4');
    expect(result.changePercent).toBeCloseTo(((50 - 49) / 49) * 100, 5);
  });

  test('missing both previousClose fields yields changePercent 0, not NaN/undefined', async () => {
    mockAxios.get.mockResolvedValueOnce(chartResponse({ regularMarketPrice: 50 }));
    const result = await getYahooPayload('TEST_SYMBOL_5');
    expect(result.currentPrice).toBe(50);
    expect(result.changePercent).toBe(0);
  });
});
