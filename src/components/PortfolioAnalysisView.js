import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

function PortfolioAnalysisView({ analysis, formatPriceWithSign, onBack }) {
  return (
    <div className="App">
      <div className="analysis-container">
        <div className="analysis-content">
          <h1 className="analysis-title">ניתוח התיק</h1>

          <button className="back-button" onClick={onBack}>
            חזרה לדף הבית
          </button>

          <div className="analysis-section">
            <h2 className="section-title">תקציר ניתוח</h2>
            <div className="distribution-grid">
              <div className="distribution-card">
                <h3>מספר פוזיציות</h3>
                <div className="distribution-value">{analysis.summaryMetrics.positionsCount}</div>
                <div className="distribution-percentage">
                  ישראליות: {analysis.summaryMetrics.israeliPositions} | אמריקאיות: {analysis.summaryMetrics.americanPositions}
                </div>
                <div className="distribution-percentage">
                  גמל: {analysis.summaryMetrics.pensionPositions} | כספית: {analysis.summaryMetrics.cashFundsPositions} | עו"ש: {analysis.summaryMetrics.bankPositions}
                </div>
              </div>
              <div className="distribution-card">
                <h3>רווח/הפסד לא ממומש</h3>
                <div className={`distribution-value ${analysis.summaryMetrics.totalProfitILS >= 0 ? 'profit-positive' : 'profit-negative'}`}>
                  {formatPriceWithSign(analysis.summaryMetrics.totalProfitILS)} ₪
                </div>
                <div className="distribution-percentage">
                  מול השקעה כוללת של {formatPriceWithSign(analysis.summaryMetrics.totalPurchaseILS)} ₪
                </div>
              </div>
              <div className="distribution-card">
                <h3>שינוי יומי משוקלל</h3>
                <div className={`distribution-value ${analysis.summaryMetrics.weightedDailyChangePercent >= 0 ? 'profit-positive' : 'profit-negative'}`}>
                  {analysis.summaryMetrics.weightedDailyChangePercent.toFixed(2)}%
                </div>
                <div className="distribution-percentage">
                  תשואה שנתית משוקללת: {analysis.summaryMetrics.weightedAnnualizedReturnPercent.toFixed(2)}%
                </div>
              </div>
              <div className="distribution-card">
                <h3>ריכוזיות 3 פוזיציות</h3>
                <div className="distribution-value">
                  {analysis.summaryMetrics.concentrationTop3Percent.toFixed(1)}%
                </div>
                <div className="distribution-percentage">
                  זמן החזקה ממוצע: {analysis.summaryMetrics.averageHoldingDays} ימים
                </div>
              </div>
              <div className="distribution-card">
                <h3>השפעת מט"ח על רכיב ארה"ב</h3>
                <div className={`distribution-value ${analysis.summaryMetrics.americanFxImpactILS >= 0 ? 'profit-positive' : 'profit-negative'}`}>
                  {formatPriceWithSign(analysis.summaryMetrics.americanFxImpactILS)} ₪
                </div>
                <div className="distribution-percentage">
                  מחושב על שווי נוכחי של הפוזיציות האמריקאיות
                </div>
              </div>
              <div className="distribution-card">
                <h3>סה"כ שווי תיק מלא</h3>
                <div className="distribution-value">
                  {formatPriceWithSign(analysis.summaryMetrics.overallTotalValueILS)} ₪
                </div>
                <div className="distribution-percentage">
                  לא מנייתי: {formatPriceWithSign(analysis.summaryMetrics.nonStockTotalValueILS)} ₪
                </div>
              </div>
            </div>
          </div>

          <div className="analysis-section">
            <h2 className="section-title">פיזור לפי רכיבי תיק</h2>
            <div className="distribution-grid">
              <div className="distribution-card">
                <h3>בורסה ישראלית</h3>
                <div className="distribution-value">
                  {formatPriceWithSign(analysis.exchangeDistribution.israeli.value)} ₪
                </div>
                <div className="distribution-percentage">
                  {analysis.exchangeDistribution.israeli.percentage.toFixed(1)}%
                </div>
              </div>
              <div className="distribution-card">
                <h3>בורסה אמריקאית</h3>
                <div className="distribution-value">
                  {formatPriceWithSign(analysis.exchangeDistribution.american.value)} ₪
                </div>
                <div className="distribution-percentage">
                  {analysis.exchangeDistribution.american.percentage.toFixed(1)}%
                </div>
              </div>
              <div className="distribution-card">
                <h3>קופות גמל</h3>
                <div className="distribution-value">
                  {formatPriceWithSign(analysis.exchangeDistribution.pension.value)} ₪
                </div>
                <div className="distribution-percentage">
                  {analysis.exchangeDistribution.pension.percentage.toFixed(1)}%
                </div>
              </div>
              <div className="distribution-card">
                <h3>קרנות כספיות</h3>
                <div className="distribution-value">
                  {formatPriceWithSign(analysis.exchangeDistribution.cashFunds.value)} ₪
                </div>
                <div className="distribution-percentage">
                  {analysis.exchangeDistribution.cashFunds.percentage.toFixed(1)}%
                </div>
              </div>
              <div className="distribution-card">
                <h3>עו"ש</h3>
                <div className="distribution-value">
                  {formatPriceWithSign(analysis.exchangeDistribution.bank.value)} ₪
                </div>
                <div className="distribution-percentage">
                  {analysis.exchangeDistribution.bank.percentage.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>

          <div className="analysis-section">
            <h2 className="section-title">גרף עוגה - פיזור התיק</h2>
            <div className="pie-chart-container">
              <div className="pie-chart-wrapper">
                <ResponsiveContainer width="60%" height={400}>
                  <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }} key="pie-chart">
                    <Pie
                      key="pie-data"
                      data={[
                        {
                          name: 'בורסה ישראלית',
                          value: analysis.exchangeDistribution.israeli.value,
                          percentage: analysis.exchangeDistribution.israeli.percentage
                        },
                        {
                          name: 'בורסה אמריקאית',
                          value: analysis.exchangeDistribution.american.value,
                          percentage: analysis.exchangeDistribution.american.percentage
                        },
                        {
                          name: 'קופות גמל',
                          value: analysis.exchangeDistribution.pension.value,
                          percentage: analysis.exchangeDistribution.pension.percentage
                        },
                        {
                          name: 'קרנות כספיות',
                          value: analysis.exchangeDistribution.cashFunds.value,
                          percentage: analysis.exchangeDistribution.cashFunds.percentage
                        },
                        {
                          name: 'עו"ש',
                          value: analysis.exchangeDistribution.bank.value,
                          percentage: analysis.exchangeDistribution.bank.percentage
                        }
                      ]}
                      cx="50%"
                      cy="50%"
                      outerRadius={120}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      <Cell fill="#667eea" />
                      <Cell fill="#764ba2" />
                      <Cell fill="#16a34a" />
                      <Cell fill="#f59e0b" />
                      <Cell fill="#0ea5e9" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>

                <div className="pie-labels-side">
                  <div className="pie-label-item">
                    <div className="label-color" style={{ backgroundColor: '#667eea' }}></div>
                    <div className="label-content">
                      <div className="label-name">בורסה ישראלית</div>
                      <div className="label-value">{formatPriceWithSign(analysis.exchangeDistribution.israeli.value)} ₪</div>
                      <div className="label-percentage">{analysis.exchangeDistribution.israeli.percentage.toFixed(1)}%</div>
                    </div>
                  </div>
                  <div className="pie-label-item">
                    <div className="label-color" style={{ backgroundColor: '#764ba2' }}></div>
                    <div className="label-content">
                      <div className="label-name">בורסה אמריקאית</div>
                      <div className="label-value">{formatPriceWithSign(analysis.exchangeDistribution.american.value)} ₪</div>
                      <div className="label-percentage">{analysis.exchangeDistribution.american.percentage.toFixed(1)}%</div>
                    </div>
                  </div>
                  <div className="pie-label-item">
                    <div className="label-color" style={{ backgroundColor: '#16a34a' }}></div>
                    <div className="label-content">
                      <div className="label-name">קופות גמל</div>
                      <div className="label-value">{formatPriceWithSign(analysis.exchangeDistribution.pension.value)} ₪</div>
                      <div className="label-percentage">{analysis.exchangeDistribution.pension.percentage.toFixed(1)}%</div>
                    </div>
                  </div>
                  <div className="pie-label-item">
                    <div className="label-color" style={{ backgroundColor: '#f59e0b' }}></div>
                    <div className="label-content">
                      <div className="label-name">קרנות כספיות</div>
                      <div className="label-value">{formatPriceWithSign(analysis.exchangeDistribution.cashFunds.value)} ₪</div>
                      <div className="label-percentage">{analysis.exchangeDistribution.cashFunds.percentage.toFixed(1)}%</div>
                    </div>
                  </div>
                  <div className="pie-label-item">
                    <div className="label-color" style={{ backgroundColor: '#0ea5e9' }}></div>
                    <div className="label-content">
                      <div className="label-name">עו"ש</div>
                      <div className="label-value">{formatPriceWithSign(analysis.exchangeDistribution.bank.value)} ₪</div>
                      <div className="label-percentage">{analysis.exchangeDistribution.bank.percentage.toFixed(1)}%</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="analysis-section">
            <h2 className="section-title">פיזור לפי מניות</h2>
            <div className="stocks-table-container">
              <table className="analysis-table">
                <thead>
                  <tr>
                    <th>מנייה</th>
                    <th>בורסה</th>
                    <th>שווי נוכחי</th>
                    <th>אחוז מהתיק</th>
                    <th>רווח/הפסד</th>
                    <th>אחוז רווח/הפסד</th>
                    <th>זמן החזקה</th>
                    <th>תשואה שנתית</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.stockDistribution.map((stock, index) => (
                    <tr key={index}>
                      <td>{stock.name}</td>
                      <td>{stock.exchange === 'israeli' ? 'ישראלית' : 'אמריקאית'}</td>
                      <td>{formatPriceWithSign(stock.value)} ₪</td>
                      <td>{stock.percentage.toFixed(1)}%</td>
                      <td className={stock.profit >= 0 ? 'profit-positive' : 'profit-negative'}>
                        {formatPriceWithSign(stock.profit)} ₪
                      </td>
                      <td className={stock.profitPercentage >= 0 ? 'profit-positive' : 'profit-negative'}>
                        {stock.profitPercentage.toFixed(1)}%
                      </td>
                      <td>{stock.daysHeld > 365 ? `${stock.yearsHeld.toFixed(1)} שנים` : `${stock.daysHeld} ימים`}</td>
                      <td className={stock.annualizedReturn >= 0 ? 'profit-positive' : 'profit-negative'}>
                        {(stock.annualizedReturn * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="analysis-section">
            <h2 className="section-title">פיזור לפי תאריכי קנייה</h2>
            <div className="date-distribution-grid">
              <div className="date-distribution-card">
                <h3>פיזור חודשי</h3>
                <div className="date-list">
                  {analysis.monthlyDistribution.map((item, index) => (
                    <div key={index} className="date-item">
                      <span className="date-label">{item.month}</span>
                      <span className="date-value">{formatPriceWithSign(item.value)} ₪</span>
                      <span className="date-count">({item.count} מניות)</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="date-distribution-card">
                <h3>פיזור שנתי</h3>
                <div className="date-list">
                  {analysis.yearlyDistribution.map((item, index) => (
                    <div key={index} className="date-item">
                      <span className="date-label">{item.year}</span>
                      <span className="date-value">{formatPriceWithSign(item.value)} ₪</span>
                      <span className="date-count">({item.count} מניות)</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="analysis-section">
            <h2 className="section-title">דוחות מפורטים</h2>
            <div className="reports-grid">
              <div className="report-card">
                <h3>המניות הכי רווחיות</h3>
                <div className="report-list">
                  {analysis.reports.topPerformers.length === 0 ? (
                    <div className="report-item">
                      <span className="report-name">אין כרגע מניות ברווח</span>
                    </div>
                  ) : (
                    analysis.reports.topPerformers.map((stock, index) => (
                      <div key={index} className="report-item">
                        <span className="report-name">{stock.name}</span>
                        <span className="report-profit profit-positive">
                          {formatPriceWithSign(stock.profit)} ₪
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="report-card">
                <h3>המניות הכי מפסידות</h3>
                <div className="report-list">
                  {analysis.reports.worstPerformers.length === 0 ? (
                    <div className="report-item">
                      <span className="report-name">אין כרגע מניות בהפסד</span>
                    </div>
                  ) : (
                    analysis.reports.worstPerformers.map((stock, index) => (
                      <div key={index} className="report-item">
                        <span className="report-name">{stock.name}</span>
                        <span className="report-profit profit-negative">
                          {formatPriceWithSign(stock.profit)} ₪
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="report-card">
                <h3>הפוזיציות הכי גדולות</h3>
                <div className="report-list">
                  {analysis.reports.largestPositions.map((stock, index) => (
                    <div key={index} className="report-item">
                      <span className="report-name">{stock.name}</span>
                      <span className="report-value">
                        {formatPriceWithSign(stock.value)} ₪
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PortfolioAnalysisView;
