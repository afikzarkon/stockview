import React from 'react';
import { formatPriceWithSign } from '../../utils/formatters';
import { CashAndCheckingCard } from '../PortfolioSummary';
import AccountsPage from './AccountsPage';

// /cash-and-checking - כספית שקלית ועו"ש.
//
// The two are one page rather than two because they are one thing to the
// user: money that is liquid right now. They are also the two categories
// whose external flows have to be declared by hand in the monthly tracker,
// for the same reason - neither carries a purchase ledger of its own.
function CashAndCheckingPage({ cashFunds = [], bankBalances = [], summary, ...rest }) {
  return (
    <AccountsPage
      {...rest}
      summary={summary}
      cashFunds={cashFunds}
      bankBalances={bankBalances}
      title='כספית שקלית ועו"ש'
      subtitle="הנזילות השוטפת של התיק"
      sections={['cash', 'bank']}
      isEmpty={cashFunds.length === 0 && bankBalances.length === 0}
      emptyMessage='עדיין לא נוספו קרנות כספיות או חשבונות עו"ש'
      summaryCard={<CashAndCheckingCard summary={summary} formatPriceWithSign={formatPriceWithSign} />}
    />
  );
}

export default CashAndCheckingPage;
