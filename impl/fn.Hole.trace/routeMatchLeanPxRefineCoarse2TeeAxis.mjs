/**
 * fn.Hole.trace / routeMatchLeanPxRefineCoarse2TeeAxis: routeMatch rule set (ports/s7route/match.mjs RULE_SETS.routeMatchLeanPxRefineCoarse2TeeAxis): the pointer rule set
 * routeMatchLeanPxRefineCoarse2 plus: station floor in rC1px, second-bend search from a rejected straight route, first bend placed on the tee axis (heritage S7 bends; judged by the pointer vote like every rule set).
 */
import { tracesOf, traceQueries, TRACE_CALLS } from '../../ports/s7trace/traceSpace.mjs';
import { RULE_SETS } from '../../ports/s7route/match.mjs';

export const reads = ['tk.s7.holes'];
export const calls = [...TRACE_CALLS];

export default function routeMatchLeanPxRefineCoarse2TeeAxis(parts) {
  return tracesOf(traceQueries(parts.call)('routeMatch', { rules: RULE_SETS.routeMatchLeanPxRefineCoarse2TeeAxis }), parts.get('tk.s7.holes'),
    { rule: 'routeMatch, rule set routeMatchLeanPxRefineCoarse2TeeAxis: S6-straight holes straight, coordinate second bend, lean table, second bend on a coarse grid; station floor in rC1px, second-bend search from a rejected straight route, first bend placed on the tee axis' });
}
