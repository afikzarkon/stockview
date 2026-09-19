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
import PageToolbar, { ToolbarButton, ToolbarPrimaryButton, ToolbarStatus } from './PageToolbar';
import KpiTile, { KpiRow } from './KpiTile';

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
  snapshotSaveError,
  lastSnapshotSavedAt,
  legacyImportBanner,
  summary,
  israeliStocks,
  americanStocks,
  pensionFunds,
  cashFunds,
  bankBalances,
  bankSavingsFunds = [],
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
  toggleGroup,
  // Background price-refresh progress (see usePriceRefresh.js). The tables
  // render immediately from the prices saved with the portfolio; these tell
  // the user whether newer ones are still being fetched, so a stale number
  // is never silently presented as live.
  pricesRefreshing = false,
  pricesLastRefreshAt = null,
  hasLoadedLivePrices = false
}) {
  const [exportError, setExportError] = useState('');
  const hasAnyData =
    israeliStocks.length > 0 ||
    americanStocks.length > 0 ||
    pensionFunds.length > 0 ||
    cashFunds.length > 0 ||
    bankBalances.length > 0 ||
    bankSavingsFunds.length > 0;
  const exportPortfolioData = { summary, israeliStocks, americanStocks, pensionFunds, cashFunds, bankBalances, bankSavingsFunds };

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

  // Every control that acts on this page, in one strip, split by weight:
  // one filled primary action, and a quiet cluster of view/export
  // secondaries. These used to be spread across three places - a bar above
  // the title, a header row, and a block buried between the summary and
  // the tables.
  const secondaryActions = (
    <>
      <ToolbarButton
        onClick={() => setIsEditMode(!isEditMode)}
        pressed={isEditMode}
        title="עריכת תאים ישירות בטבלאות"
      >
        {isEditMode ? '✓ מצב עריכה' : 'מצב עריכה'}
      </ToolbarButton>
      <ToolbarButton
        onClick={() => setShowAmericanColumns(!showAmericanColumns)}
        pressed={showAmericanColumns}
        title="עמודות מס, מדד ורווח ריאלי"
      >
        נתונים מורחבים
      </ToolbarButton>
      {hasAnyData && (
        <>
          <ToolbarButton onClick={handleExportExcel} title="ייצוא הטבלאות לאקסל">
            ייצוא Excel
          </ToolbarButton>
          <ToolbarButton onClick={handleExportPdf} title="ייצוא הטבלאות ל-PDF">
            ייצוא PDF
          </ToolbarButton>
        </>
      )}
      {showLegacyImportButton && (
        <ToolbarButton onClick={handleLegacyImportOnce} disabled={legacyImportLoading}>
          {legacyImportLoading ? 'מייבא…' : 'ייבוא מהדפדפן'}
        </ToolbarButton>
      )}
    </>
  );

  // Save is the primary action only while there is something to save;
  // otherwise it states that everything is saved and stays out of the way.
  const primaryAction = (
    <>
      <ToolbarPrimaryButton onClick={handleAddInfo}>+ הוספת מידע</ToolbarPrimaryButton>
      <ToolbarButton onClick={savePortfolio} disabled={!hasUnsavedChanges || saveLoading} pressed={hasUnsavedChanges}>
        {saveLoading ? 'שומר…' : hasUnsavedChanges ? 'שמור שינויים' : 'נשמר'}
      </ToolbarButton>
    </>
  );

  const status = (
    <>
      {hasAnyData && (
        <span className={`price-refresh-status ${pricesRefreshing ? 'is-refreshing' : ''}`}>
          <span className="price-refresh-dot" />
          {pricesRefreshing
            ? hasLoadedLivePrices
              ? 'מעדכן מחירים…'
              : 'טוען מחירים עדכניים…'
            : pricesLastRefreshAt
            ? `מחירים עודכנו ב-${pricesLastRefreshAt.toLocaleTimeString('he-IL')}`
            : 'מוצגים מחירים אחרונים שנשמרו'}
        </span>
      )}
      {lastSavedAt && (
        <ToolbarStatus>נשמר לאחרונה: {lastSavedAt.toLocaleTimeString('he-IL')}</ToolbarStatus>
      )}
      {lastSnapshotSavedAt && (
        <ToolbarStatus>מידע יומי נשמר: {lastSnapshotSavedAt.toLocaleTimeString('he-IL')}</ToolbarStatus>
      )}
      {saveError && <ToolbarStatus tone="negative">{saveError}</ToolbarStatus>}
      {snapshotSaveError && <ToolbarStatus tone="negative">{snapshotSaveError}</ToolbarStatus>}
      {exportError && <ToolbarStatus tone="negative">{exportError}</ToolbarStatus>}
      {legacyImportBanner && <ToolbarStatus tone="positive">{legacyImportBanner}</ToolbarStatus>}
    </>
  );

  const toneOf = (value) => (value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral');

  // There is no portfolio-wide profit percentage on the summary - only
  // per-market ones - so it is derived here from the two totals that do
  // exist. Null rather than 0 when there is nothing invested to divide by,
  // so an empty portfolio doesn't report a confident "0.00%".
  const totalProfitPercent =
    summary.totalPurchaseILS > 0 ? (summary.totalProfitILS / summary.totalPurchaseILS) * 100 : null;

  return (
    <div className="App">
      <div className="welcome-container">
        <div className="welcome-content">
          <PageToolbar
            title="תיק ההשקעות שלך"
            subtitle={isEditMode ? 'מצב עריכה פעיל - לחצו על תא בטבלה כדי לערוך אותו' : undefined}
            primaryAction={primaryAction}
            secondaryActions={secondaryActions}
            status={status}
          />

          {/* The three or four figures the app is opened to see, lifted out
              of the ~35-row summary below so they aren't buried among tax
              detail that is read occasionally rather than every time. */}
          {hasAnyData && (
            <KpiRow>
              <KpiTile
                label="שווי התיק"
                icon="₪"
                value={`${formatPriceWithSign(summary.capitalTotalILS)} ₪`}
                sub="סך כל הנכסים"
              />
              <KpiTile
                label="רווח/הפסד כולל"
                icon="↗"
                tone={toneOf(summary.totalProfitILS)}
                value={`${formatPriceWithSign(summary.totalProfitILS)} ₪`}
                sub={totalProfitPercent != null ? `${totalProfitPercent.toFixed(2)}% מההשקעה` : 'אין השקעה רשומה'}
              />
              <KpiTile
                label="שינוי יומי"
                icon="◷"
                tone={toneOf(summary.dailyProfitILS)}
                value={`${formatPriceWithSign(summary.dailyProfitILS)} ₪`}
                sub={`${summary.weightedDailyChange.toFixed(2)}% משוקלל`}
              />
              <KpiTile
                label="מס צפוי"
                icon="%"
                value={`${formatPriceWithSign(summary.totalTaxILS)} ₪`}
                sub="על הרווח הריאלי"
              />
            </KpiRow>
          )}

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
            <PortfolioSummary summary={summary} formatPriceWithSign={formatPriceWithSign} />
          )}

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
            pricesPending={!hasLoadedLivePrices}
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
            pricesPending={!hasLoadedLivePrices}
          />

          <FinancialAccountsTables
            pensionFunds={pensionFunds}
            cashFunds={cashFunds}
            bankBalances={bankBalances}
            bankSavingsFunds={bankSavingsFunds}
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
