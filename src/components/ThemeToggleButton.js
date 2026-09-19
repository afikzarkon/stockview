import React from 'react';

// Two-position theme switch, reused inside SideNav (post-login) and on its
// own on AuthView (no nav there yet).
//
// A track with a sliding thumb rather than a single icon that swaps: an
// icon alone is ambiguous - a sun could equally mean "you are in light
// mode" or "press for light mode". Showing both icons with the thumb
// resting on the active one removes that guess. The state is also exposed
// through aria-pressed so it isn't carried by position alone.
function ThemeToggleButton({ theme, onToggleTheme }) {
  const isDark = theme === 'dark';
  const label = isDark ? 'עבור למצב בהיר' : 'עבור למצב כהה';

  return (
    <button
      type="button"
      className="theme-toggle-button"
      data-state={isDark ? 'dark' : 'light'}
      onClick={onToggleTheme}
      aria-label={label}
      aria-pressed={!isDark}
      title={label}
    >
      <span className="theme-toggle-thumb" aria-hidden="true" />
      <span className="theme-toggle-icons" aria-hidden="true">
        <span className={`theme-toggle-icon ${isDark ? 'is-active' : ''}`}>🌙</span>
        <span className={`theme-toggle-icon ${!isDark ? 'is-active' : ''}`}>☀️</span>
      </span>
    </button>
  );
}

export default ThemeToggleButton;
