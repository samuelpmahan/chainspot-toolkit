/**
 * contracts/s5.pair@1: when two S5 tee-to-badge ray pairings are the SAME
 * pairing.
 *
 * An S5 ray hit (px.s5.rayBadgeHits[], and the selected subset in
 * px.s5.globalAssignment) carries positional ids ('tee-clean-7',
 * 'badge-9') that are meaningless across branches: tee ids are indices
 * into that branch's tee list. Identity is geometric plus the badge's
 * label:
 *
 *   badgeLabel: the badge's hole read (S1 fact, the label Sam numbers by)
 *   teeCenter:  [x, y] the tee axis center the ray leaves from
 *   u:          [ux, uy] the unit ray DIRECTION (signed: a ray, not an axis)
 *
 * Same iff the badge label is the same, the tee centers are within
 * centerPx and the ray directions agree within angleDeg (mod 2 pi).
 * Versioning: any change is s5.pair@2. Browser-safe.
 */
import { defineContract } from '../fg/identity.mjs';

const DEG = 180 / Math.PI;
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const MISMATCH = 1000;

export const rayAngleDiffDeg = (u, v) => {
  let d = Math.abs(Math.atan2(u[1], u[0]) - Math.atan2(v[1], v[0])) % (2 * Math.PI);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return d * DEG;
};

export function comparePair(a, b, { centerPx, angleDeg }) {
  const sameBadge = String(a.badgeLabel) === String(b.badgeLabel);
  const centerDistPx = Math.hypot(a.teeCenter[0] - b.teeCenter[0], a.teeCenter[1] - b.teeCenter[1]);
  const angleDiffDeg = rayAngleDiffDeg(a.u, b.u);
  const ok = sameBadge && centerDistPx <= centerPx && angleDiffDeg <= angleDeg;
  const score = (sameBadge ? 0 : MISMATCH) + Math.max(centerDistPx / (centerPx || 1), angleDiffDeg / (angleDeg || 1));
  return { ok, score, sameBadge, centerDistPx: r4(centerDistPx), angleDiffDeg: r4(angleDiffDeg) };
}

export default defineContract({
  id: 's5.pair',
  version: 1,
  subject: 'S5 pairing: badge label + tee center (px) + signed ray direction, one shared frame',
  tolerances: { centerPx: 2, angleDeg: 2 },
  describe: 'same pairing iff same badge label, |teeCenter_a - teeCenter_b| <= 2 px and ray direction difference <= 2 deg',
  compare: comparePair
});
