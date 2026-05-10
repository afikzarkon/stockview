const { Pool } = require('pg');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const PG_UNIQUE_VIOLATION = '23505';

function getSqlitePath() {
  if (process.env.DATABASE_PATH) return path.resolve(process.env.DATABASE_PATH);
  return path.join(__dirname, '..', '..', 'data', 'stockview.db');
}

function openSqlite() {
  const dbPath = getSqlitePath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS user_portfolios (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

function sqliteStore(db) {
  return {
    kind: 'sqlite',
    async findUserIdByEmail(email) {
      return db.prepare('SELECT id FROM users WHERE email = ?').get(email) || null;
    },
    async insertUser(email, passwordHash) {
      const r = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(
        email,
        passwordHash
      );
      return { id: Number(r.lastInsertRowid) };
    },
    async findUserForLogin(email) {
      return (
        db.prepare('SELECT id, email, password_hash FROM users WHERE email = ?').get(email) ||
        null
      );
    },
    async getPortfolioPayload(userId) {
      const row = db.prepare('SELECT payload FROM user_portfolios WHERE user_id = ?').get(userId);
      return row && row.payload ? row.payload : null;
    },
    async upsertPortfolio(userId, payloadJson) {
      db.prepare(
        `INSERT INTO user_portfolios (user_id, payload, updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(user_id) DO UPDATE SET
           payload = excluded.payload,
           updated_at = datetime('now')`
      ).run(userId, payloadJson);
    },
    async listUsersWithPortfolio() {
      return db
        .prepare(
          `SELECT u.id, u.email, u.created_at,
                  p.updated_at AS portfolio_saved_at
           FROM users u
           LEFT JOIN user_portfolios p ON p.user_id = u.id
           ORDER BY u.id`
        )
        .all();
    }
  };
}

async function pgStore(connectionString) {
  const sslOff = process.env.DATABASE_SSL === '0' || process.env.DATABASE_SSL === 'false';
  const pool = new Pool({
    connectionString,
    ssl: sslOff ? false : { rejectUnauthorized: false }
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_portfolios (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      payload TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  return {
    kind: 'postgres',
    pool,
    async findUserIdByEmail(email) {
      const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      return rows[0] || null;
    },
    async insertUser(email, passwordHash) {
      const { rows } = await pool.query(
        'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
        [email, passwordHash]
      );
      return { id: Number(rows[0].id) };
    },
    async findUserForLogin(email) {
      const { rows } = await pool.query(
        'SELECT id, email, password_hash FROM users WHERE email = $1',
        [email]
      );
      return rows[0] || null;
    },
    async getPortfolioPayload(userId) {
      const { rows } = await pool.query('SELECT payload FROM user_portfolios WHERE user_id = $1', [
        userId
      ]);
      const row = rows[0];
      return row && row.payload != null ? String(row.payload) : null;
    },
    async upsertPortfolio(userId, payloadJson) {
      await pool.query(
        `INSERT INTO user_portfolios (user_id, payload, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           payload = EXCLUDED.payload,
           updated_at = NOW()`,
        [userId, payloadJson]
      );
    },
    async listUsersWithPortfolio() {
      const { rows } = await pool.query(`
        SELECT u.id, u.email, u.created_at::text AS created_at,
               p.updated_at::text AS portfolio_saved_at
        FROM users u
        LEFT JOIN user_portfolios p ON p.user_id = u.id
        ORDER BY u.id
      `);
      return rows;
    }
  };
}

/**
 * אם DATABASE_URL מוגדר (Supabase / Neon / Render Postgres) → PostgreSQL בשכבה חיצונית (עמיד, לרוב חינם).
 * אחרת → SQLite קובץ מקומי (פיתוח / שרת עם דיסק).
 */
async function initDataStore() {
  const url = process.env.DATABASE_URL && String(process.env.DATABASE_URL).trim();
  if (url) {
    return pgStore(url);
  }
  return sqliteStore(openSqlite());
}

module.exports = { initDataStore, PG_UNIQUE_VIOLATION };
