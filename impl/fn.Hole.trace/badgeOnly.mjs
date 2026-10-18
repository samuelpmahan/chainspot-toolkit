/**
 * fn.Hole.trace / badgeOnly: every hole seeded from its badge (docs/evidence/s7edge/badgeseed.py): the ribbon through
 * the badge, its tee end (a visible pad on the line, or the cap hidden under a sprite), traced forward to a BasketPoint;
 * two holes never end on one BasketPoint (the weaker retries its next ribbon). Independent of the S3 association.
 */
import { tracesOf, traceQueries, TRACE_CALLS } from '../../ports/s7trace/traceSpace.mjs';

export const reads = ['tk.s7.holes'];
export const calls = [...TRACE_CALLS];

export default function badgeOnly(parts) {
  return tracesOf(traceQueries(parts.call)('badgeOnly', {}), parts.get('tk.s7.holes'), { rule: 'badge-only seeding (badgeseed.py), S2 baskets' });
}
