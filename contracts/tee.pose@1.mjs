/**
 * contracts/tee.pose@1: when two Tee findings are the SAME tee.
 *
 * Geometric identity, not a key or a hash: two tee members (from any two
 * implementations of fn.Tee.findFamily, or any two runs) are the same tee
 * when their ring centers lie within centerPx of each other AND their frame
 * angles agree within angleDeg. Tolerances are Sam's default (2 px, 2 deg).
 *
 * Pose fields read (canonical S0-cropped raster frame):
 *   center:   [x, y]  ring center fitted by fn.Tee.detectRings
 *   angleRad: frame orientation fitted by the frame measurement
 * A frame's orientation is an AXIS, so angles are compared modulo pi
 * (a frame at -0.17 rad and one at pi - 0.17 rad are the same frame).
 *
 * Versioning: any change to a tolerance, a field, or the angle convention
 * is tee.pose@2, never an edit here. Every join records this address and
 * the tolerances it ran with. Browser-safe.
 */
import { defineContract } from '../fg/identity.mjs';

const DEG = 180 / Math.PI;

export const axisAngleDiffDeg = (a, b) => {
  let d = Math.abs(a - b) % Math.PI;
  if (d > Math.PI / 2) d = Math.PI - d;
  return d * DEG;
};

export default defineContract({
  id: 'tee.pose',
  version: 1,
  subject: 'Tee pose: ring center (px) and frame angle (axis, modulo pi), canonical raster frame',
  tolerances: { centerPx: 2, angleDeg: 2 },
  describe: 'Sam default: same tee iff |center_a - center_b| <= 2 px and axis angle difference <= 2 deg',
  compare(a, b, { centerPx, angleDeg }) {
    const centerDistPx = Math.hypot(a.center[0] - b.center[0], a.center[1] - b.center[1]);
    const angleDiffDeg = axisAngleDiffDeg(a.angleRad, b.angleRad);
    const ok = centerDistPx <= centerPx && angleDiffDeg <= angleDeg;
    // rank by the larger normalized difference (0 = identical pose)
    const score = Math.max(centerDistPx / (centerPx || 1), angleDiffDeg / (angleDeg || 1));
    return { ok, score, centerDistPx: Math.round(centerDistPx * 1e4) / 1e4, angleDiffDeg: Math.round(angleDiffDeg * 1e4) / 1e4 };
  }
});
