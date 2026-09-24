import { render, screen, fireEvent } from '@testing-library/react';
import BetaNoticeModal from './BetaNoticeModal';
import BetaBanner from './BetaBanner';

describe('BetaNoticeModal', () => {
  const noop = () => {};

  // The four things the notice exists to say. Asserted by their substance
  // rather than by exact sentence, so rewording the copy does not fail the
  // test but dropping one of the warnings does.
  test('states that the system is a beta, is not secured, and must not hold real data', () => {
    render(<BetaNoticeModal onAcknowledge={noop} />);
    expect(screen.getByText(/בשלב בדיקות/)).toBeInTheDocument();
    expect(screen.getByText(/אינה מאובטחת סייבר/)).toBeInTheDocument();
    expect(screen.getByText(/אין להזין נתונים פיננסיים אמיתיים/)).toBeInTheDocument();
  });

  test('warns that the tax figures are an estimate and points at a professional', () => {
    render(<BetaNoticeModal onAcknowledge={noop} />);
    expect(screen.getByText(/חישובי המס הם אומדן בלבד/)).toBeInTheDocument();
    expect(screen.getByText(/Tax-Loss Harvesting/)).toBeInTheDocument();
    expect(screen.getByText(/התייעצו עם איש מקצוע מוסמך/)).toBeInTheDocument();
  });

  // It is a decision, not a notification: assistive tech has to interrupt
  // for it rather than announce it in passing.
  test('is an alert dialog, labelled and described by its own content', () => {
    render(<BetaNoticeModal onAcknowledge={noop} />);
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('המערכת נמצאת בשלב בדיקות');
  });

  test('the acknowledgement is what dismisses it', () => {
    const onAcknowledge = jest.fn();
    render(<BetaNoticeModal onAcknowledge={onAcknowledge} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onAcknowledge).toHaveBeenCalled();
  });

  // Acknowledging is the only way out on purpose - see the component's own
  // note. A click on the backdrop or an Escape is the gesture for closing
  // something optional, and this is not.
  test('offers exactly one way out, and it is the acknowledgement', () => {
    render(<BetaNoticeModal onAcknowledge={noop} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  test('focus lands on the acknowledgement rather than behind the overlay', () => {
    render(<BetaNoticeModal onAcknowledge={noop} />);
    expect(screen.getByRole('button')).toHaveFocus();
  });

  // A modal the page scrolls behind is a banner with extra steps.
  test('locks the page behind it while it is up, and releases it on unmount', () => {
    const { unmount } = render(<BetaNoticeModal onAcknowledge={noop} />);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});

describe('BetaBanner', () => {
  test('leads with the data warning on the screens where figures are typed', () => {
    render(<BetaBanner tone="data" />);
    expect(screen.getByText(/אין להזין נתונים אמיתיים/)).toBeInTheDocument();
  });

  test('leads with the estimate warning where a tax figure is being claimed', () => {
    render(<BetaBanner tone="tax" />);
    expect(screen.getByText(/חישובי המס הם אומדן/)).toBeInTheDocument();
    expect(screen.getByText(/יועץ מס או איש מקצוע מוסמך/)).toBeInTheDocument();
  });

  test('falls back to the general warning, including for an unknown tone', () => {
    const { rerender } = render(<BetaBanner />);
    expect(screen.getByText(/המערכת בשלב בדיקות \(Beta\)/)).toBeInTheDocument();

    rerender(<BetaBanner tone="nonsense" />);
    expect(screen.getByText(/המערכת בשלב בדיקות \(Beta\)/)).toBeInTheDocument();
  });

  test('is a note rather than an alert - it is a standing condition, not an event', () => {
    render(<BetaBanner />);
    expect(screen.getByRole('note')).toBeInTheDocument();
  });
});
