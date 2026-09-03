// Monthly portfolio-value checkpoints: one row per user per calendar month,
// storing the total portfolio value (ILS) + a per-category breakdown at the
// time the user chose to save it. A deliberate, separate action from the
// daily snapshots in snapshotRoutes.js (which feed the equity curve/
// drawdown/benchmark comparison) - this is for a slower-cadence, explicit
// "checkpoint my portfolio for this month" the user takes on their own
// schedule, then browses/compares later (see PortfolioAnalysisView.js's
// "מעקב חודשי" section).
const { readAuthUserFromRequest, getJwtSecret } = require('./authRoutes');

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

// "YYYY-MM" for "this month" - computed server-side (never trust the client
// for the date, same reasoning as snapshotRoutes.js's todayDateString()) so
// repeated saves within the same calendar month update that one row
// (upsert) instead of creating a new entry per click.
function currentMonthString() {
  return new Date().toISOString().slice(0, 7);
}

const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function mountMonthlySnapshotRoutes(app, store) {
  app.post('/api/portfolio-monthly-snapshot', requireAuth, async (req, res) => {
    try {
      const body = req.body || {};
      const totalValueILS = Number(body.totalValueILS);
      if (!Number.isFinite(totalValueILS) || totalValueILS < 0) {
        return res.status(400).json({ error: 'totalValueILS לא תקין' });
      }
      const snapshotMonth = currentMonthString();
      const breakdown =
        body.breakdown && typeof body.breakdown === 'object' ? JSON.stringify(body.breakdown) : null;

      await store.upsertMonthlySnapshot(req.user.id, snapshotMonth, totalValueILS, breakdown);
      return res.json({ ok: true, month: snapshotMonth });
    } catch (err) {
      console.error('[monthly-snapshot] failed to save snapshot', err);
      return res.status(500).json({ error: 'שגיאת שרת' });
    }
  });

  // Lets a user deliberately backfill a specific past month they forgot to
  // save (the "➕ הוספה ידנית" flow in PortfolioAnalysisView.js) - unlike the
  // route above, the client *does* choose the month here, since that's the
  // whole point of this endpoint. Still can't be used to date a save into
  // the future.
  app.post('/api/portfolio-monthly-snapshot/manual', requireAuth, async (req, res) => {
    try {
      const body = req.body || {};
      const month = body.month;
      if (typeof month !== 'string' || !MONTH_KEY_RE.test(month)) {
        return res.status(400).json({ error: 'פורמט חודש לא תקין' });
      }
      if (month > currentMonthString()) {
        return res.status(400).json({ error: 'לא ניתן להוסיף שמירה לחודש עתידי' });
      }
      const totalValueILS = Number(body.totalValueILS);
      if (!Number.isFinite(totalValueILS) || totalValueILS < 0) {
        return res.status(400).json({ error: 'totalValueILS לא תקין' });
      }
      const breakdown =
        body.breakdown && typeof body.breakdown === 'object' ? JSON.stringify(body.breakdown) : null;

      await store.upsertMonthlySnapshot(req.user.id, month, totalValueILS, breakdown);
      return res.json({ ok: true, month });
    } catch (err) {
      console.error('[monthly-snapshot] failed to add manual snapshot', err);
      return res.status(500).json({ error: 'שגיאת שרת' });
    }
  });

  app.get('/api/portfolio-monthly-snapshots', requireAuth, async (req, res) => {
    try {
      const snapshots = await store.listMonthlySnapshots(req.user.id);
      return res.json({ snapshots });
    } catch (err) {
      console.error('[monthly-snapshot] failed to list snapshots', err);
      return res.status(500).json({ error: 'שגיאת שרת' });
    }
  });

  // Lets a user correct a month they already saved (see the "ערוך" flow in
  // PortfolioAnalysisView.js's history table) - update-only, on purpose:
  // store.updateMonthlySnapshot() never creates a row. Adding a brand new
  // past month is the manual-add route above, not this one.
  app.put('/api/portfolio-monthly-snapshot/:month', requireAuth, async (req, res) => {
    try {
      const month = req.params.month;
      if (!MONTH_KEY_RE.test(month)) {
        return res.status(400).json({ error: 'פורמט חודש לא תקין' });
      }
      const body = req.body || {};
      const totalValueILS = Number(body.totalValueILS);
      if (!Number.isFinite(totalValueILS) || totalValueILS < 0) {
        return res.status(400).json({ error: 'totalValueILS לא תקין' });
      }
      const breakdown =
        body.breakdown && typeof body.breakdown === 'object' ? JSON.stringify(body.breakdown) : null;

      const updated = await store.updateMonthlySnapshot(req.user.id, month, totalValueILS, breakdown);
      if (!updated) {
        return res.status(404).json({ error: 'לא נמצאה שמירה חודשית לחודש זה - ניתן לערוך רק חודשים שכבר נשמרו' });
      }
      return res.json({ ok: true, month });
    } catch (err) {
      console.error('[monthly-snapshot] failed to update snapshot', err);
      return res.status(500).json({ error: 'שגיאת שרת' });
    }
  });

  // Lets a user permanently remove a specific saved month (see the "מחק"
  // flow in PortfolioAnalysisView.js's history section).
  app.delete('/api/portfolio-monthly-snapshot/:month', requireAuth, async (req, res) => {
    try {
      const month = req.params.month;
      if (!MONTH_KEY_RE.test(month)) {
        return res.status(400).json({ error: 'פורמט חודש לא תקין' });
      }
      const deleted = await store.deleteMonthlySnapshot(req.user.id, month);
      if (!deleted) {
        return res.status(404).json({ error: 'לא נמצאה שמירה חודשית לחודש זה' });
      }
      return res.json({ ok: true, month });
    } catch (err) {
      console.error('[monthly-snapshot] failed to delete snapshot', err);
      return res.status(500).json({ error: 'שגיאת שרת' });
    }
  });
}

module.exports = { mountMonthlySnapshotRoutes };
