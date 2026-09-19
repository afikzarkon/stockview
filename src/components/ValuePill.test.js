import { render, screen } from '@testing-library/react';
import ValuePill from './ValuePill';
import AssetCell from './AssetCell';
import ThemeToggleButton from './ThemeToggleButton';

describe('ValuePill', () => {
  test('carries the sign in the badge tone, not only in the text color', () => {
    const { rerender } = render(<ValuePill value={4.2}>+4.2%</ValuePill>);
    expect(screen.getByText('+4.2%')).toHaveClass('value-pill', 'is-positive');

    rerender(<ValuePill value={-1.8}>-1.8%</ValuePill>);
    expect(screen.getByText('-1.8%')).toHaveClass('is-negative');
  });

  // Zero is not a gain and not a loss - tinting it green would overstate a
  // flat position.
  test('treats zero and unusable values as neutral', () => {
    const { rerender } = render(<ValuePill value={0}>0.00%</ValuePill>);
    expect(screen.getByText('0.00%')).toHaveClass('is-neutral');

    rerender(<ValuePill value={null}>—</ValuePill>);
    expect(screen.getByText('—')).toHaveClass('is-neutral');

    rerender(<ValuePill value={NaN}>—</ValuePill>);
    expect(screen.getByText('—')).toHaveClass('is-neutral');
  });

  // The value drives the styling, the children the display - so a caller
  // can format however it likes without the tone drifting from the number.
  test('styles from the value while displaying whatever it is given', () => {
    render(
      <ValuePill value={-5} title="ירידה">
        ₪1,234-
      </ValuePill>
    );
    const pill = screen.getByText('₪1,234-');
    expect(pill).toHaveClass('is-negative');
    expect(pill).toHaveAttribute('title', 'ירידה');
  });

  test('accepts a numeric string, which is what the percentage helpers return', () => {
    render(<ValuePill value="3.50">3.50%</ValuePill>);
    expect(screen.getByText('3.50%')).toHaveClass('is-positive');
  });
});

describe('AssetCell', () => {
  test('renders the name and the identifier as separate lines', () => {
    const { container } = render(<AssetCell name="טבע" securityId="629014" />);
    expect(container.querySelector('.asset-cell-name').textContent).toBe('טבע');
    expect(container.querySelector('.asset-cell-id').textContent).toBe('629014');
  });

  // A US ticker already IS the asset's name; a second line repeating it
  // would be noise.
  test('omits the identifier line when it would only repeat the name', () => {
    const { container } = render(<AssetCell name="AAPL" securityId="AAPL" />);
    expect(container.querySelector('.asset-cell-id')).toBeNull();
  });

  test('omits the identifier line when there is none', () => {
    const { container } = render(<AssetCell name="AAPL" />);
    expect(container.querySelector('.asset-cell-id')).toBeNull();
  });

  test('renders a prefix (an expand toggle) ahead of the name', () => {
    const { container } = render(<AssetCell name="טבע" securityId="629014" prefix={<b>▶</b>} />);
    expect(container.querySelector('.asset-cell-name').textContent).toBe('▶טבע');
  });
});

describe('ThemeToggleButton', () => {
  // The state has to be readable without relying on which side the thumb
  // happens to be sitting on.
  test('exposes the active theme to assistive tech, not only by position', () => {
    const { rerender } = render(<ThemeToggleButton theme="dark" onToggleTheme={() => {}} />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('data-state', 'dark');
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveAccessibleName('עבור למצב בהיר');

    rerender(<ThemeToggleButton theme="light" onToggleTheme={() => {}} />);
    expect(button).toHaveAttribute('data-state', 'light');
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveAccessibleName('עבור למצב כהה');
  });

  test('shows both icons, marking the active one', () => {
    const { container } = render(<ThemeToggleButton theme="dark" onToggleTheme={() => {}} />);
    const icons = container.querySelectorAll('.theme-toggle-icon');
    expect(icons.length).toBe(2);
    expect(icons[0]).toHaveClass('is-active'); // moon, in dark mode
    expect(icons[1]).not.toHaveClass('is-active');
  });
});
