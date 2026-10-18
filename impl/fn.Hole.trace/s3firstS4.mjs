/**
 * fn.Hole.trace / s3firstS4: s3first plus what S4 recovers (Sam: "S1-S3 are a fast first pass, S4 recovers"): the
 * accepted S4 recovered tees seed their holes like S3 tees, and the S4 recovered baskets are BasketPoints a trace can
 * end on (their sprite box and rings masked like S2's).
 */
import { tracesOf, traceQueries, TRACE_CALLS } from '../../ports/s7trace/traceSpace.mjs';

export const reads = ['tk.s7.holes'];
export const calls = [...TRACE_CALLS];

export default function s3firstS4(parts) {
  return tracesOf(traceQueries(parts.call)('s3first', { s4: true }), parts.get('tk.s7.holes'),
    { rule: 's3first + S4: recovered tees as seeds, recovered baskets as endpoints' });
}
