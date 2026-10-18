/**
 * fn.q.pair.*: tee-to-badge pair math, written once behind the PxC boundary (docs/agents/boundary.md). Code outside asks
 * by Part address; register with registerQueries(store, PAIR_QUERIES) where the store is built. Every answer is { value,
 * unit }; registerQueries caches it by its arguments and profiles each call.
 *
 * Sam's S5 rule (DOCTRINE.md, S5): a tee's long axis points directly at its badge; the residual indicts the tee fit.
 *
 *   fn.q.pair.axisResidual({ center: [x, y], angleRad, target: [x, y] })
 *     the tee's long axis (an axis: angleRad modulo pi, oriented toward the target) against the ray from the tee centre
 *     to the target (the badge plate centre), canonical px:
 *       angleResidualDeg  deg, the angle between the axis and the ray (0 = the axis points straight at the target)
 *       signedPerpPx      px, the target's signed perpendicular offset from the axis line (+ = left of the axis
 *                         direction in image coordinates, y down: cross(u, target - centre))
 *       alongPx           px, the target's distance along the axis
 *       distancePx        px, tee centre to target
 *     The same definitions as the pinned S5 (ports/late/behavior/index.mjs signedAxis), so both variants' residuals
 *     compare directly. A non-finite input is a recorded data condition (value.unavailable), never a throw.
 */
const r3 = (v) => Math.round(v * 1000) / 1000;
const finitePoint = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);

export const PAIR_UNITS = Object.freeze({
  angleResidualDeg: 'deg (tee long axis to the ray tee centre -> badge plate centre)',
  signedPerpPx: 'px (badge plate centre to the tee axis line, signed: cross(axis, ray))',
  alongPx: 'px (badge plate centre along the tee axis)',
  distancePx: 'px (tee centre to badge plate centre)'
});

export function axisResidual({ center, angleRad, target }) {
  if (!finitePoint(center) || !finitePoint(target) || !Number.isFinite(angleRad)) return { unavailable: 'a tee centre, axis angle or target is not finite' };
  const dx = target[0] - center[0], dy = target[1] - center[1];
  let ux = Math.cos(angleRad), uy = Math.sin(angleRad);
  if (dx * ux + dy * uy < 0) { ux = -ux; uy = -uy; }
  const alongPx = dx * ux + dy * uy, signedPerpPx = -uy * dx + ux * dy;
  return {
    angleResidualDeg: r3((Math.atan2(Math.abs(signedPerpPx), Math.abs(alongPx)) * 180) / Math.PI),
    signedPerpPx: r3(signedPerpPx), alongPx: r3(alongPx), distancePx: r3(Math.hypot(dx, dy))
  };
}

export const PAIR_QUERIES = Object.freeze({
  'fn.q.pair.axisResidual': ({ center, angleRad, target }) => ({ value: axisResidual({ center, angleRad, target }), unit: Object.entries(PAIR_UNITS).map(([k, u]) => `${k}: ${u}`).join('; ') })
});
export const PAIR_CALLS = Object.freeze(Object.keys(PAIR_QUERIES));
