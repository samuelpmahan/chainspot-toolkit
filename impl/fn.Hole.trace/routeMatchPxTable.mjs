/**
 * fn.Hole.trace / routeMatchPxTable: routeMatch with the route table, the 1-bend refine and the second bend's search in the
 * prototypes' recorded px (everything as before the rC1px change). A rule set for the S7 pointer vote (Sam, 2026-10-20:
 * "have a bunch of possible rule sets so you can optimize over a wide batch"); ports/s7route/match.mjs MATCH_RULES.
 */
import { tracesOf, traceQueries, TRACE_CALLS } from '../../ports/s7trace/traceSpace.mjs';
import { RULE_SETS } from '../../ports/s7route/match.mjs';

export const reads = ['tk.s7.holes'];
export const calls = [...TRACE_CALLS];

export default function routeMatchPxTable(parts) {
  return tracesOf(traceQueries(parts.call)('routeMatch', { config: RULE_SETS.routeMatchPxTable }), parts.get('tk.s7.holes'),
    { rule: 'routeMatch, rule set: the table and the 1-bend refine in the recorded px' });
}
