import React, { useState } from 'react';
import { calculatePensionRealGainTax } from '../utils/cpiTax';
import { calculatePensionPeriodReturn } from '../utils/portfolioMath';

function FinancialAccountsTables({
  pensionFunds,
  cashFunds,
  bankBalances,
  cpi,
  showAdditionalData,
  isEditMode,
  editingField,
  handleCellClick,
  handleInlineEdit,
  finishInlineEdit,
  handleKeyDown,
  formatDate,
  formatPriceWithSign,
  handleDelete
}) {
  const formatPercent = (value) => {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return '-';
    }
    return `${Number(value).toFixed(2)}%`;
  };

  const [expandedFunds, setExpandedFunds] = useState({});
  const toggleFundExpanded = (fundId) => {
    setExpandedFunds((prev) => ({ ...prev, [fundId]: !prev[fundId] }));
  };
  const deleteDeposit = (fund, depositIndex) => {
    const deposits = Array.isArray(fund.deposits) ? fund.deposits : [];
    const updatedDeposits = deposits.filter((_, i) => i !== depositIndex);
    handleInlineEdit(fund.id, 'deposits', updatedDeposits, 'pension');
  };

  return (
    <>
      {pensionFunds.length > 0 && (
        <div className="stocks-section">
          <h2 className="section-title">קופות גמל</h2>
          <div className="table-container">
            <table className="stocks-table">
              <thead>
                <tr>
                  <th>שם קופה</th>
                  <th>סך השקעה ראשונית (₪)</th>
                  <th>סך ערך השקעה כיום (₪)</th>
                  <th>תאריך שווי נוכחי</th>
                  <th>סך ערך ההשקעה בעדכון הקודם (₪)</th>
                  {showAdditionalData && <th>תאריך שווי קודם</th>}
                  {showAdditionalData && <th>מוצמד למדד?</th>}
                  {showAdditionalData && <th>רווח ריאלי (חייב במס)</th>}
                  {showAdditionalData && <th>רווח אינפלציוני (פטור)</th>}
                  {showAdditionalData && <th>רווח לאחר מס (₪)</th>}
                  <th>תשואה (מעדכון קודם)</th>
                  <th>רווח מצטבר מול הפקדות</th>
                  <th>סך רווח/הפסד (₪)</th>
                  <th>רווח/הפסד מהשקעה קודמת להיום (₪)</th>
                  {isEditMode && <th>פעולות</th>}
                </tr>
              </thead>
              <tbody>
                {pensionFunds.map(item => {
                  const deposits = Array.isArray(item.deposits) ? item.deposits : [];
                  // סך ההשקעה הראשונית נגזרת תמיד מפנקס ההפקדות - בדיוק
                  // כמו "סה\"כ רכישה" במניות, לא שדה שמתעדכן ידנית בנפרד.
                  const initialInvestment = deposits.reduce((s, d) => s + (d.amount || 0), 0);
                  const currentValue = item.currentValue ?? item.amount ?? 0;
                  const previousValue = item.previousValue ?? 0;
                  // רווח מצטבר מול סך ההפקדות - מדד עזר בלבד, לא תשואה אמיתית
                  // (מתעלם מתזמון ההפקדות השונות, ראו הערה ב-portfolioSummary.js)
                  const profitPercent = initialInvestment > 0 ? ((currentValue / initialInvestment) - 1) * 100 : null;
                  // תשואה מעדכון-לעדכון: מזהה אוטומטית (לפי תאריכים בפנקס
                  // ההפקדות) אילו הפקדות נפלו בין העדכון הקודם לנוכחי,
                  // ומנטרל אותן - כך שהתשואה משקפת רק שינוי אמיתי בשווי.
                  const periodReturn = calculatePensionPeriodReturn(item);
                  const previousProfitPercent = previousValue > 0 ? periodReturn.percent : null;
                  const totalProfitLoss = currentValue - initialInvestment;
                  const updateProfitLoss = previousValue > 0 ? currentValue - previousValue : null;

                  // רווח ריאלי/אינפלציוני/מס לקופה הזו בלבד - לוידוא נקודתי מול
                  // הפירוק המצטבר שמוצג בסיכום התיק (PortfolioSummary.js)
                  let realGain = null;
                  let inflationaryGain = null;
                  let tax = null;
                  let afterTaxProfit = null;
                  if (cpi && cpi.currentIndex) {
                    const result = calculatePensionRealGainTax({
                      deposits,
                      currentValue,
                      isLinkedToIndex: !!item.isLinkedToIndex,
                      currentIndex: cpi.currentIndex,
                      indexByMonth: cpi.indexByMonth || {}
                    });
                    realGain = result.gain;
                    inflationaryGain = (currentValue - result.totalDeposited) - result.gain;
                    tax = result.tax;
                    afterTaxProfit = totalProfitLoss - tax;
                  }
                  const isExpanded = !!expandedFunds[item.id];
                  return (
                    <React.Fragment key={item.id}>
                    <tr className={isEditMode ? 'editable-row' : ''}>
                      <td onClick={() => handleCellClick(item.id, 'fundName', 'pension')} className={isEditMode ? 'editable-cell' : ''}>
                        <button onClick={() => toggleFundExpanded(item.id)} className="expand-button" style={{ marginRight: '8px', background: 'none', border: 'none', cursor: 'pointer' }}>
                          {isExpanded ? '▼' : '▶'}
                        </button>
                        {editingField === `${item.id}-fundName` ? (
                          <input
                            type="text"
                            value={item.fundName}
                            onChange={(e) => handleInlineEdit(item.id, 'fundName', e.target.value, 'pension')}
                            onBlur={finishInlineEdit}
                            onKeyDown={(e) => handleKeyDown(e, item.id, 'fundName', 'pension')}
                            autoFocus
                          />
                        ) : item.fundName}
                      </td>
                      <td>{`${formatPriceWithSign(initialInvestment)} ₪`}</td>
                      <td onClick={() => handleCellClick(item.id, 'currentValue', 'pension')} className={isEditMode ? 'editable-cell' : ''}>
                        {editingField === `${item.id}-currentValue` ? (
                          <input
                            type="number"
                            value={item.currentValue ?? item.amount ?? ''}
                            onChange={(e) => handleInlineEdit(item.id, 'currentValue', parseFloat(e.target.value), 'pension')}
                            onBlur={finishInlineEdit}
                            onKeyDown={(e) => handleKeyDown(e, item.id, 'currentValue', 'pension')}
                            autoFocus
                            step="0.01"
                            min="0"
                          />
                        ) : `${formatPriceWithSign(currentValue)} ₪`}
                      </td>
                      <td onClick={() => handleCellClick(item.id, 'currentValueDate', 'pension')} className={isEditMode ? 'editable-cell' : ''}>
                        {editingField === `${item.id}-currentValueDate` ? (
                          <input
                            type="date"
                            value={item.currentValueDate || ''}
                            onChange={(e) => handleInlineEdit(item.id, 'currentValueDate', e.target.value, 'pension')}
                            onBlur={finishInlineEdit}
                            onKeyDown={(e) => handleKeyDown(e, item.id, 'currentValueDate', 'pension')}
                            autoFocus
                          />
                        ) : (item.currentValueDate ? formatDate(item.currentValueDate) : '-')}
                      </td>
                      <td onClick={() => handleCellClick(item.id, 'previousValue', 'pension')} className={isEditMode ? 'editable-cell' : ''}>
                        {editingField === `${item.id}-previousValue` ? (
                          <input
                            type="number"
                            value={item.previousValue ?? ''}
                            onChange={(e) => handleInlineEdit(item.id, 'previousValue', parseFloat(e.target.value), 'pension')}
                            onBlur={finishInlineEdit}
                            onKeyDown={(e) => handleKeyDown(e, item.id, 'previousValue', 'pension')}
                            autoFocus
                            step="0.01"
                            min="0"
                          />
                        ) : `${formatPriceWithSign(previousValue)} ₪`}
                      </td>
                      {showAdditionalData && (
                      <td onClick={() => handleCellClick(item.id, 'previousValueDate', 'pension')} className={isEditMode ? 'editable-cell' : ''}>
                        {editingField === `${item.id}-previousValueDate` ? (
                          <input
                            type="date"
                            value={item.previousValueDate || ''}
                            onChange={(e) => handleInlineEdit(item.id, 'previousValueDate', e.target.value, 'pension')}
                            onBlur={finishInlineEdit}
                            onKeyDown={(e) => handleKeyDown(e, item.id, 'previousValueDate', 'pension')}
                            autoFocus
                          />
                        ) : (item.previousValueDate ? formatDate(item.previousValueDate) : '-')}
                      </td>
                      )}
                      {showAdditionalData && (
                      <td className={isEditMode ? 'editable-cell' : ''}>
                        <input
                          type="checkbox"
                          checked={!!item.isLinkedToIndex}
                          disabled={!isEditMode}
                          onChange={(e) => handleInlineEdit(item.id, 'isLinkedToIndex', e.target.checked, 'pension')}
                        />
                      </td>
                      )}
                      {showAdditionalData && (
                      <td className={realGain !== null && realGain > 0 ? 'profit-positive' : realGain !== null && realGain < 0 ? 'profit-negative' : ''}>
                        {realGain !== null ? `${formatPriceWithSign(realGain)} ₪` : '-'}
                      </td>
                      )}
                      {showAdditionalData && (
                      <td>
                        {inflationaryGain !== null ? `${formatPriceWithSign(inflationaryGain)} ₪` : '-'}
                      </td>
                      )}
                      {showAdditionalData && (
                      <td className={afterTaxProfit !== null && afterTaxProfit > 0 ? 'profit-positive' : afterTaxProfit !== null && afterTaxProfit < 0 ? 'profit-negative' : ''}>
                        {afterTaxProfit !== null ? `${formatPriceWithSign(afterTaxProfit)} ₪` : '-'}
                      </td>
                      )}
                      <td className={previousProfitPercent > 0 ? 'profit-positive' : previousProfitPercent < 0 ? 'profit-negative' : ''}>
                        {formatPercent(previousProfitPercent)}
                      </td>
                      <td className={profitPercent > 0 ? 'profit-positive' : profitPercent < 0 ? 'profit-negative' : ''}>
                        {formatPercent(profitPercent)}
                      </td>
                      <td className={totalProfitLoss > 0 ? 'profit-positive' : totalProfitLoss < 0 ? 'profit-negative' : ''}>
                        {`${formatPriceWithSign(totalProfitLoss)} ₪`}
                      </td>
                      <td className={updateProfitLoss > 0 ? 'profit-positive' : updateProfitLoss < 0 ? 'profit-negative' : ''}>
                        {updateProfitLoss !== null ? `${formatPriceWithSign(updateProfitLoss)} ₪` : '-'}
                      </td>
                      {isEditMode && (
                        <td>
                          <button onClick={() => handleDelete(item.id, 'pension')} className="delete-button">מחק קופה</button>
                        </td>
                      )}
                    </tr>
                    {isExpanded && deposits.length === 0 && (
                      <tr className={`${isEditMode ? 'editable-row' : ''} detail-row`} style={{ backgroundColor: '#f8f9fa' }}>
                        <td style={{ paddingLeft: '20px' }} colSpan={(showAdditionalData ? 14 : 9) + (isEditMode ? 1 : 0)}>אין הפקדות רשומות</td>
                      </tr>
                    )}
                    {isExpanded && deposits.map((d, i) => (
                      <tr key={i} className={`${isEditMode ? 'editable-row' : ''} detail-row`} style={{ backgroundColor: '#f8f9fa' }}>
                        <td style={{ paddingLeft: '20px' }}>{d.date ? formatDate(d.date) : '-'}</td>
                        <td>{`${formatPriceWithSign(d.amount)} ₪`}</td>
                        <td></td>
                        <td></td>
                        <td></td>
                        {showAdditionalData && <td></td>}
                        {showAdditionalData && <td></td>}
                        {showAdditionalData && <td></td>}
                        {showAdditionalData && <td></td>}
                        {showAdditionalData && <td></td>}
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        {isEditMode && (
                          <td>
                            <button onClick={() => deleteDeposit(item, i)} className="delete-button">מחק הפקדה</button>
                          </td>
                        )}
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

      {cashFunds.length > 0 && (
        <div className="stocks-section">
          <h2 className="section-title">כספית שקלית</h2>
          <div className="table-container">
            <table className="stocks-table">
              <thead>
                <tr>
                  <th>שם</th>
                  <th>מספר נייר ערך</th>
                  <th>תאריך עדכון</th>
                  <th>סכום (₪)</th>
                  {isEditMode && <th>פעולות</th>}
                </tr>
              </thead>
              <tbody>
                {cashFunds.map(item => (
                  <tr key={item.id} className={isEditMode ? 'editable-row' : ''}>
                    <td onClick={() => handleCellClick(item.id, 'fundName', 'cash_fund')} className={isEditMode ? 'editable-cell' : ''}>
                      {editingField === `${item.id}-fundName` ? (
                        <input
                          type="text"
                          value={item.fundName}
                          onChange={(e) => handleInlineEdit(item.id, 'fundName', e.target.value, 'cash_fund')}
                          onBlur={finishInlineEdit}
                          onKeyDown={(e) => handleKeyDown(e, item.id, 'fundName', 'cash_fund')}
                          autoFocus
                        />
                      ) : item.fundName}
                    </td>
                    <td onClick={() => handleCellClick(item.id, 'securityId', 'cash_fund')} className={isEditMode ? 'editable-cell' : ''}>
                      {editingField === `${item.id}-securityId` ? (
                        <input
                          type="text"
                          value={item.securityId}
                          onChange={(e) => handleInlineEdit(item.id, 'securityId', e.target.value, 'cash_fund')}
                          onBlur={finishInlineEdit}
                          onKeyDown={(e) => handleKeyDown(e, item.id, 'securityId', 'cash_fund')}
                          autoFocus
                        />
                      ) : item.securityId}
                    </td>
                    <td onClick={() => handleCellClick(item.id, 'updateDate', 'cash_fund')} className={isEditMode ? 'editable-cell' : ''}>
                      {editingField === `${item.id}-updateDate` ? (
                        <input
                          type="date"
                          value={item.updateDate}
                          onChange={(e) => handleInlineEdit(item.id, 'updateDate', e.target.value, 'cash_fund')}
                          onBlur={finishInlineEdit}
                          onKeyDown={(e) => handleKeyDown(e, item.id, 'updateDate', 'cash_fund')}
                          autoFocus
                        />
                      ) : formatDate(item.updateDate)}
                    </td>
                    <td onClick={() => handleCellClick(item.id, 'amount', 'cash_fund')} className={isEditMode ? 'editable-cell' : ''}>
                      {editingField === `${item.id}-amount` ? (
                        <input
                          type="number"
                          value={item.amount}
                          onChange={(e) => handleInlineEdit(item.id, 'amount', parseFloat(e.target.value), 'cash_fund')}
                          onBlur={finishInlineEdit}
                          onKeyDown={(e) => handleKeyDown(e, item.id, 'amount', 'cash_fund')}
                          autoFocus
                          step="0.01"
                          min="0"
                        />
                      ) : `${formatPriceWithSign(item.amount)} ₪`}
                    </td>
                    {isEditMode && (
                      <td>
                        <button onClick={() => handleDelete(item.id, 'cash_fund')} className="delete-button">מחק</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {bankBalances.length > 0 && (
        <div className="stocks-section">
          <h2 className="section-title">עו"ש</h2>
          <div className="table-container">
            <table className="stocks-table">
              <thead>
                <tr>
                  <th>תאריך עדכון</th>
                  <th>סכום (₪)</th>
                  {isEditMode && <th>פעולות</th>}
                </tr>
              </thead>
              <tbody>
                {bankBalances.map(item => (
                  <tr key={item.id} className={isEditMode ? 'editable-row' : ''}>
                    <td onClick={() => handleCellClick(item.id, 'updateDate', 'bank')} className={isEditMode ? 'editable-cell' : ''}>
                      {editingField === `${item.id}-updateDate` ? (
                        <input
                          type="date"
                          value={item.updateDate}
                          onChange={(e) => handleInlineEdit(item.id, 'updateDate', e.target.value, 'bank')}
                          onBlur={finishInlineEdit}
                          onKeyDown={(e) => handleKeyDown(e, item.id, 'updateDate', 'bank')}
                          autoFocus
                        />
                      ) : formatDate(item.updateDate)}
                    </td>
                    <td onClick={() => handleCellClick(item.id, 'amount', 'bank')} className={isEditMode ? 'editable-cell' : ''}>
                      {editingField === `${item.id}-amount` ? (
                        <input
                          type="number"
                          value={item.amount}
                          onChange={(e) => handleInlineEdit(item.id, 'amount', parseFloat(e.target.value), 'bank')}
                          onBlur={finishInlineEdit}
                          onKeyDown={(e) => handleKeyDown(e, item.id, 'amount', 'bank')}
                          autoFocus
                          step="0.01"
                          min="0"
                        />
                      ) : `${formatPriceWithSign(item.amount)} ₪`}
                    </td>
                    {isEditMode && (
                      <td>
                        <button onClick={() => handleDelete(item.id, 'bank')} className="delete-button">מחק</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

export default FinancialAccountsTables;
