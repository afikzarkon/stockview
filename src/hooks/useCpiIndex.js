import { useEffect, useState } from 'react';
import { apiUrl } from '../apiBase';

// שולף את "המדד הידוע" העדכני ביותר, ואת ערכי המדד לכל החודשים
// הרלוונטיים לתיק (תאריכי קניית מניות, תאריכי הפקדות לקופות גמל).
// מתרענן כל פעם שהאפליקציה נטענת מחדש (זה עדכון "פתיחת אפליקציה" -
// לא יומי, כי המדד עצמו מתפרסם רק פעם בחודש), ובכל פעם ש-monthKeys
// משתנה (למשל אחרי שנוסף פריט חדש עם תאריך שלא היה קיים קודם).
//
// מחזיר { currentIndex, indexByMonth, loading, error } כדי שקוד שקורא
// לפונקציה יוכל להציג נפילה חזרה (fallback) לחישוב הישן כל עוד המדד
// עדיין לא נטען או שהמשיכה נכשלה - כדי שהאפליקציה לעולם לא "תישבר"
// בגלל תקלה במקור חיצוני.
export function useCpiIndex(monthKeys) {
  const [state, setState] = useState({
    currentIndex: null,
    currentIndexMonth: null,
    indexByMonth: {},
    loading: true,
    error: null
  });

  const monthKeysKey = JSON.stringify([...new Set((monthKeys || []).filter(Boolean))].sort());

  useEffect(() => {
    let cancelled = false;
    const uniqueMonths = [...new Set((monthKeys || []).filter(Boolean))];

    async function load() {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const [latestRes, monthsRes] = await Promise.all([
          fetch(apiUrl('/api/cpi/latest')),
          uniqueMonths.length > 0
            ? fetch(apiUrl('/api/cpi/months'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ months: uniqueMonths })
              })
            : Promise.resolve(null)
        ]);

        if (cancelled) return;

        const latest = latestRes.ok ? await latestRes.json() : null;
        const monthsMap = monthsRes && monthsRes.ok ? await monthsRes.json() : {};

        setState({
          currentIndex: latest ? latest.value : null,
          currentIndexMonth: latest ? latest.month : null,
          indexByMonth: monthsMap || {},
          loading: false,
          error: latest ? null : 'לא ניתן היה למשוך את מדד המחירים לצרכן'
        });
      } catch (err) {
        if (cancelled) return;
        setState((prev) => ({ ...prev, loading: false, error: err.message || 'שגיאה במשיכת המדד' }));
      }
    }

    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKeysKey]);

  return state;
}
