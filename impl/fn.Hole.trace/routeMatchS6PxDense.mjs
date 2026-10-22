/**
 * fn.Hole.trace / routeMatchS6PxDense: routeMatch rule set (the recorded px rules with S6-straight holes drawn straight). For the S7 pointer vote (Sam, 2026-10-20: "have a bunch of
 * possible rule sets so you can optimize over a wide batch"); ports/s7route/match.mjs MATCH_RULES.
 */
import { tracesOf, traceQueries, TRACE_CALLS } from '../../ports/s7trace/traceSpace.mjs';
import { RULE_SETS } from '../../ports/s7route/match.mjs';

export const reads = ['tk.s7.holes'];
export const calls = [...TRACE_CALLS];

export default function routeMatchS6PxDense(parts) {
  return tracesOf(traceQueries(parts.call)('routeMatch', { config: RULE_SETS.routeMatchS6PxDense }), parts.get('tk.s7.holes'),
    { rule: 'routeMatch, rule set: the recorded px rules with S6-straight holes drawn straight' });
}
