/**
 * fn.Hole.straight / pathLoss: DOCTRINE S6 "objective path loss along tee to basket", alpha-informed: the loss profile
 * along tee -> basket (fn.q.path.loss, ports/s6straight/pathLoss.mjs, the lane's measurement half) against the
 * course-local path transparency learned on straight holes (tk.s6.pathLoss). A later variant (coordinator,
 * 2026-10-18: the existing straight tests graduate first): until its straight / bent rule on the loss profile is
 * given, every pair records 'lane not run' and the variant is excluded from acceptance. It asks nothing.
 */
import { verdictRow, LANE_NOT_RUN } from '../../ports/s6straight/holeStraight.mjs';

export const reads = ['tk.s6.holePairs'];
export const calls = [];
export const CONDITION = `${LANE_NOT_RUN}: pathLoss (alpha-informed) is a later variant; its straight / bent rule on the tk.s6.pathLoss profile is not given yet`;

export default function pathLoss(parts) {
  const verdicts = parts.get('tk.s6.holePairs').map((p) => verdictRow(p, 'unknown', { condition: CONDITION, evidence: { test: 'path loss' } }));
  return { rule: 'path loss along tee -> basket against the course-local straight-hole transparency profile (later variant)', verdicts, laneNotRun: verdicts.length > 0 };
}
