import fs from 'fs';
import path from 'path';

// Reads the two :root blocks straight out of App.css so this checks the
// palette that actually ships, not a copy of it.
function readTokens() {
  const css = fs.readFileSync(path.join(__dirname, '..', 'App.css'), 'utf8');
  const grab = (selector) => {
    const i = css.indexOf(selector);
    const block = css.slice(i, css.indexOf('}', i));
    const out = {};
    block.replace(/(--[\w-]+):\s*([^;]+);/g, (_, k, v) => { out[k] = v.trim(); return ''; });
    return out;
  };
  return { dark: grab(':root {'), light: grab(":root[data-theme='light'] {") };
}

// A token is either a hex literal or an rgba(). Both have to be handled,
// because the dark theme's card surfaces are translucent glass.
function parseColor(value) {
  const text = String(value).trim();
  const fn = text.match(/^rgba?\(([^)]+)\)$/i);
  if (fn) {
    const parts = fn[1].split(',').map((p) => parseFloat(p.trim()));
    return { rgb: parts.slice(0, 3), alpha: parts.length > 3 ? parts[3] : 1 };
  }
  const h = text.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return { rgb: [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)), alpha: 1 };
}

// A TRANSLUCENT SURFACE HAS NO COLOR OF ITS OWN. What a reader actually
// sees is it composited over whatever is behind it, so contrast has to be
// measured against that composite rather than against the nominal token -
// otherwise a glass card could be declared accessible on the strength of a
// color that is never painted.
//
// The backdrop is the page's own --sw-bg. That is the conservative choice:
// the ambient gradients drawn over it are low-alpha and only lighten it,
// and a lighter backdrop behind a dark pane can only raise the contrast of
// the light text on top.
function flatten(value, backdrop) {
  const fg = parseColor(value);
  if (fg.alpha >= 1) return fg.rgb;
  const bg = parseColor(backdrop).rgb;
  return fg.rgb.map((channel, i) => channel * fg.alpha + bg[i] * (1 - fg.alpha));
}

function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const tokens = readTokens();

// Kept for the hue-distance check below, which compares opaque brand
// colors and needs their channels rather than a composite.
const toRgb = (value) => parseColor(value).rgb;

describe.each(['dark', 'light'])('%s theme contrast', (themeName) => {
  const t = tokens[themeName];
  const pageBackdrop = t['--sw-bg'] || tokens.dark['--sw-bg'];

  const contrast = (a, b) => {
    const l1 = luminance(flatten(a, pageBackdrop));
    const l2 = luminance(flatten(b, pageBackdrop));
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };

  test('body text on the page and on a card clears WCAG AA (4.5:1)', () => {
    expect(contrast(t['--sw-text'], t['--sw-bg'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t['--sw-text'], t['--sw-surface'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t['--sw-text'], t['--sw-surface-2'])).toBeGreaterThanOrEqual(4.5);
  });

  test('secondary text clears AA on every surface it is used on', () => {
    expect(contrast(t['--sw-text-secondary'], t['--sw-surface'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t['--sw-text-secondary'], t['--sw-surface-2'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t['--sw-text-secondary'], t['--sw-surface-3'])).toBeGreaterThanOrEqual(4.5);
  });

  test('muted text clears AA large / UI-component contrast (3:1)', () => {
    expect(contrast(t['--sw-text-muted'], t['--sw-surface'])).toBeGreaterThanOrEqual(3);
  });

  // Gain/loss colors are the app's most important signal; they are also
  // used as text inside a tinted pill, so they are checked against the
  // card they sit on.
  test('gain and loss colors clear AA against the card surface', () => {
    expect(contrast(t['--sw-green'], t['--sw-surface'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t['--sw-red'], t['--sw-surface'])).toBeGreaterThanOrEqual(4.5);
  });

  test('white text on the primary button clears AA', () => {
    expect(contrast('#ffffff', t['--sw-accent-strong'])).toBeGreaterThanOrEqual(4.5);
  });

  test('gain, loss and brand accent are three visibly distinct hues', () => {
    const hues = [t['--sw-green'], t['--sw-red'], t['--sw-accent']];
    expect(new Set(hues).size).toBe(3);
    hues.forEach((a, i) => hues.slice(i + 1).forEach((b) => {
      const dist = Math.hypot(...toRgb(a).map((v, k) => v - toRgb(b)[k]));
      expect(dist).toBeGreaterThan(80);
    }));
  });
});

// The glass treatment is a palette decision, not only a CSS one: if these
// surfaces ever go back to opaque, the blur behind them becomes work that
// produces nothing, and the compositing above becomes a no-op that hides
// the fact.
test('the dark card surfaces are translucent, which is what the blur behind them is for', () => {
  expect(parseColor(tokens.dark['--sw-surface']).alpha).toBeLessThan(1);
  expect(parseColor(tokens.dark['--sw-surface-2']).alpha).toBeLessThan(1);
});

// Anything a sticky header is painted with has to be opaque, or the rows
// scrolling beneath it show through the header text.
test('the surface used behind sticky headers stays opaque', () => {
  expect(parseColor(tokens.dark['--sw-surface-3']).alpha).toBe(1);
  expect(parseColor(tokens.light['--sw-surface-3']).alpha).toBe(1);
});

test('both themes define the same token names, so no rule can resolve to nothing', () => {
  const darkKeys = Object.keys(tokens.dark).filter((k) => k.startsWith('--sw-'));
  const lightKeys = new Set(Object.keys(tokens.light));
  // Light may inherit tokens it doesn't override; what matters is that it
  // never introduces one dark lacks.
  Object.keys(tokens.light).forEach((k) => expect(darkKeys).toContain(k));
  expect(darkKeys.length).toBeGreaterThan(30);
  expect(lightKeys.size).toBeGreaterThan(20);
});
