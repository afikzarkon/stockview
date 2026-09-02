// Merges per-symbol news (server/newsRoutes.js, via useStockNews) into one
// combined, deduplicated, recency-sorted feed. Pure function, separate
// from the fetching hook, so it's independently testable.
import { formatEpochDateISO } from './analystData';

// A single story can mention several portfolio tickers and so shows up
// under each of their symbol buckets - deduped by uuid (Yahoo's own story
// id) so it only appears once in the combined feed, regardless of how many
// of the user's holdings it was returned under.
export const buildNewsFeed = (newsBySymbol, limit = 20) => {
  const byUuid = new Map();
  Object.entries(newsBySymbol || {}).forEach(([symbol, items]) => {
    (items || []).forEach((item) => {
      if (!item || !item.uuid) return;
      const existing = byUuid.get(item.uuid);
      if (existing) {
        if (!existing.relatedSymbols.includes(symbol)) existing.relatedSymbols.push(symbol);
        return;
      }
      byUuid.set(item.uuid, {
        uuid: item.uuid,
        title: item.title,
        publisher: item.publisher,
        link: item.link,
        publishedAtEpoch: item.publishedAtEpoch,
        date: formatEpochDateISO(item.publishedAtEpoch),
        relatedSymbols: [symbol]
      });
    });
  });

  return [...byUuid.values()]
    .sort((a, b) => (b.publishedAtEpoch || 0) - (a.publishedAtEpoch || 0))
    .slice(0, limit);
};
