/**
 * @jest-environment node
 */
const mockAxios = { get: jest.fn() };
jest.mock('axios', () => mockAxios);

const {
  fetchTaseSecurityMeta,
  isSecurityIdQuery,
  normalizeSecurityData,
  branchLeaf,
  looksLikeFund
} = require('./taseSecurityLookup');

// Captured live from api.tase.co.il/api/company/securitydata - the ETF that
// could not be found by any search at all before this module existed
// (Bizportal's name-autocomplete returns [] for both "1159250" and
// "איישרס"), and an ordinary share for contrast.
const REAL_ETF_RESPONSE = {
  Id: '01159250',
  Name: 'איישרס.חוץ P 500&S',
  LongName: 'ISHARES CORE S&P 500 UCITS ETF',
  CompanyName: 'בלקרוק  אירלנד',
  Symbol: 'אש.סז702',
  Type: 'קרן חוץ נסחרת',
  SecuritySubType: 'קרן חוץ נסחרת מניות',
  FullBranch: 'מכשירים פיננסים-קרן חוץ נסחרת-קרן חוץ נסחרת',
  IsForeignETF: true,
  UAssetName: 'S&P 500 - NTR',
  ISIN: 'IE00B5BMR087',
  LastRate: 249160
};

const REAL_SHARE_RESPONSE = {
  Id: '00629014',
  Name: 'טבע',
  LongName: null,
  CompanyName: 'טבע',
  Symbol: 'טבע',
  Type: ' מניות',
  SecuritySubType: 'מניה רגילה',
  FullBranch: 'הייטק-ביומד-פארמה',
  IsForeignETF: false,
  UAssetName: '',
  ISIN: 'IL0006290147',
  LastRate: 11960
};

describe('isSecurityIdQuery', () => {
  test('recognizes a security number', () => {
    expect(isSecurityIdQuery('1159250')).toBe(true);
    expect(isSecurityIdQuery('629014')).toBe(true);
    expect(isSecurityIdQuery('  1159250  ')).toBe(true);
  });

  test('does not treat a name as a security number', () => {
    expect(isSecurityIdQuery('טבע')).toBe(false);
    expect(isSecurityIdQuery('קסם S&P 500')).toBe(false);
    expect(isSecurityIdQuery('')).toBe(false);
    expect(isSecurityIdQuery(undefined)).toBe(false);
  });

  test('rejects numbers outside the plausible security-id length', () => {
    expect(isSecurityIdQuery('12')).toBe(false);
    expect(isSecurityIdQuery('1234567890')).toBe(false);
  });
});

describe('branchLeaf', () => {
  test('returns the most specific segment of the exchange\'s branch path', () => {
    expect(branchLeaf('הייטק-ביומד-פארמה')).toBe('פארמה');
    expect(branchLeaf('בנקים')).toBe('בנקים');
  });

  test('handles empty input', () => {
    expect(branchLeaf('')).toBeNull();
    expect(branchLeaf(undefined)).toBeNull();
  });
});

describe('looksLikeFund', () => {
  test('recognizes the fund instrument types', () => {
    expect(looksLikeFund('קרן חוץ נסחרת', 'קרן חוץ נסחרת מניות')).toBe(true);
    expect(looksLikeFund('קרנות סל')).toBe(true);
    expect(looksLikeFund('קרנות נאמנות')).toBe(true);
  });

  test('does not classify an ordinary share as a fund', () => {
    expect(looksLikeFund(' מניות', 'מניה רגילה')).toBe(false);
  });
});

describe('normalizeSecurityData', () => {
  test('normalizes a real ETF response, including the zero-padded id', () => {
    expect(normalizeSecurityData('1159250', REAL_ETF_RESPONSE)).toEqual({
      securityId: '1159250',
      officialName: 'איישרס.חוץ P 500&S',
      longName: 'ISHARES CORE S&P 500 UCITS ETF',
      symbol: 'אש.סז702',
      securityType: 'קרן חוץ נסחרת',
      securitySubType: 'קרן חוץ נסחרת מניות',
      branch: 'מכשירים פיננסים-קרן חוץ נסחרת-קרן חוץ נסחרת',
      branchLeaf: 'קרן חוץ נסחרת',
      isFund: true,
      isForeignETF: true,
      underlyingAsset: 'S&P 500 - NTR',
      isin: 'IE00B5BMR087'
    });
  });

  test('normalizes a real ordinary-share response', () => {
    const meta = normalizeSecurityData('629014', REAL_SHARE_RESPONSE);
    expect(meta).toMatchObject({
      securityId: '629014',
      officialName: 'טבע',
      branch: 'הייטק-ביומד-פארמה',
      branchLeaf: 'פארמה',
      isFund: false,
      isForeignETF: false
    });
    expect(meta.longName).toBeNull();
    expect(meta.underlyingAsset).toBeNull();
  });

  // An unknown id comes back as HTTP 200 with a literal null body, not a
  // 404 - the same quirk taseQuoteApi.js guards against.
  test('returns null for an unknown security rather than a half-built object', () => {
    expect(normalizeSecurityData('1', null)).toBeNull();
    expect(normalizeSecurityData('1', 'not an object')).toBeNull();
    expect(normalizeSecurityData('1', {})).toBeNull();
  });
});

describe('fetchTaseSecurityMeta', () => {
  beforeEach(() => {
    mockAxios.get.mockReset();
  });

  test('requests the security by id and returns its normalized metadata', async () => {
    mockAxios.get.mockResolvedValue({ data: REAL_ETF_RESPONSE });

    const meta = await fetchTaseSecurityMeta('1159250');

    expect(meta.officialName).toBe('איישרס.חוץ P 500&S');
    expect(meta.isFund).toBe(true);
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://api.tase.co.il/api/company/securitydata',
      expect.objectContaining({ params: { securityId: '1159250', lang: 0 } })
    );
  });

  // Referer is the one header this endpoint requires - without it the API
  // answers 403 (established by testing each header in isolation).
  test('sends the Referer header the endpoint requires', async () => {
    mockAxios.get.mockResolvedValue({ data: REAL_SHARE_RESPONSE });
    await fetchTaseSecurityMeta('629014');
    expect(mockAxios.get.mock.calls[0][1].headers.Referer).toBe('https://market.tase.co.il/');
  });

  test('returns null for an unknown id', async () => {
    mockAxios.get.mockResolvedValue({ data: null });
    expect(await fetchTaseSecurityMeta('1')).toBeNull();
  });
});
