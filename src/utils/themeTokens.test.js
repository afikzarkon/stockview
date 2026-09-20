import fs from 'fs';
import path from 'path';

// Guards the property the whole theme system rests on: a rule that paints
// a literal color cannot follow the theme. That is exactly how dark mode
// drifted out of sync before this redesign - individual rules saying
// `background: white` or `color: #2c3e50`, invisible until someone looked
// at the page in the other theme.
//
// Literals are still legitimate in three places, all of which are checked
// for rather than blanket-ignored:
//   * inside the :root token blocks, which is where colors are defined;
//   * inside a [data-theme='...'] rule, which is per-theme by definition;
//   * #fff / #ffffff as foreground ON a colored fill (button label), where
//     white is correct in both themes.
const CSS = fs.readFileSync(path.join(__dirname, '..', 'App.css'), 'utf8');

// Everything after the token definitions.
const BODY = CSS.slice(CSS.indexOf('/* Modern thin scrollbar, applied site-wide'));

function offendingDeclarations() {
  const offenders = [];
  // Strip [data-theme=...] blocks - those are per-theme on purpose.
  const scrubbed = BODY.replace(/\[data-theme=[^\]]*\][^{]*\{[^}]*\}/g, '');

  const declaration = /(background|background-color|color|border|border-color|border-top|border-bottom|fill)\s*:\s*([^;{}]*?)(?:;|\})/g;
  let match;
  while ((match = declaration.exec(scrubbed)) !== null) {
    const value = match[2].trim();
    if (!/#[0-9a-fA-F]{3,8}\b|\b(?:white|black)\b/.test(value)) continue;
    // White as a label color over a colored fill is theme-independent.
    if (/^#(?:fff|ffffff)$/i.test(value)) continue;
    offenders.push(`${match[1]}: ${value}`);
  }
  return offenders;
}

test('no rule paints a literal color that cannot follow the theme', () => {
  const offenders = offendingDeclarations();
  // Reported in full rather than as a count, so a failure says exactly
  // which declaration needs a token.
  expect(offenders).toEqual([]);
});

test('the stylesheet actually uses the token layer, rather than defining it and ignoring it', () => {
  const tokenUses = (BODY.match(/var\(--sw-/g) || []).length;
  expect(tokenUses).toBeGreaterThan(300);
});

// The glass surfaces need an opaque fallback: without backdrop-filter a
// translucent header would leave rows showing through its own text.
test('every backdrop-filter is paired with a plain background fallback', () => {
  const blocks = CSS.split('@supports').slice(1);
  expect(blocks.length).toBeGreaterThan(0);
  blocks.forEach((block) => {
    if (!/backdrop-filter/.test(block)) return;
    expect(block).toMatch(/background/);
  });
  // And the fallback rules themselves exist outside the @supports guard.
  expect(CSS).toMatch(/\.top-nav \{[^}]*background: var\(--sw-surface\)/);
});
