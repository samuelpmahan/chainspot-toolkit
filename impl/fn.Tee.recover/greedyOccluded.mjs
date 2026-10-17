/**
 * fn.Tee.recover / greedyOccluded: Sam's "one model could greedily search
 * for occluded sprites". For each badge with no S3 tee (S3 tees are paired
 * to badges by the badge-ray rule), search pose (x, y, theta) of the
 * course's RIGID pad template (measured from the S3 anchors), with theta
 * held within 3 deg of the direction to that badge. A pose is scored only
 * on template px NOT covered by a known occluder (S1 badge px + mute, S2
 * basket px, S4 recovered basket boxes, S3 tees, tees already recovered,
 * and the translucent bluish path/C1/C2 overlay class); visible frame-white
 * and interior-grey px count for it, frame or interior px on unoccluded
 * background of the wrong class count against it (negative evidence), and
 * frame-white px just outside the pad count half against it. Greedy: the
 * best accepted pose over all pending badges is taken, its px owned, and
 * the search continues until the tee count reaches the badge cardinality N.
 *
 * parts -> { recovered: [tee], missed: [...], template, assignment, ... }
 * (ports/s4recover/teeRecover.mjs recoveredTee shape).
 */
import { SLOT_READS, createRecoveryContext, recoveryInputs, greedyRecover } from '../../ports/s4recover/teeRecover.mjs';

export const reads = [...SLOT_READS];

export const BADGE_RAY = true;

export function run(parts, { badgeRay }) {
  const ctx = createRecoveryContext(recoveryInputs(parts.get));
  const g = greedyRecover(ctx, { badgeRay });
  return {
    rule: badgeRay ? 'greedy occluded rigid template; theta within 3 deg of the badge ray' : 'greedy occluded rigid template; theta free (ablation of the badge-ray rule)',
    template: ctx.tpl, assignment: ctx.assignment, searchRadiusPx: ctx.searchRadiusPx, searchRule: ctx.searchRule,
    need: g.need, rounds: g.rounds, evaluatedPoses: g.evaluatedPoses,
    recovered: g.recovered, missed: g.missed, log: g.log
  };
}

export default function greedyOccluded(parts) { return run(parts, { badgeRay: BADGE_RAY }); }
