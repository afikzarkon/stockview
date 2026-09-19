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

function toRgb(hex) {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

function luminance(hex) {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const tokens = readTokens();

describe.each(['dark', 'light'])('%s theme contrast', (themeName) => {
  const t = tokens[themeName];

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

test('both themes define the same token names, so no rule can resolve to nothing', () => {
  const darkKeys = Object.keys(tokens.dark).filter((k) => k.startsWith('--sw-'));
  const lightKeys = new Set(Object.keys(tokens.light));
  // Light may inherit tokens it doesn't override; what matters is that it
  // never introduces one dark lacks.
  Object.keys(tokens.light).forEach((k) => expect(darkKeys).toContain(k));
  expect(darkKeys.length).toBeGreaterThan(30);
  expect(lightKeys.size).toBeGreaterThan(20);
});
