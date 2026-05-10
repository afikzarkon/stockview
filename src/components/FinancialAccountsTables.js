import React from 'react';

function FinancialAccountsTables({
  pensionFunds,
  cashFunds,
  bankBalances,
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
                  <th>תאריך עדכון</th>
                  <th>סך השקעה ראשונית (₪)</th>
                  <th>סך ערך השקעה כיום (₪)</th>
                  <th>סך ערך ההשקעה בעדכון הקודם (₪)</th>
                  <th>אחוז רווח בהשקעה</th>
                  <th>אחוז רווח מבדיקה קודמת</th>
                  <th>סך רווח/הפסד (₪)</th>
                  <th>רווח/הפסד מהשקעה קודמת להיום (₪)</th>
                  {isEditMode && <th>פעולות</th>}
                </tr>
              </thead>
              <tbody>
                {pensionFunds.map(item => {
                  const initialInvestment = item.initialInvestment ?? item.amount ?? 0;
                  const currentValue = item.currentValue ?? item.amount ?? 0;
                  const previousValue = item.previousValue ?? 0;
                  const profitPercent = initialInvestment > 0 ? ((currentValue / initialInvestment) - 1) * 100 : null;
                  const previousProfitPercent = previousValue > 0 ? ((currentValue / previousValue) - 1) * 100 : null;
                  const totalProfitLoss = currentValue - initialInvestment;
                  const updateProfitLoss = previousValue > 0 ? currentValue - previousValue : null;
                  return (
                    <tr key={item.id} className={isEditMode ? 'editable-row' : ''}>
                      <td onClick={() => handleCellClick(item.id, 'fundName', 'pension')} className={isEditMode ? 'editable-cell' : ''}>
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
                      <td onClick={() => handleCellClick(item.id, 'updateDate', 'pension')} className={isEditMode ? 'editable-cell' : ''}>
                        {editingField === `${item.id}-updateDate` ? (
                          <input
                            type="date"
                            value={item.updateDate}
                            onChange={(e) => handleInlineEdit(item.id, 'updateDate', e.target.value, 'pension')}
                            onBlur={finishInlineEdit}
                            onKeyDown={(e) => handleKeyDown(e, item.id, 'updateDate', 'pension')}
                            autoFocus
                          />
                        ) : formatDate(item.updateDate)}
                      </td>
                      <td onClick={() => handleCellClick(item.id, 'initialInvestment', 'pension')} className={isEditMode ? 'editable-cell' : ''}>
                        {editingField === `${item.id}-initialInvestment` ? (
                          <input
                            type="number"
                            value={item.initialInvestment ?? item.amount ?? ''}
                            onChange={(e) => handleInlineEdit(item.id, 'initialInvestment', parseFloat(e.target.value), 'pension')}
                            onBlur={finishInlineEdit}
                            onKeyDown={(e) => handleKeyDown(e, item.id, 'initialInvestment', 'pension')}
                            autoFocus
                            step="0.01"
                            min="0"
                          />
                        ) : `${formatPriceWithSign(initialInvestment)} ₪`}
                      </td>
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
                      <td className={profitPercent > 0 ? 'profit-positive' : profitPercent < 0 ? 'profit-negative' : ''}>
                        {formatPercent(profitPercent)}
                      </td>
                      <td className={previousProfitPercent > 0 ? 'profit-positive' : previousProfitPercent < 0 ? 'profit-negative' : ''}>
                        {formatPercent(previousProfitPercent)}
                      </td>
                      <td className={totalProfitLoss > 0 ? 'profit-positive' : totalProfitLoss < 0 ? 'profit-negative' : ''}>
                        {`${formatPriceWithSign(totalProfitLoss)} ₪`}
                      </td>
                      <td className={updateProfitLoss > 0 ? 'profit-positive' : updateProfitLoss < 0 ? 'profit-negative' : ''}>
                        {updateProfitLoss !== null ? `${formatPriceWithSign(updateProfitLoss)} ₪` : '-'}
                      </td>
                      {isEditMode && (
                        <td>
                          <button onClick={() => handleDelete(item.id, 'pension')} className="delete-button">מחק</button>
                        </td>
                      )}
                    </tr>
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
