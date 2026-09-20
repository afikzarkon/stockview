import React from 'react';
import { formatPriceWithSign } from '../../utils/formatters';
import { BankSavingsCard } from '../PortfolioSummary';
import AccountsPage from './AccountsPage';

// /bank-savings - קופות חיסכון בבנק: deposits with a fixed or
// index-linked track, valued by computeBankSavingsFundValue rather than by
// a market price.
function BankSavingsPage({ bankSavingsFunds = [], summary, ...rest }) {
  return (
    <AccountsPage
      {...rest}
      summary={summary}
      bankSavingsFunds={bankSavingsFunds}
      title="קופת חיסכון בבנק"
      subtitle="פיקדונות וחסכונות - צמודי מדד וריבית קבועה"
      sections={['bank_savings']}
      isEmpty={bankSavingsFunds.length === 0}
      emptyMessage="עדיין לא נוספו קופות חיסכון בבנק"
      summaryCard={<BankSavingsCard summary={summary} formatPriceWithSign={formatPriceWithSign} />}
    />
  );
}

export default BankSavingsPage;
