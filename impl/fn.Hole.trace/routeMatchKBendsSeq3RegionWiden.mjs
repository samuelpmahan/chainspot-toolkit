/**
 * fn.Hole.trace / routeMatchKBendsSeq3RegionWiden: routeMatch rule set (ports/s7route/match.mjs RULE_SETS.routeMatchKBendsSeq3RegionWiden): the accepted rule set
 * with sequencing (ports/s7route/seq.mjs) and the weakest-leg cost of ports/s7route/kbends.mjs.
 */
import { tracesOf, traceQueries, TRACE_CALLS } from '../../ports/s7trace/traceSpace.mjs';
import { RULE_SETS } from '../../ports/s7route/match.mjs';

export const reads = ['tk.s7.holes'];
export const calls = [...TRACE_CALLS];

export default function routeMatchKBendsSeq3RegionWiden(parts) {
  return tracesOf(traceQueries(parts.call)('routeMatch', { rules: RULE_SETS.routeMatchKBendsSeq3RegionWiden }), parts.get('tk.s7.holes'),
    { rule: 'routeMatch, rule set routeMatchKBendsSeq3RegionWiden: sequencing (ports/s7route/seq.mjs): S6-straight holes claim the first forward basket on their tee ray; every other hole scores the top 3 ranks of its neighbourhood (unclaimed forward baskets by joint distance rank from its tee and from the next tee), widened to ranks 3-4 when its assigned route fails the sensor gate; region reads (ports/s7route/regionSpace.mjs): RegionGate under the weakest-leg cost, K-bend chains where the sensor rejects the K <= 1 route' });
}
