/**
 * מדפיס משתמשים רשומים מה-DB (בלי סיסמאות).
 * שימוש מתיקיית הפרויקט: npm run db:users
 */
require('dotenv').config();
const { initDataStore } = require('../src/server/dataStore');

(async () => {
  let store;
  try {
    store = await initDataStore();
    const rows = await store.listUsersWithPortfolio();

    if (rows.length === 0) {
      console.log('אין משתמשים רשומים במסד.');
      process.exit(0);
    }

    console.log('משתמשים רשומים:\n');
    for (const r of rows) {
      const saved = r.portfolio_saved_at
        ? ` | תיק אחרון בשרת: ${r.portfolio_saved_at}`
        : ' | אין עדיין תיק שמור בשרת';
      console.log(`  #${r.id}  ${r.email}  |  נוצר: ${r.created_at}${saved}`);
    }
    console.log(`\nסה״כ: ${rows.length}  (${store.kind})`);
    if (store.pool) await store.pool.end();
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
