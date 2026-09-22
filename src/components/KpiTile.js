import React from 'react';

// A headline figure, given its own tile.
//
// The portfolio summary is ~35 label/value rows across four sections - a
// wall that buries the three or four numbers someone actually opens the
// app to see (what is it worth, am I up, what moved today) among tax
// detail they read occasionally. Hoisting those few out as tiles is the
// cognitive-load fix; the detail stays, one scroll down.
//
// `tone` tints the figure and the tile's glow for gain/loss. It is applied
// from the value's own sign by the caller rather than guessed here, since
// not every figure is better when larger - a tax liability is not a gain.
// `featured` and `wide` are what make the row a bento rather than a strip
// of equal boxes: one figure is the reason the page is open and the rest
// qualify it, so the important one takes a block of the grid and prints
// its value several times larger. `wide` fills the remaining span on the
// second row, which is what keeps the block rectangular instead of
// leaving a hole beside the featured tile.
// `badge` sits on the same baseline as the figure rather than under it.
// A change belongs beside the number it qualifies: read as a line of its
// own it becomes a second statistic competing with the first, which is
// what a row of four equally-weighted lines looked like.
function KpiTile({
  label,
  value,
  sub,
  badge,
  badgeTone = 'neutral',
  tone = 'neutral',
  icon,
  onClick,
  title,
  featured,
  wide
}) {
  const Tag = onClick ? 'button' : 'div';

  const modifiers = [
    `kpi-tone-${tone}`,
    onClick ? 'is-interactive' : '',
    featured ? 'is-featured' : '',
    wide ? 'is-wide' : ''
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`kpi-tile ${modifiers}`}
      onClick={onClick}
      title={title}
    >
      <span className="kpi-tile-glow" aria-hidden="true" />
      {/* A watermark in the corner, not a bullet before the label: at the
          label's own size it read as part of the text and competed with
          it for the first glance. */}
      {icon && (
        <span className="kpi-tile-mark" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="kpi-tile-label">{label}</span>
      <span className="kpi-tile-figure">
        <span className="kpi-tile-value">{value}</span>
        {badge && <span className={`kpi-tile-badge is-${badgeTone}`}>{badge}</span>}
      </span>
      {sub && <span className="kpi-tile-sub">{sub}</span>}
    </Tag>
  );
}

export function KpiRow({ children }) {
  return <div className="kpi-row">{children}</div>;
}

export default KpiTile;
