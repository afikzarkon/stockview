import React, { useEffect, useState } from 'react';
import {
  REBALANCE_CATEGORIES,
  CATEGORY_LABELS_HE,
  emptyTargets,
  sumTargetPercents,
  isValidTargetAllocation,
  computeRebalancingPlan
} from '../utils/rebalancing';

function RebalancingSection({
  exchangeDistribution,
  formatPriceWithSign,
  targets,
  targetsLoading,
  saving,
  saveError,
  onSaveTargets
}) {
  const [draft, setDraft] = useState(emptyTargets());
  const [savedMessage, setSavedMessage] = useState('');

  // Initialize the editable draft once targets load from the server. Only
  // reacts to `targets` itself (not on every parent re-render), so it
  // won't clobber in-progress edits the user is mid-typing.
  useEffect(() => {
    if (targets) setDraft(targets);
  }, [targets]);

  const handleChange = (key, rawValue) => {
    setSavedMessage('');
    const num = rawValue === '' ? '' : Number(rawValue);
    setDraft((prev) => ({ ...prev, [key]: num }));
  };

  const handleSave = async () => {
    const ok = await onSaveTargets(draft);
    if (ok) {
      setSavedMessage('היעדים נשמרו');
      setTimeout(() => setSavedMessage(''), 3000);
    }
  };

  if (targetsLoading) {
    return <p className="history-empty-note">טוען יעדי הקצאה…</p>;
  }

  const sum = sumTargetPercents(draft);
  const valid = isValidTargetAllocation(draft);
  const plan = computeRebalancingPlan(exchangeDistribution, draft);

  return (
    <>
      <div className="rebalance-inputs-grid">
        {REBALANCE_CATEGORIES.map((key) => (
          <div className="rebalance-input-item" key={key}>
            <label>{CATEGORY_LABELS_HE[key]}</label>
            <div className="rebalance-input-wrap">
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={draft[key]}
                onChange={(e) => handleChange(key, e.target.value)}
              />
              <span>%</span>
            </div>
          </div>
        ))}
      </div>

      <div className="rebalance-sum-row">
        <span className={valid ? 'profit-positive' : 'profit-negative'}>סה"כ: {sum.toFixed(1)}%</span>
        {!valid && <span className="rebalance-sum-hint"> (צריך להסתכם ב-100%)</span>}
        <button className="benchmark-toggle-button active" onClick={handleSave} disabled={saving || !valid}>
          {saving ? 'שומר…' : 'שמור יעדים'}
        </button>
        {savedMessage && <span className="profit-positive rebalance-status-msg">{savedMessage}</span>}
        {saveError && <span className="profit-negative rebalance-status-msg">{saveError}</span>}
      </div>

      {!valid ? (
        <p className="section-subtitle" style={{ marginTop: 10 }}>
          הזינו יעדים שמסתכמים ל-100% כדי לראות את תוכנית האיזון.
        </p>
      ) : plan.totalValueILS <= 0 ? (
        <p className="history-empty-note">אין עדיין שווי תיק לחשב לפיו איזון.</p>
      ) : (
        <div className="stocks-table-container" style={{ marginTop: 16 }}>
          <table className="analysis-table">
            <thead>
              <tr>
                <th>קטגוריה</th>
                <th>% נוכחי</th>
                <th>% יעד</th>
                <th>סטייה</th>
                <th>פעולה מוצעת</th>
              </tr>
            </thead>
            <tbody>
              {plan.rows.map((row) => (
                <tr key={row.key}>
                  <td>{row.label}</td>
                  <td>{row.currentPercent.toFixed(1)}%</td>
                  <td>{row.targetPercent.toFixed(1)}%</td>
                  <td className={row.diffPercent === 0 ? '' : row.diffPercent > 0 ? 'profit-positive' : 'profit-negative'}>
                    {row.diffPercent > 0 ? '+' : ''}
                    {row.diffPercent.toFixed(1)}%
                  </td>
                  <td className={row.diffValue === 0 ? '' : row.diffValue > 0 ? 'profit-positive' : 'profit-negative'}>
                    {Math.abs(row.diffValue) < 1
                      ? 'מאוזן'
                      : `${row.diffValue > 0 ? 'לקנות' : 'למכור'} ${formatPriceWithSign(Math.abs(row.diffValue))} ₪`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default RebalancingSection;
