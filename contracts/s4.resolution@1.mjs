/**
 * contracts/s4.resolution@1: when two S4 tee-to-hole resolutions are the
 * SAME resolution.
 *
 * A native S4 resolution (px.s4.teeBadge.state.resolutions[]) says "tee at
 * this center resolves hole n". Its `tee` field is an index into that
 * branch's px.tees, which is positional and shifts whenever an upstream
 * branch adds or removes a tee, so it is never compared. Identity is the
 * hole read (a badge label, an S1 fact) plus the tee's position:
 *
 *   hole:   integer hole read the resolution claims
 *   center: [x, y] the resolved tee center (one shared frame)
 *
 * Same iff the hole is the same and the centers are within centerPx.
 * Versioning: any change is s4.resolution@2. Browser-safe.
 */
import { defineContract } from '../fg/identity.mjs';

const r4 = (v) => Math.round(v * 1e4) / 1e4;
const MISMATCH = 1000;

export default defineContract({
  id: 's4.resolution',
  version: 1,
  subject: 'S4 resolution: hole read + resolved tee center (px), one shared frame',
  tolerances: { centerPx: 2 },
  describe: 'same resolution iff same hole read and |center_a - center_b| <= 2 px',
  compare(a, b, { centerPx }) {
    const centerDistPx = Math.hypot(a.center[0] - b.center[0], a.center[1] - b.center[1]);
    const sameHole = a.hole === b.hole;
    const ok = sameHole && centerDistPx <= centerPx;
    // A different hole is never the same resolution; the score stays finite
    // (ranking only) but is pushed past any geometric difference.
    const score = (sameHole ? 0 : MISMATCH) + centerDistPx / (centerPx || 1);
    return { ok, score, sameHole, centerDistPx: r4(centerDistPx) };
  }
});
