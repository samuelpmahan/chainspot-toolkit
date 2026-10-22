/**
 * fn.Hole.trace / routeMatchLeanBadgePrior: routeMatch rule set (ports/s7route/match.mjs RULE_SETS.routeMatchLeanBadgePrior): the route table's bend search from the
 * badge-midpoint rule (2026-10-20: the badge sits at the midpoint of the first leg on the annotated courses).
 */
import { tracesOf, traceQueries, TRACE_CALLS } from '../../ports/s7trace/traceSpace.mjs';
import { RULE_SETS } from '../../ports/s7route/match.mjs';

export const reads = ['tk.s7.holes'];
export const calls = [...TRACE_CALLS];

export default function routeMatchLeanBadgePrior(parts) {
  return tracesOf(traceQueries(parts.call)('routeMatch', { config: RULE_SETS.routeMatchLeanBadgePrior }), parts.get('tk.s7.holes'),
    { rule: 'routeMatch, rule set routeMatchLeanBadgePrior: lean table; after the bend placement the first bend moves to the badge midpoint B* when the sensor reads no worse' });
}
