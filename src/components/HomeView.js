import React from 'react';
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
import { calculatePortfolioSummary } from './PortfolioSummary';
// The main portfolio dashboard: user bar, save controls, summary, the three
// tables, and the empty-state message. Extracted from App.js's final
// `return (...)` block — behavior is unchanged, only the location moved.
function HomeView({
  user,
  showLegacyImportButton,
  legacyImportLoading,
  handleLegacyImportOnce,
  handleLogout,
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
  handleAddInfo,
  setShowAnalysis,
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

export default HomeView;
