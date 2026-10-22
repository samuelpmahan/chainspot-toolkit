/**
 * fn.Hole.trace / routeMatchBadgeMidPinned: routeMatch rule set (ports/s7route/match.mjs RULE_SETS.routeMatchBadgeMidPinned): the route table's bend search from the
 * badge-midpoint rule (2026-10-20: the badge sits at the midpoint of the first leg on the annotated courses).
 */
import { tracesOf, traceQueries, TRACE_CALLS } from '../../ports/s7trace/traceSpace.mjs';
import { RULE_SETS } from '../../ports/s7route/match.mjs';

export const reads = ['tk.s7.holes'];
export const calls = [...TRACE_CALLS];

export default function routeMatchBadgeMidPinned(parts) {
  return tracesOf(traceQueries(parts.call)('routeMatch', { config: RULE_SETS.routeMatchBadgeMidPinned }), parts.get('tk.s7.holes'),
    { rule: 'routeMatch, rule set routeMatchBadgeMidPinned: the first bend at the badge midpoint B* and kept there; the second bend searched with B1 = B*' });
}
