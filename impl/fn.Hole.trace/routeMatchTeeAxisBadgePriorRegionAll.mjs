/**
 * fn.Hole.trace / routeMatchTeeAxisBadgePriorRegionAll: routeMatch rule set (ports/s7route/match.mjs RULE_SETS.routeMatchTeeAxisBadgePriorRegionAll):
 * the pointer with EVERY route measure read as a hallway REGION (ports/s7route/regionSpace.mjs, sensor 'regionAll'); measured to place
 * bends worse than edges (the region support is flat along a bend axis), kept for wide testing.
 */
import { tracesOf, traceQueries, TRACE_CALLS } from '../../ports/s7trace/traceSpace.mjs';
import { RULE_SETS } from '../../ports/s7route/match.mjs';

export const reads = ['tk.s7.holes'];
export const calls = [...TRACE_CALLS];

export default function routeMatchTeeAxisBadgePriorRegionAll(parts) {
  return tracesOf(traceQueries(parts.call)('routeMatch', { rules: RULE_SETS.routeMatchTeeAxisBadgePriorRegionAll }), parts.get('tk.s7.holes'),
    { rule: 'routeMatch, rule set routeMatchTeeAxisBadgePriorRegionAll: every route measure (table, refine, sensor gates, second bend, placement) read as the hallway region' });
}
