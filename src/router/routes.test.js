import { ROUTES, NAV_GROUPS, keyForPath, pathForKey, routeByKey } from './routes';

describe('route table', () => {
  test('every route has a unique key and a unique path', () => {
    const keys = ROUTES.map((r) => r.key);
    const paths = ROUTES.map((r) => r.path);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(paths).size).toBe(paths.length);
  });

  test('every path is absolute, so a link is never resolved against the page it is on', () => {
    ROUTES.forEach((route) => expect(route.path.startsWith('/')).toBe(true));
  });

  test('every visible route appears in exactly one nav group', () => {
    const navKeys = NAV_GROUPS.flatMap((group) => group.keys);
    expect(new Set(navKeys).size).toBe(navKeys.length);
    ROUTES.filter((r) => !r.hidden).forEach((route) => {
      expect(navKeys).toContain(route.key);
    });
  });

  test('no nav group points at a route that does not exist', () => {
    const keys = ROUTES.map((r) => r.key);
    NAV_GROUPS.flatMap((g) => g.keys).forEach((key) => expect(keys).toContain(key));
  });

  // A hidden route is reached by an action rather than the sidebar, so it
  // must not show up as a dead entry in the nav.
  test('hidden routes are excluded from the nav', () => {
    const navKeys = NAV_GROUPS.flatMap((group) => group.keys);
    ROUTES.filter((r) => r.hidden).forEach((route) => {
      expect(navKeys).not.toContain(route.key);
    });
  });

  test('every route declares a label, a hint and an icon', () => {
    ROUTES.forEach((route) => {
      expect(route.label).toBeTruthy();
      expect(route.hint).toBeTruthy();
      expect(route.icon).toBeTruthy();
    });
  });
});

describe('keyForPath', () => {
  test('resolves each route path back to its own key', () => {
    ROUTES.forEach((route) => expect(keyForPath(route.path)).toBe(route.key));
  });

  test('ignores a trailing slash', () => {
    expect(keyForPath('/israeli-stocks/')).toBe('israeli-stocks');
    expect(keyForPath('/')).toBe('home');
    expect(keyForPath('')).toBe('home');
  });

  // A deeper path under a page belongs to that page rather than nowhere.
  test('resolves a sub-path to the page it sits under', () => {
    expect(keyForPath('/us-stocks/AAPL')).toBe('us-stocks');
  });

  // A stale bookmark should land somewhere usable, not on a blank page.
  test('falls back to home for an unknown path', () => {
    expect(keyForPath('/no-such-page')).toBe('home');
    expect(keyForPath(null)).toBe('home');
  });

  // "/" is a prefix of every path; treating it as one would make every
  // unknown path resolve through it by accident rather than by the
  // fallback above.
  test('does not treat the root path as a prefix of everything', () => {
    expect(keyForPath('/analytics')).toBe('analytics');
  });
});

describe('pathForKey / routeByKey', () => {
  test('round-trips every key through its path', () => {
    ROUTES.forEach((route) => expect(keyForPath(pathForKey(route.key))).toBe(route.key));
  });

  test('falls back to home for an unknown key rather than returning undefined', () => {
    expect(routeByKey('nonsense').key).toBe('home');
    expect(pathForKey('nonsense')).toBe('/');
  });
});
