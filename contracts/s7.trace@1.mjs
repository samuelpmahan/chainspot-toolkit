/**
 * contracts/s7.trace@1: when two S7 path traces are the SAME trace.
 *
 * An S7 trace is a polyline the native tracer walked from a badge along a
 * heading hint. Its hitId is positional (it embeds the S5 tee index), and
 * two traces from slightly different headings can walk the same painted
 * path. Identity is therefore the walked GEOMETRY:
 *
 *   badgeLabel: the badge the trace leaves from (S1 label)
 *   path:       [[x, y], ...] the walked polyline (one shared frame)
 *
 * Same iff the badge label is the same, every vertex of each path lies
 * within ribbonPx of the other polyline (symmetric Hausdorff over vertices
 * to segments), and the endpoints are within endpointPx. The trace's
 * outcome (basket reached / petered out / ambiguous fork) is NOT identity;
 * a matched trace whose outcome differs is a verdict flip.
 * Versioning: any change is s7.trace@2. Browser-safe.
 */
import { defineContract } from '../fg/identity.mjs';

const r4 = (v) => Math.round(v * 1e4) / 1e4;
const MISMATCH = 1000;

export function pointToSegment([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
export function pointToPolyline(p, path) {
  if (path.length === 1) return Math.hypot(p[0] - path[0][0], p[1] - path[0][1]);
  let best = Infinity;
  for (let i = 1; i < path.length; i++) best = Math.min(best, pointToSegment(p, path[i - 1], path[i]));
  return best;
}
export function hausdorffPx(a, b) {
  let worst = 0;
  for (const p of a) worst = Math.max(worst, pointToPolyline(p, b));
  for (const p of b) worst = Math.max(worst, pointToPolyline(p, a));
  return worst;
}

export default defineContract({
  id: 's7.trace',
  version: 1,
  subject: 'S7 trace: badge label + walked polyline (px), symmetric vertex-to-polyline Hausdorff, one shared frame',
  tolerances: { ribbonPx: 4, endpointPx: 4 },
  describe: 'same trace iff same badge label, path_a within a 4 px ribbon of path_b and vice versa, and endpoints within 4 px',
  compare(a, b, { ribbonPx, endpointPx }) {
    const sameBadge = String(a.badgeLabel) === String(b.badgeLabel);
    if (!a.path.length || !b.path.length) return { ok: false, score: MISMATCH, sameBadge, hausdorffPx: null, endpointDistPx: null };
    const h = hausdorffPx(a.path, b.path);
    const ea = a.path.at(-1), eb = b.path.at(-1);
    const endpointDistPx = Math.hypot(ea[0] - eb[0], ea[1] - eb[1]);
    const ok = sameBadge && h <= ribbonPx && endpointDistPx <= endpointPx;
    const score = (sameBadge ? 0 : MISMATCH) + Math.max(h / (ribbonPx || 1), endpointDistPx / (endpointPx || 1));
    return { ok, score, sameBadge, hausdorffPx: r4(h), endpointDistPx: r4(endpointDistPx) };
  }
});
