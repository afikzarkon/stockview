/**
 * @jest-environment node
 */
// Regression test for a real production bug: the Puppeteer wait condition
// in scrapeTaseWithPuppeteer only checked whether a price *label* appeared
// on the page, not whether an actual price *value* had loaded. TASE's page
// renders its labels immediately as static shell, then fills in the real
// numbers a moment later via an async fetch - so the old condition
// succeeded the instant the shell rendered, well before the numbers
// arrived, and extraction ran against a still-loading page.
//
// puppeteer and cheerio are mocked out here (not actually exercised by
// these tests) - requiring the real packages pulls in browser-launching
// machinery and undici respectively, both of which this test environment
// can't fully load, and neither is relevant to testing the pure regex
// logic below.
jest.mock('puppeteer', () => ({}));
jest.mock('cheerio', () => ({}));

const { hasUsableTasePriceText, parseTasePriceToken } = require('./taseScraper');

describe('parseTasePriceToken', () => {
  // Regression test for a real, confirmed production bug: TASE's own page
  // labels this field "שער אחרון (באגורות)" - "last price IN AGOROT" - so
  // the scraped text is already the agorot value. The code used to
  // multiply it by 100 again, assuming it needed converting from shekels,
  // which is what turned a real ₪2,476.70 holding into ₪24,767.00's worth
  // of agorot (24,767,000) instead of the correct 247,670 agorot.
  test('the exact case confirmed against the live TASE page: "247,670" parses to 247670, not 24767000', () => {
    expect(parseTasePriceToken('247,670')).toBe(247670);
  });

  test('strips thousands-separator commas without multiplying', () => {
    expect(parseTasePriceToken('1,538')).toBe(1538);
  });

  test('handles a token with no comma the same way', () => {
    expect(parseTasePriceToken('1538')).toBe(1538);
  });

  test('handles decimal agorot values by rounding, not truncating', () => {
    expect(parseTasePriceToken('1538.6')).toBe(1539);
  });

  test('null/empty/non-numeric token returns null', () => {
    expect(parseTasePriceToken(null)).toBeNull();
    expect(parseTasePriceToken('')).toBeNull();
    expect(parseTasePriceToken('not a number')).toBeNull();
  });

  test('strips bidi/control characters before parsing', () => {
    expect(parseTasePriceToken('\u200E1,538\u200F')).toBe(1538);
  });
});

describe('hasUsableTasePriceText', () => {
  test('the exact page text seen in production BEFORE the fix (labels present, no digits) is correctly rejected', () => {
    // Captured verbatim from a real production log: labels like "שער אחרון
    // (באגורות)" are present, but the actual date/price came through as
    // "undefined undefined" - the old bug's condition matched on the label
    // alone and returned true here, which was the whole problem.
    const text =
      'נתונים עיקריים עוד על 1159250 סימול : שער אחרון (באגורות) שינוי בסיס: נכון ל- undefined undefined ' +
      'שווי שוק אלפי ₪ נכון ל- אודות החברה ענף בבורסה פרטי החברה לצפיה בנתונים נוספים תשואות נכון ל- ' +
      'מתחילת החודש מתחילת השנה ללא שינוי ללא שינוי ללא שינוי ללא שינוי נתוני עסקאות (ללא בלוק) נכון ל- ' +
      'פירוט עסקאות ללא בלוק ליום מסחרפירוט עסקאות בלוק ליום מסחר ימי מסחר אחרונים לנתונים היסטוריים ניע נכלל במדדים';

    expect(hasUsableTasePriceText(text)).toBe(false);
  });

  test('a label immediately followed by a real numeric value is accepted', () => {
    expect(hasUsableTasePriceText('שער אחרון (באגורות) 1538 שינוי יומי -1.42%')).toBe(true);
  });

  test('שווי יחידה followed by a number is accepted even without שער אחרון', () => {
    expect(hasUsableTasePriceText('שווי יחידה 250.5')).toBe(true);
  });

  test('an actual percent value (digits + %) is accepted even without a price label nearby', () => {
    expect(hasUsableTasePriceText('שינוי יומי -1.42%')).toBe(true);
    expect(hasUsableTasePriceText('2.5%')).toBe(true);
  });

  test('a bare "%" with no digits (e.g. decorative UI text) is correctly rejected - this was also a gap in the old bug', () => {
    expect(hasUsableTasePriceText('אחוז % שינוי')).toBe(false);
  });

  test('empty/undefined/null input is rejected without throwing', () => {
    expect(hasUsableTasePriceText('')).toBe(false);
    expect(hasUsableTasePriceText(undefined)).toBe(false);
    expect(hasUsableTasePriceText(null)).toBe(false);
  });

  test('a label far away (>80 chars) from any digit is rejected - the label alone is not enough', () => {
    const farAway = 'שער אחרון ' + 'x'.repeat(100) + ' 1538';
    expect(hasUsableTasePriceText(farAway)).toBe(false);
  });
});
