import React from 'react';
import { formatPriceWithSign } from '../utils/formatters';
import {
  CapitalStateCard,
  IsraeliMarketCard,
  AmericanMarketCard,
  NetInvestmentCard,
  ProvidentFundsCard,
  BankSavingsCard,
  CashAndCheckingCard
} from './PortfolioSummary';
import PortfolioActionsToolbar from './PortfolioActionsToolbar';
import KpiTile, { KpiRow } from './KpiTile';

// The home dashboard: the portfolio's top-level valuation, and one summary
// card per part of it.
//
// It deliberately holds NO holdings tables. Each asset class now has its own
// page (see router/routes.js), and a card here links to the page that shows
// the rows behind it - one card per asset class, so the cards account for
// every shekel in the total above them. The page used to render all five tables one after
// another, which meant the figures a user opens the app to check sat above
// several screens of rows they had not asked for.
function HomeView({
  summary,
  israeliStocks,
  americanStocks,
  pensionFunds,
  cashFunds,
  bankBalances,
  bankSavingsFunds = [],
  onNavigate,
  ...toolbarProps
}) {
  const hasAnyData =
    israeliStocks.length > 0 ||
    americanStocks.length > 0 ||
    pensionFunds.length > 0 ||
    cashFunds.length > 0 ||
    bankBalances.length > 0 ||
    bankSavingsFunds.length > 0;

  const exportPortfolioData = {
    summary,
    israeliStocks,
    americanStocks,
    pensionFunds,
    cashFunds,
    bankBalances,
    bankSavingsFunds
  };

  const toneOf = (value) => (value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral');

  // There is no portfolio-wide profit percentage on the summary - only
  // per-market ones - so it is derived here from the two totals that do
  // exist. Null rather than 0 when there is nothing invested to divide by,
  // so an empty portfolio doesn't report a confident "0.00%".
  const totalProfitPercent =
    summary.totalPurchaseILS > 0 ? (summary.totalProfitILS / summary.totalPurchaseILS) * 100 : null;

  const cardProps = { summary, formatPriceWithSign };

  // Each overview card is a doorway to the page that holds its rows. The
  // card stays a plain block of figures when there is nowhere to go (no
  // onNavigate) rather than rendering a button that does nothing.
  const CardLink = ({ to, children }) =>
    onNavigate ? (
      <button
        type="button"
        className="summary-card-link"
        onClick={() => onNavigate(to)}
        title="פתיחת הדף המלא"
      >
        {children}
        <span className="summary-card-link-hint" aria-hidden="true">
          הצגת הפירוט ←
        </span>
      </button>
    ) : (
      children
    );

  return (
    <div className="App">
      <div className="welcome-container">
        <div className="welcome-content">
          <PortfolioActionsToolbar
            {...toolbarProps}
            title="תיק ההשקעות שלך"
            subtitle="סיכום התיק - לפירוט המלא של כל אפיק בחרו בו בתפריט או בכרטיס המתאים"
            hasAnyData={hasAnyData}
            exportPortfolioData={exportPortfolioData}
            // The overview has no table to edit or to widen with extra
            // columns; those toggles belong on the asset pages.
            showTableControls={false}
          />

          {/* The figures the app is opened to see, lifted out of the cards
              below so they aren't buried among detail that is read
              occasionally rather than every time. */}
          {hasAnyData && (
            <KpiRow>
              {/* The figure the app is opened for, given the block of the
                  grid that says so. The three beside it qualify it. */}
              <KpiTile
                featured
                label="שווי התיק"
                icon="₪"
                value={`${formatPriceWithSign(summary.capitalTotalILS)} ₪`}
                sub="סך כל הנכסים"
              />
              <KpiTile
                label="רווח/הפסד כולל"
                icon="↗"
                tone={toneOf(summary.totalProfitILS)}
                value={`${formatPriceWithSign(summary.totalProfitILS)} ₪`}
                sub={
                  totalProfitPercent != null
                    ? `${totalProfitPercent.toFixed(2)}% מההשקעה`
                    : 'אין השקעה רשומה'
                }
              />
              <KpiTile
                label="שינוי יומי"
                icon="◷"
                tone={toneOf(summary.dailyProfitILS)}
                value={`${formatPriceWithSign(summary.dailyProfitILS)} ₪`}
                sub={`${summary.weightedDailyChange.toFixed(2)}% משוקלל`}
              />
              {/* Fills the rest of the featured tile's second row, so the
                  block stays rectangular. */}
              <KpiTile
                wide
                label="מס צפוי"
                icon="%"
                value={`${formatPriceWithSign(summary.totalTaxILS)} ₪`}
                sub="על הרווח הריאלי"
              />
            </KpiRow>
          )}

          {hasAnyData && (
            <div className="portfolio-summary">
              <h2 className="portfolio-summary-title">סיכום התיק</h2>
              <div className="summary-grid-custom">
                <div className="summary-row summary-row-single">
                  <CapitalStateCard {...cardProps} />
                </div>

                {/* The four cards the dashboard is for: the two markets,
                    the net position across both, and the provident funds. */}
                <div className="summary-row">
                  <CardLink to="israeli-stocks">
                    <IsraeliMarketCard {...cardProps} />
                  </CardLink>
                  <CardLink to="us-stocks">
                    <AmericanMarketCard {...cardProps} />
                  </CardLink>
                </div>

                <div className="summary-row">
                  <NetInvestmentCard {...cardProps} />
                  <CardLink to="provident-funds">
                    <ProvidentFundsCard {...cardProps} />
                  </CardLink>
                </div>

                {/* The remaining two asset classes. They were missing from
                    the dashboard even though their values are inside the
                    total above, so the overview described only part of
                    what it was totalling. */}
                <div className="summary-row">
                  <CardLink to="bank-savings">
                    <BankSavingsCard {...cardProps} />
                  </CardLink>
                  <CardLink to="cash-and-checking">
                    <CashAndCheckingCard {...cardProps} />
                  </CardLink>
                </div>
              </div>
            </div>
          )}

          {/* הודעה אם אין נתונים */}
          {!hasAnyData && (
            <div className="no-data-message">
              <p>עדיין לא נוספו מניות לתיק ההשקעות שלך</p>
              <p>לחץ על הכפתור למעלה כדי להתחיל</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default HomeView;
