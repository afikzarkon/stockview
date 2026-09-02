import React from 'react';
import ThemeToggleButton from './ThemeToggleButton';

const NAV_ITEMS = [
  { key: 'home', label: 'בית' },
  { key: 'analysis', label: 'ניתוח תיק' },
  { key: 'research', label: 'חקר מניות' }
];

// One persistent header shown on every authenticated page - replaces the
// old pattern of each page independently owning its own "back to home"
// button/nav buttons (see HomeView.js's old main-buttons-container and
// PortfolioAnalysisView/StockResearchView's own back buttons, which stay
// as a harmless redundant second way back for now - see the plan doc for
// why ripping them out wasn't worth the extra risk this pass).
function TopNav({ activePage, onNavigate, user, onLogout, theme, onToggleTheme }) {
  return (
    <header className="top-nav">
      <div className="top-nav-inner">
        <span className="top-nav-brand">StockView</span>
        <nav className="top-nav-links">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`top-nav-link ${activePage === item.key ? 'active' : ''}`}
              onClick={() => onNavigate(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="top-nav-actions">
          <ThemeToggleButton theme={theme} onToggleTheme={onToggleTheme} />
          {user && (
            <>
              <span className="top-nav-user">{user.email}</span>
              <button type="button" className="top-nav-logout" onClick={onLogout}>
                התנתקות
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export default TopNav;
