import React from 'react';
import EditableCell from './EditableCell';
import { profitClass, formatDailyChangePercent } from '../utils/formatters';

// Renders the name/date/price/quantity editable fields for one American
// stock row — used for both the single-stock row and each expanded detail
// row. Date/price/quantity are only shown when showAmericanColumns is on.
function AmericanEditableFields({ stock, showAmericanColumns, editingField, isEditMode, handleCellClick, handleInlineEdit, finishInlineEdit, handleKeyDown, formatDate, formatPriceWithSign, nameCellStyle }) {
  return (
    <>
      <EditableCell
        id={stock.id}
        field="stockName"
        exchange="american"
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
      {showAmericanColumns && (
        <EditableCell
          id={stock.id}
          field="purchaseDate"
          exchange="american"
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
      )}
      {showAmericanColumns && (
        <EditableCell
          id={stock.id}
          field="purchasePrice"
          exchange="american"
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
          displayValue={`${formatPriceWithSign(stock.purchasePrice)} $`}
        />
      )}
      {showAmericanColumns && (
        <EditableCell
          id={stock.id}
          field="quantity"
          exchange="american"
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
      )}
    </>
  );
}

// Renders the computed (mostly non-editable, except exchangeRate) figures
// for one single American stock row.
function AmericanSingleStockComputedCells({
  stock,
  showAmericanColumns,
  calculateAmericanStockMetrics,
  calculateProfitPercentage,
  formatPrice,
  formatPriceWithSign,
  isEditMode,
  editingField,
  handleCellClick,
  handleInlineEdit,
  finishInlineEdit,
  handleKeyDown,
  handleDelete
}) {
  const {
    totalPurchaseUSD,
    totalPurchaseILS,
    totalCurrentValueUSD,
    currentExchangeRate,
    totalCurrentValueILS,
    profitUSD,
    profitILS,
    taxILS,
    afterTaxILS,
    exchangeRateImpact
  } = calculateAmericanStockMetrics(stock);
  const profitPercentage = calculateProfitPercentage(stock.purchasePrice || 0, stock.currentPrice || 0);

  return (
    <>
      <td>{formatPriceWithSign(totalPurchaseUSD)} $</td>
      {showAmericanColumns && <td>{formatPriceWithSign(totalPurchaseILS)} ₪</td>}
      {showAmericanColumns && (
        <EditableCell
          id={stock.id}
          field="exchangeRate"
          exchange="american"
          value={stock.exchangeRate}
          type="number"
          step="0.0001"
          parse={(raw) => parseFloat(raw)}
          editingField={editingField}
          isEditMode={isEditMode}
          handleCellClick={handleCellClick}
          handleInlineEdit={handleInlineEdit}
          finishInlineEdit={finishInlineEdit}
          handleKeyDown={handleKeyDown}
          displayValue={formatPrice(stock.exchangeRate)}
        />
      )}
      {showAmericanColumns && <td>{formatPrice(currentExchangeRate)}</td>}
      <td>{formatPriceWithSign(stock.currentPrice)} $</td>
      <td>{formatPriceWithSign(totalCurrentValueUSD)} $</td>
      {showAmericanColumns && <td>{formatPriceWithSign(totalCurrentValueILS)} ₪</td>}
      <td className={profitClass(profitUSD)}>{formatPriceWithSign(profitUSD)} $</td>
      {showAmericanColumns && <td className={profitClass(profitILS)}>{formatPriceWithSign(profitILS)} ₪</td>}
      <td className={profitClass(profitPercentage)}>{profitPercentage}%</td>
      <td className={profitClass(stock.dailyChangePercent)}>{formatDailyChangePercent(stock.dailyChangePercent)}%</td>
      <td className={profitClass(stock.dailyChangePercent)}>
        {formatPriceWithSign(((stock.dailyChangePercent || 0) / 100) * totalCurrentValueUSD)} $
      </td>
      {showAmericanColumns && <td className={profitClass(exchangeRateImpact)}>{formatPriceWithSign(exchangeRateImpact)} ₪</td>}
      {showAmericanColumns && <td className="profit-negative">{formatPriceWithSign(-taxILS)} ₪</td>}
      {showAmericanColumns && <td className={profitClass(afterTaxILS)}>{formatPriceWithSign(afterTaxILS)} ₪</td>}
      {isEditMode && (
        <td>
          <button onClick={() => handleDelete(stock.id, 'american')} className="delete-button">מחק</button>
        </td>
      )}
    </>
  );
}

function AmericanStocksTable({
  americanStocks,
  isEditMode,
  showAmericanColumns,
  expandedGroups,
  groupStocksByName,
  calculateGroupSummary,
  calculateAmericanStockMetrics,
  calculateProfitPercentage,
  TAX_RATE,
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
      {americanStocks.length > 0 && (
        <div className="stocks-section">
          <h2 className="section-title">בורסה אמריקאית</h2>
          <div className="table-container">
            <table className="stocks-table american-stocks-table">
              <thead>
                <tr>
                  <th>שם מנייה</th>
                  {showAmericanColumns && <th>תאריך קנייה</th>}
                  {showAmericanColumns && <th>מחיר קנייה</th>}
                  {showAmericanColumns && <th>כמות</th>}
                  <th>סה"כ רכישה בדולר</th>
                  {showAmericanColumns && <th>סה"כ רכישה בשקל</th>}
                  {showAmericanColumns && <th>שער חליפין ביום הקנייה</th>}
                  {showAmericanColumns && <th>שער חליפין היום</th>}
                  <th>מחיר נוכחי</th>
                  <th>סה"כ שווי בדולר</th>
                  {showAmericanColumns && <th>סה"כ שווי בש"ח</th>}
                  <th>סה"כ רווח/הפסד ($)</th>
                  {showAmericanColumns && <th>סה"כ רווח/הפסד (₪)</th>}
                  <th>אחוז רווח/הפסד</th>
                  <th>אחוז שינוי יומי</th>
                  <th>רווח/הפסד יומי בדולר</th>
                  {showAmericanColumns && <th>השפעת שער חליפין</th>}
                  {showAmericanColumns && <th>מס רווח הון (₪)</th>}
                  {showAmericanColumns && <th>רווח לאחר מס (₪)</th>}
                  {isEditMode && <th>פעולות</th>}
                </tr>
              </thead>
              <tbody>
                {Object.entries(groupStocksByName(americanStocks)).map(([stockName, stocks]) => {
                  const isExpanded = expandedGroups[`american-${stockName}`];
                  const summary = calculateGroupSummary(stocks);
                  const editableFieldProps = {
                    showAmericanColumns,
                    editingField,
                    isEditMode,
                    handleCellClick,
                    handleInlineEdit,
                    finishInlineEdit,
                    handleKeyDown,
                    formatDate,
                    formatPriceWithSign
                  };
                  const computedCellProps = {
                    showAmericanColumns,
                    calculateAmericanStockMetrics,
                    calculateProfitPercentage,
                    formatPrice,
                    formatPriceWithSign,
                    isEditMode,
                    editingField,
                    handleCellClick,
                    handleInlineEdit,
                    finishInlineEdit,
                    handleKeyDown,
                    handleDelete
                  };

                  if (stocks.length === 1) {
                    const stock = stocks[0];
                    return (
                      <tr key={stock.id} className={isEditMode ? 'editable-row' : ''}>
                        <AmericanEditableFields stock={stock} {...editableFieldProps} />
                        <AmericanSingleStockComputedCells stock={stock} {...computedCellProps} />
                      </tr>
                    );
                  }

                  const totalPurchaseUSD = stocks.reduce((sum, stock) => sum + ((stock.purchasePrice || 0) * (stock.quantity || 0)), 0);
                  const totalPurchaseILS = stocks.reduce((sum, stock) => sum + ((stock.purchasePrice || 0) * (stock.quantity || 0) * (stock.exchangeRate || 0)), 0);
                  const totalCurrentValueUSD = stocks.reduce((sum, stock) => sum + ((stock.currentPrice || 0) * (stock.quantity || 0)), 0);
                  const totalCurrentValueILS = stocks.reduce((sum, stock) => {
                    const currentExchangeRate = stock.currentExchangeRate || stock.exchangeRate || 0;
                    return sum + ((stock.currentPrice || 0) * (stock.quantity || 0) * currentExchangeRate);
                  }, 0);
                  const averagePurchasePrice = summary.totalQuantity > 0 ? totalPurchaseUSD / summary.totalQuantity : 0;
                  const averageCurrentPrice = summary.totalQuantity > 0 ? totalCurrentValueUSD / summary.totalQuantity : 0;
                  const profitPercentage = calculateProfitPercentage(averagePurchasePrice, averageCurrentPrice);
                  const totalProfitUSD = totalCurrentValueUSD - totalPurchaseUSD;
                  const totalProfitILS = totalProfitUSD * (stocks[0].currentExchangeRate || stocks[0].exchangeRate || 0);
                  const totalTaxUSD = totalProfitUSD > 0 ? totalProfitUSD * TAX_RATE : 0;
                  const totalTaxILS = totalTaxUSD * (stocks[0].currentExchangeRate || stocks[0].exchangeRate || 0);
                  const totalAfterTaxILS = totalProfitILS - totalTaxILS;
                  const totalExchangeRateImpact = stocks.reduce((sum, stock) => {
                    const stockPurchaseUSD = (stock.purchasePrice || 0) * (stock.quantity || 0);
                    const stockCurrentExchangeRate = stock.currentExchangeRate || stock.exchangeRate || 0;
                    return sum + (stockPurchaseUSD * (stockCurrentExchangeRate - (stock.exchangeRate || 0)));
                  }, 0);
                  const averageCurrentPriceUSD = summary.totalQuantity > 0 ? totalCurrentValueUSD / summary.totalQuantity : 0;

                  return (
                    <React.Fragment key={stockName}>
                      <tr className={`${isEditMode ? 'editable-row' : ''} ${isExpanded ? 'summary-row-expanded' : ''}`}>
                        <td onClick={() => handleCellClick(stocks[0].id, 'stockName', 'american')} className={isEditMode ? 'editable-cell' : ''}>
                          <button onClick={() => toggleGroup(stockName, 'american')} className="expand-button" style={{ marginRight: '8px', background: 'none', border: 'none', cursor: 'pointer' }}>
                            {isExpanded ? '▼' : '▶'}
                          </button>
                          {stockName}
                        </td>
                        {showAmericanColumns && <td>{isExpanded ? '' : 'פתח קיבוץ'}</td>}
                        {showAmericanColumns && <td>{isExpanded ? '' : 'פתח קיבוץ'}</td>}
                        {showAmericanColumns && <td>{summary.totalQuantity}</td>}
                        <td>{formatPriceWithSign(totalPurchaseUSD)} $</td>
                        {showAmericanColumns && <td>{formatPriceWithSign(totalPurchaseILS)} ₪</td>}
                        {showAmericanColumns && <td>{isExpanded ? '' : 'פתח קיבוץ'}</td>}
                        {showAmericanColumns && <td>{formatPrice(stocks[0].currentExchangeRate || stocks[0].exchangeRate || 0)}</td>}
                        <td>{formatPriceWithSign(averageCurrentPriceUSD)} $</td>
                        <td>{formatPriceWithSign(totalCurrentValueUSD)} $</td>
                        {showAmericanColumns && <td>{formatPriceWithSign(totalCurrentValueILS)} ₪</td>}
                        <td className={profitClass(totalProfitUSD)}>{formatPriceWithSign(totalProfitUSD)} $</td>
                        {showAmericanColumns && <td className={profitClass(totalProfitILS)}>{formatPriceWithSign(totalProfitILS)} ₪</td>}
                        <td className={profitClass(profitPercentage)}>{profitPercentage}%</td>
                        <td className={profitClass(stocks[0].dailyChangePercent)}>
                          {formatDailyChangePercent(stocks[0].dailyChangePercent)}%
                        </td>
                        <td className={profitClass(stocks[0].dailyChangePercent)}>
                          {formatPriceWithSign(((stocks[0].dailyChangePercent || 0) / 100) * totalCurrentValueUSD)} $
                        </td>
                        {showAmericanColumns && <td className={profitClass(totalExchangeRateImpact)}>{formatPriceWithSign(totalExchangeRateImpact)} ₪</td>}
                        {showAmericanColumns && <td className="profit-negative">{formatPriceWithSign(-totalTaxILS)} ₪</td>}
                        {showAmericanColumns && <td className={profitClass(totalAfterTaxILS)}>{formatPriceWithSign(totalAfterTaxILS)} ₪</td>}
                        {isEditMode && <td></td>}
                      </tr>

                      {isExpanded && stocks.map((stock) => (
                        <tr key={stock.id} className={`${isEditMode ? 'editable-row' : ''} detail-row`} style={{ backgroundColor: '#f8f9fa' }}>
                          <AmericanEditableFields
                            stock={stock}
                            {...editableFieldProps}
                            nameCellStyle={{ paddingLeft: '20px' }}
                          />
                          <AmericanSingleStockComputedCells stock={stock} {...computedCellProps} />
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

export default AmericanStocksTable;
