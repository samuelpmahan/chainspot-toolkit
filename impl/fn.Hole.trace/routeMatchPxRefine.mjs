/**
 * fn.Hole.trace / routeMatchPxRefine: routeMatch with one rule changed ( 'px' }:the 1-bend refine in E18's recorded px). A rule set for the S7 pointer vote
 * (Sam, 2026-10-20: "have a bunch of possible rule sets so you can optimize over a wide batch"); ports/s7route/match.mjs MATCH_RULES.
 */
import { tracesOf, traceQueries, TRACE_CALLS } from '../../ports/s7trace/traceSpace.mjs';

export const reads = ['tk.s7.holes'];
export const calls = [...TRACE_CALLS];

export default function routeMatchPxRefine(parts) {
  return tracesOf(traceQueries(parts.call)('routeMatch', { rules: { refineUnits }), parts.get('tk.s7.holes'),
    { rule: 'routeMatch, rule set:  'px' }:the 1-bend refine in E18's recorded px' });
}
