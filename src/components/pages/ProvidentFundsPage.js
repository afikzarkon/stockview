import React from 'react';
import { formatPriceWithSign } from '../../utils/formatters';
import { ProvidentFundsCard } from '../PortfolioSummary';
import AccountsPage from './AccountsPage';

// /provident-funds - קופות גמל להשקעה: the deposit ledger, the current
// value, and the real-gain figures that go with them.
function ProvidentFundsPage({ pensionFunds = [], summary, ...rest }) {
  return (
    <AccountsPage
      {...rest}
      pensionFunds={pensionFunds}
      summary={summary}
      title="קופות גמל להשקעה"
      subtitle="הפקדות, שווי נוכחי ותשואה מצטברת"
      sections={['pension']}
      isEmpty={pensionFunds.length === 0}
      emptyMessage="עדיין לא נוספו קופות גמל להשקעה"
      summaryCard={
        <ProvidentFundsCard summary={summary} formatPriceWithSign={formatPriceWithSign} />
      }
    />
  );
}

export default ProvidentFundsPage;
