/**
 * fn.Hole.trace / routeMatchKBends: routeMatch rule set (ports/s7route/match.mjs RULE_SETS.routeMatchKBends): the accepted rule set
 * (routeMatchTeeAxisBadgePrior) with the fair cost of ports/s7route/kbends.mjs: a route is as good as its weakest leg.
 */
import { tracesOf, traceQueries, TRACE_CALLS } from '../../ports/s7trace/traceSpace.mjs';
import { RULE_SETS } from '../../ports/s7route/match.mjs';

export const reads = ['tk.s7.holes'];
export const calls = [...TRACE_CALLS];

export default function routeMatchKBends(parts) {
  return tracesOf(traceQueries(parts.call)('routeMatch', { config: RULE_SETS.routeMatchKBends }), parts.get('tk.s7.holes'),
    { rule: 'routeMatch, rule set routeMatchKBends: routeMatchTeeAxisBadgePrior with the weakest-leg cost: the assignment on each cell\'s best K <= 1 route (first bend at or past the badge-at-0.57 point), then a K-bend chain from B* for a route the sensor rejects' });
}
