import { buildNewsFeed } from './newsFeed';

const toEpoch = (dateStr) => Math.floor(new Date(`${dateStr}T00:00:00Z`).getTime() / 1000);

describe('buildNewsFeed', () => {
  test('sorts combined stories by recency, newest first', () => {
    const newsBySymbol = {
      AAPL: [
        { uuid: 'old', title: 'Old story', publisher: 'X', link: 'https://x/old', publishedAtEpoch: toEpoch('2024-01-01') }
      ],
      MSFT: [
        { uuid: 'new', title: 'New story', publisher: 'Y', link: 'https://x/new', publishedAtEpoch: toEpoch('2024-06-01') }
      ]
    };
    const feed = buildNewsFeed(newsBySymbol);
    expect(feed.map((s) => s.uuid)).toEqual(['new', 'old']);
    expect(feed[0].date).toBe('2024-06-01');
  });

  test('dedupes a story that appears under multiple symbols, merging relatedSymbols', () => {
    const sharedStory = { uuid: 'shared', title: 'Meta/Apple story', publisher: 'X', link: 'https://x/shared', publishedAtEpoch: toEpoch('2024-01-01') };
    const newsBySymbol = {
      AAPL: [sharedStory],
      META: [sharedStory]
    };
    const feed = buildNewsFeed(newsBySymbol);
    expect(feed).toHaveLength(1);
    expect(feed[0].relatedSymbols.sort()).toEqual(['AAPL', 'META']);
  });

  test('respects the limit', () => {
    const newsBySymbol = {
      AAPL: Array.from({ length: 30 }, (_, i) => ({
        uuid: `story-${i}`,
        title: `Story ${i}`,
        publisher: 'X',
        link: `https://x/${i}`,
        publishedAtEpoch: toEpoch('2024-01-01') + i
      }))
    };
    expect(buildNewsFeed(newsBySymbol, 5)).toHaveLength(5);
  });

  test('skips malformed entries (no uuid) without throwing', () => {
    const newsBySymbol = { AAPL: [{ title: 'no uuid', publisher: 'X', link: 'https://x' }] };
    expect(buildNewsFeed(newsBySymbol)).toEqual([]);
  });

  test('handles missing/empty input without throwing', () => {
    expect(buildNewsFeed({})).toEqual([]);
    expect(buildNewsFeed(null)).toEqual([]);
    expect(buildNewsFeed({ AAPL: null })).toEqual([]);
  });
});
