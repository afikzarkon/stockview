import { render, screen } from '@testing-library/react';
import PendingPriceValue from './PendingPriceValue';

const format = (v) => (v ?? 0).toFixed(2);

describe('PendingPriceValue', () => {
  test('shows the formatted value whenever one is known, even while a refresh is in flight', () => {
    // This is the point of the non-blocking load: a price persisted with
    // the portfolio is a real number and is shown immediately, rather than
    // being hidden behind a spinner until the market data arrives.
    render(<PendingPriceValue value={123.456} pending format={format} />);
    expect(screen.getByText('123.46')).toBeInTheDocument();
    expect(document.querySelector('.value-skeleton')).toBeNull();
  });

  test('shows a skeleton placeholder when there is no price yet and the first cycle is still running', () => {
    render(<PendingPriceValue value={0} pending format={format} />);
    expect(document.querySelector('.value-skeleton')).not.toBeNull();
    expect(screen.queryByText('0.00')).toBeNull();
  });

  // A skeleton that never resolves is worse than a number: once the first
  // refresh has completed, a missing price is a real answer.
  test('shows the formatted value once the first cycle has completed, even if the price is still missing', () => {
    render(<PendingPriceValue value={0} pending={false} format={format} />);
    expect(screen.getByText('0.00')).toBeInTheDocument();
    expect(document.querySelector('.value-skeleton')).toBeNull();
  });

  test('treats null/undefined/NaN the same as a missing price', () => {
    const { rerender } = render(<PendingPriceValue value={null} pending format={format} />);
    expect(document.querySelector('.value-skeleton')).not.toBeNull();

    rerender(<PendingPriceValue value={undefined} pending format={format} />);
    expect(document.querySelector('.value-skeleton')).not.toBeNull();

    rerender(<PendingPriceValue value={NaN} pending format={format} />);
    expect(document.querySelector('.value-skeleton')).not.toBeNull();
  });

  test('appends a currency suffix to a shown value, and never to a skeleton', () => {
    const { rerender } = render(<PendingPriceValue value={10} pending format={format} suffix=" $" />);
    expect(screen.getByText(/10\.00/)).toBeInTheDocument();
    expect(screen.getByText('$', { exact: false })).toBeInTheDocument();

    rerender(<PendingPriceValue value={0} pending format={format} suffix=" $" />);
    expect(screen.queryByText('$', { exact: false })).toBeNull();
  });

  test('the skeleton is announced to assistive tech rather than being a silent empty cell', () => {
    render(<PendingPriceValue value={null} pending format={format} />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'טוען מחיר');
  });
});
