// Site-wide dark/light theme: persisted per-browser (not per-account - a
// device/display preference, not portfolio data), applied via a
// data-theme attribute on <html> so App.css's CSS custom properties (see
// the :root / :root[data-theme='light'] blocks) can react to it. Defaults
// to dark, per explicit product decision - this app's "real" look is the
// dark theme proven out on StockResearchView; light is the opt-out, not
// the default.

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'stockview_theme';

function readStoredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function useTheme() {
  const [theme, setTheme] = useState(readStoredTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore - theme just won't persist across reloads */
    }
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  return { theme, toggleTheme };
}
