import React from 'react';

// The scroll container every data table lives in.
//
// A financial table is the one thing on the page that genuinely cannot
// reflow: a row is a set of figures that only mean anything read across,
// and a column only means anything read down. So it keeps its structure at
// every viewport - <table>/<thead>/<tbody>/<tr>/<td>, no card fallback -
// and the narrow screen is handled by letting it scroll sideways inside
// its own box rather than by taking it apart.
//
// Two things make that scroll usable, and both live in App.css because
// they are presentation:
//
//   * the first column is pinned to the inline-start edge, so whichever
//     metric you have scrolled to, you can still see whose it is;
//   * data cells never wrap, so a figure is never split across lines and
//     one long cell cannot set the height of its row.
//
// WHY A COMPONENT rather than a bare <div> at each call site: the
// accessibility wiring below is easy to leave out and invisible when it is
// missing. A scrollable region that is not focusable cannot be scrolled by
// keyboard at all - the content is simply unreachable without a mouse or a
// touchscreen - and an unlabelled region gives a screen-reader user no way
// to know what they have landed in. Having one component own that means no
// table can be added without it.
function ScrollableTable({
  // Names the region for assistive tech. Usually the same text as the
  // section heading above the table.
  label,
  // Applied to the <table>; the holdings tables use it to declare their
  // own minimum width (see .american-stocks-table).
  tableClassName = '',
  className = '',
  children
}) {
  return (
    <div
      className={`table-container ${className}`.trim()}
      // Focusable so the keyboard can reach and scroll it. role="region"
      // plus a label is what makes that focus stop announce itself as
      // something, rather than as an anonymous scrollable box.
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      <table className={`stocks-table ${tableClassName}`.trim()}>{children}</table>
    </div>
  );
}

export default ScrollableTable;
