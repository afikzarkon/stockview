/**
 * @jest-environment node
 */
const express = require('express');
const { createValuationService } = require('./valuationService');
const { mountValuationRoutes } = require('./valuationRoutes');
const { request, listen } = require('./testUtils/http');

const fy = (periodEnd, revenue, netIncome, cfo, capex, shares) => ({ periodEnd, currency: 'USD', revenue, netIncome, operatingCashFlow: cfo, capex, dilutedShares: shares, cashAndShortTerm: 50, totalDebt: 80 });
const q = (periodEnd) => ({ periodEnd, revenue: 30, netIncome: 3, operatingCashFlow: 5, capex: -1, dilutedShares: 10, cashAndShortTerm: 60, totalDebt: 70 });

function sources(overrides = {}) {
  const closes = [];
  for (let y = 2021; y <= 2026; y += 1) {
    for (let m = 1; m <= 12; m += 1) {
      const date = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
      if (date <= '2026-09-30') closes.push({ date, close: 100 });
    }
  }
  return {
    summary: jest.fn(async (symbol) =>
      symbol === 'X'
        ? { name: 'X Corp', currency: 'USD', financialCurrency: 'USD', price: 100, marketCap: 1000, sharesOutstanding: 10, beta: 1.1, analystGrowth5y: 0.09, sector: 'Tech' }
        : { marketCap: 500, trailingPE: symbol === 'P1' ? 8 : 12, priceToSales: 1, freeCashflow: 50 }
    ),
    statements: jest.fn(async () => ({
      annual: [fy('2021-12-31', 80, 8, 12, -2, 10), fy('2022-12-31', 90, 9, 13, -3, 10), fy('2023-12-31', 100, 10, 14, -4, 10), fy('2024-12-31', 110, 11, 15, -5, 10), fy('2025-12-31', 120, 12, 16, -6, 10)],
      quarterly: [q('2025-09-30'), q('2025-12-31'), q('2026-03-31'), q('2026-06-30')],
      source: 'yahoo'
    })),
    monthlyPrices: jest.fn(async () => ({ closes, splits: [] })),
    peerSymbols: jest.fn(async () => ['P1', 'X', 'P2', 'BAD']),
    peerMultiples: (s) => {
      if (s.marketCap === undefined) throw new Error('bad peer');
      return { PE: s.trailingPE, PS: s.priceToSales, PFCF: s.marketCap / s.freeCashflow };
    },
    riskFreeRate: jest.fn(async () => 0.042),
    ...overrides
  };
}

const now = () => new Date('2026-09-24T12:00:00Z');

test('assembles multiples, peers and DCF inputs', async () => {
  const src = sources();
  src.summary.mockImplementation(async (symbol) => {
    if (symbol === 'BAD') return {};
    return symbol === 'X'
      ? { name: 'X Corp', currency: 'USD', financialCurrency: 'USD', price: 100, marketCap: 1000, sharesOutstanding: 10, beta: 1.1, analystGrowth5y: 0.09, sector: 'Tech' }
      : { marketCap: 500, trailingPE: symbol === 'P1' ? 8 : 12, priceToSales: 1, freeCashflow: 50 };
  });
  const v = await createValuationService({ sources: src, now, logger: { warn() {} } }).getValuation('X');
  // TTM from the last four quarters: net income 12, revenue 120, FCF 16
  const pe = v.multiples.find((m) => m.metric === 'PE');
  expect(pe.current).toBeCloseTo(1000 / 12, 10);
  expect(pe.sectorMedian).toBe(10); // P1 8, P2 12; X itself and the failed peer excluded
  expect(pe.peerCount).toBe(2);
  expect(pe.samples).toBeGreaterThan(50);
  expect(v.peers.map((p) => p.symbol)).toEqual(['P1', 'P2']);
  expect(v.dcfInputs).toMatchObject({ cash: 60, debt: 70, sharesDiluted: 10, marketPrice: 100, beta: 1.1, analystGrowth5y: 0.09, riskFreeRate: 0.042, riskFreeRateIsDefault: false });
  expect(v.dcfInputs.fcfHistory.map((x) => x.fcf)).toEqual([10, 10, 10, 10, 10]);
  expect(v.warnings).toEqual([]);
});

test('caches per symbol and dedupes concurrent requests', async () => {
  const src = sources();
  const svc = createValuationService({ sources: src, now, logger: { warn() {} } });
  await Promise.all([svc.getValuation('X'), svc.getValuation('X')]);
  await svc.getValuation('X');
  expect(src.statements).toHaveBeenCalledTimes(1);
});

test('currency mismatch and missing risk-free rate are reported', async () => {
  const src = sources({ riskFreeRate: jest.fn(async () => { throw new Error('down'); }) });
  src.summary.mockImplementation(async () => ({ currency: 'USD', financialCurrency: 'TWD', price: 100, marketCap: 1000 }));
  const v = await createValuationService({ sources: src, now, logger: { warn() {} } }).getValuation('X');
  expect(v.warnings.join()).toMatch(/TWD/);
  expect(v.dcfInputs).toMatchObject({ riskFreeRate: 0.043, riskFreeRateIsDefault: true });
});

test('route validates the symbol and maps failures to 502', async () => {
  const src = sources({ statements: jest.fn(async () => { throw new Error('yahoo down'); }) });
  const app = express();
  mountValuationRoutes(app, { valuation: createValuationService({ sources: src, now, logger: { warn() {} } }) });
  const { server, baseUrl } = await listen(app);
  try {
    expect((await request(baseUrl, 'GET', '/api/valuation/bad%20sym')).status).toBe(400);
    const res = await request(baseUrl, 'GET', '/api/valuation/x');
    expect(res.status).toBe(502);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
