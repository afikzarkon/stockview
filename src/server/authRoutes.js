const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'auth_token';
const BCRYPT_ROUNDS = 12;
const JWT_TTL = '7d';

function getJwtSecret() {
  const s = process.env.JWT_SECRET;
  if (!s || String(s).trim() === '') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET must be set in production');
    }
    return 'stockview-dev-secret-change-me';
  }
  return s;
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production'
  };
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  const s = normalizeEmail(email);
  if (s.length < 5 || s.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function mountAuthRoutes(app, db) {
  const JWT_SECRET = getJwtSecret();

  app.get('/api/auth/me', (req, res) => {
    const token = req.cookies ? req.cookies[COOKIE_NAME] : null;
    if (!token) return res.json({ user: null });
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      return res.json({
        user: { id: payload.sub, email: payload.email }
      });
    } catch {
      res.clearCookie(COOKIE_NAME, { path: '/', sameSite: 'lax' });
      return res.json({ user: null });
    }
  });

  app.post('/api/auth/register', (req, res) => {
    const email = normalizeEmail(req.body && req.body.email);
    const password = req.body && req.body.password != null ? String(req.body.password) : '';

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'כתובת אימייל לא תקינה' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'הסיסמה חייבת להכיל לפחות 8 תווים' });
    }

    let existing;
    try {
      existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    } catch (e) {
      return res.status(500).json({ error: 'שגיאת שרת' });
    }
    if (existing) {
      return res.status(409).json({ error: 'כתובת האימייל כבר רשומה במערכת' });
    }

    const passwordHash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
    let result;
    try {
      result = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(
        email,
        passwordHash
      );
    } catch (e) {
      if (e && e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ error: 'כתובת האימייל כבר רשומה במערכת' });
      }
      return res.status(500).json({ error: 'שגיאת שרת' });
    }

    const user = { id: result.lastInsertRowid, email };
    const token = jwt.sign(
      { sub: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_TTL }
    );
    res.cookie(COOKIE_NAME, token, cookieOptions());
    return res.status(201).json({ user });
  });

  app.post('/api/auth/login', (req, res) => {
    const email = normalizeEmail(req.body && req.body.email);
    const password = req.body && req.body.password != null ? String(req.body.password) : '';

    if (!email || !password) {
      return res.status(400).json({ error: 'יש למלא אימייל וסיסמה' });
    }

    const row = db.prepare('SELECT id, email, password_hash FROM users WHERE email = ?').get(
      email
    );
    if (!row || !bcrypt.compareSync(password, row.password_hash)) {
      return res.status(401).json({ error: 'אימייל או סיסמה שגויים' });
    }

    const user = { id: row.id, email: row.email };
    const token = jwt.sign(
      { sub: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_TTL }
    );
    res.cookie(COOKIE_NAME, token, cookieOptions());
    return res.json({ user });
  });

  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie(COOKIE_NAME, { path: '/', sameSite: 'lax' });
    return res.json({ ok: true });
  });
}

module.exports = { mountAuthRoutes, getJwtSecret, COOKIE_NAME };
