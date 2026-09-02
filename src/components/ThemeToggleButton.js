import React from 'react';

// Small standalone toggle, reused both inside TopNav (post-login) and
// on its own on AuthView (no user/pages yet, so no full nav there).
function ThemeToggleButton({ theme, onToggleTheme }) {
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      className="theme-toggle-button"
      onClick={onToggleTheme}
      aria-label={isDark ? 'עבור למצב בהיר' : 'עבור למצב כהה'}
      title={isDark ? 'מצב בהיר' : 'מצב כהה'}
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  );
}

export default ThemeToggleButton;
