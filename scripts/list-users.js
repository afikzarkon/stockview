/**
 * מדפיס משתמשים רשומים מה-DB המקומי (בלי סיסמאות).
 * שימוש מתיקיית הפרויקט: npm run db:users
 */
require('dotenv').config();
const { initDb } = require('../src/server/database');

const db = initDb();
const rows = db
  .prepare(
    `SELECT u.id, u.email, u.created_at,
            p.updated_at AS portfolio_saved_at
     FROM users u
     LEFT JOIN user_portfolios p ON p.user_id = u.id
     ORDER BY u.id`
  )
  .all();

if (rows.length === 0) {
  console.log('אין משתמשים רשומים במסד.');
  process.exit(0);
}

console.log('משתמשים רשומים:\n');
for (const r of rows) {
  const saved = r.portfolio_saved_at ? ` | תיק אחרון בשרת: ${r.portfolio_saved_at}` : ' | אין עדיין תיק שמור בשרת';
  console.log(`  #${r.id}  ${r.email}  |  נוצר: ${r.created_at}${saved}`);
}
console.log(`\nסה"כ: ${rows.length}`);
