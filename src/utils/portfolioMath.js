export const TAX_RATE = 0.25;

export const calculateAmericanStockMetrics = (stock, taxRate = TAX_RATE) => {
  const totalPurchaseUSD = (stock.purchasePrice || 0) * (stock.quantity || 0);
  const totalPurchaseILS = totalPurchaseUSD * (stock.exchangeRate || 0);
  const totalCurrentValueUSD = (stock.currentPrice || 0) * (stock.quantity || 0);
  const currentExchangeRate = stock.currentExchangeRate || stock.exchangeRate || 0;
  const totalCurrentValueILS = totalCurrentValueUSD * currentExchangeRate;
  const profitUSD = totalCurrentValueUSD - totalPurchaseUSD;
  const profitILS = profitUSD * currentExchangeRate;
  const taxUSD = profitUSD > 0 ? profitUSD * taxRate : 0;
  const taxILS = taxUSD * currentExchangeRate;
  const afterTaxUSD = profitUSD - taxUSD;
  const afterTaxILS = profitILS - taxILS;
  // FX impact in ILS based on current USD position value, as requested:
  // (buy USDILS - current USDILS) * (current stock price * quantity)
  const exchangeRateImpact = ((stock.exchangeRate || 0) - currentExchangeRate) * totalCurrentValueUSD;

  return {
    totalPurchaseUSD,
    totalPurchaseILS,
    totalCurrentValueUSD,
    currentExchangeRate,
    totalCurrentValueILS,
    profitUSD,
    profitILS,
    taxUSD,
    taxILS,
    afterTaxUSD,
    afterTaxILS,
    exchangeRateImpact
  };
};
