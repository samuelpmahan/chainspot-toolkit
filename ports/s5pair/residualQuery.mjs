/**
 * fn.q.pair.residual: the S5 tee-axis residual, behind the PxC boundary (docs/agents/boundary.md). Code outside asks;
 * register with registerQueries(store, PAIR_QUERIES) where the store is built. Every answer is { value, unit };
 * registerQueries caches it by its arguments and profiles each call.
 *
 * Lane note (docs/agents/lanes-s5s7.md): the fn.q.pair.* family is the S5 learning half's (agent B, lane/s5). This is
 * the S5 stage's own minimal fn.q.pair.residual, with B's signature, so B's implementation replaces this table at
 * merge and nothing that calls it changes. No residual profile is built here.
 *
 * Sam's S5 rule (DOCTRINE.md, S5): a tee's long axis points directly at its badge; the residual indicts the tee fit.
 *
 *   fn.q.pair.residual({ center: [x, y], axis: [ux, uy], plate: [x, y] })
 *     center: the tee centre; axis: a unit vector along the tee's long axis (an axis: its sign is irrelevant, it is
 *     oriented toward the plate); plate: the badge plate centre. Canonical px:
 *       angleResidualDeg  deg, the angle between the axis and the ray centre -> plate (0 = pointing straight at it)
 *       signedPerpPx      px, the plate's signed perpendicular offset from the axis line, cross(axis, plate - centre)
 *                         with the axis oriented toward the plate (image coordinates, y down)
 *       alongPx           px, the plate's distance along the axis
 *       distancePx        px, tee centre to plate
 *     The pinned S5's definitions (ports/late/behavior/index.mjs signedAxis), so the variants' residuals compare.
 *     A non-finite input is a recorded data condition (value.unavailable), never a throw.
 */
const r3 = (v) => Math.round(v * 1000) / 1000;
const finitePoint = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);

export const PAIR_UNITS = Object.freeze({
  angleResidualDeg: 'deg (tee long axis to the ray tee centre -> badge plate centre)',
  signedPerpPx: 'px (badge plate centre to the tee axis line, signed: cross(axis, ray))',
  alongPx: 'px (badge plate centre along the tee axis)',
  distancePx: 'px (tee centre to badge plate centre)'
});

/** The unit axis of a pose angle (rad): what callers pass as `axis`. */
export const unitAxis = (angleRad) => [Math.cos(angleRad), Math.sin(angleRad)];

export function residual({ center, axis, plate }) {
  if (!finitePoint(center) || !finitePoint(plate) || !finitePoint(axis) || Math.hypot(axis[0], axis[1]) < 1e-9) return { unavailable: 'a tee centre, axis or plate centre is not finite' };
  const n = Math.hypot(axis[0], axis[1]), dx = plate[0] - center[0], dy = plate[1] - center[1];
  let ux = axis[0] / n, uy = axis[1] / n;
  if (dx * ux + dy * uy < 0) { ux = -ux; uy = -uy; }
  const alongPx = dx * ux + dy * uy, signedPerpPx = -uy * dx + ux * dy;
  return {
    angleResidualDeg: r3((Math.atan2(Math.abs(signedPerpPx), Math.abs(alongPx)) * 180) / Math.PI),
    signedPerpPx: r3(signedPerpPx), alongPx: r3(alongPx), distancePx: r3(Math.hypot(dx, dy))
  };
}

export const PAIR_QUERIES = Object.freeze({
  'fn.q.pair.residual': ({ center, axis, plate }) => ({ value: residual({ center, axis, plate }), unit: Object.entries(PAIR_UNITS).map(([k, u]) => `${k}: ${u}`).join('; ') })
});
export const PAIR_CALLS = Object.freeze(Object.keys(PAIR_QUERIES));
