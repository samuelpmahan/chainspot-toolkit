/**
 * fn.Hole.trace / routeMatchLeanCoarse2: routeMatch rule set (ports/s7route/match.mjs RULE_SETS.routeMatchLeanCoarse2): the route table's bend search
 * coarse-to-fine (Sam, 2026-10-20: an order of magnitude faster; judged by the pointer vote like every rule set).
 */
import { tracesOf, traceQueries, TRACE_CALLS } from '../../ports/s7trace/traceSpace.mjs';
import { RULE_SETS } from '../../ports/s7route/match.mjs';

export const reads = ['tk.s7.holes'];
export const calls = [...TRACE_CALLS];

export default function routeMatchLeanCoarse2(parts) {
  return tracesOf(traceQueries(parts.call)('routeMatch', { config: RULE_SETS.routeMatchLeanCoarse2 }), parts.get('tk.s7.holes'),
    { rule: 'routeMatch, rule set routeMatchLeanCoarse2: S6-straight holes straight, coordinate second bend, lean table, second bend on a coarse grid' });
}
