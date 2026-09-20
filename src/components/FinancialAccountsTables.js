import React, { useState } from 'react';
import { calculatePensionRealGainTax, calculateBankSavingsFundTax, monthKeyFromDate } from '../utils/cpiTax';
import { calculateLedgerPeriodReturn, hasAmbiguousLedgerPeriod } from '../utils/portfolioMath';
import { computeBankSavingsFundValue } from '../utils/bankSavingsFund';

// The four ledger-backed account tables: provident funds, money-market
// funds, current accounts and bank savings.
//
// `sections` picks which of them to render, because each now belongs to a
// different page - /provident-funds wants only the provident table,
// /cash-and-checking wants the money-market and current-account pair, and
// so on. It defaults to all four, so a caller that wants the whole set
// (and the original behaviour) passes nothing.
export const ACCOUNT_SECTIONS = ['pension', 'cash', 'bank', 'bank_savings'];

function FinancialAccountsTables({
  pensionFunds,
  cashFunds,
  bankBalances,
  bankSavingsFunds = [],
  sections = ACCOUNT_SECTIONS,
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

  const [expandedCashFunds, setExpandedCashFunds] = useState({});
  const toggleCashFundExpanded = (fundId) => {
    setExpandedCashFunds((prev) => ({ ...prev, [fundId]: !prev[fundId] }));
  };

  const [expandedBankAccounts, setExpandedBankAccounts] = useState({});
  const toggleBankAccountExpanded = (accountId) => {
    setExpandedBankAccounts((prev) => ({ ...prev, [accountId]: !prev[accountId] }));
  };

  // עריכת "שווי נוכחי" מבקשת גם את התאריך באותה פעולה (במקום שני שדות
  // נפרדים לערוך בזה אחר זה) - ראו applyLedgerValueEditPayload ב-
  // portfolioMath.js להסבר המלא על הבאג שזה מונע. משותף לשלוש הטבלאות
  // מבוססות-ledger (קופות גמל, כספית שקלית, עו"ש) - לא רק לפנסיה.
  const [valueDraft, setValueDraft] = useState({ value: '', date: '' });
  const startValueEdit = (item, exchange) => {
    const todayStr = new Date().toISOString().slice(0, 10);
    setValueDraft({
      value: item.currentValue ?? item.amount ?? '',
      date: item.currentValueDate || todayStr
    });
    handleCellClick(item.id, 'currentValue', exchange);
  };
  const commitValueEdit = (item, exchange) => {
    const numValue = parseFloat(valueDraft.value);
    if (!Number.isNaN(numValue) && valueDraft.date) {
      handleInlineEdit(item.id, 'currentValue', { value: numValue, date: valueDraft.date }, exchange);
    }
    finishInlineEdit();
  };
  const deleteDeposit = (fund, depositIndex, exchange) => {
    const deposits = Array.isArray(fund.deposits) ? fund.deposits : [];
    const updatedDeposits = deposits.filter((_, i) => i !== depositIndex);
    handleInlineEdit(fund.id, 'deposits', updatedDeposits, exchange);
  };

  const [expandedBankSavingsFunds, setExpandedBankSavingsFunds] = useState({});
  const toggleBankSavingsFundExpanded = (fundId) => {
    setExpandedBankSavingsFunds((prev) => ({ ...prev, [fundId]: !prev[fundId] }));
  };
  const deleteBankSavingsDeposit = (fund, depositIndex) => {
    const deposits = Array.isArray(fund.deposits) ? fund.deposits : [];
    const updatedDeposits = deposits.filter((_, i) => i !== depositIndex);
    handleInlineEdit(fund.id, 'deposits', updatedDeposits, 'bank_savings');
  };

  const shows = (name) => sections.includes(name);

  return (
    <>
      {shows('pension') && pensionFunds.length > 0 && (
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
                  {showAdditionalData && <th>מדד היום (הידוע)</th>}
                  {showAdditionalData && <th>מדד ביום ההפקדה</th>}
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
                  const periodReturn = calculateLedgerPeriodReturn(item);
                  const previousProfitPercent = previousValue > 0 ? periodReturn.percent : null;
                  const totalProfitLoss = currentValue - initialInvestment;
                  // Uses periodReturn.adjustedPreviousValue (previousValue +
                  // deposits that fell strictly within this period) - NOT
                  // the raw previousValue. This used to be a plain
                  // currentValue - previousValue, which silently counted
                  // any deposit made between the previous and current
                  // update as if it were investment profit (a real ₪35,000
                  // deposit would inflate this column by ₪35,000). Now it
                  // matches exactly what the % column next to it already
                  // does, so the two stay consistent.
                  const updateProfitLoss = previousValue > 0 ? currentValue - periodReturn.adjustedPreviousValue : null;
                  // See hasAmbiguousLedgerPeriod's own comment for the
                  // full story - flags a same-day previous/current period,
                  // which silently drops any deposit made before that
                  // shared date from the return calculation above.
                  const ambiguousPeriod = hasAmbiguousLedgerPeriod(item);

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
                      <td
                        onClick={() => { if (editingField !== `${item.id}-currentValue`) startValueEdit(item, 'pension'); }}
                        className={isEditMode ? 'editable-cell' : ''}
                      >
                        {editingField === `${item.id}-currentValue` ? (
                          <div
                            className="pension-value-edit-group"
                            onBlur={(e) => {
                              if (!e.currentTarget.contains(e.relatedTarget)) {
                                commitValueEdit(item, 'pension');
                              }
                            }}
                          >
                            <input
                              type="number"
                              value={valueDraft.value}
                              onChange={(e) => setValueDraft((d) => ({ ...d, value: e.target.value }))}
                              onKeyDown={(e) => { if (e.key === 'Enter') commitValueEdit(item, 'pension'); }}
                              autoFocus
                              step="0.01"
                              min="0"
                            />
                            <input
                              type="date"
                              value={valueDraft.date}
                              onChange={(e) => setValueDraft((d) => ({ ...d, date: e.target.value }))}
                              onKeyDown={(e) => { if (e.key === 'Enter') commitValueEdit(item, 'pension'); }}
                            />
                          </div>
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
                      {/* previousValue/previousValueDate הן תצוגה בלבד בכוונה - עריכה ישירה
                          שלהן תעקוף את applyPensionValueUpdate שדואג לשמר היסטוריה נכונה
                          כשמעדכנים "שווי נוכחי" (ראו portfolioMath.js). זה בעצמו הבאג שהיה
                          כאן בעבר - השדות האלה משתנים רק כתוצאה מעדכון "שווי נוכחי" חדש. */}
                      <td>{`${formatPriceWithSign(previousValue)} ₪`}</td>
                      {showAdditionalData && (
                        <td>{item.previousValueDate ? formatDate(item.previousValueDate) : '-'}</td>
                      )}
                      {showAdditionalData && (
                        <td>{cpi && cpi.currentIndex != null ? cpi.currentIndex : '-'}</td>
                      )}
                      {/* מדד ביום ההפקדה הוא ערך פר-הפקדה (לכל הפקדה החודש שלה) - לא
                          מוצג כאן בשורת הסיכום כי לקופה יכולות להיות הפקדות ממספר
                          חודשים שונים; ראו את הערך האמיתי בשורות ההפקדה המורחבות למטה. */}
                      {showAdditionalData && <td>-</td>}
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
                        {ambiguousPeriod && (
                          <span
                            className="ambiguous-period-warning"
                            title='תאריך "שווי קודם" זהה לתאריך "שווי נוכחי" - כל הפקדה שקדמה לתאריך הזה, גם אם קדמה זמן רב, לא נלקחת בחשבון בחישוב הזה. ודאו שהתאריכים משקפים נכון מתי כל שווי היה נכון.'
                          >
                            ⚠️{' '}
                          </span>
                        )}
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
                      <tr className={`${isEditMode ? 'editable-row' : ''} detail-row`}>
                        <td style={{ paddingLeft: '20px' }} colSpan={(showAdditionalData ? 15 : 9) + (isEditMode ? 1 : 0)}>אין הפקדות רשומות</td>
                      </tr>
                    )}
                    {isExpanded && deposits.map((d, i) => (
                      <tr key={i} className={`${isEditMode ? 'editable-row' : ''} detail-row`}>
                        <td style={{ paddingLeft: '20px' }}>{d.date ? formatDate(d.date) : '-'}</td>
                        <td>{`${formatPriceWithSign(d.amount)} ₪`}</td>
                        <td></td>
                        <td></td>
                        <td></td>
                        {showAdditionalData && <td></td>}
                        {showAdditionalData && <td></td>}
                        {showAdditionalData && (
                          <td>{cpi && cpi.indexByMonth ? cpi.indexByMonth[monthKeyFromDate(d.date)] ?? '-' : '-'}</td>
                        )}
                        {showAdditionalData && <td></td>}
                        {showAdditionalData && <td></td>}
                        {showAdditionalData && <td></td>}
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        {isEditMode && (
                          <td>
                            <button onClick={() => deleteDeposit(item, i, 'pension')} className="delete-button">מחק הפקדה</button>
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

      {shows('cash') && cashFunds.length > 0 && (
        <div className="stocks-section">
          <h2 className="section-title">כספית שקלית</h2>
          <div className="table-container">
            <table className="stocks-table">
              <thead>
                <tr>
                  <th>שם</th>
                  <th>מספר נייר ערך</th>
                  <th>שווי נוכחי (₪)</th>
                  <th>תאריך שווי נוכחי</th>
                  <th>שווי בעדכון הקודם (₪)</th>
                  {showAdditionalData && <th>תאריך שווי קודם</th>}
                  <th>תשואה (מעדכון קודם)</th>
                  {isEditMode && <th>פעולות</th>}
                </tr>
              </thead>
              <tbody>
                {cashFunds.map(item => {
                  const deposits = Array.isArray(item.deposits) ? item.deposits : [];
                  const currentValue = item.currentValue ?? item.amount ?? 0;
                  const previousValue = item.previousValue ?? 0;
                  const periodReturn = calculateLedgerPeriodReturn(item);
                  const periodReturnPercent = previousValue > 0 ? periodReturn.percent : null;
                  const ambiguousPeriod = hasAmbiguousLedgerPeriod(item);
                  const isExpanded = !!expandedCashFunds[item.id];
                  return (
                    <React.Fragment key={item.id}>
                      <tr className={isEditMode ? 'editable-row' : ''}>
                        <td onClick={() => handleCellClick(item.id, 'fundName', 'cash_fund')} className={isEditMode ? 'editable-cell' : ''}>
                          <button onClick={() => toggleCashFundExpanded(item.id)} className="expand-button" style={{ marginRight: '8px', background: 'none', border: 'none', cursor: 'pointer' }}>
                            {isExpanded ? '▼' : '▶'}
                          </button>
                          {editingField === `${item.id}-fundName` ? (
                            <input
                              type="text"
                              value={item.fundName}
                              onChange={(e) => handleInlineEdit(item.id, 'fundName', e.target.value, 'cash_fund')}
                              onBlur={finishInlineEdit}
                              onKeyDown={(e) => handleKeyDown(e, item.id, 'fundName', 'cash_fund')}
                              autoFocus
                            />
                          ) : (item.fundName || '-')}
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
                        <td
                          onClick={() => { if (editingField !== `${item.id}-currentValue`) startValueEdit(item, 'cash_fund'); }}
                          className={isEditMode ? 'editable-cell' : ''}
                        >
                          {editingField === `${item.id}-currentValue` ? (
                            <div
                              className="pension-value-edit-group"
                              onBlur={(e) => {
                                if (!e.currentTarget.contains(e.relatedTarget)) {
                                  commitValueEdit(item, 'cash_fund');
                                }
                              }}
                            >
                              <input
                                type="number"
                                value={valueDraft.value}
                                onChange={(e) => setValueDraft((d) => ({ ...d, value: e.target.value }))}
                                onKeyDown={(e) => { if (e.key === 'Enter') commitValueEdit(item, 'cash_fund'); }}
                                autoFocus
                                step="0.01"
                                min="0"
                              />
                              <input
                                type="date"
                                value={valueDraft.date}
                                onChange={(e) => setValueDraft((d) => ({ ...d, date: e.target.value }))}
                                onKeyDown={(e) => { if (e.key === 'Enter') commitValueEdit(item, 'cash_fund'); }}
                              />
                            </div>
                          ) : `${formatPriceWithSign(currentValue)} ₪`}
                        </td>
                        <td>{item.currentValueDate ? formatDate(item.currentValueDate) : '-'}</td>
                        {/* previousValue/previousValueDate הן תצוגה בלבד בכוונה - ראו
                            הערת השדות המקבילים בטבלת קופות הגמל למעלה. */}
                        <td>{`${formatPriceWithSign(previousValue)} ₪`}</td>
                        {showAdditionalData && (
                          <td>{item.previousValueDate ? formatDate(item.previousValueDate) : '-'}</td>
                        )}
                        <td className={periodReturnPercent > 0 ? 'profit-positive' : periodReturnPercent < 0 ? 'profit-negative' : ''}>
                          {ambiguousPeriod && (
                            <span
                              className="ambiguous-period-warning"
                              title='תאריך "שווי קודם" זהה לתאריך "שווי נוכחי" - כל הפקדה/משיכה שקדמה לתאריך הזה, גם אם קדמה זמן רב, לא נלקחת בחשבון בחישוב הזה.'
                            >
                              ⚠️{' '}
                            </span>
                          )}
                          {formatPercent(periodReturnPercent)}
                        </td>
                        {isEditMode && (
                          <td>
                            <button onClick={() => handleDelete(item.id, 'cash_fund')} className="delete-button">מחק כספית</button>
                          </td>
                        )}
                      </tr>
                      {isExpanded && deposits.length === 0 && (
                        <tr className={`${isEditMode ? 'editable-row' : ''} detail-row`}>
                          <td style={{ paddingLeft: '20px' }} colSpan={(showAdditionalData ? 8 : 7) + (isEditMode ? 1 : 0)}>אין הפקדות/משיכות רשומות</td>
                        </tr>
                      )}
                      {isExpanded && deposits.map((d, i) => (
                        <tr key={i} className={`${isEditMode ? 'editable-row' : ''} detail-row`}>
                          <td style={{ paddingLeft: '20px' }}>{d.date ? formatDate(d.date) : '-'}</td>
                          <td>{`${formatPriceWithSign(d.amount)} ₪ ${d.amount < 0 ? '(משיכה)' : ''}`}</td>
                          <td></td>
                          <td></td>
                          <td></td>
                          {showAdditionalData && <td></td>}
                          <td></td>
                          {isEditMode && (
                            <td>
                              <button onClick={() => deleteDeposit(item, i, 'cash_fund')} className="delete-button">מחק</button>
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

      {shows('bank') && bankBalances.length > 0 && (
        <div className="stocks-section">
          <h2 className="section-title">עו"ש</h2>
          <div className="table-container">
            <table className="stocks-table">
              <thead>
                <tr>
                  <th>שווי נוכחי (₪)</th>
                  <th>תאריך שווי נוכחי</th>
                  <th>שווי בעדכון הקודם (₪)</th>
                  {showAdditionalData && <th>תאריך שווי קודם</th>}
                  <th>תשואה (מעדכון קודם)</th>
                  {isEditMode && <th>פעולות</th>}
                </tr>
              </thead>
              <tbody>
                {bankBalances.map(item => {
                  const deposits = Array.isArray(item.deposits) ? item.deposits : [];
                  const currentValue = item.currentValue ?? item.amount ?? 0;
                  const previousValue = item.previousValue ?? 0;
                  const periodReturn = calculateLedgerPeriodReturn(item);
                  const periodReturnPercent = previousValue > 0 ? periodReturn.percent : null;
                  const ambiguousPeriod = hasAmbiguousLedgerPeriod(item);
                  const isExpanded = !!expandedBankAccounts[item.id];
                  return (
                    <React.Fragment key={item.id}>
                      <tr className={isEditMode ? 'editable-row' : ''}>
                        <td
                          onClick={() => { if (editingField !== `${item.id}-currentValue`) startValueEdit(item, 'bank'); }}
                          className={isEditMode ? 'editable-cell' : ''}
                        >
                          <button onClick={() => toggleBankAccountExpanded(item.id)} className="expand-button" style={{ marginRight: '8px', background: 'none', border: 'none', cursor: 'pointer' }}>
                            {isExpanded ? '▼' : '▶'}
                          </button>
                          {editingField === `${item.id}-currentValue` ? (
                            <div
                              className="pension-value-edit-group"
                              onBlur={(e) => {
                                if (!e.currentTarget.contains(e.relatedTarget)) {
                                  commitValueEdit(item, 'bank');
                                }
                              }}
                            >
                              <input
                                type="number"
                                value={valueDraft.value}
                                onChange={(e) => setValueDraft((d) => ({ ...d, value: e.target.value }))}
                                onKeyDown={(e) => { if (e.key === 'Enter') commitValueEdit(item, 'bank'); }}
                                autoFocus
                                step="0.01"
                                min="0"
                              />
                              <input
                                type="date"
                                value={valueDraft.date}
                                onChange={(e) => setValueDraft((d) => ({ ...d, date: e.target.value }))}
                                onKeyDown={(e) => { if (e.key === 'Enter') commitValueEdit(item, 'bank'); }}
                              />
                            </div>
                          ) : `${formatPriceWithSign(currentValue)} ₪`}
                        </td>
                        <td>{item.currentValueDate ? formatDate(item.currentValueDate) : '-'}</td>
                        <td>{`${formatPriceWithSign(previousValue)} ₪`}</td>
                        {showAdditionalData && (
                          <td>{item.previousValueDate ? formatDate(item.previousValueDate) : '-'}</td>
                        )}
                        <td className={periodReturnPercent > 0 ? 'profit-positive' : periodReturnPercent < 0 ? 'profit-negative' : ''}>
                          {ambiguousPeriod && (
                            <span
                              className="ambiguous-period-warning"
                              title='תאריך "שווי קודם" זהה לתאריך "שווי נוכחי" - כל הפקדה/משיכה שקדמה לתאריך הזה, גם אם קדמה זמן רב, לא נלקחת בחשבון בחישוב הזה.'
                            >
                              ⚠️{' '}
                            </span>
                          )}
                          {formatPercent(periodReturnPercent)}
                        </td>
                        {isEditMode && (
                          <td>
                            <button onClick={() => handleDelete(item.id, 'bank')} className="delete-button">מחק חשבון</button>
                          </td>
                        )}
                      </tr>
                      {isExpanded && deposits.length === 0 && (
                        <tr className={`${isEditMode ? 'editable-row' : ''} detail-row`}>
                          <td style={{ paddingLeft: '20px' }} colSpan={(showAdditionalData ? 6 : 5) + (isEditMode ? 1 : 0)}>אין הפקדות/משיכות רשומות</td>
                        </tr>
                      )}
                      {isExpanded && deposits.map((d, i) => (
                        <tr key={i} className={`${isEditMode ? 'editable-row' : ''} detail-row`}>
                          <td style={{ paddingLeft: '20px' }}>{`${formatPriceWithSign(d.amount)} ₪ ${d.amount < 0 ? '(משיכה)' : ''}`}</td>
                          <td>{d.date ? formatDate(d.date) : '-'}</td>
                          <td></td>
                          {showAdditionalData && <td></td>}
                          <td></td>
                          {isEditMode && (
                            <td>
                              <button onClick={() => deleteDeposit(item, i, 'bank')} className="delete-button">מחק</button>
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

      {shows('bank_savings') && bankSavingsFunds.length > 0 && (
        <div className="stocks-section">
          <h2 className="section-title">קופות חיסכון בבנק</h2>
          <div className="table-container">
            <table className="stocks-table">
              <thead>
                <tr>
                  <th>שם</th>
                  <th>מסלול השקעה</th>
                  <th>ריבית שנתית (%)</th>
                  <th>צמוד למדד?</th>
                  <th>סך הפקדות (₪)</th>
                  <th>שווי נוכחי (₪)</th>
                  <th>רווח/הפסד (₪)</th>
                  {showAdditionalData && <th>מס (₪)</th>}
                  {showAdditionalData && <th>רווח אחרי מס (₪)</th>}
                  {isEditMode && <th>פעולות</th>}
                </tr>
              </thead>
              <tbody>
                {bankSavingsFunds.map((item) => {
                  const deposits = Array.isArray(item.deposits) ? item.deposits : [];
                  const totalDeposited = deposits.reduce((s, d) => s + (d.amount || 0), 0);
                  const currentValue = computeBankSavingsFundValue(item);
                  const profitLoss = currentValue - totalDeposited;

                  let tax = null;
                  let afterTaxProfit = null;
                  const taxResult = calculateBankSavingsFundTax({
                    deposits,
                    currentValue,
                    isLinkedToIndex: !!item.isLinkedToIndex,
                    currentIndex: cpi && cpi.currentIndex,
                    indexByMonth: (cpi && cpi.indexByMonth) || {}
                  });
                  tax = taxResult.tax;
                  afterTaxProfit = profitLoss - tax;

                  const isExpanded = !!expandedBankSavingsFunds[item.id];
                  return (
                    <React.Fragment key={item.id}>
                    <tr className={isEditMode ? 'editable-row' : ''}>
                      <td onClick={() => handleCellClick(item.id, 'fundName', 'bank_savings')} className={isEditMode ? 'editable-cell' : ''}>
                        <button onClick={() => toggleBankSavingsFundExpanded(item.id)} className="expand-button" style={{ marginRight: '8px', background: 'none', border: 'none', cursor: 'pointer' }}>
                          {isExpanded ? '▼' : '▶'}
                        </button>
                        {editingField === `${item.id}-fundName` ? (
                          <input
                            type="text"
                            value={item.fundName}
                            onChange={(e) => handleInlineEdit(item.id, 'fundName', e.target.value, 'bank_savings')}
                            onBlur={finishInlineEdit}
                            onKeyDown={(e) => handleKeyDown(e, item.id, 'fundName', 'bank_savings')}
                            autoFocus
                          />
                        ) : item.fundName}
                      </td>
                      <td onClick={() => handleCellClick(item.id, 'investmentTrack', 'bank_savings')} className={isEditMode ? 'editable-cell' : ''}>
                        {editingField === `${item.id}-investmentTrack` ? (
                          <input
                            type="text"
                            value={item.investmentTrack || ''}
                            onChange={(e) => handleInlineEdit(item.id, 'investmentTrack', e.target.value, 'bank_savings')}
                            onBlur={finishInlineEdit}
                            onKeyDown={(e) => handleKeyDown(e, item.id, 'investmentTrack', 'bank_savings')}
                            autoFocus
                          />
                        ) : (item.investmentTrack || '-')}
                      </td>
                      <td onClick={() => handleCellClick(item.id, 'interestRate', 'bank_savings')} className={isEditMode ? 'editable-cell' : ''}>
                        {editingField === `${item.id}-interestRate` ? (
                          <input
                            type="number"
                            value={item.interestRate ?? ''}
                            onChange={(e) => handleInlineEdit(item.id, 'interestRate', parseFloat(e.target.value), 'bank_savings')}
                            onBlur={finishInlineEdit}
                            onKeyDown={(e) => handleKeyDown(e, item.id, 'interestRate', 'bank_savings')}
                            autoFocus
                            step="0.01"
                            min="0"
                          />
                        ) : `${item.interestRate ?? 0}%`}
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          checked={!!item.isLinkedToIndex}
                          disabled={!isEditMode}
                          onChange={(e) => handleInlineEdit(item.id, 'isLinkedToIndex', e.target.checked, 'bank_savings')}
                        />
                      </td>
                      <td>{`${formatPriceWithSign(totalDeposited)} ₪`}</td>
                      <td>{`${formatPriceWithSign(currentValue)} ₪`}</td>
                      <td className={profitLoss > 0 ? 'profit-positive' : profitLoss < 0 ? 'profit-negative' : ''}>
                        {`${formatPriceWithSign(profitLoss)} ₪`}
                      </td>
                      {showAdditionalData && (
                        <td>{tax !== null ? `${formatPriceWithSign(tax)} ₪` : '-'}</td>
                      )}
                      {showAdditionalData && (
                        <td className={afterTaxProfit !== null && afterTaxProfit > 0 ? 'profit-positive' : afterTaxProfit !== null && afterTaxProfit < 0 ? 'profit-negative' : ''}>
                          {afterTaxProfit !== null ? `${formatPriceWithSign(afterTaxProfit)} ₪` : '-'}
                        </td>
                      )}
                      {isEditMode && (
                        <td>
                          <button onClick={() => handleDelete(item.id, 'bank_savings')} className="delete-button">מחק קופה</button>
                        </td>
                      )}
                    </tr>
                    {isExpanded && deposits.length === 0 && (
                      <tr className={`${isEditMode ? 'editable-row' : ''} detail-row`}>
                        <td style={{ paddingLeft: '20px' }} colSpan={(showAdditionalData ? 9 : 7) + (isEditMode ? 1 : 0)}>אין הפקדות רשומות</td>
                      </tr>
                    )}
                    {isExpanded && deposits.map((d, i) => (
                      <tr key={i} className={`${isEditMode ? 'editable-row' : ''} detail-row`}>
                        <td style={{ paddingLeft: '20px' }}>{d.date ? formatDate(d.date) : '-'}</td>
                        <td>{`${formatPriceWithSign(d.amount)} ₪`}</td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        {showAdditionalData && <td></td>}
                        {showAdditionalData && <td></td>}
                        {isEditMode && (
                          <td>
                            <button onClick={() => deleteBankSavingsDeposit(item, i)} className="delete-button">מחק הפקדה</button>
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
    </>
  );
}

export default FinancialAccountsTables;
