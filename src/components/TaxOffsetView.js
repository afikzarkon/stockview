import React, { useMemo } from 'react';
import PageToolbar from './PageToolbar';
import BetaBanner from './BetaBanner';
import { computeTaxLossHarvestingOpportunities } from '../utils/taxLossHarvesting';

// /tax-offset - הזדמנות לקיזוז מס.
//
// The calculator is unchanged; only its address is. It is an actionable
// tool - the user comes to it with a decision to make about realising a
// loss before year end - rather than something read in passing while
// scrolling through charts, which is what it was as one section among
// fourteen on the analytics page.
//
// Everything it shows comes out of one pure computation over the current
// holdings and the CPI, so the page holds no state of its own.
function TaxOffsetView({
  formatPriceWithSign,
  israeliStocks = [],
  americanStocks = [],
  pensionFunds = [],
  bankSavingsFunds = [],
  cpi = null
}) {
  const harvesting = useMemo(
    () =>
      computeTaxLossHarvestingOpportunities(
        israeliStocks,
        americanStocks,
        pensionFunds,
        cpi,
        bankSavingsFunds
      ),
    [israeliStocks, americanStocks, pensionFunds, cpi, bankSavingsFunds]
  );

  return (
    <div className="App">
      <div className="analysis-container">
        <div className="analysis-content">
          <PageToolbar
            title="הזדמנות לקיזוז מס"
            subtitle="פוזיציות בהפסד ריאלי שניתן לממש כדי לקזז מס על רווחים"
          />

        <BetaBanner tone="tax" />

        <div className="analysis-section">
          <h2 className="section-title">הזדמנויות לקיזוז מס (Tax-Loss Harvesting)</h2>
          <div className="distribution-grid">
            <div className="distribution-card">
              <h3>סה"כ הפסד ריאלי הניתן למימוש</h3>
              <div className="distribution-value profit-negative">
                {formatPriceWithSign(harvesting.totalHarvestableLoss)} ₪
              </div>
              <div className="distribution-percentage">{harvesting.lossPositions.length} פוזיציות</div>
            </div>
            <div className="distribution-card">
              <h3>שווי מס פוטנציאלי</h3>
              <div className="distribution-value profit-positive">
                עד {formatPriceWithSign(harvesting.totalPotentialTaxValue)} ₪
              </div>
              <div className="distribution-percentage">אם ימומש מול רווחים באותו שיעור מס</div>
            </div>
            <div className="distribution-card">
              <h3>רווחים ריאליים פתוחים כרגע</h3>
              <div className="distribution-value profit-positive">
                {formatPriceWithSign(harvesting.totalCurrentGains)} ₪
              </div>
              <div className="distribution-percentage">
                מס משוער: {formatPriceWithSign(harvesting.totalGainsTax)} ₪
              </div>
            </div>
          </div>

          {!harvesting.hasLossPositions ? (
            <p className="history-empty-note">אין כרגע פוזיציות בהפסד ריאלי בתיק.</p>
          ) : (
            <div className="stocks-table-container" style={{ marginTop: 16 }}>
              <table className="analysis-table">
                <thead>
                  <tr>
                    <th>פוזיציה</th>
                    <th>קטגוריה</th>
                    <th>הפסד ריאלי</th>
                    <th>שווי מס פוטנציאלי</th>
                  </tr>
                </thead>
                <tbody>
                  {harvesting.lossPositions.map((position) => (
                    <tr key={`${position.category}-${position.id}`}>
                      <td>{position.name}</td>
                      <td>{position.categoryLabel}</td>
                      <td className="profit-negative">{formatPriceWithSign(position.harvestableLoss)} ₪</td>
                      <td className="profit-positive">{formatPriceWithSign(position.taxValue)} ₪</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        </div>
      </div>
    </div>
  );
}

export default TaxOffsetView;
