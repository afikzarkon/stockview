import { computeValuationSpectrumLayout } from './valuationSpectrum';

describe('computeValuationSpectrumLayout', () => {
  test('fair value always sits at the center (50%), by definition', () => {
    const layout = computeValuationSpectrumLayout(569.6, 956.08);
    expect(layout.fairValuePosition).toBe(50);
  });

  test('matches the SimplyWall.st reference example: fair value $569.60, current price $956.08 -> ~67.9% overvalued', () => {
    const layout = computeValuationSpectrumLayout(569.6, 956.08);
    expect(layout.overvaluedPercent).toBeCloseTo(67.9, 1);
    expect(layout.isOvervalued).toBe(true);
    // current price is to the right of center (overvalued)
    expect(layout.currentPricePosition).toBeGreaterThan(50);
  });

  test('an undervalued stock (price below fair value) positions to the left of center', () => {
    const layout = computeValuationSpectrumLayout(100, 80); // 20% undervalued
    expect(layout.overvaluedPercent).toBeCloseTo(-20, 5);
    expect(layout.isOvervalued).toBe(false);
    expect(layout.currentPricePosition).toBeLessThan(50);
  });

  test('price exactly at fair value sits at the same center position as the fair value marker', () => {
    const layout = computeValuationSpectrumLayout(100, 100);
    expect(layout.overvaluedPercent).toBe(0);
    expect(layout.currentPricePosition).toBe(50);
  });

  test('the range expands to fit an extreme outlier rather than clipping it to the edge', () => {
    const layout = computeValuationSpectrumLayout(30, 950); // ~3067% overvalued
    expect(layout.range).toBeGreaterThan(2500);
    // still strictly inside the bar (not pinned to exactly 100%)
    expect(layout.currentPricePosition).toBeLessThan(100);
    expect(layout.currentPricePosition).toBeGreaterThan(50);
  });

  test('the range never shrinks below +-60% even for a price very close to fair value', () => {
    const layout = computeValuationSpectrumLayout(100, 101); // 1% overvalued
    expect(layout.range).toBe(60);
  });

  test('zone boundaries sit at the +-20% marks, inside the 0-100% bar', () => {
    const layout = computeValuationSpectrumLayout(100, 105);
    expect(layout.underZoneBoundaryPosition).toBeLessThan(50);
    expect(layout.overZoneBoundaryPosition).toBeGreaterThan(50);
    expect(layout.underZoneBoundaryPosition).toBeGreaterThanOrEqual(0);
    expect(layout.overZoneBoundaryPosition).toBeLessThanOrEqual(100);
  });

  test('returns null for a non-positive or missing fair value', () => {
    expect(computeValuationSpectrumLayout(0, 100)).toBeNull();
    expect(computeValuationSpectrumLayout(-5, 100)).toBeNull();
    expect(computeValuationSpectrumLayout(null, 100)).toBeNull();
  });

  test('returns null for a missing or negative current price', () => {
    expect(computeValuationSpectrumLayout(100, null)).toBeNull();
    expect(computeValuationSpectrumLayout(100, -1)).toBeNull();
  });

  test('a current price of exactly 0 is valid (not treated as missing)', () => {
    const layout = computeValuationSpectrumLayout(100, 0);
    expect(layout).not.toBeNull();
    expect(layout.overvaluedPercent).toBe(-100);
  });

  describe('label positions stay legible even when the true zone boundaries are close together', () => {
    test('for a mild deviation, where the true boundary is already well spread out, the label position matches it exactly', () => {
      const layout = computeValuationSpectrumLayout(100, 105); // 5% overvalued, well within the +-60% min range
      expect(layout.underZoneLabelPosition).toBeCloseTo(layout.underZoneBoundaryPosition, 5);
      expect(layout.overZoneLabelPosition).toBeCloseTo(layout.overZoneBoundaryPosition, 5);
    });

    test('for an extreme deviation (real observed case: ~3110% overvalued), the labels are pushed apart to a minimum readable gap instead of clustering at the true (near-center) boundary', () => {
      const layout = computeValuationSpectrumLayout(29.78, 956.08);
      // the true boundary is very close to center at this range...
      expect(Math.abs(layout.underZoneBoundaryPosition - 50)).toBeLessThan(2);
      expect(Math.abs(layout.overZoneBoundaryPosition - 50)).toBeLessThan(2);
      // ...but the label positions are still meaningfully spread out
      expect(50 - layout.underZoneLabelPosition).toBeGreaterThanOrEqual(14);
      expect(layout.overZoneLabelPosition - 50).toBeGreaterThanOrEqual(14);
    });

    test('label positions never sit closer to center than the true boundary (only ever pushed further out, never in)', () => {
      const layout = computeValuationSpectrumLayout(100, 105);
      expect(layout.underZoneLabelPosition).toBeLessThanOrEqual(layout.underZoneBoundaryPosition);
      expect(layout.overZoneLabelPosition).toBeGreaterThanOrEqual(layout.overZoneBoundaryPosition);
    });
  });
});
