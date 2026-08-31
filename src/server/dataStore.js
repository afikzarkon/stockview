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
    CREATE TABLE IF NOT EXISTS portfolio_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      snapshot_date TEXT NOT NULL,
      total_value_ils REAL NOT NULL,
      breakdown TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, snapshot_date)
    );
    CREATE TABLE IF NOT EXISTS rebalance_targets (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      targets TEXT NOT NULL,
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
    },
    async upsertPortfolioSnapshot(userId, snapshotDate, totalValueILS, breakdownJson) {
      db.prepare(
        `INSERT INTO portfolio_snapshots (user_id, snapshot_date, total_value_ils, breakdown)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, snapshot_date) DO UPDATE SET
           total_value_ils = excluded.total_value_ils,
           breakdown = excluded.breakdown`
      ).run(userId, snapshotDate, totalValueILS, breakdownJson || null);
    },
    async listPortfolioSnapshots(userId) {
      return db
        .prepare(
          `SELECT snapshot_date, total_value_ils, breakdown
           FROM portfolio_snapshots
           WHERE user_id = ?
           ORDER BY snapshot_date ASC`
        )
        .all(userId)
        .map((row) => ({
          date: row.snapshot_date,
          totalValueILS: row.total_value_ils,
          breakdown: row.breakdown ? JSON.parse(row.breakdown) : null
        }));
    },
    async getRebalanceTargets(userId) {
      const row = db.prepare('SELECT targets FROM rebalance_targets WHERE user_id = ?').get(userId);
      return row && row.targets ? JSON.parse(row.targets) : null;
    },
    async upsertRebalanceTargets(userId, targetsJson) {
      db.prepare(
        `INSERT INTO rebalance_targets (user_id, targets, updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(user_id) DO UPDATE SET
           targets = excluded.targets,
           updated_at = datetime('now')`
      ).run(userId, targetsJson);
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS portfolio_snapshots (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      snapshot_date DATE NOT NULL,
      total_value_ils DOUBLE PRECISION NOT NULL,
      breakdown JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, snapshot_date)
    );
  `);
  await pool.query(
    'CREATE INDEX IF NOT EXISTS portfolio_snapshots_user_date_idx ON portfolio_snapshots (user_id, snapshot_date)'
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rebalance_targets (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      targets JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  const portfolioTables = [
    'user_israeli_stocks',
    'user_american_stocks',
    'user_pension_funds',
    'user_bank_balances',
    'user_cash_funds'
  ];
  for (const table of portfolioTables) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${table} (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        sort_index INTEGER NOT NULL DEFAULT 0,
        item JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS ${table}_user_id_sort_idx ON ${table} (user_id, sort_index)`
    );
  }
  // Add query-friendly generated columns per item type while keeping full JSON compatibility.
  await pool.query(`
    ALTER TABLE user_israeli_stocks
      ADD COLUMN IF NOT EXISTS client_item_id BIGINT GENERATED ALWAYS AS (
        CASE
          WHEN (item->>'id') ~ '^-?\\d+$' THEN (item->>'id')::BIGINT
          ELSE NULL
        END
      ) STORED,
      ADD COLUMN IF NOT EXISTS stock_name TEXT GENERATED ALWAYS AS (item->>'stockName') STORED,
      ADD COLUMN IF NOT EXISTS purchase_date TEXT GENERATED ALWAYS AS (item->>'purchaseDate') STORED,
      ADD COLUMN IF NOT EXISTS purchase_price DOUBLE PRECISION GENERATED ALWAYS AS (
        CASE
          WHEN (item->>'purchasePrice') ~ '^-?\\d+(\\.\\d+)?$' THEN (item->>'purchasePrice')::DOUBLE PRECISION
          ELSE NULL
        END
      ) STORED,
      ADD COLUMN IF NOT EXISTS quantity DOUBLE PRECISION GENERATED ALWAYS AS (
        CASE
          WHEN (item->>'quantity') ~ '^-?\\d+(\\.\\d+)?$' THEN (item->>'quantity')::DOUBLE PRECISION
          ELSE NULL
        END
      ) STORED,
      ADD COLUMN IF NOT EXISTS current_price DOUBLE PRECISION GENERATED ALWAYS AS (
        CASE
          WHEN (item->>'currentPrice') ~ '^-?\\d+(\\.\\d+)?$' THEN (item->>'currentPrice')::DOUBLE PRECISION
          ELSE NULL
        END
      ) STORED,
      ADD COLUMN IF NOT EXISTS daily_change_percent DOUBLE PRECISION GENERATED ALWAYS AS (
        CASE
          WHEN (item->>'dailyChangePercent') ~ '^-?\\d+(\\.\\d+)?$' THEN (item->>'dailyChangePercent')::DOUBLE PRECISION
          ELSE NULL
        END
      ) STORED
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS user_israeli_stocks_stock_name_idx ON user_israeli_stocks (user_id, stock_name)');

  await pool.query(`
    ALTER TABLE user_american_stocks
      ADD COLUMN IF NOT EXISTS client_item_id BIGINT GENERATED ALWAYS AS (
        CASE
          WHEN (item->>'id') ~ '^-?\\d+$' THEN (item->>'id')::BIGINT
          ELSE NULL
        END
      ) STORED,
      ADD COLUMN IF NOT EXISTS stock_name TEXT GENERATED ALWAYS AS (item->>'stockName') STORED,
      ADD COLUMN IF NOT EXISTS purchase_date TEXT GENERATED ALWAYS AS (item->>'purchaseDate') STORED,
      ADD COLUMN IF NOT EXISTS purchase_price DOUBLE PRECISION GENERATED ALWAYS AS (
        CASE
          WHEN (item->>'purchasePrice') ~ '^-?\\d+(\\.\\d+)?$' THEN (item->>'purchasePrice')::DOUBLE PRECISION
          ELSE NULL
        END
      ) STORED,
      ADD COLUMN IF NOT EXISTS quantity DOUBLE PRECISION GENERATED ALWAYS AS (
        CASE
          WHEN (item->>'quantity') ~ '^-?\\d+(\\.\\d+)?$' THEN (item->>'quantity')::DOUBLE PRECISION
          ELSE NULL
        END
      ) STORED,
      ADD COLUMN IF NOT EXISTS exchange_rate DOUBLE PRECISION GENERATED ALWAYS AS (
        CASE
          WHEN (item->>'exchangeRate') ~ '^-?\\d+(\\.\\d+)?$' THEN (item->>'exchangeRate')::DOUBLE PRECISION
          ELSE NULL
        END
      ) STORED,
      ADD COLUMN IF NOT EXISTS current_exchange_rate DOUBLE PRECISION GENERATED ALWAYS AS (
        CASE
          WHEN (item->>'currentExchangeRate') ~ '^-?\\d+(\\.\\d+)?$' THEN (item->>'currentExchangeRate')::DOUBLE PRECISION
          ELSE NULL
        END
      ) STORED,
      ADD COLUMN IF NOT EXISTS current_price DOUBLE PRECISION GENERATED ALWAYS AS (
        CASE
          WHEN (item->>'currentPrice') ~ '^-?\\d+(\\.\\d+)?$' THEN (item->>'currentPrice')::DOUBLE PRECISION
          ELSE NULL
        END
      ) STORED,
      ADD COLUMN IF NOT EXISTS daily_change_percent DOUBLE PRECISION GENERATED ALWAYS AS (
        CASE
          WHEN (item->>'dailyChangePercent') ~ '^-?\\d+(\\.\\d+)?$' THEN (item->>'dailyChangePercent')::DOUBLE PRECISION
          ELSE NULL
        END
      ) STORED
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS user_american_stocks_stock_name_idx ON user_american_stocks (user_id, stock_name)');

  await pool.query(`
    ALTER TABLE user_pension_funds
      ADD COLUMN IF NOT EXISTS client_item_id BIGINT GENERATED ALWAYS AS (
        CASE
          WHEN (item->>'id') ~ '^-?\\d+$' THEN (item->>'id')::BIGINT
          ELSE NULL
        END
      ) STORED,
      ADD COLUMN IF NOT EXISTS fund_name TEXT GENERATED ALWAYS AS (item->>'fundName') STORED,
      ADD COLUMN IF NOT EXISTS update_date TEXT GENERATED ALWAYS AS (item->>'updateDate') STORED,
      ADD COLUMN IF NOT EXISTS initial_investment DOUBLE PRECISION GENERATED ALWAYS AS (
        CASE
          WHEN (item->>'initialInvestment') ~ '^-?\\d+(\\.\\d+)?$' THEN (item->>'initialInvestment')::DOUBLE PRECISION
          ELSE NULL
        END
      ) STORED,
      ADD COLUMN IF NOT EXISTS current_value DOUBLE PRECISION GENERATED ALWAYS AS (
        CASE
          WHEN (item->>'currentValue') ~ '^-?\\d+(\\.\\d+)?$' THEN (item->>'currentValue')::DOUBLE PRECISION
          ELSE NULL
        END
      ) STORED,
      ADD COLUMN IF NOT EXISTS previous_value DOUBLE PRECISION GENERATED ALWAYS AS (
        CASE
          WHEN (item->>'previousValue') ~ '^-?\\d+(\\.\\d+)?$' THEN (item->>'previousValue')::DOUBLE PRECISION
          ELSE NULL
        END
      ) STORED,
      ADD COLUMN IF NOT EXISTS amount DOUBLE PRECISION GENERATED ALWAYS AS (
        CASE
          WHEN (item->>'amount') ~ '^-?\\d+(\\.\\d+)?$' THEN (item->>'amount')::DOUBLE PRECISION
          ELSE NULL
        END
      ) STORED
  `);

  await pool.query(`
    ALTER TABLE user_bank_balances
      ADD COLUMN IF NOT EXISTS client_item_id BIGINT GENERATED ALWAYS AS (
        CASE
          WHEN (item->>'id') ~ '^-?\\d+$' THEN (item->>'id')::BIGINT
          ELSE NULL
        END
      ) STORED,
      ADD COLUMN IF NOT EXISTS update_date TEXT GENERATED ALWAYS AS (item->>'updateDate') STORED,
      ADD COLUMN IF NOT EXISTS amount DOUBLE PRECISION GENERATED ALWAYS AS (
        CASE
          WHEN (item->>'amount') ~ '^-?\\d+(\\.\\d+)?$' THEN (item->>'amount')::DOUBLE PRECISION
          ELSE NULL
        END
      ) STORED
  `);

  await pool.query(`
    ALTER TABLE user_cash_funds
      ADD COLUMN IF NOT EXISTS client_item_id BIGINT GENERATED ALWAYS AS (
        CASE
          WHEN (item->>'id') ~ '^-?\\d+$' THEN (item->>'id')::BIGINT
          ELSE NULL
        END
      ) STORED,
      ADD COLUMN IF NOT EXISTS fund_name TEXT GENERATED ALWAYS AS (item->>'fundName') STORED,
      ADD COLUMN IF NOT EXISTS security_id TEXT GENERATED ALWAYS AS (item->>'securityId') STORED,
      ADD COLUMN IF NOT EXISTS update_date TEXT GENERATED ALWAYS AS (item->>'updateDate') STORED,
      ADD COLUMN IF NOT EXISTS amount DOUBLE PRECISION GENERATED ALWAYS AS (
        CASE
          WHEN (item->>'amount') ~ '^-?\\d+(\\.\\d+)?$' THEN (item->>'amount')::DOUBLE PRECISION
          ELSE NULL
        END
      ) STORED
  `);

  function normalizeSnapshot(input) {
    const parsed =
      input && typeof input === 'object'
        ? input
        : (() => {
            try {
              return JSON.parse(String(input || '{}'));
            } catch {
              return {};
            }
          })();
    return {
      israeliStocks: Array.isArray(parsed.israeliStocks) ? parsed.israeliStocks : [],
      americanStocks: Array.isArray(parsed.americanStocks) ? parsed.americanStocks : [],
      pensionFunds: Array.isArray(parsed.pensionFunds) ? parsed.pensionFunds : [],
      bankBalances: Array.isArray(parsed.bankBalances) ? parsed.bankBalances : [],
      cashFunds: Array.isArray(parsed.cashFunds) ? parsed.cashFunds : []
    };
  }

  async function readItems(client, table, userId) {
    const { rows } = await client.query(
      `SELECT item FROM ${table} WHERE user_id = $1 ORDER BY sort_index ASC, id ASC`,
      [userId]
    );
    return rows.map((r) => r.item);
  }

  async function writeItems(client, table, userId, items) {
    await client.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
    if (!items.length) return;
    const values = [];
    const placeholders = [];
    items.forEach((item, i) => {
      const base = i * 3;
      placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}::jsonb)`);
      values.push(userId, i, JSON.stringify(item));
    });
    await client.query(
      `INSERT INTO ${table} (user_id, sort_index, item) VALUES ${placeholders.join(',')}`,
      values
    );
  }

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
      const client = await pool.connect();
      try {
        // Important: do not run concurrent queries on the same pg client.
        const israeliStocks = await readItems(client, 'user_israeli_stocks', userId);
        const americanStocks = await readItems(client, 'user_american_stocks', userId);
        const pensionFunds = await readItems(client, 'user_pension_funds', userId);
        const bankBalances = await readItems(client, 'user_bank_balances', userId);
        const cashFunds = await readItems(client, 'user_cash_funds', userId);
        const normalized = {
          israeliStocks,
          americanStocks,
          pensionFunds,
          bankBalances,
          cashFunds
        };
        const hasNormalizedData = Object.values(normalized).some((arr) => arr.length > 0);
        if (hasNormalizedData) return JSON.stringify(normalized);

        // Backward compatibility: if legacy snapshot exists, return it as-is.
        const { rows } = await client.query('SELECT payload FROM user_portfolios WHERE user_id = $1', [
          userId
        ]);
        const row = rows[0];
        return row && row.payload != null ? String(row.payload) : null;
      } finally {
        client.release();
      }
    },
    async upsertPortfolio(userId, payloadJson) {
      const snapshot = normalizeSnapshot(payloadJson);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await writeItems(client, 'user_israeli_stocks', userId, snapshot.israeliStocks);
        await writeItems(client, 'user_american_stocks', userId, snapshot.americanStocks);
        await writeItems(client, 'user_pension_funds', userId, snapshot.pensionFunds);
        await writeItems(client, 'user_bank_balances', userId, snapshot.bankBalances);
        await writeItems(client, 'user_cash_funds', userId, snapshot.cashFunds);
        // Keep legacy snapshot row updated for easy inspection and backward compatibility.
        await client.query(
          `INSERT INTO user_portfolios (user_id, payload, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (user_id) DO UPDATE SET
             payload = EXCLUDED.payload,
             updated_at = NOW()`,
          [userId, JSON.stringify(snapshot)]
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    async listUsersWithPortfolio() {
      const { rows } = await pool.query(`
        SELECT u.id, u.email, u.created_at::text AS created_at,
               GREATEST(
                 p.updated_at,
                 (SELECT MAX(updated_at) FROM user_israeli_stocks s WHERE s.user_id = u.id),
                 (SELECT MAX(updated_at) FROM user_american_stocks s WHERE s.user_id = u.id),
                 (SELECT MAX(updated_at) FROM user_pension_funds s WHERE s.user_id = u.id),
                 (SELECT MAX(updated_at) FROM user_bank_balances s WHERE s.user_id = u.id),
                 (SELECT MAX(updated_at) FROM user_cash_funds s WHERE s.user_id = u.id)
               )::text AS portfolio_saved_at
        FROM users u
        LEFT JOIN user_portfolios p ON p.user_id = u.id
        ORDER BY u.id
      `);
      return rows;
    },
    async upsertPortfolioSnapshot(userId, snapshotDate, totalValueILS, breakdownJson) {
      await pool.query(
        `INSERT INTO portfolio_snapshots (user_id, snapshot_date, total_value_ils, breakdown)
         VALUES ($1, $2::date, $3, $4::jsonb)
         ON CONFLICT (user_id, snapshot_date) DO UPDATE SET
           total_value_ils = EXCLUDED.total_value_ils,
           breakdown = EXCLUDED.breakdown`,
        [userId, snapshotDate, totalValueILS, breakdownJson || null]
      );
    },
    async listPortfolioSnapshots(userId) {
      const { rows } = await pool.query(
        `SELECT snapshot_date::text AS snapshot_date, total_value_ils, breakdown
         FROM portfolio_snapshots
         WHERE user_id = $1
         ORDER BY snapshot_date ASC`,
        [userId]
      );
      return rows.map((row) => ({
        date: row.snapshot_date,
        totalValueILS: row.total_value_ils,
        breakdown: row.breakdown || null
      }));
    },
    async getRebalanceTargets(userId) {
      const { rows } = await pool.query('SELECT targets FROM rebalance_targets WHERE user_id = $1', [userId]);
      return rows[0] ? rows[0].targets : null;
    },
    async upsertRebalanceTargets(userId, targetsJson) {
      await pool.query(
        `INSERT INTO rebalance_targets (user_id, targets, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           targets = EXCLUDED.targets,
           updated_at = NOW()`,
        [userId, targetsJson]
      );
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
