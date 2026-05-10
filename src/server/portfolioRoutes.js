const jwt = require('jsonwebtoken');
const { getJwtSecret, COOKIE_NAME } = require('./authRoutes');

const emptyPortfolio = () => ({
  israeliStocks: [],
  americanStocks: [],
  pensionFunds: [],
  bankBalances: [],
  cashFunds: []
});

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: 'נדרשת התחברות' });
  }
  try {
    const payload = jwt.verify(token, getJwtSecret());
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: 'פג תוקף או טוקן לא תקין' });
  }
}

function mountPortfolioRoutes(app, db) {
  app.get('/api/portfolio', requireAuth, (req, res) => {
    try {
      const row = db
        .prepare('SELECT payload FROM user_portfolios WHERE user_id = ?')
        .get(req.user.id);
      if (!row || !row.payload) {
        return res.json(emptyPortfolio());
      }
      const data = JSON.parse(row.payload);
      return res.json({
        israeliStocks: Array.isArray(data.israeliStocks) ? data.israeliStocks : [],
        americanStocks: Array.isArray(data.americanStocks) ? data.americanStocks : [],
        pensionFunds: Array.isArray(data.pensionFunds) ? data.pensionFunds : [],
        bankBalances: Array.isArray(data.bankBalances) ? data.bankBalances : [],
        cashFunds: Array.isArray(data.cashFunds) ? data.cashFunds : []
      });
    } catch {
      return res.status(500).json({ error: 'שגיאת שרת' });
    }
  });

  app.put('/api/portfolio', requireAuth, (req, res) => {
    try {
      const body = req.body || {};
      const snapshot = {
        israeliStocks: Array.isArray(body.israeliStocks) ? body.israeliStocks : [],
        americanStocks: Array.isArray(body.americanStocks) ? body.americanStocks : [],
        pensionFunds: Array.isArray(body.pensionFunds) ? body.pensionFunds : [],
        bankBalances: Array.isArray(body.bankBalances) ? body.bankBalances : [],
        cashFunds: Array.isArray(body.cashFunds) ? body.cashFunds : []
      };
      const payload = JSON.stringify(snapshot);
      db.prepare(
        `INSERT INTO user_portfolios (user_id, payload, updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(user_id) DO UPDATE SET
           payload = excluded.payload,
           updated_at = datetime('now')`
      ).run(req.user.id, payload);
      return res.json({ ok: true });
    } catch {
      return res.status(500).json({ error: 'שגיאת שרת' });
    }
  });
}

module.exports = { mountPortfolioRoutes };
