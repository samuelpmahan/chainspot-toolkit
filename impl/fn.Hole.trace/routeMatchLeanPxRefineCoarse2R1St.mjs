/**
 * fn.Hole.trace / routeMatchLeanPxRefineCoarse2R1St: routeMatch rule set (ports/s7route/match.mjs RULE_SETS.routeMatchLeanPxRefineCoarse2R1St): the pointer rule set
 * routeMatchLeanPxRefineCoarse2 plus: the station floor (straight read, second bend, placement gate) in rC1px, not 20 px (heritage S7 bends; judged by the pointer vote like every rule set).
 */
import { tracesOf, traceQueries, TRACE_CALLS } from '../../ports/s7trace/traceSpace.mjs';
import { RULE_SETS } from '../../ports/s7route/match.mjs';

export const reads = ['tk.s7.holes'];
export const calls = [...TRACE_CALLS];

export default function routeMatchLeanPxRefineCoarse2R1St(parts) {
  return tracesOf(traceQueries(parts.call)('routeMatch', { config: RULE_SETS.routeMatchLeanPxRefineCoarse2R1St }), parts.get('tk.s7.holes'),
    { rule: 'routeMatch, rule set routeMatchLeanPxRefineCoarse2R1St: S6-straight holes straight, coordinate second bend, lean table, second bend on a coarse grid; the station floor (straight read, second bend, placement gate) in rC1px, not 20 px' });
}
