import { detectForeignAssetIsraeliEtf, effectiveExchangeForIsraeliStock } from './israeliEtfClassifier';

describe('detectForeignAssetIsraeliEtf', () => {
  test('matches a fund tracking the S&P 500', () => {
    expect(detectForeignAssetIsraeliEtf('קסם S&P 500')).toBe(true);
    expect(detectForeignAssetIsraeliEtf('תכלית מחקה S&P500')).toBe(true);
  });

  test('matches common Hebrew "tracking foreign index" phrasing', () => {
    expect(detectForeignAssetIsraeliEtf('הראל מחקה נאסד"ק')).toBe(true);
    expect(detectForeignAssetIsraeliEtf('אינדקס עוקב MSCI עולמי')).toBe(true);
  });

  test('is case-insensitive for the English keywords', () => {
    expect(detectForeignAssetIsraeliEtf('kesem nasdaq tracker')).toBe(true);
  });

  test('does not match an ordinary Israeli stock name', () => {
    expect(detectForeignAssetIsraeliEtf('טבע')).toBe(false);
    expect(detectForeignAssetIsraeliEtf('בנק הפועלים')).toBe(false);
  });

  test('handles missing/empty input gracefully', () => {
    expect(detectForeignAssetIsraeliEtf('')).toBe(false);
    expect(detectForeignAssetIsraeliEtf(undefined)).toBe(false);
    expect(detectForeignAssetIsraeliEtf(null)).toBe(false);
  });
});

describe('effectiveExchangeForIsraeliStock', () => {
  test('auto-detects by name when isForeignAsset is not set', () => {
    expect(effectiveExchangeForIsraeliStock({ stockName: 'קסם S&P 500' })).toBe('american');
    expect(effectiveExchangeForIsraeliStock({ stockName: 'טבע' })).toBe('israeli');
  });

  test('a manual isForeignAsset:true override wins even for an ordinary-looking name', () => {
    expect(effectiveExchangeForIsraeliStock({ stockName: 'טבע', isForeignAsset: true })).toBe('american');
  });

  test('a manual isForeignAsset:false override wins even for a keyword-matching name', () => {
    expect(effectiveExchangeForIsraeliStock({ stockName: 'קסם S&P 500', isForeignAsset: false })).toBe('israeli');
  });

  test('handles a missing stock object gracefully', () => {
    expect(effectiveExchangeForIsraeliStock(undefined)).toBe('israeli');
  });
});
