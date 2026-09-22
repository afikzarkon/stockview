import { render, screen, fireEvent, within } from '@testing-library/react';
import PageToolbar, { ToolbarButton, ToolbarPrimaryButton, ToolbarStatus } from './PageToolbar';
import KpiTile, { KpiRow } from './KpiTile';

describe('PageToolbar', () => {
  test('keeps the primary action visually and structurally apart from the secondaries', () => {
    const { container } = render(
      <PageToolbar
        title="תיק ההשקעות שלך"
        primaryAction={<ToolbarPrimaryButton onClick={() => {}}>+ הוספת מידע</ToolbarPrimaryButton>}
        secondaryActions={<ToolbarButton onClick={() => {}}>ייצוא Excel</ToolbarButton>}
      />
    );

    const primary = container.querySelector('.page-toolbar-primary');
    const secondary = container.querySelector('.page-toolbar-secondary');
    expect(within(primary).getByText('+ הוספת מידע')).toBeInTheDocument();
    expect(within(secondary).getByText('ייצוא Excel')).toBeInTheDocument();
    // A secondary control must never be styled as the primary one.
    expect(secondary.querySelector('.toolbar-btn-primary')).toBeNull();
  });

  test('renders the title as the page heading', () => {
    render(<PageToolbar title="ניתוח התיק" subtitle="ביצועים ופיזור" />);
    expect(screen.getByRole('heading', { name: 'ניתוח התיק' })).toBeInTheDocument();
    expect(screen.getByText('ביצועים ופיזור')).toBeInTheDocument();
  });

  test('omits the subtitle and status rows entirely when there is nothing to say', () => {
    const { container } = render(<PageToolbar title="בית" />);
    expect(container.querySelector('.page-toolbar-subtitle')).toBeNull();
    expect(container.querySelector('.page-toolbar-status')).toBeNull();
  });

  test('status is passive text, never a control', () => {
    const { container } = render(
      <PageToolbar title="בית" status={<ToolbarStatus tone="negative">שמירה נכשלה</ToolbarStatus>} />
    );
    const status = container.querySelector('.page-toolbar-status');
    expect(within(status).getByText('שמירה נכשלה')).toBeInTheDocument();
    expect(status.querySelector('button')).toBeNull();
  });
});

describe('ToolbarButton', () => {
  // A toggle that is ON has to say so, not just look different.
  test('exposes a toggle state through aria-pressed', () => {
    const { rerender } = render(<ToolbarButton pressed={false}>מצב עריכה</ToolbarButton>);
    expect(screen.getByText('מצב עריכה')).toHaveAttribute('aria-pressed', 'false');

    rerender(<ToolbarButton pressed>מצב עריכה</ToolbarButton>);
    const on = screen.getByText('מצב עריכה');
    expect(on).toHaveAttribute('aria-pressed', 'true');
    expect(on).toHaveClass('is-pressed');
  });

  // A plain action is not a toggle; claiming it is would be a lie to a
  // screen reader.
  test('a non-toggle button has no pressed state at all', () => {
    render(<ToolbarButton>ייצוא PDF</ToolbarButton>);
    expect(screen.getByText('ייצוא PDF')).not.toHaveAttribute('aria-pressed');
  });

  test('does not fire while disabled', () => {
    const onClick = jest.fn();
    render(
      <ToolbarButton onClick={onClick} disabled>
        שמור
      </ToolbarButton>
    );
    fireEvent.click(screen.getByText('שמור'));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('KpiTile', () => {
  test('renders its label, figure and supporting line', () => {
    render(<KpiTile label="שווי התיק" value="1,000.00 ₪" sub="סך כל הנכסים" />);
    expect(screen.getByText('שווי התיק')).toBeInTheDocument();
    expect(screen.getByText('1,000.00 ₪')).toBeInTheDocument();
    expect(screen.getByText('סך כל הנכסים')).toBeInTheDocument();
  });

  test('tone drives the tile styling for gain and loss', () => {
    const { container, rerender } = render(<KpiTile label="רווח" value="+5" tone="positive" />);
    expect(container.querySelector('.kpi-tile')).toHaveClass('kpi-tone-positive');

    rerender(<KpiTile label="רווח" value="-5" tone="negative" />);
    expect(container.querySelector('.kpi-tile')).toHaveClass('kpi-tone-negative');
  });

  test('defaults to a neutral tone, since not every figure is better when larger', () => {
    const { container } = render(<KpiTile label="מס צפוי" value="1,200 ₪" />);
    expect(container.querySelector('.kpi-tile')).toHaveClass('kpi-tone-neutral');
  });

  // Only a tile that actually does something should be focusable or
  // announced as a control.
  test('is a button only when it is interactive', () => {
    const { container, rerender } = render(<KpiTile label="שווי" value="1" />);
    expect(container.querySelector('button')).toBeNull();

    const onClick = jest.fn();
    rerender(<KpiTile label="שווי" value="1" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalled();
  });

  test('the decorative glow and corner mark are hidden from assistive tech', () => {
    const { container } = render(<KpiTile label="שווי" value="1" icon="₪" />);
    expect(container.querySelector('.kpi-tile-glow')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('.kpi-tile-mark')).toHaveAttribute('aria-hidden', 'true');
  });

  // The change belongs beside the figure it qualifies, not under it as a
  // second statistic - so it renders inside the figure row.
  test('a badge sits with the figure and carries its own tone', () => {
    const { container } = render(
      <KpiTile label="שווי" value="1,000 ₪" badge="+4.2%" badgeTone="positive" />
    );
    const badge = container.querySelector('.kpi-tile-figure .kpi-tile-badge');
    expect(badge).not.toBeNull();
    expect(badge).toHaveTextContent('+4.2%');
    expect(badge).toHaveClass('is-positive');
  });

  test('no badge element at all when there is no change to state', () => {
    const { container } = render(<KpiTile label="שווי" value="1,000 ₪" />);
    expect(container.querySelector('.kpi-tile-badge')).toBeNull();
  });

  test('KpiRow groups tiles together', () => {
    const { container } = render(
      <KpiRow>
        <KpiTile label="a" value="1" />
        <KpiTile label="b" value="2" />
      </KpiRow>
    );
    expect(container.querySelectorAll('.kpi-row > .kpi-tile').length).toBe(2);
  });
});
