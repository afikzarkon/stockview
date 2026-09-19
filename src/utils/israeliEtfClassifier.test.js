import {
  detectForeignAssetIsraeliEtf,
  detectIsraeliFund,
  effectiveExchangeForIsraeliStock,
  israeliStockDisplayName,
  resolveIsraeliSector,
  ETF_SECTOR_KEY
} from './israeliEtfClassifier';
import { sectorFromTaseBranch } from './israeliSectorMapping';
import { UNCLASSIFIED_SECTOR_KEY } from './sectorLabels';

describe('israeliStockDisplayName', () => {
  // For an Israeli holding, `stockName` holds the numeric TASE security id -
  // the name lives in officialName. Getting this order wrong is what made
  // the old classifier test a string of digits against a keyword list.
  test('prefers the official name over the raw security id', () => {
    expect(israeliStockDisplayName({ stockName: '1159250', officialName: 'איישרס.חוץ P 500&S' })).toBe(
      'איישרס.חוץ P 500&S'
    );
  });

  test('falls back to the security id when no name has been resolved', () => {
    expect(israeliStockDisplayName({ stockName: '1159250' })).toBe('1159250');
  });

  test('handles a missing holding gracefully', () => {
    expect(israeliStockDisplayName(undefined)).toBe('');
  });
});

describe('detectForeignAssetIsraeliEtf', () => {
  test('matches a fund tracking the S&P 500', () => {
    expect(detectForeignAssetIsraeliEtf('קסם S&P 500')).toBe(true);
    expect(detectForeignAssetIsraeliEtf('תכלית מחקה S&P500')).toBe(true);
  });

  test('matches common Hebrew "tracking foreign index" phrasing', () => {
    expect(detectForeignAssetIsraeliEtf('הראל מחקה נאסד"ק')).toBe(true);
    expect(detectForeignAssetIsraeliEtf('אינדקס עוקב MSCI עולמי')).toBe(true);
  });

  // The decisive keyword: the exchange names these instruments with "חוץ"
  // itself ("קרן חוץ נסחרת"), so a name containing it is foreign exposure by
  // the exchange's own description.
  test('matches a name containing "חוץ", the exchange\'s own word for foreign exposure', () => {
    expect(detectForeignAssetIsraeliEtf('איישרס.חוץ P 500&S')).toBe(true);
    expect(detectForeignAssetIsraeliEtf('מגדל מניות חוץ')).toBe(true);
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

  test('classifies a whole holding by its resolved name, not by its numeric security id', () => {
    expect(detectForeignAssetIsraeliEtf({ stockName: '1159250', officialName: 'איישרס.חוץ P 500&S' })).toBe(true);
    expect(detectForeignAssetIsraeliEtf({ stockName: '629014', officialName: 'טבע' })).toBe(false);
  });
});

describe('detectIsraeliFund', () => {
  test('trusts the exchange instrument type when the holding carries one', () => {
    expect(detectIsraeliFund({ stockName: '1159250', securityType: 'קרן חוץ נסחרת' })).toBe(true);
    expect(detectIsraeliFund({ stockName: '629014', securityType: ' מניות', securitySubType: 'מניה רגילה' })).toBe(
      false
    );
  });

  test('falls back to the name for a holding saved before the metadata existed', () => {
    expect(detectIsraeliFund({ stockName: '1145713', officialName: 'קסם Russell 2000 ETF' })).toBe(true);
    expect(detectIsraeliFund({ stockName: '5113121', officialName: 'הראל מחקה משולבת מדינה חודשי' })).toBe(true);
    expect(detectIsraeliFund({ stockName: '629014', officialName: 'טבע' })).toBe(false);
  });

  test('handles a missing holding gracefully', () => {
    expect(detectIsraeliFund(undefined)).toBe(false);
  });
});

describe('effectiveExchangeForIsraeliStock', () => {
  test('auto-detects by the resolved name', () => {
    expect(effectiveExchangeForIsraeliStock({ stockName: '1146471', officialName: 'קסם S&P 500' })).toBe('american');
    expect(effectiveExchangeForIsraeliStock({ stockName: '629014', officialName: 'טבע' })).toBe('israeli');
  });

  test("the exchange's own foreign-ETF flag classifies a fund whose name has no keyword", () => {
    expect(
      effectiveExchangeForIsraeliStock({ stockName: '1159250', officialName: 'בלקרוק', isForeignETF: true })
    ).toBe('american');
  });

  // Nothing writes isForeignAsset any more (the "נכס זר?" column is gone),
  // but portfolios saved while it existed must keep behaving as their owner
  // set them up.
  test('a legacy manual isForeignAsset:true override still wins for an ordinary-looking name', () => {
    expect(effectiveExchangeForIsraeliStock({ stockName: '629014', officialName: 'טבע', isForeignAsset: true })).toBe(
      'american'
    );
  });

  test('a legacy manual isForeignAsset:false override still wins over the automatic classification', () => {
    expect(
      effectiveExchangeForIsraeliStock({
        stockName: '1146471',
        officialName: 'קסם S&P 500',
        isForeignAsset: false
      })
    ).toBe('israeli');
  });

  test('handles a missing stock object gracefully', () => {
    expect(effectiveExchangeForIsraeliStock(undefined)).toBe('israeli');
  });
});

describe('resolveIsraeliSector', () => {
  test('classifies a fund/ETF/index tracker as its own sector, not as unclassified', () => {
    expect(
      resolveIsraeliSector(
        { stockName: '1159250', officialName: 'איישרס.חוץ P 500&S', securityType: 'קרן חוץ נסחרת' },
        sectorFromTaseBranch
      )
    ).toBe(ETF_SECTOR_KEY);
  });

  test("maps an ordinary share from the exchange's own branch classification", () => {
    expect(
      resolveIsraeliSector(
        { stockName: '629014', officialName: 'טבע', securityType: ' מניות', branch: 'הייטק-ביומד-פארמה' },
        sectorFromTaseBranch
      )
    ).toBe('Healthcare');
  });

  test('an explicit sector already on the holding wins over the automatic classification', () => {
    expect(
      resolveIsraeliSector(
        { stockName: '629014', officialName: 'טבע', branch: 'הייטק-ביומד-פארמה', sector: 'Technology' },
        sectorFromTaseBranch
      )
    ).toBe('Technology');
  });

  test('falls back to unclassified when there is nothing to classify from', () => {
    expect(resolveIsraeliSector({ stockName: '123456' }, sectorFromTaseBranch)).toBe(UNCLASSIFIED_SECTOR_KEY);
    expect(resolveIsraeliSector(undefined, sectorFromTaseBranch)).toBe(UNCLASSIFIED_SECTOR_KEY);
  });

  test('works without a branch mapper passed in', () => {
    expect(resolveIsraeliSector({ stockName: '629014', branch: 'הייטק-ביומד-פארמה' })).toBe(
      UNCLASSIFIED_SECTOR_KEY
    );
  });
});
