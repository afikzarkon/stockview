// Store factories for integration tests: always the real SQLite store (in
// memory), plus the real Postgres store when TEST_DATABASE_URL points at a
// throwaway database - e.g.
//   TEST_DATABASE_URL=postgres://test@localhost:5433/stockview_test npm test
// The Postgres database is WIPED (public schema dropped) before each use, so
// the URL must name a database containing "test".
const { sqliteStore, openSqlite, pgStore } = require('../dataStore');

const pgUrl = process.env.TEST_DATABASE_URL || '';

async function makePgStore() {
  if (!/test/i.test(pgUrl)) throw new Error('TEST_DATABASE_URL must name a test database');
  process.env.DATABASE_SSL = '0';
  const { Pool } = require('pg');
  const admin = new Pool({ connectionString: pgUrl, ssl: false });
  await admin.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  await admin.end();
  const store = await pgStore(pgUrl);
  store.close = () => store.pool.end();
  return store;
}

function makeSqliteStore() {
  const store = sqliteStore(openSqlite(':memory:'));
  store.close = async () => {};
  return store;
}

const STORE_FACTORIES = [['sqlite', makeSqliteStore]];
if (pgUrl) STORE_FACTORIES.push(['postgres', makePgStore]);

module.exports = { STORE_FACTORIES };
