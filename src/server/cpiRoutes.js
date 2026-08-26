// מקור נתונים למדד המחירים לצרכן: ה-API הציבורי של הלמ"ס (הלשכה המרכזית
// לסטטיסטיקה). המדד מתפרסם רק פעם בחודש (ב-15 לחודש, עבור החודש הקודם),
// ולכן אין טעם למשוך אותו בכל טעינה - שומרים אותו בקאש בזיכרון ומרעננים
// רק פעם ביום (למקרה שהתפרסם מדד חדש) או לפי בקשה מפורשת.
//
// ⚠️ הערה חשובה: כתובת ה-API והפרמטרים המדויקים (מספר הסדרה של "מדד
// המחירים לצרכן - כללי") מבוססים על תיעוד הלמ"ס הפומבי, אך לא נבדקו
// מול השרת החי בסביבת הפיתוח הזו (חסימת רשת). מומלץ לוודא ולהתאים
// לפי https://www.cbs.gov.il/he/Pages/מדדי-מחירים-באמצעות-API.aspx
// לפני עלייה לפרודקשן, ובמידת הצורך לעדכן CPI_SERIES_ID ואת פורמט
// התגובה בפונקציה parseCbsResponse.
const axios = require('axios');

const CBS_BASE_URL = 'https://api.cbs.gov.il/index/data/price';
// קוד הסדרה של "מדד המחירים לצרכן - כללי" (יש לוודא מול תיעוד הלמ"ס)
const CPI_SERIES_ID = '120010';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // רענון פעם ביום למדד "הידוע"

// קאש בזיכרון: מדדי עבר קבועים לכל תקופת ריצת השרת (מדד שכבר פורסם
// לא משתנה), ולכן שומרים אותם ללא תפוגה. "המדד הידוע" מתרענן אחת ליום.
// שים לב: הקאש הוא per-mount (בתוך mountCpiRoutes), לא global-module, כדי
// שיהיה אפשר להריץ מספר עותקים מבודדים (כמו בטסטים) בלי לדלוף מצב ביניהם.
function createCpiCache() {
  const monthIndexCache = new Map(); // "YYYY-MM" -> number
  let latestIndexCache = null; // { month: 'YYYY-MM', value: number, fetchedAt: number }
  return {
    monthIndexCache,
    getLatest: () => latestIndexCache,
    setLatest: (v) => { latestIndexCache = v; }
  };
}

function parseCbsResponse(data) {
  // מבנה משוער של תגובת ה-API: { month_data: [{ date: 'YYYY-MM-DD', currBase: [{ index: number }] }] }
  // יש להתאים לפי המבנה האמיתי שמוחזר מהשרת.
  const rows = (data && (data.month_data || data.data)) || [];
  return rows
    .map((row) => {
      const dateStr = row.date || row.period;
      const indexValue = row.currBase && row.currBase[0] ? row.currBase[0].index : row.index;
      if (!dateStr || indexValue == null) return null;
      return { month: String(dateStr).slice(0, 7), value: Number(indexValue) };
    })
    .filter(Boolean);
}

async function fetchCbsSeries({ startPeriod, endPeriod } = {}) {
  const params = {
    id: CPI_SERIES_ID,
    format: 'json',
    download: 'false'
  };
  if (startPeriod) params.startPeriod = startPeriod;
  if (endPeriod) params.endPeriod = endPeriod;

  const response = await axios.get(CBS_BASE_URL, {
    params,
    headers: { 'User-Agent': 'stockview-app/1.0' }, // חובה ע"פ תיעוד הלמ"ס
    timeout: 10000
  });
  return parseCbsResponse(response.data);
}

// מחזיר את ערך המדד לחודש נתון ("YYYY-MM"), עם קאש קבוע (מדדי עבר לא משתנים).
async function getIndexForMonth(cache, monthKey) {
  if (cache.monthIndexCache.has(monthKey)) return cache.monthIndexCache.get(monthKey);

  const [year, month] = monthKey.split('-');
  const period = `${year}${month}`;
  const rows = await fetchCbsSeries({ startPeriod: period, endPeriod: period });
  const match = rows.find((r) => r.month === monthKey);
  if (match) {
    cache.monthIndexCache.set(monthKey, match.value);
    return match.value;
  }
  return null;
}

// מחזיר את "המדד הידוע" האחרון שפורסם, עם רענון פעם ביום.
async function getLatestIndex(cache) {
  const cached = cache.getLatest();
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached;
  }
  const rows = await fetchCbsSeries({ last: 1 });
  const sorted = [...rows].sort((a, b) => (a.month < b.month ? 1 : -1));
  const latest = sorted[0];
  if (latest) {
    const entry = { month: latest.month, value: latest.value, fetchedAt: Date.now() };
    cache.setLatest(entry);
    cache.monthIndexCache.set(latest.month, latest.value);
    return entry;
  }
  throw new Error('CBS API returned no CPI data');
}

function mountCpiRoutes(app) {
  const cache = createCpiCache();

  // GET /api/cpi/latest -> { month: 'YYYY-MM', value: number }
  app.get('/api/cpi/latest', async (req, res) => {
    try {
      const latest = await getLatestIndex(cache);
      return res.json({ month: latest.month, value: latest.value });
    } catch (err) {
      console.error('[cpi] failed to fetch latest index', err.message);
      // fail-safe: אם יש קאש ישן, עדיף להגיש אותו מאשר לשבור את החישוב
      const stale = cache.getLatest();
      if (stale) {
        return res.json({ month: stale.month, value: stale.value, stale: true });
      }
      return res.status(502).json({ error: 'לא ניתן היה למשוך את מדד המחירים לצרכן' });
    }
  });

  // GET /api/cpi/month/:yyyymm -> { month, value }
  app.get('/api/cpi/month/:yyyymm', async (req, res) => {
    const monthKey = req.params.yyyymm;
    if (!/^\d{4}-\d{2}$/.test(monthKey)) {
      return res.status(400).json({ error: 'פורמט חודש לא תקין, נדרש YYYY-MM' });
    }
    try {
      const value = await getIndexForMonth(cache, monthKey);
      if (value == null) {
        return res.status(404).json({ error: `אין נתון מדד לחודש ${monthKey}` });
      }
      return res.json({ month: monthKey, value });
    } catch (err) {
      console.error('[cpi] failed to fetch index for month', monthKey, err.message);
      return res.status(502).json({ error: 'לא ניתן היה למשוך את מדד המחירים לצרכן' });
    }
  });

  // POST /api/cpi/months  { months: ['2020-01', '2023-06', ...] } -> { '2020-01': value, ... }
  // נוח למשיכה מרוכזת של כל התאריכים הרלוונטיים לתיק בבקשה אחת.
  app.post('/api/cpi/months', async (req, res) => {
    const months = Array.isArray(req.body && req.body.months) ? req.body.months : [];
    const result = {};
    for (const monthKey of months) {
      if (!/^\d{4}-\d{2}$/.test(monthKey)) continue;
      try {
        const value = await getIndexForMonth(cache, monthKey);
        if (value != null) result[monthKey] = value;
      } catch (err) {
        console.error('[cpi] failed to fetch index for month', monthKey, err.message);
      }
    }
    return res.json(result);
  });
}

module.exports = { mountCpiRoutes };
