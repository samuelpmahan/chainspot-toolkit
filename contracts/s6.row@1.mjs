/**
 * contracts/s6.row@1: when two S6 two-ray rows are the SAME row.
 *
 * An S6 row (px.s6.twoRayRows[]) evaluates one S5 pairing against one
 * basket's predicted top. Its ids ('s6ray:tee-clean-6:plus:badge-9:
 * basket-clean-9') are positional in BOTH tees and baskets, so they shift
 * when either list changes upstream. Identity is the pairing under
 * contracts/s5.pair@1 plus the basket's geometry:
 *
 *   badgeLabel, teeCenter, u  as s5.pair@1
 *   templateTop: [x, y] the basket's predicted top the row tests against
 *
 * Same iff s5.pair@1 holds and the template tops are within topPx. The
 * row's status (zero-bend candidate or rejected) is NOT identity: two
 * branches that evaluate the same row differently disagree about it, and
 * the effect matrix reports that as a verdict flip on a matched row.
 * Versioning: any change is s6.row@2. Browser-safe.
 */
import { defineContract } from '../fg/identity.mjs';
import { comparePair } from './s5.pair@1.mjs';

const r4 = (v) => Math.round(v * 1e4) / 1e4;
const MISMATCH = 1000;

export default defineContract({
  id: 's6.row',
  version: 1,
  subject: 'S6 row: S5 pairing (s5.pair@1) + basket template top (px), one shared frame',
  tolerances: { centerPx: 2, angleDeg: 2, topPx: 2 },
  describe: 'same row iff s5.pair@1 holds (2 px, 2 deg) and |templateTop_a - templateTop_b| <= 2 px',
  compare(a, b, { centerPx, angleDeg, topPx }) {
    const pair = comparePair(a, b, { centerPx, angleDeg });
    const topDistPx = Math.hypot(a.templateTop[0] - b.templateTop[0], a.templateTop[1] - b.templateTop[1]);
    const ok = pair.ok && topDistPx <= topPx;
    const score = Math.max(pair.score, topDistPx / (topPx || 1) + (pair.sameBadge ? 0 : MISMATCH));
    return { ok, score, sameBadge: pair.sameBadge, centerDistPx: pair.centerDistPx, angleDiffDeg: pair.angleDiffDeg, topDistPx: r4(topDistPx) };
  }
});
