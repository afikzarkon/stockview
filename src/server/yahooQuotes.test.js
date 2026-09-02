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

const {
  unwrapYahooNumber,
  fetchYahooAssetProfile,
  fetchYahooNews,
  fetchYahooSymbolSearch,
  fetchYahooSimilarCompanies,
  getYahooPayload
} = require('./yahooQuotes');

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

// fetchYahooNews's response shape below is trimmed from a real Yahoo
// search response for 'AAPL' captured during development (real news
// stories, real thumbnail/relatedTickers shape) - not invented.
describe('fetchYahooNews', () => {
  beforeEach(() => {
    mockAxios.get.mockReset();
  });

  const realYahooSearchResponse = {
    data: {
      explains: [],
      count: 2,
      quotes: [],
      news: [
        {
          uuid: '8e589e0f-9a52-3867-b1ca-e6c94ba71693',
          title: 'Apple and Meta Struggled in August But Which Looks Stronger in September?',
          publisher: '24/7 Wall St.',
          link: 'https://finance.yahoo.com/m/8e589e0f-9a52-3867-b1ca-e6c94ba71693/apple-and-meta-struggled-in.html',
          providerPublishTime: 1788273496,
          type: 'STORY',
          relatedTickers: ['META', 'AAPL']
        },
        {
          // Missing a link - real Yahoo responses sometimes omit fields;
          // this entry should be filtered out rather than shown as a
          // broken/unclickable news item.
          uuid: 'no-link-story',
          title: 'A story with no link',
          publisher: 'Nobody',
          providerPublishTime: 1788271200,
          relatedTickers: ['AAPL']
        }
      ]
    }
  };

  test('parses real news items and filters out ones missing a usable link', async () => {
    mockAxios.get.mockResolvedValueOnce(realYahooSearchResponse);
    const result = await fetchYahooNews('AAPL', 10);
    expect(result).toEqual([
      {
        uuid: '8e589e0f-9a52-3867-b1ca-e6c94ba71693',
        title: 'Apple and Meta Struggled in August But Which Looks Stronger in September?',
        publisher: '24/7 Wall St.',
        link: 'https://finance.yahoo.com/m/8e589e0f-9a52-3867-b1ca-e6c94ba71693/apple-and-meta-struggled-in.html',
        publishedAtEpoch: 1788273496,
        relatedTickers: ['META', 'AAPL']
      }
    ]);
  });

  test('passes q/newsCount/quotesCount params through to the search endpoint', async () => {
    mockAxios.get.mockResolvedValueOnce({ data: { news: [] } });
    await fetchYahooNews('MSFT', 5);
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://query1.finance.yahoo.com/v1/finance/search',
      expect.objectContaining({ params: { q: 'MSFT', newsCount: 5, quotesCount: 0 } })
    );
  });

  test('returns an empty array (not throwing) when the news field is missing', async () => {
    mockAxios.get.mockResolvedValueOnce({ data: {} });
    expect(await fetchYahooNews('AAPL')).toEqual([]);
  });
});

// fetchYahooSymbolSearch's response shape below is trimmed from a real
// Yahoo search response for 'apple' captured during development - includes
// a non-EQUITY-shaped entry-adjacent field set (REIT, foreign listing) to
// verify the EQUITY-only filter and the shortname/longname fallback.
describe('fetchYahooSymbolSearch', () => {
  beforeEach(() => {
    mockAxios.get.mockReset();
  });

  test('parses EQUITY quotes, preferring longname over shortname', async () => {
    mockAxios.get.mockResolvedValueOnce({
      data: {
        quotes: [
          { symbol: 'AAPL', shortname: 'Apple Inc.', longname: 'Apple Inc.', exchDisp: 'NASDAQ', quoteType: 'EQUITY' },
          { symbol: 'APLE', shortname: 'Apple Hospitality REIT, Inc.', exchDisp: 'NYSE', quoteType: 'EQUITY' },
          // Not EQUITY - should be filtered out (e.g. a fund/ETF/crypto match)
          { symbol: 'AAPL.SOME-INDEX', shortname: 'Some Index', exchDisp: 'INDX', quoteType: 'INDEX' }
        ]
      }
    });

    const result = await fetchYahooSymbolSearch('apple', 8);
    expect(result).toEqual([
      { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ' },
      { symbol: 'APLE', name: 'Apple Hospitality REIT, Inc.', exchange: 'NYSE' }
    ]);
  });

  test('passes q/quotesCount params through, with newsCount 0', async () => {
    mockAxios.get.mockResolvedValueOnce({ data: { quotes: [] } });
    await fetchYahooSymbolSearch('tesla', 5);
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://query1.finance.yahoo.com/v1/finance/search',
      expect.objectContaining({ params: { q: 'tesla', newsCount: 0, quotesCount: 5 } })
    );
  });

  test('returns an empty array (not throwing) when the quotes field is missing', async () => {
    mockAxios.get.mockResolvedValueOnce({ data: {} });
    expect(await fetchYahooSymbolSearch('xyz')).toEqual([]);
  });
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

// fetchYahooFundamentalsTimeseries hits a completely different endpoint
// (ws/fundamentals-timeseries, not v10/finance/quoteSummary) that Yahoo
// Finance's own site currently uses for its Financials tab. The response
// shape below is trimmed from a real KO request made during development -
// confirmed to genuinely return 4 years of populated data, unlike
// quoteSummary's balanceSheetHistory/incomeStatementHistory modules (dates
// only, no actual figures for the same ticker).
describe('fetchYahooFundamentalsTimeseries', () => {
  let fetchYahooFundamentalsTimeseriesFresh;

  beforeEach(() => {
    jest.resetModules();
    mockAxios.get.mockReset();
    // eslint-disable-next-line global-require
    fetchYahooFundamentalsTimeseriesFresh = require('./yahooQuotes').fetchYahooFundamentalsTimeseries;
  });

  const realKoFundamentalsResponse = {
    data: {
      timeseries: {
        result: [
          {
            meta: { symbol: ['KO'], type: ['annualDilutedEPS'] },
            annualDilutedEPS: [
              { asOfDate: '2022-12-31', reportedValue: { raw: 2.19, fmt: '2.19' } },
              { asOfDate: '2023-12-31', reportedValue: { raw: 2.47, fmt: '2.47' } },
              null, // Yahoo intersperses null placeholders for periods with no reported value
              { asOfDate: '2025-12-31', reportedValue: { raw: 3.04, fmt: '3.04' } }
            ]
          },
          {
            meta: { symbol: ['KO'], type: ['annualEBIT'] },
            annualEBIT: [
              { asOfDate: '2022-12-31', reportedValue: { raw: 12570000000, fmt: '12.57B' } },
              { asOfDate: '2025-12-31', reportedValue: { raw: 17650000000, fmt: '17.65B' } }
            ]
          }
        ],
        error: null
      }
    }
  };

  test('parses each type into a sorted, cleaned {date, value}[] series', async () => {
    mockAxios.get.mockResolvedValueOnce(realKoFundamentalsResponse);
    const result = await fetchYahooFundamentalsTimeseriesFresh('KO');
    expect(result.annualDilutedEPS).toEqual([
      { date: '2022-12-31', value: 2.19 },
      { date: '2023-12-31', value: 2.47 },
      { date: '2025-12-31', value: 3.04 }
    ]);
    expect(result.annualEBIT).toEqual([
      { date: '2022-12-31', value: 12570000000 },
      { date: '2025-12-31', value: 17650000000 }
    ]);
  });

  test('passes the requested types joined by comma, plus period1/period2', async () => {
    mockAxios.get.mockResolvedValueOnce({ data: { timeseries: { result: [] } } });
    await fetchYahooFundamentalsTimeseriesFresh('KO');
    const call = mockAxios.get.mock.calls[0];
    expect(call[0]).toBe('https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/KO');
    // Not asserting the exact joined string (it's grown to 20+ types for
    // the phase-2 visualizations - see FUNDAMENTALS_TIMESERIES_TYPES) -
    // just that every original type is still requested, comma-joined.
    const requestedTypes = call[1].params.type.split(',');
    ['annualDilutedEPS', 'annualEBIT', 'annualInvestedCapital', 'annualNetIncome', 'annualTotalAssets'].forEach((t) =>
      expect(requestedTypes).toContain(t)
    );
    expect(call[1].params.period1).toBeLessThan(call[1].params.period2);
  });

  test('returns an empty object (not throwing) when the result field is missing', async () => {
    mockAxios.get.mockResolvedValueOnce({ data: {} });
    expect(await fetchYahooFundamentalsTimeseriesFresh('NODATA')).toEqual({});
  });
});

// fetchYahooSimilarCompanies hits yet another distinct Yahoo endpoint
// (v6/finance/recommendationsbysymbol, not quoteSummary or fundamentals-
// timeseries) - confirmed during development to need no crumb/cookie at
// all (a plain unauthenticated request against the real endpoint
// succeeded). The response shape below is real, captured for AAPL.
describe('fetchYahooSimilarCompanies', () => {
  beforeEach(() => {
    mockAxios.get.mockReset();
  });

  test('parses the recommendedSymbols list into {symbol, score} pairs', async () => {
    mockAxios.get.mockResolvedValueOnce({
      data: {
        finance: {
          result: [
            {
              symbol: 'AAPL',
              recommendedSymbols: [
                { symbol: 'AMZN', score: 0.185963 },
                { symbol: 'TSLA', score: 0.175216 },
                { symbol: 'GOOG', score: 0.163872 }
              ]
            }
          ],
          error: null
        }
      }
    });
    const result = await fetchYahooSimilarCompanies('AAPL');
    expect(result).toEqual([
      { symbol: 'AMZN', score: 0.185963 },
      { symbol: 'TSLA', score: 0.175216 },
      { symbol: 'GOOG', score: 0.163872 }
    ]);
  });

  test('calls the correct URL with no crumb/auth params', async () => {
    mockAxios.get.mockResolvedValueOnce({ data: { finance: { result: [] } } });
    await fetchYahooSimilarCompanies('AAPL');
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://query1.finance.yahoo.com/v6/finance/recommendationsbysymbol/AAPL',
      expect.not.objectContaining({ params: expect.anything() })
    );
  });

  test('returns an empty array (not throwing) when recommendedSymbols is missing', async () => {
    mockAxios.get.mockResolvedValueOnce({ data: { finance: { result: [] } } });
    expect(await fetchYahooSimilarCompanies('NODATA')).toEqual([]);
  });
});

// fetchYahooStockResearch combines a 7-module quoteSummary call, a
// fundamentals-timeseries call, and a recommendationsbysymbol call for the
// stock research scorecard (see src/utils/stockScorecard.js). The
// quoteSummary response shape below is trimmed from real KO/AAPL calls
// made during development - notably confirms financialData's ratios
// (currentRatio, debtToEquity, returnOnEquity, ...) are populated even
// though balanceSheetHistory/incomeStatementHistory (deliberately NOT
// requested here) turned out to return empty statement shells for the
// same ticker.
describe('fetchYahooStockResearch', () => {
  let fetchYahooStockResearchFresh;

  beforeEach(() => {
    // Same resetModules reasoning as fetchYahooDividendSummary above.
    jest.resetModules();
    mockAxios.get.mockReset();
    // eslint-disable-next-line global-require
    fetchYahooStockResearchFresh = require('./yahooQuotes').fetchYahooStockResearch;
  });

  const realKoQuoteSummaryResponse = {
    data: {
      quoteSummary: {
        result: [
          {
            summaryDetail: { trailingPE: 26.627628, forwardPE: 25.144766 },
            defaultKeyStatistics: {
              pegRatio: 4.32,
              priceToBook: 10.474943,
              heldPercentInsiders: 0.098950006,
              heldPercentInstitutions: 0.68364996,
              beta: 0.55,
              sharesOutstanding: 4300000000
            },
            financialData: {
              currentPrice: 88,
              targetMeanPrice: 94.69565,
              currentRatio: 1.305,
              debtToEquity: 115.519,
              returnOnEquity: 0.42054,
              returnOnAssets: 0.09401,
              operatingCashflow: 16341999616,
              totalDebt: 44260999168,
              earningsGrowth: 0.169,
              revenueGrowth: 0.067
            },
            earningsTrend: {
              trend: [
                { period: '0q', growth: 0.0719 },
                { period: '+1y', growth: 0.0681 }
              ]
            },
            insiderHolders: {
              holders: [
                { name: 'A', relation: 'Officer', transactionDescription: 'Sale' },
                { name: 'B', relation: 'Officer', transactionDescription: 'Sale' },
                { name: 'C', relation: 'Officer', transactionDescription: 'Purchase at price 85' },
                { name: 'D', relation: 'Officer', transactionDescription: 'Stock Award(Grant)' }
              ]
            },
            institutionOwnership: {
              ownershipList: [
                { organization: 'Berkshire Hathaway, Inc', pctHeld: 0.093 },
                { organization: 'Blackrock Inc.', pctHeld: 0.075 }
              ]
            },
            // Real AAPL assetProfile shape captured during development -
            // note the doubled internal whitespace in the officer name,
            // a genuine Yahoo data quirk, not a typo here.
            assetProfile: {
              sector: 'Consumer Defensive',
              industry: 'Beverages—Non-Alcoholic',
              website: 'https://www.coca-colacompany.com',
              longBusinessSummary: 'The Coca-Cola Company manufactures beverages worldwide.',
              fullTimeEmployees: 79100,
              city: 'Atlanta',
              country: 'United States',
              companyOfficers: [
                { name: 'Mr. James  Quincey', title: 'Chairman & CEO', age: 60, totalPay: { raw: 18500000, fmt: '18.5M' } },
                { name: 'Mr. John  Murphy', title: 'President & CFO', age: 56 } // no totalPay - some officers don't have it
              ]
            },
            // Real KO insiderTransactions shape captured during
            // development - deliberately listed OUT of date order here to
            // exercise the most-recent-first sort in fetchYahooStockResearch.
            insiderTransactions: {
              transactions: [
                {
                  filerName: 'ORTEGA LUISA',
                  filerRelation: 'Divisional Officer',
                  transactionText: 'Sale at price 86.55 - 86.67 per share.',
                  shares: { raw: 55755, fmt: '55.76k' },
                  value: { raw: 4827894, fmt: '4.83M' },
                  startDate: { raw: 1785974400, fmt: '2026-08-06' }
                },
                {
                  filerName: 'QUAN NANCY W',
                  filerRelation: 'Officer',
                  transactionText: 'Sale at price 90.39 per share.',
                  shares: { raw: 50000, fmt: '50k' },
                  value: { raw: 4519260, fmt: '4.52M' },
                  startDate: { raw: 1787097600, fmt: '2026-08-19' }
                }
              ]
            }
          }
        ]
      }
    }
  };

  const realKoFundamentalsResponse = {
    data: {
      timeseries: {
        result: [
          {
            meta: { symbol: ['KO'], type: ['annualDilutedEPS'] },
            annualDilutedEPS: [
              { asOfDate: '2022-12-31', reportedValue: { raw: 2.19, fmt: '2.19' } },
              { asOfDate: '2025-12-31', reportedValue: { raw: 3.04, fmt: '3.04' } }
            ]
          }
        ],
        error: null
      }
    }
  };

  const realSimilarCompaniesResponse = {
    data: {
      finance: {
        result: [{ symbol: 'KO', recommendedSymbols: [{ symbol: 'PEP', score: 0.19 }, { symbol: 'KDP', score: 0.15 }] }],
        error: null
      }
    }
  };

  // v8/finance/chart shape for the Price History branch - same endpoint
  // fetchYahooHistoricalCloses already uses elsewhere, timestamps are UTC
  // seconds.
  const realPriceHistoryResponse = {
    data: {
      chart: {
        result: [
          {
            timestamp: [1704499200, 1704585600],
            indicators: { quote: [{ close: [58.5, 59.1] }] }
          }
        ]
      }
    }
  };

  // v7/finance/quote batch shape for the peer-PE fetch.
  const realPeerQuotesResponse = {
    data: {
      quoteResponse: {
        result: [
          { symbol: 'PEP', trailingPE: 18.3 },
          { symbol: 'KDP', trailingPE: 21.7 }
        ]
      }
    }
  };

  // Mocks by URL rather than call order - Promise.all's branches all go
  // through an async getYahooCrumbAndCookie() (or, for similar companies /
  // price history, straight to axios.get) before their request fires, so
  // relying on mockResolvedValueOnce call order would be fragile.
  function mockAllEndpoints({
    quoteSummary = realKoQuoteSummaryResponse,
    fundamentals = realKoFundamentalsResponse,
    similarCompanies = realSimilarCompaniesResponse,
    priceHistory = realPriceHistoryResponse,
    peerQuotes = realPeerQuotesResponse
  } = {}) {
    mockAxios.get.mockImplementation((url) => {
      if (url.includes('quoteSummary')) return Promise.resolve(quoteSummary);
      if (url.includes('fundamentals-timeseries')) return Promise.resolve(fundamentals);
      if (url.includes('recommendationsbysymbol')) return Promise.resolve(similarCompanies);
      if (url.includes('v7/finance/quote')) return Promise.resolve(peerQuotes);
      if (url.includes('v8/finance/chart')) return Promise.resolve(priceHistory);
      return Promise.resolve({ data: {} });
    });
  }

  test('extracts value/growth/health/ownership fields from the combined response', async () => {
    mockAllEndpoints();
    const result = await fetchYahooStockResearchFresh('KO');

    expect(result.trailingPE).toBe(26.627628);
    expect(result.pegRatio).toBe(4.32);
    expect(result.priceToBook).toBe(10.474943);
    expect(result.earningsGrowth).toBe(0.169);
    expect(result.revenueGrowth).toBe(0.067);
    expect(result.nextYearEarningsGrowth).toBe(0.0681); // from the '+1y' trend entry, not '0q'
    expect(result.currentRatio).toBe(1.305);
    expect(result.debtToEquity).toBe(115.519);
    expect(result.returnOnEquity).toBe(0.42054);
    expect(result.heldPercentInsiders).toBe(0.098950006);
    expect(result.heldPercentInstitutions).toBe(0.68364996);
  });

  test('counts insider sale vs purchase transaction descriptions, ignoring grants', async () => {
    mockAllEndpoints();
    const result = await fetchYahooStockResearchFresh('KO');
    expect(result.insiderRecentSales).toBe(2);
    expect(result.insiderRecentPurchases).toBe(1);
  });

  test('takes the top 5 institutional holders with org name and % held', async () => {
    mockAllEndpoints();
    const result = await fetchYahooStockResearchFresh('KO');
    expect(result.topInstitutionalHolders).toEqual([
      { organization: 'Berkshire Hathaway, Inc', pctHeld: 0.093 },
      { organization: 'Blackrock Inc.', pctHeld: 0.075 }
    ]);
  });

  test('includes fundamentalsHistory from the fundamentals-timeseries call', async () => {
    mockAllEndpoints();
    const result = await fetchYahooStockResearchFresh('KO');
    expect(result.fundamentalsHistory.annualDilutedEPS).toEqual([
      { date: '2022-12-31', value: 2.19 },
      { date: '2025-12-31', value: 3.04 }
    ]);
  });

  test('extracts companyProfile from assetProfile, collapsing doubled whitespace in officer names', async () => {
    mockAllEndpoints();
    const result = await fetchYahooStockResearchFresh('KO');
    expect(result.companyProfile.sector).toBe('Consumer Defensive');
    expect(result.companyProfile.industry).toBe('Beverages—Non-Alcoholic');
    expect(result.companyProfile.website).toBe('https://www.coca-colacompany.com');
    expect(result.companyProfile.fullTimeEmployees).toBe(79100);
    expect(result.companyProfile.companyOfficers).toEqual([
      { name: 'Mr. James Quincey', title: 'Chairman & CEO', age: 60, totalPay: 18500000 },
      { name: 'Mr. John Murphy', title: 'President & CFO', age: 56, totalPay: null }
    ]);
  });

  test('includes similarCompanies from the recommendationsbysymbol call', async () => {
    mockAllEndpoints();
    const result = await fetchYahooStockResearchFresh('KO');
    expect(result.similarCompanies).toEqual([
      { symbol: 'PEP', score: 0.19 },
      { symbol: 'KDP', score: 0.15 }
    ]);
  });

  test('extracts beta and sharesOutstanding for the DCF model', async () => {
    mockAllEndpoints();
    const result = await fetchYahooStockResearchFresh('KO');
    expect(result.beta).toBe(0.55);
    expect(result.sharesOutstanding).toBe(4300000000);
  });

  test('extracts insiderTransactions sorted most-recent-first', async () => {
    mockAllEndpoints();
    const result = await fetchYahooStockResearchFresh('KO');
    expect(result.insiderTransactions).toEqual([
      {
        filerName: 'QUAN NANCY W',
        filerRelation: 'Officer',
        transactionText: 'Sale at price 90.39 per share.',
        shares: 50000,
        value: 4519260,
        startDateEpoch: 1787097600
      },
      {
        filerName: 'ORTEGA LUISA',
        filerRelation: 'Divisional Officer',
        transactionText: 'Sale at price 86.55 - 86.67 per share.',
        shares: 55755,
        value: 4827894,
        startDateEpoch: 1785974400
      }
    ]);
  });

  test('includes priceHistory as {date, close} points from the chart endpoint', async () => {
    mockAllEndpoints();
    const result = await fetchYahooStockResearchFresh('KO');
    expect(result.priceHistory).toEqual([
      { date: '2024-01-06', close: 58.5 },
      { date: '2024-01-07', close: 59.1 }
    ]);
  });

  test('includes peerQuotes (trailing P/E) for the similar-companies symbols', async () => {
    mockAllEndpoints();
    const result = await fetchYahooStockResearchFresh('KO');
    expect(result.peerQuotes).toEqual([
      { symbol: 'PEP', trailingPE: 18.3 },
      { symbol: 'KDP', trailingPE: 21.7 }
    ]);
  });

  test('requests the widened set of fundamentals-timeseries types (revenue, balance sheet, free cash flow)', async () => {
    mockAllEndpoints();
    await fetchYahooStockResearchFresh('KO');
    const fundamentalsCall = mockAxios.get.mock.calls.find(([url]) => url.includes('fundamentals-timeseries'));
    const requestedTypes = fundamentalsCall[1].params.type.split(',');
    ['annualTotalRevenue', 'annualFreeCashFlow', 'annualStockholdersEquity', 'annualCurrentAssets'].forEach((t) =>
      expect(requestedTypes).toContain(t)
    );
  });

  test('skips the peer-quotes HTTP call entirely when there are no similar companies', async () => {
    mockAllEndpoints({ similarCompanies: { data: { finance: { result: [{ symbol: 'KO', recommendedSymbols: [] }] } } } });
    const result = await fetchYahooStockResearchFresh('KO');
    expect(result.peerQuotes).toEqual([]);
    expect(mockAxios.get.mock.calls.some(([url]) => url.includes('v7/finance/quote'))).toBe(false);
  });

  test('degrades gracefully to empty fundamentalsHistory/similarCompanies/priceHistory (not a thrown error) if those fetches fail', async () => {
    mockAxios.get.mockImplementation((url) => {
      if (url.includes('quoteSummary')) return Promise.resolve(realKoQuoteSummaryResponse);
      if (url.includes('fundamentals-timeseries')) return Promise.reject(new Error('endpoint down'));
      if (url.includes('recommendationsbysymbol')) return Promise.reject(new Error('endpoint down too'));
      if (url.includes('v8/finance/chart')) return Promise.reject(new Error('endpoint down too'));
      return Promise.resolve({ data: {} });
    });
    const result = await fetchYahooStockResearchFresh('KO');
    expect(result.fundamentalsHistory).toEqual({});
    expect(result.similarCompanies).toEqual([]);
    expect(result.priceHistory).toEqual([]);
    expect(result.peerQuotes).toEqual([]); // no similar companies -> nothing to look up
    expect(result.trailingPE).toBe(26.627628); // the rest of the research still comes through
  });

  test('degrades gracefully to empty peerQuotes if the peer-quotes fetch itself fails (but similar companies succeeded)', async () => {
    mockAxios.get.mockImplementation((url) => {
      if (url.includes('quoteSummary')) return Promise.resolve(realKoQuoteSummaryResponse);
      if (url.includes('fundamentals-timeseries')) return Promise.resolve(realKoFundamentalsResponse);
      if (url.includes('recommendationsbysymbol')) return Promise.resolve(realSimilarCompaniesResponse);
      if (url.includes('v7/finance/quote')) return Promise.reject(new Error('endpoint down'));
      return Promise.resolve({ data: {} });
    });
    const result = await fetchYahooStockResearchFresh('KO');
    expect(result.similarCompanies).toEqual([
      { symbol: 'PEP', score: 0.19 },
      { symbol: 'KDP', score: 0.15 }
    ]);
    expect(result.peerQuotes).toEqual([]);
  });

  test('returns nulls/empty arrays (not throwing) when every module is missing', async () => {
    mockAllEndpoints({
      quoteSummary: { data: { quoteSummary: { result: [{}] } } },
      fundamentals: { data: {} },
      similarCompanies: { data: {} }
    });
    const result = await fetchYahooStockResearchFresh('NODATA');
    expect(result.trailingPE).toBeNull();
    expect(result.currentRatio).toBeNull();
    expect(result.insiderRecentSales).toBe(0);
    expect(result.insiderRecentPurchases).toBe(0);
    expect(result.topInstitutionalHolders).toEqual([]);
    expect(result.fundamentalsHistory).toEqual({});
    expect(result.companyProfile).toEqual({
      sector: null,
      industry: null,
      website: null,
      longBusinessSummary: null,
      fullTimeEmployees: null,
      city: null,
      country: null,
      companyOfficers: []
    });
    expect(result.similarCompanies).toEqual([]);
    expect(result.beta).toBeNull();
    expect(result.sharesOutstanding).toBeNull();
    expect(result.insiderTransactions).toEqual([]);
    expect(result.peerQuotes).toEqual([]); // no similar companies -> nothing to look up
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
