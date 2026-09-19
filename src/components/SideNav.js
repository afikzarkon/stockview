import React from 'react';
import ThemeToggleButton from './ThemeToggleButton';

// Inline SVG rather than an icon dependency or emoji: these inherit
// currentColor, so they follow the active/inactive and theme states for
// free, and they stay crisp at any size. An emoji would be neither.
const ICONS = {
  home: (
    <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z" />
  ),
  analysis: <path d="M4 20V10m5 10V4m5 16v-7m5 7V8" />,
  research: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-3.5-3.5" />
    </>
  )
};

export const NAV_ITEMS = [
  { key: 'home', label: 'בית', hint: 'התיק שלי' },
  { key: 'analysis', label: 'ניתוח תיק', hint: 'ביצועים ופיזור' },
  { key: 'research', label: 'חקר מניות', hint: 'בדיקת מניה' }
];

function NavIcon({ name }) {
  return (
    <svg
      className="side-nav-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}

// The app's primary navigation.
//
// A sidebar rather than a row of tabs: the nav is a fixed, short list that
// benefits from always being visible, and moving it out of the header frees
// the entire top edge for the CONTEXTUAL actions of whatever page is open
// (see PageToolbar). Those two things were previously competing for the
// same strip.
//
// On narrow screens it becomes a bottom bar - thumb-reachable, and it
// doesn't steal horizontal space a table needs.
function SideNav({ activePage, onNavigate, user, onLogout, theme, onToggleTheme }) {
  return (
    <nav className="side-nav" aria-label="ניווט ראשי">
      <div className="side-nav-brand">
        <span className="side-nav-mark" aria-hidden="true">
          ₪
        </span>
        <span className="side-nav-brand-text">StockView</span>
      </div>

      <ul className="side-nav-list">
        {NAV_ITEMS.map((item) => {
          const isActive = activePage === item.key;
          return (
            <li key={item.key}>
              <button
                type="button"
                className={`side-nav-link ${isActive ? 'active' : ''}`}
                onClick={() => onNavigate(item.key)}
                // The active page is a state, not just a style - a screen
                // reader has no way to see the highlight.
                aria-current={isActive ? 'page' : undefined}
                title={item.hint}
              >
                <NavIcon name={item.key} />
                <span className="side-nav-label">{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="side-nav-footer">
        <ThemeToggleButton theme={theme} onToggleTheme={onToggleTheme} />
        {user && (
          <div className="side-nav-user">
            <span className="side-nav-user-email" title={user.email}>
              {user.email}
            </span>
            <button type="button" className="side-nav-logout" onClick={onLogout}>
              התנתקות
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}

export default SideNav;
