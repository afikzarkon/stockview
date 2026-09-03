import './App.css';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { formatPriceWithSign, normalizeIsraeliStocksFromStorage } from './utils/formatters';
import { calculatePortfolioSummary } from './utils/portfolioSummary';
import { applyPensionValueEditPayload } from './utils/portfolioMath';
import { calculatePortfolioAnalysis } from './utils/portfolioAnalysis';
import { fetchCurrentPrice, fetchIsraeliStockPrice, fetchHistoricalExchangeRate } from './api/stockPrices';
import { apiUrl } from './apiBase';
import { useAuth } from './hooks/useAuth';
import { usePortfolioData } from './hooks/usePortfolioData';
import { usePriceRefresh } from './hooks/usePriceRefresh';
import { useCpiIndex } from './hooks/useCpiIndex';
import { usePortfolioSnapshots } from './hooks/usePortfolioSnapshots';
import { useMonthlySnapshots } from './hooks/useMonthlySnapshots';
import { buildItemizedMonthlyBreakdown } from './utils/monthlySnapshotBreakdown';
import { useRebalanceTargets } from './hooks/useRebalanceTargets';
import { useTheme } from './hooks/useTheme';
import { monthKeyFromDate } from './utils/cpiTax';
import StockFormView from './components/StockFormView';
import PortfolioAnalysisView from './components/PortfolioAnalysisView';
import StockResearchView from './components/StockResearchView';
import HomeView from './components/HomeView';
import AuthView from './components/AuthView';
import TopNav from './components/TopNav';
import ThemeToggleButton from './components/ThemeToggleButton';

const LEGACY_KEYS = [
  'israeliStocks',
  'americanStocks',
  'pensionFunds',
  'bankBalances',
  'cashFunds'
];

function legacyImportFlagKey(userId) {
  return `stockview_legacy_import_done_${userId}`;
}

function readLegacyPortfolioFromLocalStorage() {
  try {
    const parseArr = (key) => {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    };
    const israeliRaw = localStorage.getItem('israeliStocks');
    const israeliParsed = israeliRaw ? JSON.parse(israeliRaw) : [];
    return {
      israeliStocks: normalizeIsraeliStocksFromStorage(
        Array.isArray(israeliParsed) ? israeliParsed : []
      ),
      americanStocks: parseArr('americanStocks'),
      pensionFunds: parseArr('pensionFunds'),
      bankBalances: parseArr('bankBalances'),
      cashFunds: parseArr('cashFunds')
    };
  } catch {
    return null;
  }
}

function portfolioHasAnyRows(p) {
  if (!p) return false;
  return (
    p.israeliStocks.length > 0 ||
    p.americanStocks.length > 0 ||
    p.pensionFunds.length > 0 ||
    p.bankBalances.length > 0 ||
    p.cashFunds.length > 0
  );
}

function clearLegacyPortfolioKeys() {
  LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
}

function App() {
  const { user, authLoading, authHeader, login, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const {
    israeliStocks,
    setIsraeliStocks,
    americanStocks,
    setAmericanStocks,
    pensionFunds,
    setPensionFunds,
    bankBalances,
    setBankBalances,
    cashFunds,
    setCashFunds,
    portfolioReady,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    saveLoading,
    saveError,
    lastSavedAt,
    savePortfolio,
    replacePortfolio,
    resetPortfolio
  } = usePortfolioData(user, authHeader);

  const [showForm, setShowForm] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showStockResearch, setShowStockResearch] = useState(false);
  const [isAddingNewStock, setIsAddingNewStock] = useState(false);
  const [formData, setFormData] = useState({
    itemType: 'stock',
    stockName: '',
    securityId: '',
    purchaseDate: '',
    purchasePrice: '',
    initialInvestment: '',
    currentValue: '',
    previousValue: '',
    isLinkedToIndex: false,
    currentValueDate: '',
    previousValueDate: '',
    quantity: '',
    exchange: 'israeli',
    exchangeRate: ''
  });
  // State for fillHistoricalExchangeRate (auto-filling the exchange-rate
  // field from the real USD/ILS rate on the purchase date) - the manual
  // input only ever shows once exchangeRateNotFound is true, i.e. the
  // automatic lookup genuinely came back empty for that date.
  const [exchangeRateFetching, setExchangeRateFetching] = useState(false);
  const [exchangeRateNotFound, setExchangeRateNotFound] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingStock, setEditingStock] = useState(null);
  const [showAmericanColumns, setShowAmericanColumns] = useState(true);
  const [editingField, setEditingField] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});

  const [legacyImportCompleted, setLegacyImportCompleted] = useState(false);
  const [legacyImportLoading, setLegacyImportLoading] = useState(false);
  const [legacyImportBanner, setLegacyImportBanner] = useState('');

  usePriceRefresh({
    israeliStocks,
    americanStocks,
    setIsraeliStocks,
    setAmericanStocks,
    isEditMode,
    editingField,
    isAddingNewStock
  });

  // כל חודשי המדד הרלוונטיים לתיק: תאריכי קניית מניות ישראליות +
  // תאריכי כל הפקדה בפנקס ההפקדות של כל קופת גמל. משמש לחישוב מס
  // רווח הון ריאלי מוצמד למדד (ראו utils/cpiTax.js).
  const relevantCpiMonths = [
    ...israeliStocks.map((s) => monthKeyFromDate(s.purchaseDate)),
    ...pensionFunds.flatMap((f) => (Array.isArray(f.deposits) ? f.deposits : []).map((d) => monthKeyFromDate(d.date)))
  ].filter(Boolean);

  const cpi = useCpiIndex(relevantCpiMonths);

  // Computed once here (not just inside the "show analysis" branch) so it
  // can also feed the snapshot-saving hook below, regardless of which
  // screen is currently visible. Cheap pure-JS reduce over the portfolio
  // arrays, so recomputing on relevant changes is fine.
  const analysis = useMemo(
    () => calculatePortfolioAnalysis(israeliStocks, americanStocks, pensionFunds, cashFunds, bankBalances),
    [israeliStocks, americanStocks, pensionFunds, cashFunds, bankBalances]
  );

  // Itemized (one entry per actual holding/account, not just a category
  // total) so the monthly-snapshot comparison/history can show per-stock
  // movement (see utils/monthlySnapshotBreakdown.js). Reused for the daily
  // snapshot too - it's a strict superset of the old flat-number shape
  // (category totals are just the sum of a category's items), and nothing
  // currently reads the daily snapshot's breakdown for anything but this.
  const snapshotBreakdown = useMemo(
    () => buildItemizedMonthlyBreakdown(analysis, pensionFunds, cashFunds, bankBalances),
    [analysis, pensionFunds, cashFunds, bankBalances]
  );

  const {
    snapshots,
    snapshotsLoading,
    saveSnapshotNow,
    saving: snapshotSaving,
    saveError: snapshotSaveError,
    lastSavedAt: lastSnapshotSavedAt
  } = usePortfolioSnapshots(user, authHeader);

  // Snapshot saving is manual (a button, not automatic) - see
  // usePortfolioSnapshots.js for why. Guarded by portfolioReady so a click
  // during the brief "empty arrays" initial-load state can't save a bogus
  // 0-value snapshot (saveSnapshotNow itself also guards against <= 0).
  const handleSaveSnapshot = () => {
    if (!portfolioReady) return;
    saveSnapshotNow(analysis.summaryMetrics.overallTotalValueILS, snapshotBreakdown);
  };

  const {
    monthlySnapshots,
    monthlySnapshotsLoading,
    saveMonthlySnapshot,
    savingMonthly,
    saveMonthlyError,
    updateMonthlySnapshot,
    updatingMonth,
    updateMonthlyError,
    deleteMonthlySnapshot,
    deletingMonth,
    deleteMonthlyError,
    addManualMonthlySnapshot,
    addingManual,
    addManualError
  } = useMonthlySnapshots(user, authHeader);

  // Confirms before every save, since the comparison table is only
  // meaningful if the checkpoint is taken on a consistent day each month -
  // saving on the 3rd one month and the 27th the next would make a
  // "month-over-month" change look bigger/smaller than it really is.
  const handleSaveMonthlySnapshot = () => {
    if (!portfolioReady) return;
    const ok = window.confirm(
      'שימו לב: על מנת שהנתונים יהיו רלוונטיים ומדויקים עבור המעקב, מומלץ לבצע את השמירה תמיד בתאריך קבוע בחודש (לדוגמה, ב-10 לחודש).'
    );
    if (!ok) return;
    saveMonthlySnapshot(analysis.summaryMetrics.overallTotalValueILS, snapshotBreakdown);
  };


  const {
    targets: rebalanceTargets,
    loading: rebalanceTargetsLoading,
    saving: rebalanceSaving,
    saveError: rebalanceSaveError,
    saveTargets: saveRebalanceTargets
  } = useRebalanceTargets(user, authHeader);

  useEffect(() => {
    if (!user || !user.id) {
      setLegacyImportCompleted(false);
      return;
    }
    setLegacyImportCompleted(localStorage.getItem(legacyImportFlagKey(user.id)) === '1');
  }, [user]);






  const handleAddInfo = () => {
    setIsEditMode(false);
    setEditingStock(null);
    setIsAddingNewStock(true);
    setShowForm(true);
  };

  const handleLogout = async () => {
    await logout();
    resetPortfolio();
    setShowForm(false);
    setShowAnalysis(false);
    setLegacyImportBanner('');
  };

  const handleLegacyImportOnce = async () => {
    if (!user || legacyImportLoading) return;
    const snapshot = readLegacyPortfolioFromLocalStorage();
    if (!portfolioHasAnyRows(snapshot)) {
      window.alert('לא נמצאו נתונים ישנים בדפדפן (localStorage).');
      return;
    }
    const ok = window.confirm(
      'יובאו לתיק שלך בשרת הנתונים שנשמרו בעבר בדפדפן הזה.\n\n' +
        'אם כבר בנית תיק בשרת — הוא יוחלף במלואו בנתוני הייבוא.\n\n' +
        'להמשיך?'
    );
    if (!ok) return;

    setLegacyImportLoading(true);
    setLegacyImportBanner('');
    try {
      const r = await fetch(apiUrl('/api/portfolio'), {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({
          israeliStocks: snapshot.israeliStocks,
          americanStocks: snapshot.americanStocks,
          pensionFunds: snapshot.pensionFunds,
          bankBalances: snapshot.bankBalances,
          cashFunds: snapshot.cashFunds
        })
      });
      if (!r.ok) throw new Error('save failed');
      replacePortfolio(snapshot);
      clearLegacyPortfolioKeys();
      localStorage.setItem(legacyImportFlagKey(user.id), '1');
      setLegacyImportCompleted(true);
      setLegacyImportBanner('ייבוא מהדפדפן הושלם — הנתונים נשמרו בשרת.');
    } catch {
      window.alert('שמירת הייבוא נכשלה. נסה שוב או בדוק שהשרת רץ.');
    } finally {
      setLegacyImportLoading(false);
    }
  };

  const legacySnapshot = readLegacyPortfolioFromLocalStorage();
  const showLegacyImportButton =
    portfolioReady &&
    user &&
    !legacyImportCompleted &&
    portfolioHasAnyRows(legacySnapshot);

  // Auto-fills the exchange-rate field from the real USD/ILS rate on the
  // stock's purchase date, instead of requiring the user to look it up and
  // type it in - the manual input only appears at all once this genuinely
  // can't find a rate (exchangeRateNotFound), not as a default option.
  const fillHistoricalExchangeRate = async (dateStr) => {
    setExchangeRateFetching(true);
    setExchangeRateNotFound(false);
    try {
      const rate = await fetchHistoricalExchangeRate(dateStr);
      if (rate !== null) {
        // Yahoo returns full floating-point precision (e.g.
        // 3.8533899784088135) - rounded to 4 decimals to match this
        // field's own step, so a later manual edit (or the browser's
        // native number-input validation on submit) doesn't choke on a
        // "3.8533899784088135 isn't a multiple of step 0.0001" mismatch.
        setFormData(prev => ({ ...prev, exchangeRate: rate.toFixed(4) }));
      } else {
        setExchangeRateNotFound(true);
      }
    } finally {
      setExchangeRateFetching(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Triggers fillHistoricalExchangeRate whenever the combination that
  // makes it meaningful becomes true (stock + American exchange + a
  // purchase date) - a useEffect rather than hand-wiring the fetch into
  // handleInputChange's purchaseDate/exchange branches specifically, so it
  // fires no matter which order the user fills the two fields in (date
  // first, then exchange - or the other way around), instead of only
  // covering the two orderings that were explicitly coded for. lastFetchKeyRef
  // avoids re-fetching for the exact same date if the user just toggles
  // exchange back and forth without actually changing the date.
  const lastAutoFetchKeyRef = useRef(null);
  useEffect(() => {
    if (formData.itemType !== 'stock' || formData.exchange !== 'american' || !formData.purchaseDate) {
      lastAutoFetchKeyRef.current = null;
      return;
    }
    if (lastAutoFetchKeyRef.current === formData.purchaseDate) return;
    lastAutoFetchKeyRef.current = formData.purchaseDate;
    fillHistoricalExchangeRate(formData.purchaseDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.itemType, formData.exchange, formData.purchaseDate]);

  // Explicit manual trigger (a button next to the field) alongside the
  // automatic effect above - always available as a reliable fallback if
  // the automatic fetch didn't land for any reason (a network hiccup, or
  // the user changing the date faster than the request could resolve).
  const handlePullExchangeRate = () => {
    if (formData.purchaseDate) fillHistoricalExchangeRate(formData.purchaseDate);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log('🚀 handleSubmit נקרא!');
    console.log('📝 נתוני הטופס:', formData);
    
    // קבלת מחיר נוכחי ואחוז שינוי יומי מ-API
    let currentPrice = 0;
    let dailyChangePercent = 0;
    
    if (formData.exchange === 'american') {
      const priceData = await fetchCurrentPrice(formData.stockName.trim());
      if (priceData) {
        currentPrice = priceData.currentPrice || 0;
        dailyChangePercent = priceData.changePercent || 0;
      }
    } else if (formData.exchange === 'israeli') {
      const stockId = formData.stockName.trim();
      const priceData = await fetchIsraeliStockPrice(stockId);
      if (priceData && priceData.currentPrice !== null) {
        const normalizedPrice = priceData.currentPrice / 100; // המרה מאגורות לשקלים
        currentPrice = normalizedPrice;
        dailyChangePercent = priceData.changePercent || 0;
      }
      // אם לא מתקבל מחיר, המחיר נשאר 0 (כפי שהוגדר בתחילת הפונקציה)
    }
    
    // יצירת ושמירת אובייקט לפי סוג פריט
    if (formData.itemType === 'stock') {
      const stockData = {
        id: Date.now(),
        stockName: formData.stockName,
        purchaseDate: formData.purchaseDate,
        purchasePrice: parseFloat(formData.purchasePrice),
        quantity: parseInt(formData.quantity),
        exchangeRate: formData.exchange === 'american' ? parseFloat(formData.exchangeRate) : null,
        currentPrice: currentPrice,
        dailyChangePercent: dailyChangePercent
      };
      console.log('💾 שומר מנייה/כספית חדשה:', stockData);
      if (formData.exchange === 'israeli') {
        const updatedIsraeliStocks = [...israeliStocks, stockData];
        setIsraeliStocks(updatedIsraeliStocks);
        setHasUnsavedChanges(true);
      } else {
        const updatedAmericanStocks = [...americanStocks, stockData];
        setAmericanStocks(updatedAmericanStocks);
        setHasUnsavedChanges(true);
      }
    } else if (formData.itemType === 'cash_fund') {
      const cashItem = {
        id: Date.now(),
        fundName: formData.stockName,
        securityId: formData.securityId,
        updateDate: formData.purchaseDate,
        amount: parseFloat(formData.purchasePrice)
      };
      const updatedCashFunds = [...cashFunds, cashItem];
      setCashFunds(updatedCashFunds);
      setHasUnsavedChanges(true);
    } else if (formData.itemType === 'pension') {
      // בדיוק כמו מניות: מתקבצים אוטומטית לפי שם זהה, בלי לבחור "חדש/קיים".
      const depositAmount = parseFloat(formData.initialInvestment) || 0;
      const depositDate = formData.purchaseDate;
      const trimmedName = (formData.stockName || '').trim();
      const existingFund = pensionFunds.find((fund) => fund.fundName === trimmedName);

      if (existingFund) {
        // קופה קיימת עם אותו שם בדיוק: מוסיפים שורה חדשה לפנקס ההפקדות
        // שלה בלבד. currentValue/previousValue/isLinkedToIndex של הקופה
        // הקיימת לא משתנים (אלה מתעדכנים בנפרד דרך הטבלה, לא כאן).
        const updatedPensionFunds = pensionFunds.map((fund) =>
          fund.fundName === trimmedName
            ? { ...fund, deposits: [...(Array.isArray(fund.deposits) ? fund.deposits : []), { date: depositDate, amount: depositAmount }] }
            : fund
        );
        setPensionFunds(updatedPensionFunds);
        setHasUnsavedChanges(true);
      } else {
        // שם חדש: פותחים קופה חדשה. "שווי נוכחי" מתחיל שווה לסכום
        // ההפקדה (עדיין לא הספיק לצמוח/לרדת) - בדיוק כמו שמחיר מניה
        // מתחיל שווה למחיר הקנייה עד לעדכון הראשון. אפשר (וכדאי) לעדכן
        // את זה בהמשך דרך הטבלה כשיש שווי אמיתי ועדכני.
        const pensionItem = {
          id: Date.now(),
          fundName: trimmedName,
          isLinkedToIndex: !!formData.isLinkedToIndex,
          currentValue: depositAmount,
          currentValueDate: depositDate,
          previousValue: 0,
          previousValueDate: '',
          deposits: [{ date: depositDate, amount: depositAmount }],
          amount: depositAmount
        };
        const updatedPensionFunds = [...pensionFunds, pensionItem];
        setPensionFunds(updatedPensionFunds);
        setHasUnsavedChanges(true);
      }
    } else if (formData.itemType === 'bank') {
      const bankItem = {
        id: Date.now(),
        updateDate: formData.purchaseDate,
        amount: parseFloat(formData.purchasePrice)
      };
      const updatedBankBalances = [...bankBalances, bankItem];
      setBankBalances(updatedBankBalances);
      setHasUnsavedChanges(true);
    }

    setShowForm(false);
    setIsAddingNewStock(false);
    
    // איפוס הטופס
    setFormData({
      itemType: 'stock',
      stockName: '',
      securityId: '',
      purchaseDate: '',
      purchasePrice: '',
      initialInvestment: '',
      currentValue: '',
      previousValue: '',
      isLinkedToIndex: false,
    currentValueDate: '',
    previousValueDate: '',
      quantity: '',
      exchange: 'israeli',
      exchangeRate: ''
    });
  };

  const handleBackToHome = () => {
    setShowForm(false);
  };

  // Single navigation entry point for TopNav (and, via onBack, the pages'
  // own existing back buttons) - clears whichever "show X" flag isn't the
  // target page. 'home' clears both, same as the original handleBackToHome.
  const handleNavigate = (page) => {
    setShowForm(false);
    setShowAnalysis(page === 'analysis');
    setShowStockResearch(page === 'research');
  };

  const activePage = showAnalysis ? 'analysis' : showStockResearch ? 'research' : 'home';

  // פונקציה למחיקת מנייה
  const handleDelete = (id, exchange) => {
    if (exchange === 'israeli') {
      const updatedIsraeliStocks = israeliStocks.filter(stock => stock.id !== id);
      setIsraeliStocks(updatedIsraeliStocks);
      setHasUnsavedChanges(true);
    } else if (exchange === 'american') {
      const updatedAmericanStocks = americanStocks.filter(stock => stock.id !== id);
      setAmericanStocks(updatedAmericanStocks);
      setHasUnsavedChanges(true);
    } else if (exchange === 'pension') {
      const updatedPensionFunds = pensionFunds.filter(item => item.id !== id);
      setPensionFunds(updatedPensionFunds);
      setHasUnsavedChanges(true);
    } else if (exchange === 'bank') {
      const updatedBankBalances = bankBalances.filter(item => item.id !== id);
      setBankBalances(updatedBankBalances);
      setHasUnsavedChanges(true);
    } else if (exchange === 'cash_fund') {
      const updatedCashFunds = cashFunds.filter(item => item.id !== id);
      setCashFunds(updatedCashFunds);
      setHasUnsavedChanges(true);
    }
  };


  // פונקציה לשמירת עריכה
  const handleSaveEdit = async () => {
    if (!formData.stockName || !formData.purchasePrice || !formData.quantity || !formData.purchaseDate) {
      alert('אנא מלא את כל השדות');
      return;
    }
    
    if (!editingStock) {
      alert('שגיאה: לא נמצאה מנייה לעריכה');
      return;
    }
    
    let currentPrice = editingStock.currentPrice;
    let dailyChangePercent = editingStock.dailyChangePercent;
    
    if (formData.exchange === 'american') {
      const priceData = await fetchCurrentPrice(formData.stockName.trim());
      if (priceData) {
        currentPrice = priceData.currentPrice || 0;
        dailyChangePercent = priceData.changePercent || 0;
      }
    } else if (formData.exchange === 'israeli') {
      // מנייה ישראלית - שומרים את המחיר הנוכחי ואחוז השינוי הקיימים
      // currentPrice ו-dailyChangePercent כבר מוגדרים מהערכים הקיימים
    }
    
    const updatedStock = {
      ...editingStock,
      stockName: formData.stockName,
      purchasePrice: parseFloat(formData.purchasePrice),
      quantity: parseInt(formData.quantity),
      purchaseDate: formData.purchaseDate,
      currentPrice: currentPrice,
      dailyChangePercent: dailyChangePercent
    };
    
    if (formData.exchange === 'israeli') {
      const updatedIsraeliStocks = israeliStocks.map(stock => 
        stock.id === editingStock.id ? updatedStock : stock
      );
      setIsraeliStocks(updatedIsraeliStocks);
      setHasUnsavedChanges(true);
    } else {
      const updatedAmericanStocks = americanStocks.map(stock => 
        stock.id === editingStock.id ? updatedStock : stock
      );
      setAmericanStocks(updatedAmericanStocks);
      setHasUnsavedChanges(true);
    }
    
    setIsEditMode(false);
    setEditingStock(null);
    setFormData({
      stockName: '',
      securityId: '',
      purchasePrice: '',
      initialInvestment: '',
      currentValue: '',
      previousValue: '',
      isLinkedToIndex: false,
    currentValueDate: '',
    previousValueDate: '',
      quantity: '',
      purchaseDate: '',
      exchange: 'israeli',
      exchangeRate: ''
    });
  };

  // פונקציה לביטול עריכה
  const handleCancelEdit = () => {
    setIsEditMode(false);
    setEditingStock(null);
    setFormData({
      stockName: '',
      securityId: '',
      purchasePrice: '',
      initialInvestment: '',
      currentValue: '',
      previousValue: '',
      isLinkedToIndex: false,
    currentValueDate: '',
    previousValueDate: '',
      quantity: '',
      purchaseDate: '',
      exchange: 'israeli',
      exchangeRate: ''
    });
  };


  // פונקציה לעריכה inline
  const handleInlineEdit = (id, field, value, exchange) => {
    console.log(`✏️ עריכה: ${field} = ${value} עבור מנייה ${id}`);
    if (exchange === 'israeli') {
      const updatedIsraeliStocks = israeliStocks.map(stock => 
        stock.id === id ? { ...stock, [field]: value } : stock
      );
      setIsraeliStocks(updatedIsraeliStocks);
      setHasUnsavedChanges(true);
    } else if (exchange === 'american') {
      const updatedAmericanStocks = americanStocks.map(stock => 
        stock.id === id ? { ...stock, [field]: value } : stock
      );
      setAmericanStocks(updatedAmericanStocks);
      setHasUnsavedChanges(true);
    } else if (exchange === 'pension') {
      const updatedPensionFunds = pensionFunds.map(item => {
        if (item.id !== id) return item;
        // כשמעדכנים את השווי הנוכחי, זו "סגירת תקופה": השווי הישן עובר
        // להיות "השווי הקודם" (עם התאריך הישן שלו). הפקדות שבוצעו בין
        // שני התאריכים מזוהות אוטומטית לפי הפנקס בזמן חישוב התשואה
        // (ראו calculatePensionPeriodReturn), לא כאן.
        // value מגיע כ-{ value, date } מדיאלוג העריכה ב-FinancialAccountsTables
        // (שמבקש את שניהם באותה פעולה, ראו applyPensionValueEditPayload).
        if (field === 'currentValue') {
          return applyPensionValueEditPayload(item, value);
        }
        return { ...item, [field]: value };
      });
      setPensionFunds(updatedPensionFunds);
      setHasUnsavedChanges(true);
    } else if (exchange === 'bank') {
      const updatedBankBalances = bankBalances.map(item => 
        item.id === id ? { ...item, [field]: value } : item
      );
      setBankBalances(updatedBankBalances);
      setHasUnsavedChanges(true);
    } else if (exchange === 'cash_fund') {
      const updatedCashFunds = cashFunds.map(item => 
        item.id === id ? { ...item, [field]: value } : item
      );
      setCashFunds(updatedCashFunds);
      setHasUnsavedChanges(true);
    }
  };

  // פונקציה להתחלת עריכה inline
  const startInlineEdit = (id, field) => {
    setEditingField(`${id}-${field}`);
  };

  // פונקציה לסיום עריכה inline
  const finishInlineEdit = () => {
    setEditingField(null);
  };

  // פונקציה לטיפול בלחיצה על תא
  const handleCellClick = (id, field, exchange) => {
    if (isEditMode) {
      startInlineEdit(id, field);
    }
  };

  // פונקציה לטיפול בלחיצה על מקש Enter
  const handleKeyDown = (e, id, field, exchange) => {
    if (e.key === 'Enter') {
      finishInlineEdit();
    }
  };

  // Toggle expand/collapse of a grouped row (touches state, stays in App)
  const toggleGroup = (stockName, exchange) => {
    const key = `${exchange}-${stockName}`;
    setExpandedGroups(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };


  if (authLoading) {
    return (
      <div className="App">
        <div className="auth-loading-wrap">
          <p className="auth-loading-text">טוען…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="App">
        <div className="auth-theme-toggle-wrap">
          <ThemeToggleButton theme={theme} onToggleTheme={toggleTheme} />
        </div>
        <AuthView onAuthenticated={login} />
      </div>
    );
  }

  if (!portfolioReady) {
    return (
      <div className="App">
        <div className="auth-loading-wrap">
          <p className="auth-loading-text">טוען את תיק ההשקעות מהשרת…</p>
        </div>
      </div>
    );
  }

  if (showForm) {
    return (
      <>
        <TopNav
          activePage={activePage}
          onNavigate={handleNavigate}
          user={user}
          onLogout={handleLogout}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
        <StockFormView
          isEditMode={isEditMode}
          formData={formData}
          pensionFunds={pensionFunds}
          handleSubmit={handleSubmit}
          handleInputChange={handleInputChange}
          handleBackToHome={handleBackToHome}
          handleSaveEdit={handleSaveEdit}
          handleCancelEdit={handleCancelEdit}
          exchangeRateFetching={exchangeRateFetching}
          exchangeRateNotFound={exchangeRateNotFound}
          onPullExchangeRate={handlePullExchangeRate}
        />
      </>
    );
  }

  if (showAnalysis) {
    return (
      <>
        <TopNav
          activePage={activePage}
          onNavigate={handleNavigate}
          user={user}
          onLogout={handleLogout}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
        <PortfolioAnalysisView
          analysis={analysis}
          formatPriceWithSign={formatPriceWithSign}
          onBack={() => handleNavigate('home')}
          snapshots={snapshots}
          snapshotsLoading={snapshotsLoading}
          americanStocks={americanStocks}
          israeliStocks={israeliStocks}
          pensionFunds={pensionFunds}
          cpi={cpi}
          rebalanceTargets={rebalanceTargets}
          rebalanceTargetsLoading={rebalanceTargetsLoading}
          rebalanceSaving={rebalanceSaving}
          rebalanceSaveError={rebalanceSaveError}
          onSaveRebalanceTargets={saveRebalanceTargets}
          monthlySnapshots={monthlySnapshots}
          monthlySnapshotsLoading={monthlySnapshotsLoading}
          onSaveMonthlySnapshot={handleSaveMonthlySnapshot}
          savingMonthly={savingMonthly}
          saveMonthlyError={saveMonthlyError}
          onUpdateMonthlySnapshot={updateMonthlySnapshot}
          updatingMonth={updatingMonth}
          updateMonthlyError={updateMonthlyError}
          onDeleteMonthlySnapshot={deleteMonthlySnapshot}
          deletingMonth={deletingMonth}
          deleteMonthlyError={deleteMonthlyError}
          onAddManualMonthlySnapshot={addManualMonthlySnapshot}
          addingManual={addingManual}
          addManualError={addManualError}
        />
      </>
    );
  }

  if (showStockResearch) {
    return (
      <>
        <TopNav
          activePage={activePage}
          onNavigate={handleNavigate}
          user={user}
          onLogout={handleLogout}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
        <StockResearchView onBack={() => handleNavigate('home')} theme={theme} />
      </>
    );
  }

  const summary = calculatePortfolioSummary(
    israeliStocks,
    americanStocks,
    pensionFunds,
    cashFunds,
    bankBalances,
    { currentIndex: cpi.currentIndex, indexByMonth: cpi.indexByMonth }
  );

  return (
    <>
      <TopNav
        activePage={activePage}
        onNavigate={handleNavigate}
        user={user}
        onLogout={handleLogout}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      <HomeView
        showLegacyImportButton={showLegacyImportButton}
        legacyImportLoading={legacyImportLoading}
        handleLegacyImportOnce={handleLegacyImportOnce}
        savePortfolio={savePortfolio}
        hasUnsavedChanges={hasUnsavedChanges}
        saveLoading={saveLoading}
        lastSavedAt={lastSavedAt}
        saveError={saveError}
        handleSaveSnapshot={handleSaveSnapshot}
        snapshotSaving={snapshotSaving}
        snapshotSaveError={snapshotSaveError}
        lastSnapshotSavedAt={lastSnapshotSavedAt}
        legacyImportBanner={legacyImportBanner}
        summary={summary}
        israeliStocks={israeliStocks}
        americanStocks={americanStocks}
        pensionFunds={pensionFunds}
        cashFunds={cashFunds}
        bankBalances={bankBalances}
        cpi={cpi}
        handleAddInfo={handleAddInfo}
        isEditMode={isEditMode}
        setIsEditMode={setIsEditMode}
        showAmericanColumns={showAmericanColumns}
        setShowAmericanColumns={setShowAmericanColumns}
        expandedGroups={expandedGroups}
        editingField={editingField}
        handleCellClick={handleCellClick}
        handleInlineEdit={handleInlineEdit}
        finishInlineEdit={finishInlineEdit}
        handleKeyDown={handleKeyDown}
        handleDelete={handleDelete}
        toggleGroup={toggleGroup}
      />
    </>
  );
}

export default App;