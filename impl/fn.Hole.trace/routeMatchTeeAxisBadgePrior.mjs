/**
 * fn.Hole.trace / routeMatchTeeAxisBadgePrior: routeMatch rule set (ports/s7route/match.mjs RULE_SETS.routeMatchTeeAxisBadgePrior): the route table's bend search from the
 * badge-midpoint rule (2026-10-20: the badge sits at the midpoint of the first leg on the annotated courses).
 */
import { tracesOf, traceQueries, TRACE_CALLS } from '../../ports/s7trace/traceSpace.mjs';
import { RULE_SETS } from '../../ports/s7route/match.mjs';

export const reads = ['tk.s7.holes'];
export const calls = [...TRACE_CALLS];

export default function routeMatchTeeAxisBadgePrior(parts) {
  return tracesOf(traceQueries(parts.call)('routeMatch', { rules: RULE_SETS.routeMatchTeeAxisBadgePrior }), parts.get('tk.s7.holes'),
    { rule: 'routeMatch, rule set routeMatchTeeAxisBadgePrior: lean table; station floor in rC1, second bend from a straight route, first bend fitted on the tee axis, then moved to the badge midpoint B* when the sensor reads no worse' });
}
