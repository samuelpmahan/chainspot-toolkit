/**
 * fn.Hole.trace / routeMatchLeanPxRefineCoarse2AxisB1: routeMatch rule set (ports/s7route/match.mjs RULE_SETS.routeMatchLeanPxRefineCoarse2AxisB1): the pointer rule set
 * routeMatchLeanPxRefineCoarse2 plus: the bend placement fits the first bend on the tee axis (heritage S7 bends; judged by the pointer vote like every rule set).
 */
import { tracesOf, traceQueries, TRACE_CALLS } from '../../ports/s7trace/traceSpace.mjs';
import { RULE_SETS } from '../../ports/s7route/match.mjs';

export const reads = ['tk.s7.holes'];
export const calls = [...TRACE_CALLS];

export default function routeMatchLeanPxRefineCoarse2AxisB1(parts) {
  return tracesOf(traceQueries(parts.call)('routeMatch', { rules: RULE_SETS.routeMatchLeanPxRefineCoarse2AxisB1 }), parts.get('tk.s7.holes'),
    { rule: 'routeMatch, rule set routeMatchLeanPxRefineCoarse2AxisB1: S6-straight holes straight, coordinate second bend, lean table, second bend on a coarse grid; the bend placement fits the first bend on the tee axis' });
}
