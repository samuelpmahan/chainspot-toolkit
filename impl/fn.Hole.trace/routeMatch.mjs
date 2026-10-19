/**
 * fn.Hole.trace / routeMatch (Sam, 2026-10-19: "start from 18x18 matching"; "assignment + bend refinement passes using
 * the hallway sensor"): scoring = tk.s7.routeTable (every hole x every basket, one cached row per hole), matching =
 * ports/s7route/match.mjs: one-to-one assignment on edge contrast + the on-axis prior, then straight / one bend / a
 * sensor-gated second bend. The graduated docs/evidence/s7after/match6.py (72/72 on the judged dev courses).
 */
import { tracesOf, traceQueries, TRACE_CALLS } from '../../ports/s7trace/traceSpace.mjs';

export const reads = ['tk.s7.holes'];
export const calls = [...TRACE_CALLS];

export default function routeMatch(parts) {
  return tracesOf(traceQueries(parts.call)('routeMatch', {}), parts.get('tk.s7.holes'),
    { rule: 'routeMatch: 18x18 edge contrast + on-axis prior, one-to-one; straight if the hallway sensor reads >= 0.75, else the refined contrast 1-bend route; a second bend only when the sensor reads it as hallway (>= 0.75, +0.15)' });
}
