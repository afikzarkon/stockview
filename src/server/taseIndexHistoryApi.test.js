jest.mock('axios');
const axios = require('axios');
const {
  fetchTaseIndexHistoricalCloses,
  TASE_INDEX_IDS,
  TASE_INDEX_HISTORY_URL
} = require('./taseIndexHistoryApi');

const page = (items, totalRec) => ({ data: { Items: items, TotalRec: totalRec } });
const row = (tradeDate, closeRate) => ({ TradeDate: tradeDate, CloseRate: closeRate });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('fetchTaseIndexHistoricalCloses', () => {
  test('posts to the INDEX endpoint, not the security one', async () => {
    axios.post.mockResolvedValueOnce(page([row('17/09/2026', 4164.35)], 1));
    await fetchTaseIndexHistoricalCloses(137, '2026-09-01');
    const [url] = axios.post.mock.calls[0];
    expect(url).toBe(TASE_INDEX_HISTORY_URL);
    expect(url).toContain('/api/index/historyeod');
  });

  // The security endpoint answers an index id with HTTP 200 and an empty
  // Items array - a silent empty result that reads as "this index has no
  // data" rather than "wrong endpoint". Hence the separate module.
  test('zero-pads the index id to the 8-digit oId the endpoint expects', async () => {
    axios.post.mockResolvedValueOnce(page([row('17/09/2026', 4164.35)], 1));
    await fetchTaseIndexHistoricalCloses(137, '2026-09-01');
    const [, body] = axios.post.mock.calls[0];
    expect(body.oId).toBe('00000137');
    expect(body.pType).toBe(6); // the three-year window
    expect(body.pageNum).toBe(1);
  });

  test('converts TASE dates to ISO and returns ascending {date, close}', async () => {
    axios.post.mockResolvedValueOnce(
      page([row('17/09/2026', 4164.35), row('16/09/2026', 4150.1), row('15/09/2026', 4100)], 3)
    );
    const points = await fetchTaseIndexHistoricalCloses(137, '2026-09-15');
    expect(points).toEqual([
      { date: '2026-09-15', close: 4100 },
      { date: '2026-09-16', close: 4150.1 },
      { date: '2026-09-17', close: 4164.35 }
    ]);
  });

  // An index LEVEL is a plain number, unlike a security's CloseRate which
  // this app treats as agorot. Dividing by 100 here would scale the whole
  // benchmark.
  test('passes the index level through without an agorot conversion', async () => {
    axios.post.mockResolvedValueOnce(page([row('17/09/2026', 4164.35)], 1));
    const [point] = await fetchTaseIndexHistoricalCloses(137, '2026-09-01');
    expect(point.close).toBe(4164.35);
  });

  test('pages backward until the requested from-date is reached', async () => {
    axios.post
      .mockResolvedValueOnce(page([row('17/09/2026', 300), row('10/09/2026', 290)], 4))
      .mockResolvedValueOnce(page([row('03/09/2026', 280), row('27/08/2026', 270)], 4));
    const points = await fetchTaseIndexHistoricalCloses(137, '2026-08-27');
    expect(axios.post).toHaveBeenCalledTimes(2);
    expect(points[0]).toEqual({ date: '2026-08-27', close: 270 });
    expect(points).toHaveLength(4);
  });

  test('stops once the server-reported total has been fetched', async () => {
    axios.post.mockResolvedValueOnce(page([row('17/09/2026', 300)], 1));
    // from-date far in the past: only TotalRec can end the loop here.
    const points = await fetchTaseIndexHistoricalCloses(137, '2000-01-01');
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(points).toHaveLength(1);
  });

  test('stops on an empty page rather than looping to the page cap', async () => {
    axios.post
      .mockResolvedValueOnce(page([row('17/09/2026', 300)], 999))
      .mockResolvedValueOnce(page([], 999));
    const points = await fetchTaseIndexHistoricalCloses(137, '2000-01-01');
    expect(axios.post).toHaveBeenCalledTimes(2);
    expect(points).toHaveLength(1);
  });

  // Number(null) is 0, not NaN - a missing rate has to be rejected on the
  // raw value or it is silently recorded as a zero close.
  test('drops rows with a missing close instead of recording a zero', async () => {
    axios.post.mockResolvedValueOnce(
      page([row('17/09/2026', 4164.35), row('16/09/2026', null), { TradeDate: '15/09/2026' }], 3)
    );
    const points = await fetchTaseIndexHistoricalCloses(137, '2026-09-15');
    expect(points).toEqual([{ date: '2026-09-17', close: 4164.35 }]);
  });

  test('drops rows with an unparseable date', async () => {
    axios.post.mockResolvedValueOnce(page([row('2026-09-17', 100), row('16/09/2026', 200)], 2));
    const points = await fetchTaseIndexHistoricalCloses(137, '2026-09-16');
    expect(points).toEqual([{ date: '2026-09-16', close: 200 }]);
  });

  // Pages are contiguous in practice, but a date appearing twice must
  // still collapse rather than produce two entries for one day.
  test('deduplicates a date appearing on two pages', async () => {
    axios.post
      .mockResolvedValueOnce(page([row('17/09/2026', 300), row('16/09/2026', 290)], 4))
      .mockResolvedValueOnce(page([row('16/09/2026', 290), row('15/09/2026', 280)], 4));
    const points = await fetchTaseIndexHistoricalCloses(137, '2026-09-15');
    expect(points.map((p) => p.date)).toEqual(['2026-09-15', '2026-09-16', '2026-09-17']);
  });

  test('returns an empty series rather than throwing when there is nothing', async () => {
    axios.post.mockResolvedValueOnce(page([], 0));
    await expect(fetchTaseIndexHistoricalCloses(137, '2026-09-01')).resolves.toEqual([]);
  });
});

describe('TASE_INDEX_IDS', () => {
  // Each id was confirmed against the live endpoint by matching that
  // index's latest close to the same index from an independent source.
  test('maps the four benchmark indices this app offers', () => {
    expect(TASE_INDEX_IDS).toEqual({ ta125: 137, ta35: 142, ta90: 143, taBanks: 164 });
  });
});
