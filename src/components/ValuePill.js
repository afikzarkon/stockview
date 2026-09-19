import React from 'react';

// A return / change shown as a rounded badge rather than bare colored
// text.
//
// The tinted, bordered background carries the sign before the number is
// even read, which matters in a table where dozens of percentages compete
// for attention - color alone on plain text is easy to miss at a glance and
// is the first thing lost by anyone with a red/green deficiency. The badge
// keeps the color but adds shape and containment, so the figure reads as a
// discrete status.
//
// `value` drives the styling; `children` is what's displayed, so a caller
// can format however it likes (percentage, signed currency, or both).
function ValuePill({ value, children, title, className = '' }) {
  const numeric = Number(value);
  const tone = !Number.isFinite(numeric) || numeric === 0 ? 'is-neutral' : numeric > 0 ? 'is-positive' : 'is-negative';

  return (
    <span className={`value-pill ${tone} ${className}`.trim()} title={title}>
      {children}
    </span>
  );
}

export default ValuePill;
