/**
 * fn.Tee.recover / greedyOccludedNoBadgeRay: ablation of the badge-ray rule.
 * Identical to greedyOccluded (same template, occluders, scoring, greedy
 * ownership and cardinality stop) except theta is searched freely over
 * [0, 180) deg in 4 deg steps and refined, instead of being held within
 * 3 deg of the direction to the badge. The recovered tee's residual against
 * its badge ray is still recorded as evidence.
 */
import { SLOT_READS } from '../../ports/s4recover/teeRecover.mjs';
import { run } from './greedyOccluded.mjs';

export const reads = [...SLOT_READS];

export default function greedyOccludedNoBadgeRay(parts) { return run(parts, { badgeRay: false }); }
