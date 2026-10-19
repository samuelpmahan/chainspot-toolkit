/**
 * fn.Hole.straight / segmentVerify: the graduated s7main straight-hole test (docs/evidence/s7main/s3first.py step 2,
 * `seg_fit`; Sam's order: tee -> badge -> 0-bend holes by the 3-point test -> verified as one segment). A MATCHING RULE over
 * tk.s6.pairFeatures (ports/s6straight/matching.mjs): the pair the 3-point rule calls STRAIGHT is verified as the single segment
 * tee cap -> its BasketPoint when the segment's edge step (tk.s6.feature.segment, fn.q.path.edgePair at W +- 1.5 px, centre
 * +- 1.5 px) is >= 6 lum/px. Verified -> straight (that basket); not verified, or not STRAIGHT by the 3-point test -> bent.
 */
import { segmentVerifyRule } from '../../ports/s6straight/matching.mjs';
import { SEGMENT_VERIFY } from '../../ports/s6straight/holeStraight.mjs';

export const reads = ['tk.s6.pairFeatures'];
export const calls = [];

export { SEGMENT_VERIFY };   // s3first.py seg_fit as called in step 2 (s3first.py lines 64-74): ports/s6straight/holeStraight.mjs

export default function segmentVerify(parts) { return segmentVerifyRule(parts.get('tk.s6.pairFeatures')); }
