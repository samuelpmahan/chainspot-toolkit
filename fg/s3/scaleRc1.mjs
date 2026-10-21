/**
 * tk.scale.rC1: rC1px, the radius of the basket's C1 circle (a physical 10 m ring, so it follows the map), measured per image
 * from the S2 BasketPoints (LOCAL); the unit of every map-scaled bound (DOCTRINE: UDisc renders differently at different zooms).
 * One Calculation, registered by the early store before S3 (ports/early/earlyStore.mjs) and by any later store that needs the
 * map unit on the S3 board (the S5 residual profile's tee-to-badge assumption, ports/s5pair/residualProfile.mjs).
 */
import { ringScale, opaquePlane } from '../alpha/alphaSpace.mjs';
import { teeBounds } from './teeScale.mjs';

const BASKET_POINT_DOCTRINE = Object.freeze([0.34, 0.73]);   // DOCTRINE BasketPoint: px from the sprite's bottom-centre pixel
export const SCALE_RC1_PART = 'tk.scale.rC1';
export const SCALE_RC1_CALCULATION = Object.freeze(['fn.tk.scale.rC1', {
  inParts: ['px.image.cropped', 'px.badges', 'px.baskets'], outParts: [SCALE_RC1_PART],
  note: 'rC1px from the C1/C2 rings around every S2 BasketPoint (fg/alpha/alphaSpace.mjs ringScale), and the S3 tee bounds in it',
  calculate: (io) => {
    const img = io.in('px.image.cropped'), baskets = io.in('px.baskets');
    const centres = baskets.map(({ bbox: [x, y, w, h] }) => [x + (w - 1) / 2 + BASKET_POINT_DOCTRINE[0], y + h - 1 + BASKET_POINT_DOCTRINE[1]]);
    const fit = ringScale(img, centres, opaquePlane(img, [io.in('px.badges'), baskets]), { stepPx: 0.5, angleStepDeg: 2 });
    const r1Px = Number.isFinite(fit.r1Px) ? fit.r1Px : null;
    return { [SCALE_RC1_PART]: { r1Px, unit: 'px (C1 radius)', fit, tee: teeBounds(r1Px), condition: r1Px ? null : `rC1 not measured (${fit.reason ?? 'no fit'}): S3 keeps the pinned px bounds`, emits: { rC1Px: r1Px ?? -1, baskets: centres.length } } };
  }
}]);
