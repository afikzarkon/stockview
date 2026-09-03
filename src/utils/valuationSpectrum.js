// Layout math for the SimplyWall.st-style "Share Price vs Fair Value"
// spectrum bar (StockResearchView.js) - kept separate from the component
// so the positioning is directly testable, matching this app's convention
// of pulling calculation logic out of JSX.
//
// The bar's axis is "% deviation of price from fair value" - fair value is
// fixed at the center (0%, by definition), and the current price is placed
// according to its own actual deviation. Green/amber/red zones sit at the
// +-20% boundaries (SimplyWall.st's own convention: "20% Undervalued" /
// "About Right" / "20% Overvalued"), and the visible range expands to fit
// an extreme outlier rather than clipping it off the edge of the bar.

const isFiniteNumber = (n) => typeof n === 'number' && Number.isFinite(n);

const ZONE_BOUNDARY_PERCENT = 20;
const MIN_RANGE_PERCENT = 60;
// The +-20% boundaries as a *position* only shrink toward the center as
// range grows (a very over/undervalued stock widens the range - see
// below), which can put the "20% Undervalued" / "About Right" / "20%
// Overvalued" text labels close enough together to overlap. The colored
// zones themselves stay mathematically accurate (see underZoneBoundaryPosition
// / overZoneBoundaryPosition); underZoneLabelPosition/overZoneLabelPosition
// are for the *text* only, pushed out to at least this far from center so
// the three labels stay legible even in an extreme case.
const MIN_LABEL_GAP_PERCENT = 14;

export function computeValuationSpectrumLayout(fairValuePerShare, currentPrice) {
  if (!isFiniteNumber(fairValuePerShare) || fairValuePerShare <= 0) return null;
  if (!isFiniteNumber(currentPrice) || currentPrice < 0) return null;

  const overvaluedPercent = ((currentPrice - fairValuePerShare) / fairValuePerShare) * 100;
  // at least +-60%, or just enough further to fit the actual point with
  // some breathing room, so a wildly over/undervalued stock still renders
  // on-bar instead of pinned to the very edge
  const range = Math.max(MIN_RANGE_PERCENT, Math.abs(overvaluedPercent) * 1.15);

  const toPosition = (deviationPercent) => {
    const clamped = Math.min(range, Math.max(-range, deviationPercent));
    return 50 + (clamped / range) * 50;
  };

  const underZoneBoundaryPosition = toPosition(-ZONE_BOUNDARY_PERCENT);
  const overZoneBoundaryPosition = toPosition(ZONE_BOUNDARY_PERCENT);

  return {
    overvaluedPercent,
    isOvervalued: overvaluedPercent >= 0,
    range,
    currentPricePosition: toPosition(overvaluedPercent),
    fairValuePosition: 50,
    underZoneBoundaryPosition,
    overZoneBoundaryPosition,
    underZoneLabelPosition: Math.min(underZoneBoundaryPosition, 50 - MIN_LABEL_GAP_PERCENT),
    overZoneLabelPosition: Math.max(overZoneBoundaryPosition, 50 + MIN_LABEL_GAP_PERCENT)
  };
}
