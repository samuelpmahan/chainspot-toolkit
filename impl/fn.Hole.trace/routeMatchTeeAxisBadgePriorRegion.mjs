/**
 * fn.Hole.trace / routeMatchTeeAxisBadgePriorRegion: routeMatch rule set (ports/s7route/match.mjs RULE_SETS.routeMatchTeeAxisBadgePriorRegion):
 * the pointer routeMatchTeeAxisBadgePrior with the assignment read as a hallway REGION (ports/s7route/regionSpace.mjs, sensor 'region').
 */
import { tracesOf, traceQueries, TRACE_CALLS } from '../../ports/s7trace/traceSpace.mjs';
import { RULE_SETS } from '../../ports/s7route/match.mjs';

export const reads = ['tk.s7.holes'];
export const calls = [...TRACE_CALLS];

export default function routeMatchTeeAxisBadgePriorRegion(parts) {
  return tracesOf(traceQueries(parts.call)('routeMatch', { config: RULE_SETS.routeMatchTeeAxisBadgePriorRegion }), parts.get('tk.s7.holes'),
    { rule: 'routeMatch, rule set routeMatchTeeAxisBadgePriorRegion: as routeMatchTeeAxisBadgePrior, but which basket each hole gets is decided by the region support (the band looks like the per-image hallway layer over what lies beside it) plus the on-axis prior; the routes and bends stay the edge table\'s' });
}
