/**
 * fn.Hole.trace / routeMatchLeanPxRefineCoarse2StraightB2: routeMatch rule set (ports/s7route/match.mjs RULE_SETS.routeMatchLeanPxRefineCoarse2StraightB2): the pointer rule set
 * routeMatchLeanPxRefineCoarse2 plus: a straight contrast route the sensor rejects also gets the second-bend search, B1 seeded on the tee axis past the badge (heritage S7 bends; judged by the pointer vote like every rule set).
 */
import { tracesOf, traceQueries, TRACE_CALLS } from '../../ports/s7trace/traceSpace.mjs';
import { RULE_SETS } from '../../ports/s7route/match.mjs';

export const reads = ['tk.s7.holes'];
export const calls = [...TRACE_CALLS];

export default function routeMatchLeanPxRefineCoarse2StraightB2(parts) {
  return tracesOf(traceQueries(parts.call)('routeMatch', { config: RULE_SETS.routeMatchLeanPxRefineCoarse2StraightB2 }), parts.get('tk.s7.holes'),
    { rule: 'routeMatch, rule set routeMatchLeanPxRefineCoarse2StraightB2: S6-straight holes straight, coordinate second bend, lean table, second bend on a coarse grid; a straight contrast route the sensor rejects also gets the second-bend search, B1 seeded on the tee axis past the badge' });
}
