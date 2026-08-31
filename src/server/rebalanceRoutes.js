// Rebalancing target allocation: the % the user wants in each portfolio
// category (israeli/american/pension/cashFunds/bank). Personal planning
// data, so (unlike snapshots/benchmarks/sectors) this requires auth and
// lives per-user, same pattern as portfolioRoutes.js.
const { readAuthUserFromRequest, getJwtSecret } = require('./authRoutes');

const REBALANCE_CATEGORIES = ['israeli', 'american', 'pension', 'cashFunds', 'bank'];

function requireAuth(req, res, next) {
  try {
    const authUser = readAuthUserFromRequest(req, getJwtSecret());
    if (!authUser) return res.status(401).json({ error: 'נדרשת התחברות' });
    req.user = { id: authUser.id, email: authUser.email };
    next();
  } catch {
    return res.status(401).json({ error: 'פג תוקף או טוקן לא תקין' });
  }
}

function normalizeTargets(body) {
  const targets = {};
  REBALANCE_CATEGORIES.forEach((key) => {
    const value = Number(body?.[key]);
    targets[key] = Number.isFinite(value) && value >= 0 ? value : 0;
  });
  return targets;
}

function mountRebalanceRoutes(app, store) {
  app.get('/api/rebalance-targets', requireAuth, async (req, res) => {
    try {
      const targets = await store.getRebalanceTargets(req.user.id);
      return res.json({ targets: targets || null });
    } catch (err) {
      console.error('[rebalance] failed to load targets', err);
      return res.status(500).json({ error: 'שגיאת שרת' });
    }
  });

  app.put('/api/rebalance-targets', requireAuth, async (req, res) => {
    try {
      const targets = normalizeTargets(req.body);
      await store.upsertRebalanceTargets(req.user.id, JSON.stringify(targets));
      return res.json({ ok: true, targets });
    } catch (err) {
      console.error('[rebalance] failed to save targets', err);
      return res.status(500).json({ error: 'שגיאת שרת' });
    }
  });
}

module.exports = { mountRebalanceRoutes };
