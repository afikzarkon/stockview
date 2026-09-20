import React from 'react';

// A price cell that shows a skeleton placeholder instead of a number while
// the first live price cycle is still in flight AND no price is known yet.
//
// This is the visible half of the non-blocking load: the page renders
// immediately from whatever prices were persisted with the portfolio rather
// than waiting for the market data, so most cells show a real (very
// slightly stale) number right away and are quietly replaced when the
// refresh lands. The only cells with genuinely nothing to show are holdings
// that have never had a price fetched - a stock added moments ago, or one
// whose quote failed last time. Those used to render a confident "0.00",
// which reads as "this holding is worthless" rather than "still loading".
//
// Once the first refresh cycle completes, a still-missing price is a real
// answer ("we asked, and there is no quote"), so the skeleton stops and the
// formatted value is shown - a skeleton that never resolves would be worse
// than a number.
function PendingPriceValue({ value, pending, format, suffix = '' }) {
  const hasValue = value !== null && value !== undefined && Number.isFinite(Number(value)) && Number(value) !== 0;
  if (!hasValue && pending) {
    return <span className="value-skeleton" role="status" aria-label="טוען מחיר" />;
  }
  return (
    <>
      {format(value)}
      {suffix}
    </>
  );
}

export default PendingPriceValue;
