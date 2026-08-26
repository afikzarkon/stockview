import React from 'react';

function PortfolioSummary({ summary, formatPriceWithSign }) {
  return (
    <div className="portfolio-summary">
      <h2 className="portfolio-summary-title">סיכום התיק</h2>
      <div className="summary-grid-custom">
        <div className="summary-row summary-row-single">
          <div className="summary-section summary-col">
            <h3 className="summary-section-title">סה"כ מצב ההון</h3>
            <div className="summary-item"><span className="summary-label">בורסה ישראלית:</span><span className="summary-value">{formatPriceWithSign(summary.capitalIsraeliILS)} ₪</span></div>
            <div className="summary-item"><span className="summary-label">בורסה אמריקאית:</span><span className="summary-value">{formatPriceWithSign(summary.capitalAmericanILS)} ₪</span></div>
            <div className="summary-item"><span className="summary-label">כספית שקלית:</span><span className="summary-value">{formatPriceWithSign(summary.capitalCashFundsILS)} ₪</span></div>
            <div className="summary-item"><span className="summary-label">קופת גמל:</span><span className="summary-value">{formatPriceWithSign(summary.capitalPensionILS)} ₪</span></div>
            <div className="summary-item"><span className="summary-label">עו"ש:</span><span className="summary-value">{formatPriceWithSign(summary.capitalBankILS)} ₪</span></div>
            <div className="summary-item"><span className="summary-label">סה"כ מצב ההון:</span><span className="summary-value">{formatPriceWithSign(summary.capitalTotalILS)} ₪</span></div>
          </div>
        </div>

        <div className="summary-row">
          <div className="summary-section summary-col">
            <h3 className="summary-section-title"> בורסה ישראל - השקעה בש''ח(₪)</h3>
            <div className="summary-item"><span className="summary-label">סה"כ השקעה:</span><span className="summary-value">{formatPriceWithSign(summary.israeliOnlyPurchaseILS)} ₪</span></div>
            <div className="summary-item"><span className="summary-label">סה"כ שווי:</span><span className="summary-value">{formatPriceWithSign(summary.israeliOnlyCurrentValueILS)} ₪</span></div>
            <div className="summary-item"><span className="summary-label">סך רווח והפסד:</span><span className={`summary-value ${summary.israeliOnlyProfitILS >= 0 ? 'profit-positive' : 'profit-negative'}`}>{formatPriceWithSign(summary.israeliOnlyProfitILS)} ₪</span></div>
            <div className="summary-item"><span className="summary-label">רווח ריאלי - חייב במס:</span><span className={`summary-value ${summary.israeliOnlyRealGainILS >= 0 ? 'profit-positive' : 'profit-negative'}`}>{formatPriceWithSign(summary.israeliOnlyRealGainILS)} ₪</span></div>
            <div className="summary-item"><span className="summary-label">רווח אינפלציוני - פטור ממס:</span><span className="summary-value">{formatPriceWithSign(summary.israeliOnlyInflationaryGainILS)} ₪</span></div>
            <div className="summary-item"><span className="summary-label">סה"כ מס שנשלם:</span><span className="summary-value profit-negative">{formatPriceWithSign(-summary.israeliOnlyTaxILS)} ₪</span></div>
            <div className="summary-item"><span className="summary-label">אחוז רווח והפסד כללי:</span><span className={`summary-value ${summary.israeliOnlyProfitPercent >= 0 ? 'profit-positive' : 'profit-negative'}`}>{summary.israeliOnlyProfitPercent.toFixed(2)}%</span></div>
            <div className="summary-item"><span className="summary-label">אחוז רווח והפסד יומי:</span><span className={`summary-value ${summary.israeliOnlyDailyPercent >= 0 ? 'profit-positive' : 'profit-negative'}`}>{summary.israeliOnlyDailyPercent.toFixed(2)}%</span></div>
            <div className="summary-item"><span className="summary-label">רווח והפסד יומי בש"ח:</span><span className={`summary-value ${summary.israeliOnlyDailyProfitILS >= 0 ? 'profit-positive' : 'profit-negative'}`}>{formatPriceWithSign(summary.israeliOnlyDailyProfitILS)} ₪</span></div>
          </div>

          <div className="summary-section summary-col">
            <h3 className="summary-section-title">בורסה אמריקאית - השקעה בדולר ($)</h3>
            <div className="summary-item"><span className="summary-label">סה"כ השקעה:</span><span className="summary-value">{formatPriceWithSign(summary.totalPurchaseUSD)} $</span></div>
            <div className="summary-item"><span className="summary-label">סה"כ שווי:</span><span className="summary-value">{formatPriceWithSign(summary.totalCurrentValueUSD)} $</span></div>
            <div className="summary-item"><span className="summary-label">סה"כ רווח והפסד:</span><span className={`summary-value ${summary.totalProfitUSD >= 0 ? 'profit-positive' : 'profit-negative'}`}>{formatPriceWithSign(summary.totalProfitUSD)} $</span></div>
            <div className="summary-item"><span className="summary-label">רווח ריאלי חייב במס:</span><span className={`summary-value ${summary.americanOnlyRealGainILS >= 0 ? 'profit-positive' : 'profit-negative'}`}>{formatPriceWithSign(summary.americanOnlyRealGainILS)} ₪</span></div>
            <div className="summary-item"><span className="summary-label">רווח אינפלציוני פטור ממס (משער חליפין):</span><span className="summary-value">{formatPriceWithSign(summary.americanOnlyCurrencyExemptGainILS)} ₪</span></div>
            <div className="summary-item"><span className="summary-label">סך מס שנשלם:</span><span className="summary-value profit-negative">{formatPriceWithSign(-summary.americanOnlyTaxUSD)} $</span></div>
            <div className="summary-item"><span className="summary-label">אחוז רווח והפסד כללי:</span><span className={`summary-value ${summary.americanOnlyProfitPercent >= 0 ? 'profit-positive' : 'profit-negative'}`}>{summary.americanOnlyProfitPercent.toFixed(2)}%</span></div>
            <div className="summary-item"><span className="summary-label">אחוז רווח והפסד יומי:</span><span className={`summary-value ${summary.americanOnlyDailyPercent >= 0 ? 'profit-positive' : 'profit-negative'}`}>{summary.americanOnlyDailyPercent.toFixed(2)}%</span></div>
            <div className="summary-item"><span className="summary-label">רווח והפסד יומי:</span><span className={`summary-value ${summary.americanOnlyDailyProfitUSD >= 0 ? 'profit-positive' : 'profit-negative'}`}>{formatPriceWithSign(summary.americanOnlyDailyProfitUSD)} $</span></div>
          </div>
        </div>

        <div className="summary-row">
          <div className="summary-section summary-col">
            <h3 className="summary-section-title">סיכום השקעות נטו (₪)</h3>
            <div className="summary-item"><span className="summary-label">סה"כ השקעה בש"ח:</span><span className="summary-value">{formatPriceWithSign(summary.totalPurchaseILS)} ₪</span></div>
            <div className="summary-item"><span className="summary-label">סה"כ שווי בש"ח:</span><span className="summary-value">{formatPriceWithSign(summary.totalCurrentValueILS)} ₪</span></div>
            <div className="summary-item"><span className="summary-label">סה"כ רווח והפסד בש"ח:</span><span className={`summary-value ${summary.totalProfitILS >= 0 ? 'profit-positive' : 'profit-negative'}`}>{formatPriceWithSign(summary.totalProfitILS)} ₪</span></div>
            <div className="summary-item"><span className="summary-label">סה"כ רווח ריאלי חייב במס:</span><span className={`summary-value ${summary.totalRealGainILS >= 0 ? 'profit-positive' : 'profit-negative'}`}>{formatPriceWithSign(summary.totalRealGainILS)} ₪</span></div>
            <div className="summary-item"><span className="summary-label">סה"כ רווח אינפלציוני פטור ממס:</span><span className="summary-value">{formatPriceWithSign(summary.totalInflationaryGainILS)} ₪</span></div>
            <div className="summary-item"><span className="summary-label">סה"כ מס לשלם:</span><span className="summary-value profit-negative">{formatPriceWithSign(-summary.totalTaxILS)} ₪</span></div>
            <div className="summary-item"><span className="summary-label">סה"כ רווח והפסד לאחר מס:</span><span className={`summary-value ${summary.totalProfitAfterTaxILS >= 0 ? 'profit-positive' : 'profit-negative'}`}>{formatPriceWithSign(summary.totalProfitAfterTaxILS)} ₪</span></div>
            <div className="summary-item"><span className="summary-label">השפעת הדולר על התיק:</span><span className={`summary-value ${summary.totalExchangeImpact >= 0 ? 'profit-positive' : 'profit-negative'}`}>{formatPriceWithSign(summary.totalExchangeImpact)} ₪</span></div>
          </div>

          <div className="summary-section summary-col">
            <h3 className="summary-section-title">קופות גמל - השקעה בש''ח(₪)</h3>
            <div className="summary-item"><span className="summary-label">סך הפקדות:</span><span className="summary-value">{formatPriceWithSign(summary.pensionInitialInvestmentILS)} ₪</span></div>
            <div className="summary-item"><span className="summary-label">סך שווי היום:</span><span className="summary-value">{formatPriceWithSign(summary.pensionCurrentValueILS)} ₪</span></div>
            <div className="summary-item"><span className="summary-label">תשואה מעדכון קודם:</span><span className={`summary-value ${summary.pensionPreviousProfitPercent >= 0 ? 'profit-positive' : 'profit-negative'}`}>{summary.pensionPreviousProfitPercent.toFixed(2)}%</span></div>
            <div className="summary-item"><span className="summary-label">רווח מצטבר אל מול הפקדות:</span><span className={`summary-value ${summary.pensionProfitPercent >= 0 ? 'profit-positive' : 'profit-negative'}`}>{summary.pensionProfitPercent.toFixed(2)}%</span></div>
            <div className="summary-item"><span className="summary-label">סה"כ רווח והפסד:</span><span className={`summary-value ${summary.pensionTotalProfitILS >= 0 ? 'profit-positive' : 'profit-negative'}`}>{formatPriceWithSign(summary.pensionTotalProfitILS)} ₪</span></div>
            <div className="summary-item"><span className="summary-label">רווח ריאלי - חייב במס:</span><span className={`summary-value ${summary.pensionRealGainILS >= 0 ? 'profit-positive' : 'profit-negative'}`}>{formatPriceWithSign(summary.pensionRealGainILS)} ₪</span></div>
            <div className="summary-item"><span className="summary-label">רווח אינפלציוני פטור:</span><span className="summary-value">{formatPriceWithSign(summary.pensionInflationaryGainILS)} ₪</span></div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default PortfolioSummary;
