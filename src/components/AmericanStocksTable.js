import React from 'react';

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

                  if (stocks.length === 1) {
                    const stock = stocks[0];
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
                      <tr
                        key={stock.id}
                        className={isEditMode ? 'editable-row' : ''}
                      >
                        <td onClick={() => handleCellClick(stock.id, 'stockName', 'american')} className={isEditMode ? 'editable-cell' : ''}>
                          {editingField === `${stock.id}-stockName` ? (
                            <input
                              type="text"
                              value={stock.stockName}
                              onChange={(e) => handleInlineEdit(stock.id, 'stockName', e.target.value, 'american')}
                              onBlur={finishInlineEdit}
                              onKeyDown={(e) => handleKeyDown(e, stock.id, 'stockName', 'american')}
                              autoFocus
                            />
                          ) : stock.stockName}
                        </td>
                        {showAmericanColumns && (
                          <td onClick={() => handleCellClick(stock.id, 'purchaseDate', 'american')} className={isEditMode ? 'editable-cell' : ''}>
                            {editingField === `${stock.id}-purchaseDate` ? (
                              <input
                                type="date"
                                value={stock.purchaseDate}
                                onChange={(e) => handleInlineEdit(stock.id, 'purchaseDate', e.target.value, 'american')}
                                onBlur={finishInlineEdit}
                                onKeyDown={(e) => handleKeyDown(e, stock.id, 'purchaseDate', 'american')}
                                autoFocus
                              />
                            ) : formatDate(stock.purchaseDate)}
                          </td>
                        )}
                        {showAmericanColumns && (
                          <td onClick={() => handleCellClick(stock.id, 'purchasePrice', 'american')} className={isEditMode ? 'editable-cell' : ''}>
                            {editingField === `${stock.id}-purchasePrice` ? (
                              <input
                                type="number"
                                value={stock.purchasePrice}
                                onChange={(e) => handleInlineEdit(stock.id, 'purchasePrice', parseFloat(e.target.value), 'american')}
                                onBlur={finishInlineEdit}
                                onKeyDown={(e) => handleKeyDown(e, stock.id, 'purchasePrice', 'american')}
                                autoFocus
                                step="0.01"
                              />
                            ) : formatPriceWithSign(stock.purchasePrice) + ' $'}
                          </td>
                        )}
                        {showAmericanColumns && (
                          <td onClick={() => handleCellClick(stock.id, 'quantity', 'american')} className={isEditMode ? 'editable-cell' : ''}>
                            {editingField === `${stock.id}-quantity` ? (
                              <input
                                type="number"
                                value={stock.quantity}
                                onChange={(e) => handleInlineEdit(stock.id, 'quantity', parseInt(e.target.value), 'american')}
                                onBlur={finishInlineEdit}
                                onKeyDown={(e) => handleKeyDown(e, stock.id, 'quantity', 'american')}
                                autoFocus
                                min="1"
                              />
                            ) : stock.quantity}
                          </td>
                        )}
                        <td>{formatPriceWithSign(totalPurchaseUSD)} $</td>
                        {showAmericanColumns && <td>{formatPriceWithSign(totalPurchaseILS)} ₪</td>}
                        {showAmericanColumns && (
                          <td onClick={() => handleCellClick(stock.id, 'exchangeRate', 'american')} className={isEditMode ? 'editable-cell' : ''}>
                            {editingField === `${stock.id}-exchangeRate` ? (
                              <input
                                type="number"
                                value={stock.exchangeRate}
                                onChange={(e) => handleInlineEdit(stock.id, 'exchangeRate', parseFloat(e.target.value), 'american')}
                                onBlur={finishInlineEdit}
                                onKeyDown={(e) => handleKeyDown(e, stock.id, 'exchangeRate', 'american')}
                                autoFocus
                                step="0.0001"
                              />
                            ) : formatPrice(stock.exchangeRate)}
                          </td>
                        )}
                        {showAmericanColumns && <td>{formatPrice(currentExchangeRate)}</td>}
                        <td>{formatPriceWithSign(stock.currentPrice)} $</td>
                        <td>{formatPriceWithSign(totalCurrentValueUSD)} $</td>
                        {showAmericanColumns && <td>{formatPriceWithSign(totalCurrentValueILS)} ₪</td>}
                        <td className={profitUSD >= 0 ? 'profit-positive' : 'profit-negative'}>{formatPriceWithSign(profitUSD)} $</td>
                        {showAmericanColumns && <td className={profitILS >= 0 ? 'profit-positive' : 'profit-negative'}>{formatPriceWithSign(profitILS)} ₪</td>}
                        <td className={profitPercentage >= 0 ? 'profit-positive' : 'profit-negative'}>{profitPercentage}%</td>
                        <td className={(stock.dailyChangePercent || 0) >= 0 ? 'profit-positive' : 'profit-negative'}>{stock.dailyChangePercent ? stock.dailyChangePercent.toFixed(2) : '0.00'}%</td>
                        <td className={(stock.dailyChangePercent || 0) >= 0 ? 'profit-positive' : 'profit-negative'}>{formatPriceWithSign(((stock.dailyChangePercent || 0) / 100) * totalCurrentValueUSD)} $</td>
                        {showAmericanColumns && <td className={exchangeRateImpact >= 0 ? 'profit-positive' : 'profit-negative'}>{formatPriceWithSign(exchangeRateImpact)} ₪</td>}
                        {showAmericanColumns && <td className="profit-negative">{formatPriceWithSign(-taxILS)} ₪</td>}
                        {showAmericanColumns && <td className={afterTaxILS >= 0 ? 'profit-positive' : 'profit-negative'}>{formatPriceWithSign(afterTaxILS)} ₪</td>}
                        {isEditMode && (
                          <td>
                            <button onClick={() => handleDelete(stock.id, 'american')} className="delete-button">מחק</button>
                          </td>
                        )}
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
                        <td className={totalProfitUSD >= 0 ? 'profit-positive' : 'profit-negative'}>{formatPriceWithSign(totalProfitUSD)} $</td>
                        {showAmericanColumns && <td className={totalProfitILS >= 0 ? 'profit-positive' : 'profit-negative'}>{formatPriceWithSign(totalProfitILS)} ₪</td>}
                        <td className={profitPercentage >= 0 ? 'profit-positive' : 'profit-negative'}>{profitPercentage}%</td>
                        <td className={(stocks[0].dailyChangePercent || 0) >= 0 ? 'profit-positive' : 'profit-negative'}>{stocks[0].dailyChangePercent ? stocks[0].dailyChangePercent.toFixed(2) : '0.00'}%</td>
                        <td className={(stocks[0].dailyChangePercent || 0) >= 0 ? 'profit-positive' : 'profit-negative'}>{formatPriceWithSign(((stocks[0].dailyChangePercent || 0) / 100) * totalCurrentValueUSD)} $</td>
                        {showAmericanColumns && <td className={totalExchangeRateImpact >= 0 ? 'profit-positive' : 'profit-negative'}>{formatPriceWithSign(totalExchangeRateImpact)} ₪</td>}
                        {showAmericanColumns && <td className="profit-negative">{formatPriceWithSign(-totalTaxILS)} ₪</td>}
                        {showAmericanColumns && <td className={totalAfterTaxILS >= 0 ? 'profit-positive' : 'profit-negative'}>{formatPriceWithSign(totalAfterTaxILS)} ₪</td>}
                        {isEditMode && <td></td>}
                      </tr>

                      {isExpanded && stocks.map((stock) => {
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
                          <tr key={stock.id} className={`${isEditMode ? 'editable-row' : ''} detail-row`} style={{ backgroundColor: '#f8f9fa' }}>
                            <td onClick={() => handleCellClick(stock.id, 'stockName', 'american')} className={isEditMode ? 'editable-cell' : ''} style={{ paddingLeft: '20px' }}>
                              {editingField === `${stock.id}-stockName` ? (
                                <input
                                  type="text"
                                  value={stock.stockName}
                                  onChange={(e) => handleInlineEdit(stock.id, 'stockName', e.target.value, 'american')}
                                  onBlur={finishInlineEdit}
                                  onKeyDown={(e) => handleKeyDown(e, stock.id, 'stockName', 'american')}
                                  autoFocus
                                />
                              ) : stock.stockName}
                            </td>
                            {showAmericanColumns && (
                              <td onClick={() => handleCellClick(stock.id, 'purchaseDate', 'american')} className={isEditMode ? 'editable-cell' : ''}>
                                {editingField === `${stock.id}-purchaseDate` ? (
                                  <input
                                    type="date"
                                    value={stock.purchaseDate}
                                    onChange={(e) => handleInlineEdit(stock.id, 'purchaseDate', e.target.value, 'american')}
                                    onBlur={finishInlineEdit}
                                    onKeyDown={(e) => handleKeyDown(e, stock.id, 'purchaseDate', 'american')}
                                    autoFocus
                                  />
                                ) : formatDate(stock.purchaseDate)}
                              </td>
                            )}
                            {showAmericanColumns && (
                              <td onClick={() => handleCellClick(stock.id, 'purchasePrice', 'american')} className={isEditMode ? 'editable-cell' : ''}>
                                {editingField === `${stock.id}-purchasePrice` ? (
                                  <input
                                    type="number"
                                    value={stock.purchasePrice}
                                    onChange={(e) => handleInlineEdit(stock.id, 'purchasePrice', parseFloat(e.target.value), 'american')}
                                    onBlur={finishInlineEdit}
                                    onKeyDown={(e) => handleKeyDown(e, stock.id, 'purchasePrice', 'american')}
                                    autoFocus
                                    step="0.01"
                                  />
                                ) : formatPriceWithSign(stock.purchasePrice) + ' $'}
                              </td>
                            )}
                            {showAmericanColumns && (
                              <td onClick={() => handleCellClick(stock.id, 'quantity', 'american')} className={isEditMode ? 'editable-cell' : ''}>
                                {editingField === `${stock.id}-quantity` ? (
                                  <input
                                    type="number"
                                    value={stock.quantity}
                                    onChange={(e) => handleInlineEdit(stock.id, 'quantity', parseInt(e.target.value), 'american')}
                                    onBlur={finishInlineEdit}
                                    onKeyDown={(e) => handleKeyDown(e, stock.id, 'quantity', 'american')}
                                    autoFocus
                                    min="1"
                                  />
                                ) : stock.quantity}
                              </td>
                            )}
                            <td>{formatPriceWithSign(totalPurchaseUSD)} $</td>
                            {showAmericanColumns && <td>{formatPriceWithSign(totalPurchaseILS)} ₪</td>}
                            {showAmericanColumns && (
                              <td onClick={() => handleCellClick(stock.id, 'exchangeRate', 'american')} className={isEditMode ? 'editable-cell' : ''}>
                                {editingField === `${stock.id}-exchangeRate` ? (
                                  <input
                                    type="number"
                                    value={stock.exchangeRate}
                                    onChange={(e) => handleInlineEdit(stock.id, 'exchangeRate', parseFloat(e.target.value), 'american')}
                                    onBlur={finishInlineEdit}
                                    onKeyDown={(e) => handleKeyDown(e, stock.id, 'exchangeRate', 'american')}
                                    autoFocus
                                    step="0.0001"
                                  />
                                ) : formatPrice(stock.exchangeRate)}
                              </td>
                            )}
                            {showAmericanColumns && <td>{formatPrice(currentExchangeRate)}</td>}
                            <td>{formatPriceWithSign(stock.currentPrice)} $</td>
                            <td>{formatPriceWithSign(totalCurrentValueUSD)} $</td>
                            {showAmericanColumns && <td>{formatPriceWithSign(totalCurrentValueILS)} ₪</td>}
                            <td className={profitUSD >= 0 ? 'profit-positive' : 'profit-negative'}>{formatPriceWithSign(profitUSD)} $</td>
                            {showAmericanColumns && <td className={profitILS >= 0 ? 'profit-positive' : 'profit-negative'}>{formatPriceWithSign(profitILS)} ₪</td>}
                            <td className={profitPercentage >= 0 ? 'profit-positive' : 'profit-negative'}>{profitPercentage}%</td>
                            <td className={(stock.dailyChangePercent || 0) >= 0 ? 'profit-positive' : 'profit-negative'}>{stock.dailyChangePercent ? stock.dailyChangePercent.toFixed(2) : '0.00'}%</td>
                            <td className={(stock.dailyChangePercent || 0) >= 0 ? 'profit-positive' : 'profit-negative'}>{formatPriceWithSign(((stock.dailyChangePercent || 0) / 100) * totalCurrentValueUSD)} $</td>
                            {showAmericanColumns && <td className={exchangeRateImpact >= 0 ? 'profit-positive' : 'profit-negative'}>{formatPriceWithSign(exchangeRateImpact)} ₪</td>}
                            {showAmericanColumns && <td className="profit-negative">{formatPriceWithSign(-taxILS)} ₪</td>}
                            {showAmericanColumns && <td className={afterTaxILS >= 0 ? 'profit-positive' : 'profit-negative'}>{formatPriceWithSign(afterTaxILS)} ₪</td>}
                            {isEditMode && (
                              <td>
                                <button onClick={() => handleDelete(stock.id, 'american')} className="delete-button">מחק</button>
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

export default AmericanStocksTable;
