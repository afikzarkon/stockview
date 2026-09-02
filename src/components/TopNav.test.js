import { render, screen, fireEvent } from '@testing-library/react';
import TopNav from './TopNav';

const noop = () => {};

function makeProps(overrides = {}) {
  return {
    activePage: 'home',
    onNavigate: noop,
    user: { email: 'test@example.com' },
    onLogout: noop,
    theme: 'dark',
    onToggleTheme: noop,
    ...overrides
  };
}

describe('TopNav', () => {
  test('renders the three nav links and marks the active one', () => {
    const { container } = render(<TopNav {...makeProps({ activePage: 'research' })} />);
    expect(screen.getByText('בית')).toBeInTheDocument();
    expect(screen.getByText('ניתוח תיק')).toBeInTheDocument();
    expect(screen.getByText('חקר מניות')).toBeInTheDocument();
    expect(screen.getByText('חקר מניות').className).toContain('active');
    expect(screen.getByText('בית').className).not.toContain('active');
    expect(container.querySelectorAll('.top-nav-link.active').length).toBe(1);
  });

  test('clicking a nav link calls onNavigate with that page key', () => {
    const onNavigate = jest.fn();
    render(<TopNav {...makeProps({ onNavigate })} />);
    fireEvent.click(screen.getByText('ניתוח תיק'));
    expect(onNavigate).toHaveBeenCalledWith('analysis');
    fireEvent.click(screen.getByText('חקר מניות'));
    expect(onNavigate).toHaveBeenCalledWith('research');
    fireEvent.click(screen.getByText('בית'));
    expect(onNavigate).toHaveBeenCalledWith('home');
  });

  test('shows the user email and calls onLogout when logout is clicked', () => {
    const onLogout = jest.fn();
    render(<TopNav {...makeProps({ onLogout })} />);
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    fireEvent.click(screen.getByText('התנתקות'));
    expect(onLogout).toHaveBeenCalled();
  });

  test('does not render the user email/logout when there is no user', () => {
    render(<TopNav {...makeProps({ user: null })} />);
    expect(screen.queryByText('test@example.com')).toBeNull();
    expect(screen.queryByText('התנתקות')).toBeNull();
  });

  test('the theme toggle reflects the current theme and calls onToggleTheme', () => {
    const onToggleTheme = jest.fn();
    const { rerender } = render(<TopNav {...makeProps({ theme: 'dark', onToggleTheme })} />);
    const button = screen.getByRole('button', { name: 'עבור למצב בהיר' });
    fireEvent.click(button);
    expect(onToggleTheme).toHaveBeenCalled();

    rerender(<TopNav {...makeProps({ theme: 'light', onToggleTheme })} />);
    expect(screen.getByRole('button', { name: 'עבור למצב כהה' })).toBeInTheDocument();
  });
});
