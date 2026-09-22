// Chart colors, resolved per theme.
//
// Recharts renders SVG, and SVG presentation attributes (stroke, fill)
// cannot read CSS custom properties - `stroke="var(--sw-accent)"` simply
// does not paint. So chart colors have to be passed as literal values from
// JS, which is why they can't just live in App.css with everything else.
//
// They are hand-matched to the tokens in App.css's :root blocks. If a
// palette token changes there, its twin here has to change with it - that
// duplication is forced by the SVG limitation above, not a choice.
//
// Everything is derived from the theme string the app already tracks
// (useTheme), so a toggle re-renders the charts with the other set rather
// than leaving them painted for the theme that was active at mount.

const DARK = {
  accent: '#6366f1',
  accent2: '#3b82f6',
  benchmark: '#f59e0b',
  positive: '#10b981',
  negative: '#ef4444',
  // Barely there on purpose. A grid is a reading aid for the axis, not a
  // texture: at the old alpha a year of weekly points sat behind a visible
  // lattice, and the lattice was the busiest thing on the chart. This is
  // low enough to find a value against and to disappear otherwise.
  grid: 'rgba(255, 255, 255, 0.055)',
  axis: '#a1a1aa',
  tooltipBg: 'rgba(9, 9, 11, 0.88)',
  tooltipBorder: 'rgba(255, 255, 255, 0.14)',
  tooltipText: '#fafafa',
  // Categorical series: distinct in hue AND in lightness, so they stay
  // separable in greyscale and to the most common color deficiencies -
  // a pie chart of ten sectors is unreadable otherwise.
  categorical: [
    '#6366f1',
    '#f59e0b',
    '#10b981',
    '#22d3ee',
    '#ef4444',
    '#a855f7',
    '#14b8a6',
    '#fb923c',
    '#64748b',
    '#ec4899'
  ]
};

const LIGHT = {
  ...DARK,
  accent: '#4f46e5',
  accent2: '#2563eb',
  benchmark: '#d97706',
  positive: '#047857',
  negative: '#dc2626',
  grid: 'rgba(15, 23, 42, 0.05)',
  axis: '#64748b',
  tooltipBg: 'rgba(255, 255, 255, 0.96)',
  tooltipBorder: '#e2e8f0',
  tooltipText: '#0f172a',
  categorical: [
    '#4f46e5',
    '#d97706',
    '#047857',
    '#0891b2',
    '#dc2626',
    '#9333ea',
    '#0d9488',
    '#ea580c',
    '#475569',
    '#db2777'
  ]
};

export const getChartTheme = (theme) => (theme === 'light' ? LIGHT : DARK);

// Shared Recharts <Tooltip> styling: a glass panel matching the app's
// cards, instead of Recharts' default white box - which is invisible
// against a light page and blinding against a dark one.
export const tooltipStyles = (theme) => {
  const c = getChartTheme(theme);
  return {
    contentStyle: {
      background: c.tooltipBg,
      border: `1px solid ${c.tooltipBorder}`,
      borderRadius: 12,
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.24)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      color: c.tooltipText,
      fontSize: 13,
      padding: '10px 14px',
      direction: 'rtl'
    },
    labelStyle: { color: c.tooltipText, fontWeight: 600, marginBottom: 4 },
    itemStyle: { color: c.tooltipText }
  };
};

// Id for the <linearGradient> def used to fill the area under a trend
// line. Kept here so the gradient and the stroke that sits on top of it
// can never drift apart.
export const AREA_GRADIENT_ID = 'swAreaGradient';
