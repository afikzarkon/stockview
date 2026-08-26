import React from 'react';
import EditableCell from './EditableCell';
import { profitClass, formatDailyChangePercent } from '../utils/formatters';
import { calculateStockRealGainTax, monthKeyFromDate } from '../utils/cpiTax';

// Renders the 4 editable fields (name/date/price/quantity) for one Israeli
// stock row — used for both the single-stock row and each expanded detail
// row, since they're identical apart from an optional style prop.
function IsraeliEditableFields({ stock, editingField, isEditMode, handleCellClick, handleInlineEdit, finishInlineEdit, handleKeyDown, formatDate, formatPrice, nameCellStyle }) {
  return (
    <>
      <EditableCell
        id={stock.id}
        field="stockName"
        exchange="israeli"
        value={stock.stockName}
        editingField={editingField}
        isEditMode={isEditMode}
        handleCellClick={handleCellClick}
        handleInlineEdit={handleInlineEdit}
        finishInlineEdit={finishInlineEdit}
        handleKeyDown={handleKeyDown}
        displayValue={stock.stockName}
        style={nameCellStyle}
      />
      <EditableCell
        id={stock.id}
        field="purchaseDate"
        exchange="israeli"
        value={stock.purchaseDate}
        type="date"
        editingField={editingField}
        isEditMode={isEditMode}
        handleCellClick={handleCellClick}
        handleInlineEdit={handleInlineEdit}
        finishInlineEdit={finishInlineEdit}
        handleKeyDown={handleKeyDown}
        displayValue={formatDate(stock.purchaseDate)}
      />
      <EditableCell
        id={stock.id}
        field="purchasePrice"
        exchange="israeli"
        value={stock.purchasePrice}
        type="number"
        step="0.01"
        parse={(raw) => parseFloat(raw)}
        editingField={editingField}
        isEditMode={isEditMode}
        handleCellClick={handleCellClick}
        handleInlineEdit={handleInlineEdit}
        finishInlineEdit={finishInlineEdit}
        handleKeyDown={handleKeyDown}
        displayValue={formatPrice(stock.purchasePrice)}
      />
      <EditableCell
        id={stock.id}
        field="quantity"
        exchange="israeli"
        value={stock.quantity}
        type="number"
        min="1"
        parse={(raw) => parseInt(raw)}
        editingField={editingField}
        isEditMode={isEditMode}
        handleCellClick={handleCellClick}
        handleInlineEdit={handleInlineEdit}
        finishInlineEdit={finishInlineEdit}
        handleKeyDown={handleKeyDown}
        displayValue={stock.quantity}
      />
    </>
  );
}

// Renders the computed (non-editable) figures for one Israeli stock row —
// used for both the single-stock row and each expanded detail row.
function IsraeliComputedCells({ stock, normalizeIsraeliPrice, calculateProfitPercentage, TAX_RATE, cpi, showAdditionalData, formatPrice, formatPriceWithSign, isEditMode, handleDelete }) {
  const displayCurrentPrice = normalizeIsraeliPrice(stock.currentPrice);
  const totalPurchase = (stock.purchasePrice || 0) * (stock.quantity || 0);
  const totalCurrentValue = (displayCurrentPrice || 0) * (stock.quantity || 0);
  const profit = totalCurrentValue - totalPurchase;
  const profitPercentage = calculateProfitPercentage(totalPurchase, totalCurrentValue);

  // מס רווח הון ריאלי: מוצמד למדד לפי תאריך הקנייה כשהמדד זמין (אותה
  // לוגיקה בדיוק כמו ב-portfolioSummary.js, כדי שהמספר בשורה הזו יהיה
  // תמיד עקבי עם הסכום המצטבר שמוצג בסיכום התיק). אם אין מדד לתאריך
  // הקנייה - נופלים חזרה למס שטוח על הרווח הנומינלי, בלי הצמדה.
  const indexAtPurchase = cpi && cpi.indexByMonth ? cpi.indexByMonth[monthKeyFromDate(stock.purchaseDate)] : null;
  const currentIndex = cpi ? cpi.currentIndex : null;
  let capitalGainsTaxILS;
  let realGain;
  if (currentIndex && indexAtPurchase) {
    const result = calculateStockRealGainTax({
      purchasePrice: stock.purchasePrice,
      quantity: stock.quantity,
      currentValue: totalCurrentValue,
      indexAtPurchase,
      currentIndex
    });
    capitalGainsTaxILS = result.tax;
    realGain = result.realGain;
  } else {
    capitalGainsTaxILS = profit > 0 ? profit * TAX_RATE : 0;
    realGain = profit;
  }
  // רווח אינפלציוני נגזר כ"מה שנשאר" מהנומינלי אחרי הרווח הריאלי - עקבי
  // תמיד עם הכלל האסימטרי מפסק דין מוזס, בדיוק כמו ב-portfolioSummary.js.
  const inflationaryGain = profit - realGain;
  const afterTaxProfitILS = profit - capitalGainsTaxILS;

  return (
    <>
      <td>{formatPrice(totalPurchase)}</td>
      <td>{formatPrice(displayCurrentPrice)}</td>
      <td>{formatPrice(totalCurrentValue)}</td>
      <td className={profitClass(profit)}>{formatPriceWithSign(profit)}</td>
      {showAdditionalData && <td>{indexAtPurchase != null ? indexAtPurchase : '-'}</td>}
      {showAdditionalData && <td>{currentIndex != null ? currentIndex : '-'}</td>}
      {showAdditionalData && <td className="profit-negative">{formatPriceWithSign(-capitalGainsTaxILS)}</td>}
      {showAdditionalData && <td className={profitClass(afterTaxProfitILS)}>{formatPriceWithSign(afterTaxProfitILS)}</td>}
      {showAdditionalData && <td className={profitClass(inflationaryGain)}>{formatPriceWithSign(inflationaryGain)}</td>}
      {showAdditionalData && <td className={profitClass(realGain)}>{formatPriceWithSign(realGain)}</td>}
      <td className={profitClass(profit)}>{profitPercentage}%</td>
      <td className={profitClass(stock.dailyChangePercent)}>{formatDailyChangePercent(stock.dailyChangePercent)}%</td>
      <td className={profitClass(stock.dailyChangePercent)}>
        {formatPriceWithSign(((stock.dailyChangePercent || 0) / 100) * totalCurrentValue)} ₪
      </td>
      {isEditMode && (
        <td>
          <button onClick={() => handleDelete(stock.id, 'israeli')} className="delete-button">
            מחק
          </button>
        </td>
      )}
    </>
  );
}

function IsraeliStocksTable({
  israeliStocks,
  isEditMode,
  showAdditionalData,
  expandedGroups,
  groupStocksByName,
  calculateGroupSummary,
  normalizeIsraeliPrice,
  calculateProfitPercentage,
  TAX_RATE,
  cpi,
  handleCellClick,
  handleInlineEdit,
  finishInlineEdit,
  handleKeyDown,
  formatDate,
  formatPrice,
  formatPriceWithSign,
  handleDelete,
  toggleGroup,
  editingField
}) {
  return (
    <>
      {israeliStocks.length > 0 && (
        <div className="stocks-section">
          <h2 className="section-title">בורסה ישראלית</h2>
          <div className="table-container">
            <table className="stocks-table">
              <thead>
                <tr>
                  <th>שם מנייה</th>
                  <th>תאריך קנייה</th>
                  <th>מחיר קנייה (₪)</th>
                  <th>כמות</th>
                  <th>סה"כ קנייה בש"ח</th>
                  <th>מחיר נוכחי (₪)</th>
                  <th>סה"כ שווי היום (₪)</th>
                  <th>סה"כ רווח/הפסד בש"ח</th>
                  {showAdditionalData && <th>מדד ביום הקנייה</th>}
                  {showAdditionalData && <th>מדד היום (הידוע)</th>}
                  {showAdditionalData && <th>מס רווח הון (₪)</th>}
                  {showAdditionalData && <th>רווח לאחר מס (₪)</th>}
                  {showAdditionalData && <th>רווח אינפלציוני (₪)</th>}
                  {showAdditionalData && <th>רווח ריאלי (₪)</th>}
                  <th>אחוז רווח/הפסד</th>
                  <th>אחוז שינוי יומי</th>
                  <th>רווח/הפסד יומי בש"ח</th>
                  {isEditMode && <th>פעולות</th>}
                </tr>
              </thead>
              <tbody>
                {Object.entries(groupStocksByName(israeliStocks)).map(([stockName, stocks]) => {
                  const isExpanded = expandedGroups[`israeli-${stockName}`];
                  const summary = calculateGroupSummary(stocks);
                  const editableFieldProps = {
                    editingField,
                    isEditMode,
                    handleCellClick,
                    handleInlineEdit,
                    finishInlineEdit,
                    handleKeyDown,
                    formatDate,
                    formatPrice
                  };
                  const computedCellProps = {
                    normalizeIsraeliPrice,
                    calculateProfitPercentage,
                    TAX_RATE,
                    cpi,
                    showAdditionalData,
                    formatPrice,
                    formatPriceWithSign,
                    isEditMode,
                    handleDelete
                  };

                  if (stocks.length === 1) {
                    const stock = stocks[0];
                    return (
                      <tr key={stock.id} className={isEditMode ? 'editable-row' : ''}>
                        <IsraeliEditableFields stock={stock} {...editableFieldProps} />
                        <IsraeliComputedCells stock={stock} {...computedCellProps} />
                      </tr>
                    );
                  }

                  return (
                    <React.Fragment key={stockName}>
                      <tr className={`${isEditMode ? 'editable-row' : ''} ${isExpanded ? 'summary-row-expanded' : ''}`}>
                        <td
                          onClick={() => handleCellClick(stocks[0].id, 'stockName', 'israeli')}
                          className={isEditMode ? 'editable-cell' : ''}
                        >
                          <button
                            onClick={() => toggleGroup(stockName, 'israeli')}
                            className="expand-button"
                            style={{ marginRight: '8px', background: 'none', border: 'none', cursor: 'pointer' }}
                          >
                            {isExpanded ? '▼' : '▶'}
                          </button>
                          {stockName}
                        </td>
                        <td>פתח קיבוץ</td>
                        <td>פתח קיבוץ</td>
                        <td>{summary.totalQuantity}</td>
                        <td>{formatPrice(summary.totalPurchaseValue)}</td>
                        <td>{formatPrice(summary.averageCurrentPrice)}</td>
                        <td>{formatPrice(summary.totalCurrentValue)}</td>
                        <td className={profitClass(summary.totalProfit)}>{formatPriceWithSign(summary.totalProfit)}</td>
                        {showAdditionalData && (
                          <td colSpan={2} style={{ color: '#7f8c8d', fontSize: '0.85em' }}>ראה פירוט לכל שורה (מחיצים שונים)</td>
                        )}
                        {showAdditionalData && (() => {
                          // סכימה per-lot של המס/הרווח הריאלי (לא על הרווח המצרפי),
                          // כי לכל lot יש תאריך קנייה ומדד שונים.
                          let tax = 0;
                          let realGainSum = 0;
                          stocks.forEach((stock) => {
                            const displayCurrentPrice = normalizeIsraeliPrice(stock.currentPrice);
                            const totalCurrentValueLot = (displayCurrentPrice || 0) * (stock.quantity || 0);
                            const profitLot = totalCurrentValueLot - (stock.purchasePrice || 0) * (stock.quantity || 0);
                            const indexAtPurchase = cpi && cpi.indexByMonth ? cpi.indexByMonth[monthKeyFromDate(stock.purchaseDate)] : null;
                            if (cpi && cpi.currentIndex && indexAtPurchase) {
                              const result = calculateStockRealGainTax({
                                purchasePrice: stock.purchasePrice,
                                quantity: stock.quantity,
                                currentValue: totalCurrentValueLot,
                                indexAtPurchase,
                                currentIndex: cpi.currentIndex
                              });
                              tax += result.tax;
                              realGainSum += result.realGain;
                            } else {
                              tax += profitLot > 0 ? profitLot * TAX_RATE : 0;
                              realGainSum += profitLot;
                            }
                          });
                          const after = summary.totalProfit - tax;
                          const inflationarySum = summary.totalProfit - realGainSum;
                          return (
                            <>
                              <td className="profit-negative">{formatPriceWithSign(-tax)}</td>
                              <td className={profitClass(after)}>{formatPriceWithSign(after)}</td>
                              <td className={profitClass(inflationarySum)}>{formatPriceWithSign(inflationarySum)}</td>
                              <td className={profitClass(realGainSum)}>{formatPriceWithSign(realGainSum)}</td>
                            </>
                          );
                        })()}
                        <td className={profitClass(summary.totalProfit)}>{summary.profitPercentage}%</td>
                        <td className={profitClass(stocks[0].dailyChangePercent)}>
                          {formatDailyChangePercent(stocks[0].dailyChangePercent)}%
                        </td>
                        <td className={profitClass(stocks[0].dailyChangePercent)}>
                          {formatPriceWithSign(((stocks[0].dailyChangePercent || 0) / 100) * summary.totalCurrentValue)} ₪
                        </td>
                        {isEditMode && <td></td>}
                      </tr>

                      {isExpanded && stocks.map((stock) => (
                        <tr key={stock.id} className={`${isEditMode ? 'editable-row' : ''} detail-row`} style={{ backgroundColor: '#f8f9fa' }}>
                          <IsraeliEditableFields
                            stock={stock}
                            {...editableFieldProps}
                            nameCellStyle={{ paddingLeft: '20px' }}
                          />
                          <IsraeliComputedCells stock={stock} {...computedCellProps} />
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

export default IsraeliStocksTable;
