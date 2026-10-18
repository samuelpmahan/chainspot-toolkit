/**
 * fn.Hole.trace / endpoints (Sam, 2026-10-18: "the ABFeature era paired all badge -> basket endpoints and scored them
 * and THAT'S how it was able to assume known endpoints + work backwards"): every (badge, basket) pair scored by the
 * ribbon between them, assigned one-to-one by the provider's exact matcher, each hole traced back from its basket to
 * its badge; the tee -> badge leg is straight hallway. Baskets: S2 + S4 recovered.
 */
import { tracesOf, traceQueries, TRACE_CALLS } from '../../ports/s7trace/traceSpace.mjs';

export const reads = ['tk.s7.holes'];
export const calls = [...TRACE_CALLS];

export default function endpoints(parts) {
  return tracesOf(traceQueries(parts.call)('endpoints', {}), parts.get('tk.s7.holes'),
    { rule: 'endpoints: badge -> basket pairs scored by ribbon evidence, exact one-to-one matching (maximumWeightTeeBadgeMatching), traced back from the basket' });
}
