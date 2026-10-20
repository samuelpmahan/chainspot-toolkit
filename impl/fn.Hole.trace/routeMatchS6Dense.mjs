/**
 * fn.Hole.trace / routeMatchS6Dense: routeMatch rule set (S6-straight holes drawn straight; the second bend on the dense grid). For the S7 pointer vote (Sam, 2026-10-20: "have a bunch of
 * possible rule sets so you can optimize over a wide batch"); ports/s7route/match.mjs MATCH_RULES.
 */
import { tracesOf, traceQueries, TRACE_CALLS } from '../../ports/s7trace/traceSpace.mjs';

export const reads = ['tk.s7.holes'];
export const calls = [...TRACE_CALLS];

export default function routeMatchS6Dense(parts) {
  return tracesOf(traceQueries(parts.call)('routeMatch', { rules: { straightFromS6: true, secondBendRefine: 'dense' } }), parts.get('tk.s7.holes'),
    { rule: 'routeMatch, rule set: S6-straight holes drawn straight; the second bend on the dense grid' });
}
