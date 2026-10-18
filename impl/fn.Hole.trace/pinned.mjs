/**
 * fn.Hole.trace / pinned: the native late tracer (ports/s7.mjs: traceBadgeToBasket on fresh S6 heading hints, the
 * `--until 7` recipe with lane s5-axis-heading) as it ran, when the attempt has it; else every hole is `lane not run`.
 */
import { tracesOf, traceQueries, TRACE_CALLS, STATUS } from '../../ports/s7trace/traceSpace.mjs';

export const reads = ['tk.s7.holes'];
export const calls = [...TRACE_CALLS];

export default function pinned(parts) {
  const solve = traceQueries(parts.call)('pinned', {});
  const v = tracesOf(solve, parts.get('tk.s7.holes'), { rule: 'pinned native S7 tracer output, walks simplified at W / 4' });
  if (solve.condition) for (const t of v.traces) t.status = STATUS.laneNotRun;
  return v;
}
