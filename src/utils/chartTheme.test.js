import { getChartTheme, tooltipStyles, AREA_GRADIENT_ID } from './chartTheme';

describe('getChartTheme', () => {
  test('returns a different palette per theme, so charts follow a toggle', () => {
    const dark = getChartTheme('dark');
    const light = getChartTheme('light');
    expect(dark.accent).not.toBe(light.accent);
    expect(dark.grid).not.toBe(light.grid);
    expect(dark.axis).not.toBe(light.axis);
  });

  test('defaults to dark for an unknown or missing theme', () => {
    expect(getChartTheme(undefined)).toEqual(getChartTheme('dark'));
    expect(getChartTheme('sepia')).toEqual(getChartTheme('dark'));
  });

  // SVG presentation attributes can't read CSS custom properties, so every
  // value here has to be a literal a browser will actually paint. A
  // var(--...) reference would silently render nothing.
  test('every color is a literal value, never a CSS variable reference', () => {
    ['dark', 'light'].forEach((theme) => {
      const c = getChartTheme(theme);
      const values = [c.accent, c.accent2, c.benchmark, c.positive, c.negative, c.grid, c.axis, ...c.categorical];
      values.forEach((value) => {
        expect(typeof value).toBe('string');
        expect(value).not.toMatch(/var\(/);
        expect(value).toMatch(/^(#|rgba?\()/);
      });
    });
  });

  test('gains and losses stay distinct from the brand accent in both themes', () => {
    ['dark', 'light'].forEach((theme) => {
      const c = getChartTheme(theme);
      expect(new Set([c.positive, c.negative, c.accent]).size).toBe(3);
    });
  });

  test('the categorical palette has no duplicate hues to confuse two series', () => {
    ['dark', 'light'].forEach((theme) => {
      const { categorical } = getChartTheme(theme);
      expect(categorical.length).toBeGreaterThanOrEqual(10);
      expect(new Set(categorical).size).toBe(categorical.length);
    });
  });
});

describe('tooltipStyles', () => {
  test('produces a themed glass panel rather than the default white box', () => {
    const dark = tooltipStyles('dark');
    const light = tooltipStyles('light');

    expect(dark.contentStyle.background).not.toBe(light.contentStyle.background);
    expect(dark.contentStyle.color).not.toBe(light.contentStyle.color);
    expect(dark.contentStyle.backdropFilter).toContain('blur');
    // The app is RTL; a tooltip that isn't would read backwards.
    expect(dark.contentStyle.direction).toBe('rtl');
  });

  test('label and item text match the panel text color', () => {
    const { contentStyle, labelStyle, itemStyle } = tooltipStyles('light');
    expect(labelStyle.color).toBe(contentStyle.color);
    expect(itemStyle.color).toBe(contentStyle.color);
  });
});

test('the area gradient id is a stable, valid SVG identifier', () => {
  expect(AREA_GRADIENT_ID).toMatch(/^[A-Za-z][\w-]*$/);
});
