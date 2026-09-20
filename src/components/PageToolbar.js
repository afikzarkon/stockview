import React from 'react';

// The contextual action bar for whatever page is open: one sticky strip
// holding the page title, its actions, and its live status.
//
// Controls used to be scattered down the page - a save button in a bar at
// the very top, export and "add" in a header row below it, then edit-mode
// and column toggles buried in the middle between the summary and the
// tables, with three separate places reporting status. Finding an action
// meant remembering where on the page it lived.
//
// Three zones, in a deliberate order:
//   primary   - exactly one, the thing this page is FOR. Filled, accented.
//   secondary - view/filter/export. Outlined, visually quieter, so the
//               primary action is never competing with six others.
//   status    - passive feedback only, never a control.
//
// Sticky, so the actions stay reachable while scrolling a long table
// instead of requiring a trip back to the top.
function PageToolbar({ title, subtitle, primaryAction, secondaryActions, status, children }) {
  return (
    <div className="page-toolbar">
      <div className="page-toolbar-main">
        <div className="page-toolbar-heading">
          <h1 className="page-toolbar-title">{title}</h1>
          {subtitle && <p className="page-toolbar-subtitle">{subtitle}</p>}
        </div>

        <div className="page-toolbar-actions">
          {secondaryActions && <div className="page-toolbar-secondary">{secondaryActions}</div>}
          {primaryAction && <div className="page-toolbar-primary">{primaryAction}</div>}
        </div>
      </div>

      {status && <div className="page-toolbar-status">{status}</div>}
      {children}
    </div>
  );
}

// A secondary control in the toolbar. `pressed` drives both the visual
// state and aria-pressed, so a toggle that is ON is reported as on rather
// than only looking different.
export function ToolbarButton({ onClick, pressed, disabled, title, children }) {
  return (
    <button
      type="button"
      className={`toolbar-btn ${pressed ? 'is-pressed' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed === undefined ? undefined : Boolean(pressed)}
      title={title}
    >
      {children}
    </button>
  );
}

// The page's single primary action.
export function ToolbarPrimaryButton({ onClick, disabled, children }) {
  return (
    <button type="button" className="toolbar-btn-primary" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

// Passive status text. `tone` only affects color; it is never the sole
// carrier of meaning, since the text itself always says what happened.
export function ToolbarStatus({ tone = 'muted', children }) {
  return <span className={`toolbar-status toolbar-status-${tone}`}>{children}</span>;
}

export default PageToolbar;
