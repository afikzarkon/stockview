/**
 * @jest-environment node
 */
// Regression test for a real bug: Yahoo's quoteSummary endpoint returns
// numeric fields either as a plain number (when formatted=false is
// respected) or as a { raw, fmt, longFmt } display-ready object. Treating
// the second shape as a plain number silently produced `null` for every
// analyst price target while recommendationKey (a plain string field)
// worked fine — exactly what showed up in production before this fix.
const { unwrapYahooNumber } = require('./yahooQuotes');

describe('unwrapYahooNumber', () => {
  test('passes through a plain finite number', () => {
    expect(unwrapYahooNumber(150.5)).toBe(150.5);
    expect(unwrapYahooNumber(0)).toBe(0);
  });

  test('unwraps the { raw, fmt } shape Yahoo uses when formatted=false is not honored', () => {
    expect(unwrapYahooNumber({ raw: 150.5, fmt: '150.50' })).toBe(150.5);
    expect(unwrapYahooNumber({ raw: 12, fmt: '12', longFmt: '12' })).toBe(12);
  });

  test('null/undefined input returns null', () => {
    expect(unwrapYahooNumber(null)).toBeNull();
    expect(unwrapYahooNumber(undefined)).toBeNull();
  });

  test('non-finite plain number returns null', () => {
    expect(unwrapYahooNumber(NaN)).toBeNull();
  });

  test('object without a finite raw value returns null rather than throwing', () => {
    expect(unwrapYahooNumber({})).toBeNull();
    expect(unwrapYahooNumber({ raw: null })).toBeNull();
    expect(unwrapYahooNumber({ fmt: '150.50' })).toBeNull(); // raw missing
  });

  test('string input (unexpected shape) returns null rather than a bogus value', () => {
    expect(unwrapYahooNumber('150.5')).toBeNull();
  });
});
