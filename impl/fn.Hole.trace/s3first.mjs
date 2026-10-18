/**
 * fn.Hole.trace / s3first: the hallway solve in Sam's order, graduated from docs/evidence/s7main/s3first.py (identical
 * output on golden, lenard, townelake with the prototype's inputs: ports/s7trace/identity.mjs). S1-S3 only: the S3
 * association's tees, the S2 baskets; holes without a tee are seeded from their badge.
 */
import { tracesOf, traceQueries, TRACE_CALLS } from '../../ports/s7trace/traceSpace.mjs';

export const reads = ['tk.s7.holes'];
export const calls = [...TRACE_CALLS];

export default function s3first(parts) {
  return tracesOf(traceQueries(parts.call)('s3first', { s4: false }), parts.get('tk.s7.holes'),
    { rule: 'S3 first (Sam\'s order): W from tee -> badge, 3-point STRAIGHT verified, other tees traced from the cap, badge-only seeds; S2 baskets' });
}
