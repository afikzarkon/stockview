import React, { useState } from 'react';
import { TAX_RATE, calculateAmericanStockMetrics } from '../utils/portfolioMath';
import {
  formatDate,
  formatPrice,
  formatPriceWithSign,
  normalizeIsraeliPrice,
  calculateProfitPercentage
} from '../utils/formatters';
import { groupStocksByName, calculateGroupSummary } from '../utils/stockGrouping';
import PortfolioSummary from './PortfolioSummary';
import IsraeliStocksTable from './IsraeliStocksTable';
import AmericanStocksTable from './AmericanStocksTable';
import FinancialAccountsTables from './FinancialAccountsTables';

// The main portfolio dashboard: user bar, save controls, summary, the three
// tables, and the empty-state message. Extracted from App.js's final
// `return (...)` block — behavior is unchanged, only the location moved.
function HomeView({
  showLegacyImportButton,
  legacyImportLoading,
  handleLegacyImportOnce,
  savePortfolio,
  hasUnsavedChanges,
  saveLoading,
  lastSavedAt,
  saveError,
  legacyImportBanner,
  summary,
  israeliStocks,
  americanStocks,
  pensionFunds,
  cashFunds,
  bankBalances,
  cpi,
  handleAddInfo,
  isEditMode,
  setIsEditMode,
  showAmericanColumns,
  setShowAmericanColumns,
  expandedGroups,
  editingField,
  handleCellClick,
  handleInlineEdit,
  finishInlineEdit,
  handleKeyDown,
  handleDelete,
  toggleGroup
}) {
  const [exportError, setExportError] = useState('');
  const hasAnyData =
    israeliStocks.length > 0 ||
    americanStocks.length > 0 ||
    pensionFunds.length > 0 ||
    cashFunds.length > 0 ||
    bankBalances.length > 0;
  const exportPortfolioData = { summary, israeliStocks, americanStocks, pensionFunds, cashFunds, bankBalances };

  // exportReport.js pulls in exceljs + jsPDF + the embedded Hebrew font -
  // several hundred KB gzipped (confirmed: it blew up the main bundle by
  // ~458KB when imported statically). Loaded on demand here instead, so
  // that weight only hits users who actually click export, not everyone
  // who opens their portfolio.
  const handleExportExcel = async () => {
    setExportError('');
    try {
      const { downloadPortfolioExcel } = await import('../utils/exportReport');
      await downloadPortfolioExcel(exportPortfolioData);
    } catch {
      setExportError('שגיאה בייצוא לאקסל, נסה שוב');
    }
  };

  const handleExportPdf = async () => {
    setExportError('');
    try {
      const { downloadPortfolioPdf } = await import('../utils/exportReport');
      downloadPortfolioPdf(exportPortfolioData);
    } catch {
      setExportError('שגיאה בייצוא ל-PDF, נסה שוב');
    }
  };

  return (
    <div className="App">
      <div className="welcome-container">
        <div className="user-bar">
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
          <div className="page-header-row">
            <h1 className="welcome-title">תיק ההשקעות שלך</h1>
            <div className="page-header-actions">
              {hasAnyData && (
                <div className="export-actions">
                  <button type="button" className="export-button" onClick={handleExportExcel}>
                    ייצוא ל-Excel
                  </button>
                  <button type="button" className="export-button" onClick={handleExportPdf}>
                    ייצוא ל-PDF
                  </button>
                </div>
              )}
              <button type="button" className="add-info-button" onClick={handleAddInfo}>
                + הוספת מידע חדש
              </button>
            </div>
          </div>
          {exportError && <p className="export-error">{exportError}</p>}

          {/* מקור החישוב: המדד שנמשך ומשמש לחישוב מס רווח ההון הריאלי */}
          {cpi && (cpi.loading || cpi.currentIndex != null || cpi.error) && (
            <p className="cpi-status-banner">
              {cpi.loading && 'טוען את מדד המחירים לצרכן...'}
              {!cpi.loading && cpi.currentIndex != null && (
                <>מדד המחירים לצרכן הידוע: <strong>{cpi.currentIndex}</strong> (חודש {cpi.currentIndexMonth}) — משמש לחישוב מס רווח הון ריאלי</>
              )}
              {!cpi.loading && cpi.currentIndex == null && cpi.error && `לא ניתן היה למשוך את מדד המחירים לצרכן (${cpi.error}) - מוצג מס נומינלי שטוח`}
            </p>
          )}

          {/* סיכום התיק */}
          {(israeliStocks.length > 0 || americanStocks.length > 0) && (
            <PortfolioSummary
              summary={summary}
              formatPriceWithSign={formatPriceWithSign}
            />
          )}

          <div className="main-buttons-container">
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
                {showAmericanColumns ? 'הסתר נתונים נוספים' : 'לחץ כאן כדי לראות נתונים נוספים'}
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
            showAdditionalData={showAmericanColumns}
            expandedGroups={expandedGroups}
            groupStocksByName={groupStocksByName}
            calculateGroupSummary={calculateGroupSummary}
            normalizeIsraeliPrice={normalizeIsraeliPrice}
            calculateProfitPercentage={calculateProfitPercentage}
            TAX_RATE={TAX_RATE}
            cpi={cpi}
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
            showAdditionalData={showAmericanColumns}
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
            cpi={cpi}
            showAdditionalData={showAmericanColumns}
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

export default HomeView;
