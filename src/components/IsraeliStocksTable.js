import React from 'react';

function IsraeliStocksTable({
  israeliStocks,
  isEditMode,
  expandedGroups,
  groupStocksByName,
  calculateGroupSummary,
  normalizeIsraeliPrice,
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
                  <th>מס רווח הון (₪)</th>
                  <th>רווח לאחר מס (₪)</th>
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

                  if (stocks.length === 1) {
                    const stock = stocks[0];
                    const displayCurrentPrice = normalizeIsraeliPrice(stock.currentPrice);
                    const totalPurchase = (stock.purchasePrice || 0) * (stock.quantity || 0);
                    const totalCurrentValue = (displayCurrentPrice || 0) * (stock.quantity || 0);
                    const profit = totalCurrentValue - totalPurchase;
                    const profitPercentage = calculateProfitPercentage(totalPurchase, totalCurrentValue);
                    const capitalGainsTaxILS = profit > 0 ? profit * TAX_RATE : 0;
                    const afterTaxProfitILS = profit - capitalGainsTaxILS;

                    return (
                      <tr
                        key={stock.id}
                        className={isEditMode ? 'editable-row' : ''}
                      >
                        <td
                          onClick={() => handleCellClick(stock.id, 'stockName', 'israeli')}
                          className={isEditMode ? 'editable-cell' : ''}
                        >
                          {editingField === `${stock.id}-stockName` ? (
                            <input
                              type="text"
                              value={stock.stockName}
                              onChange={(e) => handleInlineEdit(stock.id, 'stockName', e.target.value, 'israeli')}
                              onBlur={finishInlineEdit}
                              onKeyDown={(e) => handleKeyDown(e, stock.id, 'stockName', 'israeli')}
                              autoFocus
                            />
                          ) : (
                            stock.stockName
                          )}
                        </td>
                        <td
                          onClick={() => handleCellClick(stock.id, 'purchaseDate', 'israeli')}
                          className={isEditMode ? 'editable-cell' : ''}
                        >
                          {editingField === `${stock.id}-purchaseDate` ? (
                            <input
                              type="date"
                              value={stock.purchaseDate}
                              onChange={(e) => handleInlineEdit(stock.id, 'purchaseDate', e.target.value, 'israeli')}
                              onBlur={finishInlineEdit}
                              onKeyDown={(e) => handleKeyDown(e, stock.id, 'purchaseDate', 'israeli')}
                              autoFocus
                            />
                          ) : (
                            formatDate(stock.purchaseDate)
                          )}
                        </td>
                        <td
                          onClick={() => handleCellClick(stock.id, 'purchasePrice', 'israeli')}
                          className={isEditMode ? 'editable-cell' : ''}
                        >
                          {editingField === `${stock.id}-purchasePrice` ? (
                            <input
                              type="number"
                              value={stock.purchasePrice}
                              onChange={(e) => handleInlineEdit(stock.id, 'purchasePrice', parseFloat(e.target.value), 'israeli')}
                              onBlur={finishInlineEdit}
                              onKeyDown={(e) => handleKeyDown(e, stock.id, 'purchasePrice', 'israeli')}
                              autoFocus
                              step="0.01"
                            />
                          ) : (
                            formatPrice(stock.purchasePrice)
                          )}
                        </td>
                        <td
                          onClick={() => handleCellClick(stock.id, 'quantity', 'israeli')}
                          className={isEditMode ? 'editable-cell' : ''}
                        >
                          {editingField === `${stock.id}-quantity` ? (
                            <input
                              type="number"
                              value={stock.quantity}
                              onChange={(e) => handleInlineEdit(stock.id, 'quantity', parseInt(e.target.value), 'israeli')}
                              onBlur={finishInlineEdit}
                              onKeyDown={(e) => handleKeyDown(e, stock.id, 'quantity', 'israeli')}
                              autoFocus
                              min="1"
                            />
                          ) : (
                            stock.quantity
                          )}
                        </td>
                        <td>{formatPrice(totalPurchase)}</td>
                        <td>{formatPrice(displayCurrentPrice)}</td>
                        <td>{formatPrice(totalCurrentValue)}</td>
                        <td className={profit >= 0 ? 'profit-positive' : 'profit-negative'}>
                          {formatPriceWithSign(profit)}
                        </td>
                        <td className="profit-negative">
                          {formatPriceWithSign(-capitalGainsTaxILS)}
                        </td>
                        <td className={afterTaxProfitILS >= 0 ? 'profit-positive' : 'profit-negative'}>
                          {formatPriceWithSign(afterTaxProfitILS)}
                        </td>
                        <td className={profit >= 0 ? 'profit-positive' : 'profit-negative'}>
                          {profitPercentage}%
                        </td>
                        <td className={(stock.dailyChangePercent || 0) >= 0 ? 'profit-positive' : 'profit-negative'}>
                          {stock.dailyChangePercent !== undefined && stock.dailyChangePercent !== null ? stock.dailyChangePercent.toFixed(2) : '0.00'}%
                        </td>
                        <td className={(stock.dailyChangePercent || 0) >= 0 ? 'profit-positive' : 'profit-negative'}>
                          {formatPriceWithSign(((stock.dailyChangePercent || 0) / 100) * totalCurrentValue)} ₪
                        </td>
                        {isEditMode && (
                          <td>
                            <button
                              onClick={() => handleDelete(stock.id, 'israeli')}
                              className="delete-button"
                            >
                              מחק
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  }

                  return (
                    <React.Fragment key={stockName}>
                      <tr
                        className={`${isEditMode ? 'editable-row' : ''} ${isExpanded ? 'summary-row-expanded' : ''}`}
                      >
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
                        <td className={summary.totalProfit >= 0 ? 'profit-positive' : 'profit-negative'}>
                          {formatPriceWithSign(summary.totalProfit)}
                        </td>
                        {(() => {
                          const tax = summary.totalProfit > 0 ? summary.totalProfit * TAX_RATE : 0;
                          const after = summary.totalProfit - tax;
                          return (
                            <>
                              <td className="profit-negative">{formatPriceWithSign(-tax)}</td>
                              <td className={after >= 0 ? 'profit-positive' : 'profit-negative'}>{formatPriceWithSign(after)}</td>
                            </>
                          );
                        })()}
                        <td className={summary.totalProfit >= 0 ? 'profit-positive' : 'profit-negative'}>
                          {summary.profitPercentage}%
                        </td>
                        <td className={(stocks[0].dailyChangePercent || 0) >= 0 ? 'profit-positive' : 'profit-negative'}>
                          {stocks[0].dailyChangePercent !== undefined && stocks[0].dailyChangePercent !== null ? stocks[0].dailyChangePercent.toFixed(2) : '0.00'}%
                        </td>
                        <td className={(stocks[0].dailyChangePercent || 0) >= 0 ? 'profit-positive' : 'profit-negative'}>
                          {formatPriceWithSign(((stocks[0].dailyChangePercent || 0) / 100) * summary.totalCurrentValue)} ₪
                        </td>
                        {isEditMode && <td></td>}
                      </tr>

                      {isExpanded && stocks.map((stock) => {
                        const displayCurrentPrice = normalizeIsraeliPrice(stock.currentPrice);
                        const totalPurchase = (stock.purchasePrice || 0) * (stock.quantity || 0);
                        const totalCurrentValue = (displayCurrentPrice || 0) * (stock.quantity || 0);
                        const profit = totalCurrentValue - totalPurchase;
                        const profitPercentage = calculateProfitPercentage(totalPurchase, totalCurrentValue);
                        const capitalGainsTaxILS = profit > 0 ? profit * TAX_RATE : 0;
                        const afterTaxProfitILS = profit - capitalGainsTaxILS;

                        return (
                          <tr
                            key={stock.id}
                            className={`${isEditMode ? 'editable-row' : ''} detail-row`}
                            style={{ backgroundColor: '#f8f9fa' }}
                          >
                            <td
                              onClick={() => handleCellClick(stock.id, 'stockName', 'israeli')}
                              className={isEditMode ? 'editable-cell' : ''}
                              style={{ paddingLeft: '20px' }}
                            >
                              {editingField === `${stock.id}-stockName` ? (
                                <input
                                  type="text"
                                  value={stock.stockName}
                                  onChange={(e) => handleInlineEdit(stock.id, 'stockName', e.target.value, 'israeli')}
                                  onBlur={finishInlineEdit}
                                  onKeyDown={(e) => handleKeyDown(e, stock.id, 'stockName', 'israeli')}
                                  autoFocus
                                />
                              ) : (
                                stock.stockName
                              )}
                            </td>
                            <td
                              onClick={() => handleCellClick(stock.id, 'purchaseDate', 'israeli')}
                              className={isEditMode ? 'editable-cell' : ''}
                            >
                              {editingField === `${stock.id}-purchaseDate` ? (
                                <input
                                  type="date"
                                  value={stock.purchaseDate}
                                  onChange={(e) => handleInlineEdit(stock.id, 'purchaseDate', e.target.value, 'israeli')}
                                  onBlur={finishInlineEdit}
                                  onKeyDown={(e) => handleKeyDown(e, stock.id, 'purchaseDate', 'israeli')}
                                  autoFocus
                                />
                              ) : (
                                formatDate(stock.purchaseDate)
                              )}
                            </td>
                            <td
                              onClick={() => handleCellClick(stock.id, 'purchasePrice', 'israeli')}
                              className={isEditMode ? 'editable-cell' : ''}
                            >
                              {editingField === `${stock.id}-purchasePrice` ? (
                                <input
                                  type="number"
                                  value={stock.purchasePrice}
                                  onChange={(e) => handleInlineEdit(stock.id, 'purchasePrice', parseFloat(e.target.value), 'israeli')}
                                  onBlur={finishInlineEdit}
                                  onKeyDown={(e) => handleKeyDown(e, stock.id, 'purchasePrice', 'israeli')}
                                  autoFocus
                                  step="0.01"
                                />
                              ) : (
                                formatPrice(stock.purchasePrice)
                              )}
                            </td>
                            <td
                              onClick={() => handleCellClick(stock.id, 'quantity', 'israeli')}
                              className={isEditMode ? 'editable-cell' : ''}
                            >
                              {editingField === `${stock.id}-quantity` ? (
                                <input
                                  type="number"
                                  value={stock.quantity}
                                  onChange={(e) => handleInlineEdit(stock.id, 'quantity', parseInt(e.target.value), 'israeli')}
                                  onBlur={finishInlineEdit}
                                  onKeyDown={(e) => handleKeyDown(e, stock.id, 'quantity', 'israeli')}
                                  autoFocus
                                  min="1"
                                />
                              ) : (
                                stock.quantity
                              )}
                            </td>
                            <td>{formatPrice(totalPurchase)}</td>
                            <td>{formatPrice(displayCurrentPrice)}</td>
                            <td>{formatPrice(totalCurrentValue)}</td>
                            <td className={profit >= 0 ? 'profit-positive' : 'profit-negative'}>
                              {formatPriceWithSign(profit)}
                            </td>
                            <td className="profit-negative">
                              {formatPriceWithSign(-capitalGainsTaxILS)}
                            </td>
                            <td className={afterTaxProfitILS >= 0 ? 'profit-positive' : 'profit-negative'}>
                              {formatPriceWithSign(afterTaxProfitILS)}
                            </td>
                            <td className={profit >= 0 ? 'profit-positive' : 'profit-negative'}>
                              {profitPercentage}%
                            </td>
                            <td className={(stock.dailyChangePercent || 0) >= 0 ? 'profit-positive' : 'profit-negative'}>
                              {stock.dailyChangePercent !== undefined && stock.dailyChangePercent !== null ? stock.dailyChangePercent.toFixed(2) : '0.00'}%
                            </td>
                            <td className={(stock.dailyChangePercent || 0) >= 0 ? 'profit-positive' : 'profit-negative'}>
                              {formatPriceWithSign(((stock.dailyChangePercent || 0) / 100) * totalCurrentValue)} ₪
                            </td>
                            {isEditMode && (
                              <td>
                                <button
                                  onClick={() => handleDelete(stock.id, 'israeli')}
                                  className="delete-button"
                                >
                                  מחק
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
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
