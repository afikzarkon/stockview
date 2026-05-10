import './App.css';
import React, { useState, useEffect, useRef } from 'react';
import { TAX_RATE, calculateAmericanStockMetrics } from './utils/portfolioMath';
import StockFormView from './components/StockFormView';
import PortfolioAnalysisView from './components/PortfolioAnalysisView';
import PortfolioSummary from './components/PortfolioSummary';
import IsraeliStocksTable from './components/IsraeliStocksTable';
import AmericanStocksTable from './components/AmericanStocksTable';
import FinancialAccountsTables from './components/FinancialAccountsTables';
import AuthView from './components/AuthView';

function normalizeIsraeliStocksFromStorage(parsed) {
  if (!Array.isArray(parsed)) return [];
  return parsed.map((stock) => {
    const priceNum =
      typeof stock.currentPrice === 'string' ? parseFloat(stock.currentPrice) : stock.currentPrice;
    const needsDivide =
      priceNum !== null && priceNum !== undefined && !isNaN(priceNum) && priceNum > 1000;
    return {
      ...stock,
      currentPrice: needsDivide ? priceNum / 100 : priceNum
    };
  });
}

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
  const POLLING_INTERVAL_MS = 10000;
  const YAHOO_PROXY_URL = 'https://api.allorigins.win/raw?url=';
  const YAHOO_CHART_BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/';

  const [showForm, setShowForm] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [isAddingNewStock, setIsAddingNewStock] = useState(false);
  const [israeliStocks, setIsraeliStocks] = useState([]);
  const [americanStocks, setAmericanStocks] = useState([]);
  const [pensionFunds, setPensionFunds] = useState([]);
  const [bankBalances, setBankBalances] = useState([]);
  const [cashFunds, setCashFunds] = useState([]);
  const [formData, setFormData] = useState({
    itemType: 'stock',
    stockName: '',
    securityId: '',
    purchaseDate: '',
    purchasePrice: '',
    initialInvestment: '',
    currentValue: '',
    previousValue: '',
    quantity: '',
    exchange: 'israeli',
    exchangeRate: ''
  });
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingStock, setEditingStock] = useState(null);
  const [showAmericanColumns, setShowAmericanColumns] = useState(true);
  const [editingField, setEditingField] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [portfolioReady, setPortfolioReady] = useState(false);
  const userRef = useRef(null);
  const persistTimerRef = useRef(null);
  userRef.current = user;

  const [legacyImportCompleted, setLegacyImportCompleted] = useState(false);
  const [legacyImportLoading, setLegacyImportLoading] = useState(false);
  const [legacyImportBanner, setLegacyImportBanner] = useState('');

  useEffect(() => {
    if (!user || !user.id) {
      setLegacyImportCompleted(false);
      return;
    }
    setLegacyImportCompleted(localStorage.getItem(legacyImportFlagKey(user.id)) === '1');
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/auth/me', { credentials: 'include' });
        const d = await r.json();
        if (!cancelled) setUser(d.user || null);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // טעינת תיק לפי משתמש מחובר (שרת) — לא משתף נתונים בין משתמשים או לפי LocalStorage
  useEffect(() => {
    if (!user) {
      setPortfolioReady(false);
      return;
    }

    let cancelled = false;
    setPortfolioReady(false);
    (async () => {
      try {
        const r = await fetch('/api/portfolio', { credentials: 'include' });
        if (!r.ok) throw new Error('load failed');
        const d = await r.json();
        if (cancelled) return;
        setIsraeliStocks(normalizeIsraeliStocksFromStorage(d.israeliStocks || []));
        setAmericanStocks(Array.isArray(d.americanStocks) ? d.americanStocks : []);
        setPensionFunds(Array.isArray(d.pensionFunds) ? d.pensionFunds : []);
        setBankBalances(Array.isArray(d.bankBalances) ? d.bankBalances : []);
        setCashFunds(Array.isArray(d.cashFunds) ? d.cashFunds : []);
      } catch {
        if (!cancelled) {
          setIsraeliStocks([]);
          setAmericanStocks([]);
          setPensionFunds([]);
          setBankBalances([]);
          setCashFunds([]);
        }
      } finally {
        if (!cancelled) setPortfolioReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // פונקציה לקבלת מחיר נוכחי ואחוז שינוי יומי מ-TASE (דרך השרת המקומי)
  const fetchIsraeliStockPrice = async (stockId) => {
    try {
      const response = await fetch(`/api/israeli-stock/${stockId}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('שגיאה בקריאת נתונים מהשרת');
      const json = await response.json();
      return json;
    } catch (error) {
      return null;
    }
  };

  // עדכון אוטומטי של מחירי מניות כל 10 שניות
  useEffect(() => {
    const interval = setInterval(async () => {
      // לא מעדכן אם המשתמש נמצא במצב עריכה או מוסיף מנייה חדשה
      if (isEditMode || editingField || isAddingNewStock) {
        return;
      }
      
      // עדכון מניות ישראליות
      if (israeliStocks.length > 0) {
        // קיבוץ מניות לפי שם (ID) כדי לבצע בקשה אחת לכל מנייה
        const stocksBySymbol = {};
        israeliStocks.forEach(stock => {
          if (!stocksBySymbol[stock.stockName]) {
            stocksBySymbol[stock.stockName] = [];
          }
          stocksBySymbol[stock.stockName].push(stock);
        });

        const updatedIsraeliStocks = [];
        
        // עבור כל מנייה ייחודית, בקש נתונים פעם אחת
        for (const [stockSymbol, stocks] of Object.entries(stocksBySymbol)) {
          const priceData = await fetchIsraeliStockPrice(stockSymbol);
          
          if (priceData && priceData.currentPrice !== null) {
            // המרה מאגורות לשקלים
            const normalizedPrice = priceData.currentPrice / 100;
            
            // עדכן את כל השורות של המנייה הזו
            stocks.forEach(stock => {
              updatedIsraeliStocks.push({
                ...stock,
                currentPrice: normalizedPrice,
                dailyChangePercent: priceData.changePercent
              });
            });
          } else {
            // אם לא התקבל מחיר, שומרים את המניות עם הנתונים הקיימים
            stocks.forEach(stock => {
              updatedIsraeliStocks.push(stock);
            });
          }
        }
        
        setIsraeliStocks(updatedIsraeliStocks);
        // שמירה עם המניות האמריקאיות הנוכחיות
        setAmericanStocks(currentAmericanStocks => {
          persistPortfolio(updatedIsraeliStocks, currentAmericanStocks);
          return currentAmericanStocks;
        });
      }

      // עדכון מניות אמריקאיות
      if (americanStocks.length > 0) {
        // קבלת שער החליפין הנוכחי
        const currentExchangeRate = await fetchExchangeRate();
        
        // קיבוץ מניות לפי שם כדי לבצע בקשה אחת לכל מנייה
        const stocksBySymbol = {};
        americanStocks.forEach(stock => {
          if (!stocksBySymbol[stock.stockName]) {
            stocksBySymbol[stock.stockName] = [];
          }
          stocksBySymbol[stock.stockName].push(stock);
        });

        const updatedAmericanStocks = [];
        
        // עבור כל מנייה ייחודית, בקש נתונים פעם אחת
        for (const [stockSymbol, stocks] of Object.entries(stocksBySymbol)) {
          try {
            const priceData = await fetchCurrentPrice(stockSymbol);
            if (priceData !== null) {
              // עדכן את כל השורות של המנייה הזו
              stocks.forEach(stock => {
                updatedAmericanStocks.push({
                  ...stock, 
                  currentPrice: priceData.currentPrice,
                  dailyChangePercent: priceData.changePercent,
                  currentExchangeRate: currentExchangeRate || stock.currentExchangeRate || stock.exchangeRate
                });
              });
            } else {
              stocks.forEach(stock => {
                updatedAmericanStocks.push({
                  ...stock,
                  currentExchangeRate: currentExchangeRate || stock.currentExchangeRate || stock.exchangeRate
                });
              });
            }
          } catch (error) {
            stocks.forEach(stock => {
              updatedAmericanStocks.push({
                ...stock,
                currentExchangeRate: currentExchangeRate || stock.currentExchangeRate || stock.exchangeRate
              });
            });
          }
        }
        
        setAmericanStocks(updatedAmericanStocks);
        // שמירה עם המניות הישראליות הנוכחיות
        setIsraeliStocks(currentIsraeliStocks => {
          persistPortfolio(currentIsraeliStocks, updatedAmericanStocks);
          return currentIsraeliStocks;
        });
      }
    }, POLLING_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [israeliStocks.length, americanStocks.length, isEditMode, isAddingNewStock]); // eslint-disable-line react-hooks/exhaustive-deps

  /** שמירת תיק בשרת (פר משתמש מחובר), עם debounce כדי לא לעמיס על ה-API */
  const persistPortfolio = (
    israeliData,
    americanData,
    pensionData = pensionFunds,
    bankData = bankBalances,
    cashData = cashFunds
  ) => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(async () => {
      if (!userRef.current) return;
      const body = JSON.stringify({
        israeliStocks: israeliData,
        americanStocks: americanData,
        pensionFunds: pensionData,
        bankBalances: bankData,
        cashFunds: cashData
      });
      try {
        await fetch('/api/portfolio', {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body
        });
      } catch {
        /* רשת/שרת — יישמר בפעם הבאה או אחרי ריענון */
      }
    }, 450);
  };

  // פונקציה לקבלת מחיר נוכחי ואחוז שינוי יומי מ-Yahoo Finance דרך proxy
  const fetchCurrentPrice = async (stockSymbol) => {
    try {
      const yahooUrl = `${YAHOO_CHART_BASE_URL}${stockSymbol}`;
      const response = await fetch(YAHOO_PROXY_URL + encodeURIComponent(yahooUrl));
      const data = await response.json();
      
      if (data.chart && data.chart.result && data.chart.result.length > 0) {
        const meta = data.chart.result[0].meta;
        const currentPrice = meta.regularMarketPrice;
        
        // נסה כמה אפשרויות לאחוז שינוי
        const changePercent = meta.regularMarketChangePercent || 
                             meta.changePercent || 
                             meta.regularMarketChange || 
                             meta.change || 
                             0;
        
        // אם אין אחוז שינוי, חשב אותו בעצמי
        let finalChangePercent = 0;
        if (changePercent && changePercent !== 0) {
          finalChangePercent = changePercent * 100; // המרה לאחוזים
        } else if (meta.previousClose && meta.regularMarketPrice) {
          // חשב אחוז שינוי בעצמי
          const change = meta.regularMarketPrice - meta.previousClose;
          finalChangePercent = (change / meta.previousClose) * 100;
        }
        
        return { currentPrice, changePercent: finalChangePercent };
      }
    } catch (error) {
      return null;
    }
  };

  // פונקציה לקבלת שער החליפין הנוכחי שקל/דולר מ-Yahoo Finance
  const fetchExchangeRate = async () => {
    try {
      const yahooUrl = `${YAHOO_CHART_BASE_URL}USDILS=X`;
      const response = await fetch(YAHOO_PROXY_URL + encodeURIComponent(yahooUrl));
      const data = await response.json();
      
      if (data.chart && data.chart.result && data.chart.result.length > 0) {
        const currentRate = data.chart.result[0].meta.regularMarketPrice;
        return currentRate;
      }
    } catch (error) {
      return null;
    }
  };




  const handleAddInfo = () => {
    setIsEditMode(false);
    setEditingStock(null);
    setIsAddingNewStock(true);
    setShowForm(true);
  };

  const handleLogout = async () => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
      /* ignore */
    }
    setShowForm(false);
    setShowAnalysis(false);
    setIsraeliStocks([]);
    setAmericanStocks([]);
    setPensionFunds([]);
    setBankBalances([]);
    setCashFunds([]);
    setPortfolioReady(false);
    setLegacyImportBanner('');
    setUser(null);
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
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    try {
      const r = await fetch('/api/portfolio', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          israeliStocks: snapshot.israeliStocks,
          americanStocks: snapshot.americanStocks,
          pensionFunds: snapshot.pensionFunds,
          bankBalances: snapshot.bankBalances,
          cashFunds: snapshot.cashFunds
        })
      });
      if (!r.ok) throw new Error('save failed');
      setIsraeliStocks(snapshot.israeliStocks);
      setAmericanStocks(snapshot.americanStocks);
      setPensionFunds(snapshot.pensionFunds);
      setBankBalances(snapshot.bankBalances);
      setCashFunds(snapshot.cashFunds);
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

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
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
        persistPortfolio(updatedIsraeliStocks, americanStocks);
      } else {
        const updatedAmericanStocks = [...americanStocks, stockData];
        setAmericanStocks(updatedAmericanStocks);
        persistPortfolio(israeliStocks, updatedAmericanStocks);
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
      persistPortfolio(israeliStocks, americanStocks, pensionFunds, bankBalances, updatedCashFunds);
    } else if (formData.itemType === 'pension') {
      const pensionItem = {
        id: Date.now(),
        fundName: formData.stockName,
        updateDate: formData.purchaseDate,
        initialInvestment: parseFloat(formData.initialInvestment),
        currentValue: parseFloat(formData.currentValue),
        previousValue: parseFloat(formData.previousValue),
        amount: parseFloat(formData.currentValue)
      };
      const updatedPensionFunds = [...pensionFunds, pensionItem];
      setPensionFunds(updatedPensionFunds);
      persistPortfolio(israeliStocks, americanStocks, updatedPensionFunds, bankBalances);
    } else if (formData.itemType === 'bank') {
      const bankItem = {
        id: Date.now(),
        updateDate: formData.purchaseDate,
        amount: parseFloat(formData.purchasePrice)
      };
      const updatedBankBalances = [...bankBalances, bankItem];
      setBankBalances(updatedBankBalances);
      persistPortfolio(israeliStocks, americanStocks, pensionFunds, updatedBankBalances);
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
      quantity: '',
      exchange: 'israeli',
      exchangeRate: ''
    });
  };

  const handleBackToHome = () => {
    setShowForm(false);
  };

  // פונקציה למחיקת מנייה
  const handleDelete = (id, exchange) => {
    if (exchange === 'israeli') {
      const updatedIsraeliStocks = israeliStocks.filter(stock => stock.id !== id);
      setIsraeliStocks(updatedIsraeliStocks);
      persistPortfolio(updatedIsraeliStocks, americanStocks);
    } else if (exchange === 'american') {
      const updatedAmericanStocks = americanStocks.filter(stock => stock.id !== id);
      setAmericanStocks(updatedAmericanStocks);
      persistPortfolio(israeliStocks, updatedAmericanStocks);
    } else if (exchange === 'pension') {
      const updatedPensionFunds = pensionFunds.filter(item => item.id !== id);
      setPensionFunds(updatedPensionFunds);
      persistPortfolio(israeliStocks, americanStocks, updatedPensionFunds, bankBalances);
    } else if (exchange === 'bank') {
      const updatedBankBalances = bankBalances.filter(item => item.id !== id);
      setBankBalances(updatedBankBalances);
      persistPortfolio(israeliStocks, americanStocks, pensionFunds, updatedBankBalances);
    } else if (exchange === 'cash_fund') {
      const updatedCashFunds = cashFunds.filter(item => item.id !== id);
      setCashFunds(updatedCashFunds);
      persistPortfolio(israeliStocks, americanStocks, pensionFunds, bankBalances, updatedCashFunds);
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
      persistPortfolio(updatedIsraeliStocks, americanStocks);
    } else {
      const updatedAmericanStocks = americanStocks.map(stock => 
        stock.id === editingStock.id ? updatedStock : stock
      );
      setAmericanStocks(updatedAmericanStocks);
      persistPortfolio(israeliStocks, updatedAmericanStocks);
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
      persistPortfolio(updatedIsraeliStocks, americanStocks);
    } else if (exchange === 'american') {
      const updatedAmericanStocks = americanStocks.map(stock => 
        stock.id === id ? { ...stock, [field]: value } : stock
      );
      setAmericanStocks(updatedAmericanStocks);
      persistPortfolio(israeliStocks, updatedAmericanStocks);
    } else if (exchange === 'pension') {
      const updatedPensionFunds = pensionFunds.map(item => 
        item.id === id ? { ...item, [field]: value } : item
      );
      setPensionFunds(updatedPensionFunds);
      persistPortfolio(israeliStocks, americanStocks, updatedPensionFunds, bankBalances);
    } else if (exchange === 'bank') {
      const updatedBankBalances = bankBalances.map(item => 
        item.id === id ? { ...item, [field]: value } : item
      );
      setBankBalances(updatedBankBalances);
      persistPortfolio(israeliStocks, americanStocks, pensionFunds, updatedBankBalances);
    } else if (exchange === 'cash_fund') {
      const updatedCashFunds = cashFunds.map(item => 
        item.id === id ? { ...item, [field]: value } : item
      );
      setCashFunds(updatedCashFunds);
      persistPortfolio(israeliStocks, americanStocks, pensionFunds, bankBalances, updatedCashFunds);
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

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('he-IL');
  };

  const formatPrice = (price) => {
    if (price === null || price === undefined || isNaN(price)) {
      return '0.00';
    }
    const formattedNumber = price.toFixed(2);
    return parseFloat(formattedNumber).toLocaleString('he-IL', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const formatPriceWithSign = (price) => {
    if (price === null || price === undefined || isNaN(price)) {
      return '0.00';
    }
    const formattedNumber = Math.abs(price).toFixed(2);
    const withCommas = parseFloat(formattedNumber).toLocaleString('he-IL', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    if (price >= 0) {
      return withCommas;
    } else {
      return `${withCommas}-`;
    }
  };

  // Normalize Israeli price: if saved in agorot (big number), convert to shekels
  const normalizeIsraeliPrice = (price) => {
    const num = typeof price === 'string' ? parseFloat(price) : price;
    if (num === null || num === undefined || isNaN(num)) return 0;
    return num > 1000 ? num / 100 : num;
  };

  const calculateProfitPercentage = (purchaseValue, currentValue) => {
    if (purchaseValue === 0 || !purchaseValue || !currentValue) return 0;
    return ((currentValue - purchaseValue) / purchaseValue * 100).toFixed(2);
  };

  // פונקציה לקיבוץ מניות לפי שם
  const groupStocksByName = (stocks) => {
    const grouped = {};
    stocks.forEach(stock => {
      if (!grouped[stock.stockName]) {
        grouped[stock.stockName] = [];
      }
      grouped[stock.stockName].push(stock);
    });
    return grouped;
  };

  // פונקציה לחישוב סיכומים של קיבוץ
  const calculateGroupSummary = (stocks) => {
    const totalQuantity = stocks.reduce((sum, stock) => sum + (stock.quantity || 0), 0);
    const totalPurchaseValue = stocks.reduce((sum, stock) => {
      const purchaseValue = (stock.purchasePrice || 0) * (stock.quantity || 0);
      return sum + purchaseValue;
    }, 0);
    const totalCurrentValue = stocks.reduce((sum, stock) => {
      const normalizedPrice = normalizeIsraeliPrice(stock.currentPrice);
      const currentValue = (normalizedPrice || 0) * (stock.quantity || 0);
      return sum + currentValue;
    }, 0);
    const totalProfit = totalCurrentValue - totalPurchaseValue;
    const profitPercentage = calculateProfitPercentage(totalPurchaseValue, totalCurrentValue);
    
    // חישוב מחיר ממוצע משוקלל לפי הכמות
    const averagePurchasePrice = totalQuantity > 0 ? totalPurchaseValue / totalQuantity : 0;
    const averageCurrentPrice = totalQuantity > 0 ? totalCurrentValue / totalQuantity : 0;
    
    return {
      totalQuantity,
      totalPurchaseValue,
      totalCurrentValue,
      totalProfit,
      profitPercentage,
      averagePurchasePrice,
      averageCurrentPrice
    };
  };

  // פונקציה לטיפול בפתיחה/סגירה של קיבוץ
  const toggleGroup = (stockName, exchange) => {
    const key = `${exchange}-${stockName}`;
    setExpandedGroups(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // פונקציה לחישוב סיכום כללי של התיק
  const calculatePortfolioSummary = () => {
    // חישוב מניות ישראליות
    const israeliSummary = israeliStocks.reduce((acc, stock) => {
      const totalPurchase = (stock.purchasePrice || 0) * (stock.quantity || 0);
      const normalizedPrice = normalizeIsraeliPrice(stock.currentPrice);
      const totalCurrentValue = (normalizedPrice || 0) * (stock.quantity || 0);
      const profit = totalCurrentValue - totalPurchase;
      
      acc.totalPurchaseILS += totalPurchase;
      acc.totalCurrentValueILS += totalCurrentValue;
      acc.totalProfitILS += profit;
      acc.totalWeight += totalCurrentValue; // משקל לחישוב אחוז שינוי יומי
      acc.dailyChangeSum += (stock.dailyChangePercent || 0) * totalCurrentValue;
      
      return acc;
    }, {
      totalPurchaseILS: 0,
      totalCurrentValueILS: 0,
      totalProfitILS: 0,
      totalWeight: 0,
      dailyChangeSum: 0
    });

    // חישוב מניות אמריקאיות
    const americanSummary = americanStocks.reduce((acc, stock) => {
      const metrics = calculateAmericanStockMetrics(stock);
      
      acc.totalPurchaseUSD += metrics.totalPurchaseUSD;
      acc.totalPurchaseILS += metrics.totalPurchaseILS;
      acc.totalCurrentValueUSD += metrics.totalCurrentValueUSD;
      acc.totalCurrentValueILS += metrics.totalCurrentValueILS;
      acc.totalProfitUSD += metrics.profitUSD;
      acc.totalProfitILS += metrics.profitILS;
      acc.totalExchangeImpact += metrics.exchangeRateImpact;
      acc.totalWeight += metrics.totalCurrentValueILS; // משקל לחישוב אחוז שינוי יומי
      acc.dailyChangeSum += (stock.dailyChangePercent || 0) * metrics.totalCurrentValueILS;
      
      return acc;
    }, {
      totalPurchaseUSD: 0,
      totalPurchaseILS: 0,
      totalCurrentValueUSD: 0,
      totalCurrentValueILS: 0,
      totalProfitUSD: 0,
      totalProfitILS: 0,
      totalExchangeImpact: 0,
      totalWeight: 0,
      dailyChangeSum: 0
    });

    // חישוב אחוז שינוי יומי משוקלל
    const totalWeight = israeliSummary.totalWeight + americanSummary.totalWeight;
    const weightedDailyChange = totalWeight > 0 ? 
      (israeliSummary.dailyChangeSum + americanSummary.dailyChangeSum) / totalWeight : 0;

    // חישוב רווח יומי בשקלים ובדולרים
    const dailyProfitILS = (weightedDailyChange / 100) * (israeliSummary.totalCurrentValueILS + americanSummary.totalCurrentValueILS);
    const dailyProfitUSD = (weightedDailyChange / 100) * americanSummary.totalCurrentValueUSD;

    // רווח יומי נפרד לכל בורסה
    const israeliDailyProfitILS = israeliStocks.reduce((sum, stock) => {
      const totalCurrentValue = normalizeIsraeliPrice(stock.currentPrice) * (stock.quantity || 0);
      return sum + ((stock.dailyChangePercent || 0) / 100) * totalCurrentValue;
    }, 0);

    const americanDailyProfitUSD = americanStocks.reduce((sum, stock) => {
      const totalCurrentValueUSD = (stock.currentPrice || 0) * (stock.quantity || 0);
      return sum + ((stock.dailyChangePercent || 0) / 100) * totalCurrentValueUSD;
    }, 0);

    // אחוזי רווח כוללים פר בורסה
    const israeliProfitILS = israeliSummary.totalCurrentValueILS - israeliSummary.totalPurchaseILS;
    const israeliTaxILS = israeliProfitILS > 0 ? israeliProfitILS * TAX_RATE : 0;
    const israeliAfterTaxILS = israeliProfitILS - israeliTaxILS;
    const israeliProfitPercent = israeliSummary.totalPurchaseILS > 0 ? (israeliProfitILS / israeliSummary.totalPurchaseILS) * 100 : 0;
    const israeliDailyPercent = israeliSummary.totalCurrentValueILS > 0 ? (israeliDailyProfitILS / israeliSummary.totalCurrentValueILS) * 100 : 0;

    const americanProfitUSD = americanSummary.totalCurrentValueUSD - americanSummary.totalPurchaseUSD;
    const americanTaxUSD = americanProfitUSD > 0 ? americanProfitUSD * TAX_RATE : 0;
    const americanAfterTaxUSD = americanProfitUSD - americanTaxUSD;
    const americanProfitPercent = americanSummary.totalPurchaseUSD > 0 ? (americanProfitUSD / americanSummary.totalPurchaseUSD) * 100 : 0;
    const americanDailyPercent = americanSummary.totalCurrentValueUSD > 0 ? (americanDailyProfitUSD / americanSummary.totalCurrentValueUSD) * 100 : 0;
    const americanTaxILS = americanSummary.totalCurrentValueUSD > 0 ? americanTaxUSD * (americanSummary.totalCurrentValueILS / americanSummary.totalCurrentValueUSD) : 0;

    // סה"כ מצב ההון לפי קטגוריות
    const cashFundsTotalILS = cashFunds.reduce((sum, item) => sum + (item.amount || 0), 0);
    const pensionFundsTotalILS = pensionFunds.reduce((sum, item) => sum + (item.amount || 0), 0);
    const pensionInitialInvestmentILS = pensionFunds.reduce((sum, item) => sum + (item.initialInvestment ?? item.amount ?? 0), 0);
    const pensionCurrentValueILS = pensionFunds.reduce((sum, item) => sum + (item.currentValue ?? item.amount ?? 0), 0);
    const pensionPreviousValueILS = pensionFunds.reduce((sum, item) => sum + (item.previousValue ?? item.amount ?? 0), 0);
    const pensionProfitPercent = pensionInitialInvestmentILS > 0 ? ((pensionCurrentValueILS / pensionInitialInvestmentILS) - 1) * 100 : 0;
    const pensionPreviousProfitPercent = pensionPreviousValueILS > 0 ? ((pensionCurrentValueILS / pensionPreviousValueILS) - 1) * 100 : (pensionInitialInvestmentILS > 0 ? ((pensionCurrentValueILS / pensionInitialInvestmentILS) - 1) * 100 : 0);
    const pensionTotalProfitILS = pensionCurrentValueILS - pensionInitialInvestmentILS;
    const pensionTaxILS = pensionTotalProfitILS > 0 ? pensionTotalProfitILS * TAX_RATE : 0;
    const pensionUpdateProfitILS = pensionCurrentValueILS - pensionPreviousValueILS;
    const totalTaxILS = israeliTaxILS + americanTaxILS + pensionTaxILS;
    const totalProfitAfterTaxILS = (israeliSummary.totalProfitILS + americanSummary.totalProfitILS + pensionTotalProfitILS) - totalTaxILS;
    const bankBalancesTotalILS = bankBalances.reduce((sum, item) => sum + (item.amount || 0), 0);
    const capitalIsraeliILS = israeliSummary.totalCurrentValueILS;
    const capitalAmericanILS = americanSummary.totalCurrentValueILS;
    const capitalTotalILS = capitalIsraeliILS + capitalAmericanILS + cashFundsTotalILS + pensionFundsTotalILS + bankBalancesTotalILS;

    return {
      // סיכום בשקלים
      totalPurchaseILS: israeliSummary.totalPurchaseILS + americanSummary.totalPurchaseILS + pensionInitialInvestmentILS,
      totalCurrentValueILS: israeliSummary.totalCurrentValueILS + americanSummary.totalCurrentValueILS + pensionCurrentValueILS,
      totalProfitILS: israeliSummary.totalProfitILS + americanSummary.totalProfitILS + pensionTotalProfitILS,

      // סיכום ישראלי בלבד
      israeliOnlyPurchaseILS: israeliSummary.totalPurchaseILS,
      israeliOnlyCurrentValueILS: israeliSummary.totalCurrentValueILS,
      israeliOnlyProfitILS: israeliSummary.totalProfitILS,
      israeliOnlyTaxILS: israeliTaxILS,
      israeliOnlyAfterTaxILS: israeliAfterTaxILS,
      israeliOnlyProfitPercent: israeliProfitPercent,
      israeliOnlyDailyPercent: israeliDailyPercent,
      israeliOnlyDailyProfitILS: israeliDailyProfitILS,
      
      // סיכום בדולרים
      totalPurchaseUSD: americanSummary.totalPurchaseUSD,
      totalCurrentValueUSD: americanSummary.totalCurrentValueUSD,
      totalProfitUSD: americanSummary.totalProfitUSD,
      americanOnlyTaxUSD: americanTaxUSD,
      americanOnlyTaxILS: americanTaxILS,
      americanOnlyAfterTaxUSD: americanAfterTaxUSD,
      americanOnlyProfitPercent: americanProfitPercent,
      americanOnlyDailyPercent: americanDailyPercent,
      americanOnlyDailyProfitUSD: americanDailyProfitUSD,
      
      // אחוז שינוי יומי משוקלל
      weightedDailyChange: weightedDailyChange,
      
      // רווח יומי בשקלים ובדולרים
      dailyProfitILS: dailyProfitILS,
      dailyProfitUSD: dailyProfitUSD,
      israeliDailyProfitILS: israeliDailyProfitILS,
      americanDailyProfitUSD: americanDailyProfitUSD,
      
      // השפעת שער חליפין כוללת
      totalExchangeImpact: americanSummary.totalExchangeImpact,

      // מצב הון
      capitalIsraeliILS,
      capitalAmericanILS,
      capitalCashFundsILS: cashFundsTotalILS,
      capitalPensionILS: pensionFundsTotalILS,
      pensionInitialInvestmentILS,
      pensionCurrentValueILS,
      pensionPreviousValueILS,
      pensionProfitPercent,
      pensionPreviousProfitPercent,
      pensionTotalProfitILS,
      pensionTaxILS,
      pensionUpdateProfitILS,
      capitalBankILS: bankBalancesTotalILS,
      capitalTotalILS,
      totalTaxILS,
      totalProfitAfterTaxILS
    };
  };

  // פונקציות לניתוח התיק
  const calculatePortfolioAnalysis = () => {
    // ניתוח פיזור לפי בורסות
    const israeliTotalValue = israeliStocks.reduce((sum, stock) => {
      const normalizedPrice = normalizeIsraeliPrice(stock.currentPrice);
      return sum + ((normalizedPrice || 0) * (stock.quantity || 0));
    }, 0);

    const americanTotalValueILS = americanStocks.reduce((sum, stock) => {
      const currentExchangeRate = stock.currentExchangeRate || stock.exchangeRate || 0;
      return sum + ((stock.currentPrice || 0) * (stock.quantity || 0) * currentExchangeRate);
    }, 0);

    const totalValueILS = israeliTotalValue + americanTotalValueILS;

    // ניתוח פיזור לפי מניות
    const stockDistribution = {};
    
    // מניות ישראליות
    israeliStocks.forEach(stock => {
      const value = normalizeIsraeliPrice(stock.currentPrice) * (stock.quantity || 0);
      const purchaseValue = (stock.purchasePrice || 0) * (stock.quantity || 0);
      const profit = value - purchaseValue;
      
      // חישוב זמן החזקה
      const purchaseDate = new Date(stock.purchaseDate);
      const currentDate = new Date();
      const daysHeld = Math.floor((currentDate - purchaseDate) / (1000 * 60 * 60 * 24));
      const yearsHeld = daysHeld / 365;
      
      
      if (!stockDistribution[stock.stockName]) {
        stockDistribution[stock.stockName] = {
          name: stock.stockName,
          value: 0,
          percentage: 0,
          exchange: 'israeli',
          profit: 0,
          profitPercentage: 0,
          totalQuantity: 0,
          avgPurchasePrice: 0,
          totalPurchaseValue: 0,
          daysHeld: 0,
          yearsHeld: 0,
          annualizedReturn: 0,
          dailyChange: 0,
          volatility: 0
        };
      }
      
      stockDistribution[stock.stockName].value += value;
      stockDistribution[stock.stockName].profit += profit;
      stockDistribution[stock.stockName].totalQuantity += (stock.quantity || 0);
      stockDistribution[stock.stockName].totalPurchaseValue += purchaseValue;
      stockDistribution[stock.stockName].daysHeld = Math.max(stockDistribution[stock.stockName].daysHeld, daysHeld);
      stockDistribution[stock.stockName].yearsHeld = Math.max(stockDistribution[stock.stockName].yearsHeld, yearsHeld);
      stockDistribution[stock.stockName].dailyChange = stock.dailyChangePercent || 0;
      
      // חישוב תשואה שנתית
      if (yearsHeld > 0 && purchaseValue > 0) {
        const annualizedReturn = Math.pow((value / purchaseValue), (1 / yearsHeld)) - 1;
        stockDistribution[stock.stockName].annualizedReturn = annualizedReturn;
      }
    });

    // מניות אמריקאיות
    americanStocks.forEach(stock => {
      const currentExchangeRate = stock.currentExchangeRate || stock.exchangeRate || 0;
      const value = (stock.currentPrice || 0) * (stock.quantity || 0) * currentExchangeRate;
      const purchaseValue = (stock.purchasePrice || 0) * (stock.quantity || 0) * currentExchangeRate;
      const profit = value - purchaseValue;
      
      // חישוב זמן החזקה
      const purchaseDate = new Date(stock.purchaseDate);
      const currentDate = new Date();
      const daysHeld = Math.floor((currentDate - purchaseDate) / (1000 * 60 * 60 * 24));
      const yearsHeld = daysHeld / 365;
      
      
      if (!stockDistribution[stock.stockName]) {
        stockDistribution[stock.stockName] = {
          name: stock.stockName,
          value: 0,
          percentage: 0,
          exchange: 'american',
          profit: 0,
          profitPercentage: 0,
          totalQuantity: 0,
          avgPurchasePrice: 0,
          totalPurchaseValue: 0,
          daysHeld: 0,
          yearsHeld: 0,
          annualizedReturn: 0,
          dailyChange: 0,
          volatility: 0
        };
      }
      
      stockDistribution[stock.stockName].value += value;
      stockDistribution[stock.stockName].profit += profit;
      stockDistribution[stock.stockName].totalQuantity += (stock.quantity || 0);
      stockDistribution[stock.stockName].totalPurchaseValue += purchaseValue;
      stockDistribution[stock.stockName].daysHeld = Math.max(stockDistribution[stock.stockName].daysHeld, daysHeld);
      stockDistribution[stock.stockName].yearsHeld = Math.max(stockDistribution[stock.stockName].yearsHeld, yearsHeld);
      stockDistribution[stock.stockName].dailyChange = stock.dailyChangePercent || 0;
      
      // חישוב תשואה שנתית
      if (yearsHeld > 0 && purchaseValue > 0) {
        const annualizedReturn = Math.pow((value / purchaseValue), (1 / yearsHeld)) - 1;
        stockDistribution[stock.stockName].annualizedReturn = annualizedReturn;
      }
    });

    // חישוב נתונים נוספים
    Object.values(stockDistribution).forEach(stock => {
      stock.percentage = totalValueILS > 0 ? (stock.value / totalValueILS) * 100 : 0;
      stock.profitPercentage = stock.totalPurchaseValue > 0 ? (stock.profit / stock.totalPurchaseValue) * 100 : 0;
      stock.avgPurchasePrice = stock.totalQuantity > 0 ? stock.totalPurchaseValue / stock.totalQuantity : 0;
      
      // חישוב תשואה שנתית כוללת
      if (stock.yearsHeld > 0 && stock.totalPurchaseValue > 0) {
        stock.annualizedReturn = Math.pow((stock.value / stock.totalPurchaseValue), (1 / stock.yearsHeld)) - 1;
      }
      
      // חישוב וולטיליות (פשטני)
      stock.volatility = Math.abs(stock.dailyChange) * 1.5; // קירוב פשטני לוולטיליות
    });

    // ניתוח פיזור לפי תאריכי קנייה
    const monthlyDistribution = {};
    const yearlyDistribution = {};
    
    [...israeliStocks, ...americanStocks].forEach(stock => {
      const date = new Date(stock.purchaseDate);
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const year = date.getFullYear();
      
      const value = stock.exchange === 'israeli' 
        ? normalizeIsraeliPrice(stock.currentPrice) * (stock.quantity || 0)
        : (stock.currentPrice || 0) * (stock.quantity || 0) * (stock.currentExchangeRate || stock.exchangeRate || 0);
      
      if (!monthlyDistribution[month]) {
        monthlyDistribution[month] = { value: 0, count: 0 };
      }
      monthlyDistribution[month].value += value;
      monthlyDistribution[month].count += 1;
      
      if (!yearlyDistribution[year]) {
        yearlyDistribution[year] = { value: 0, count: 0 };
      }
      yearlyDistribution[year].value += value;
      yearlyDistribution[year].count += 1;
    });

    // דוחות מפורטים
    const topPerformers = Object.values(stockDistribution)
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 5);

    const worstPerformers = Object.values(stockDistribution)
      .sort((a, b) => a.profit - b.profit)
      .slice(0, 5);

    const largestPositions = Object.values(stockDistribution)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    return {
      // פיזור לפי בורסות
      exchangeDistribution: {
        israeli: {
          value: israeliTotalValue,
          percentage: totalValueILS > 0 ? (israeliTotalValue / totalValueILS) * 100 : 0
        },
        american: {
          value: americanTotalValueILS,
          percentage: totalValueILS > 0 ? (americanTotalValueILS / totalValueILS) * 100 : 0
        },
        total: totalValueILS
      },
      
      // פיזור לפי מניות
      stockDistribution: Object.values(stockDistribution).sort((a, b) => b.value - a.value),
      
      // פיזור לפי תאריכים
      monthlyDistribution: Object.entries(monthlyDistribution)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, data]) => ({ month, ...data })),
      
      yearlyDistribution: Object.entries(yearlyDistribution)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([year, data]) => ({ year, ...data })),
      
      // דוחות מפורטים
      reports: {
        topPerformers,
        worstPerformers,
        largestPositions
      }
    };
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
        <AuthView onAuthenticated={setUser} />
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
      <StockFormView
        isEditMode={isEditMode}
        formData={formData}
        handleSubmit={handleSubmit}
        handleInputChange={handleInputChange}
        handleBackToHome={handleBackToHome}
        handleSaveEdit={handleSaveEdit}
        handleCancelEdit={handleCancelEdit}
      />
    );
  }

  if (showAnalysis) {
    const analysis = calculatePortfolioAnalysis();
    
    return (
      <PortfolioAnalysisView
        analysis={analysis}
        formatPriceWithSign={formatPriceWithSign}
        onBack={() => setShowAnalysis(false)}
      />
    );
  }

  const summary = calculatePortfolioSummary();

  return (
    <div className="App">
      <div className="welcome-container">
        <div className="user-bar">
          <span className="user-email">{user.email}</span>
          {showLegacyImportButton ? (
            <button
              type="button"
              className="user-legacy-import"
              disabled={legacyImportLoading}
              onClick={handleLegacyImportOnce}
            >
              {legacyImportLoading ? 'מייבא…' : 'ייבוא חד-פעמי מהדפדפן'}
            </button>
          ) : null}
          <button type="button" className="user-logout" onClick={handleLogout}>
            התנתקות
          </button>
        </div>
        {legacyImportBanner ? <p className="user-import-banner">{legacyImportBanner}</p> : null}
        <div className="welcome-content">
          <h1 className="welcome-title">תיק ההשקעות שלך</h1>
          
          {/* סיכום התיק */}
          {(israeliStocks.length > 0 || americanStocks.length > 0) && (
            <PortfolioSummary
              summary={summary}
              formatPriceWithSign={formatPriceWithSign}
            />
          )}
          
          <div className="main-buttons-container">
            <button className="add-info-button" onClick={handleAddInfo}>
              הוספת מידע חדש
            </button>
            <button className="analysis-button" onClick={() => setShowAnalysis(true)}>
              ניתוח התיק
            </button>

            {/* כפתורי בקרה */}
            <div className="control-buttons">
              <button
                onClick={() => setIsEditMode(!isEditMode)}
                className={`btn ${isEditMode ? 'btn-danger' : 'btn-warning'}`}
              >
                {isEditMode ? 'יציאה ממצב עריכה' : 'מצב עריכה'}
              </button>
              
              <button
                onClick={() => setShowAmericanColumns(!showAmericanColumns)}
                className="btn btn-info"
              >
                {showAmericanColumns ? 'הסתר עמודות אמריקאיות' : 'הצגת נתונים נוספים בבורסה אמריקאית'}
              </button>
            </div>
            
            {/* הודעה על מצב עריכה */}
            {isEditMode && (
              <div className="edit-mode-notice">
                <div className="notice-content">
                  <span className="notice-icon">✏️</span>
                  <span className="notice-text">מצב עריכה פעיל - לחץ על תאים לעריכה</span>
                </div>
              </div>
            )}
          </div>

          <IsraeliStocksTable
            israeliStocks={israeliStocks}
            isEditMode={isEditMode}
            expandedGroups={expandedGroups}
            groupStocksByName={groupStocksByName}
            calculateGroupSummary={calculateGroupSummary}
            normalizeIsraeliPrice={normalizeIsraeliPrice}
            calculateProfitPercentage={calculateProfitPercentage}
            TAX_RATE={TAX_RATE}
            handleCellClick={handleCellClick}
            handleInlineEdit={handleInlineEdit}
            finishInlineEdit={finishInlineEdit}
            handleKeyDown={handleKeyDown}
            formatDate={formatDate}
            formatPrice={formatPrice}
            formatPriceWithSign={formatPriceWithSign}
            handleDelete={handleDelete}
            toggleGroup={toggleGroup}
            editingField={editingField}
          />

          <AmericanStocksTable
            americanStocks={americanStocks}
            isEditMode={isEditMode}
            showAmericanColumns={showAmericanColumns}
            expandedGroups={expandedGroups}
            groupStocksByName={groupStocksByName}
            calculateGroupSummary={calculateGroupSummary}
            calculateAmericanStockMetrics={calculateAmericanStockMetrics}
            calculateProfitPercentage={calculateProfitPercentage}
            TAX_RATE={TAX_RATE}
            handleCellClick={handleCellClick}
            handleInlineEdit={handleInlineEdit}
            finishInlineEdit={finishInlineEdit}
            handleKeyDown={handleKeyDown}
            formatDate={formatDate}
            formatPrice={formatPrice}
            formatPriceWithSign={formatPriceWithSign}
            handleDelete={handleDelete}
            toggleGroup={toggleGroup}
            editingField={editingField}
          />

          <FinancialAccountsTables
            pensionFunds={pensionFunds}
            cashFunds={cashFunds}
            bankBalances={bankBalances}
            isEditMode={isEditMode}
            editingField={editingField}
            handleCellClick={handleCellClick}
            handleInlineEdit={handleInlineEdit}
            finishInlineEdit={finishInlineEdit}
            handleKeyDown={handleKeyDown}
            formatDate={formatDate}
            formatPriceWithSign={formatPriceWithSign}
            handleDelete={handleDelete}
          />

          {/* הודעה אם אין נתונים */}
          {israeliStocks.length === 0 && americanStocks.length === 0 && (
            <div className="no-data-message">
              <p>עדיין לא נוספו מניות לתיק ההשקעות שלך</p>
              <p>לחץ על הכפתור למעלה כדי להתחיל</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;