import './App.css';
import React, { useEffect, useState } from 'react';
import { TAX_RATE, calculateAmericanStockMetrics } from './utils/portfolioMath';
import {
  formatDate,
  formatPrice,
  formatPriceWithSign,
  normalizeIsraeliPrice,
  calculateProfitPercentage,
  normalizeIsraeliStocksFromStorage
} from './utils/formatters';
import { groupStocksByName, calculateGroupSummary } from './utils/stockGrouping';
import { calculatePortfolioSummary } from './utils/portfolioSummary';
import { calculatePortfolioAnalysis } from './utils/portfolioAnalysis';
import { fetchCurrentPrice, fetchIsraeliStockPrice } from './api/stockPrices';
import { apiUrl } from './apiBase';
import { useAuth } from './hooks/useAuth';
import { usePortfolioData } from './hooks/usePortfolioData';
import { usePriceRefresh } from './hooks/usePriceRefresh';
import StockFormView from './components/StockFormView';
import PortfolioAnalysisView from './components/PortfolioAnalysisView';
import PortfolioSummary from './components/PortfolioSummary';
import IsraeliStocksTable from './components/IsraeliStocksTable';
import AmericanStocksTable from './components/AmericanStocksTable';
import FinancialAccountsTables from './components/FinancialAccountsTables';
import AuthView from './components/AuthView';

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
    quantity: '',
    exchange: 'israeli',
    exchangeRate: ''
  });
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
      setHasUnsavedChanges(true);
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
      setHasUnsavedChanges(true);
    } else if (exchange === 'american') {
      const updatedAmericanStocks = americanStocks.map(stock => 
        stock.id === id ? { ...stock, [field]: value } : stock
      );
      setAmericanStocks(updatedAmericanStocks);
      setHasUnsavedChanges(true);
    } else if (exchange === 'pension') {
      const updatedPensionFunds = pensionFunds.map(item => 
        item.id === id ? { ...item, [field]: value } : item
      );
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
    const analysis = calculatePortfolioAnalysis(
      israeliStocks,
      americanStocks,
      pensionFunds,
      cashFunds,
      bankBalances
    );
    
    return (
      <PortfolioAnalysisView
        analysis={analysis}
        formatPriceWithSign={formatPriceWithSign}
        onBack={() => setShowAnalysis(false)}
      />
    );
  }

  const summary = calculatePortfolioSummary(
    israeliStocks,
    americanStocks,
    pensionFunds,
    cashFunds,
    bankBalances
  );

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
        <div className="user-bar">
          <button
            type="button"
            className="btn portfolio-save-btn"
            onClick={savePortfolio}
            disabled={!hasUnsavedChanges || saveLoading}
          >
            {saveLoading ? 'שומר…' : hasUnsavedChanges ? 'שמור שינויים' : 'נשמר'}
          </button>
          {lastSavedAt ? (
            <span className="user-email" style={{ fontSize: 12, opacity: 0.8 }}>
              נשמר לאחרונה: {lastSavedAt.toLocaleTimeString('he-IL')}
            </span>
          ) : null}
          {saveError ? (
            <span className="user-email" style={{ fontSize: 12, color: '#b00020' }}>
              {saveError}
            </span>
          ) : null}
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