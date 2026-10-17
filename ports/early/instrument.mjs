/**
 * Runner auto-instrumentation (toolkit layer).
 *
 * Sam's rule (2026-10-17): every Calculation should be auto-instrumented by
 * the runtime, execution time measured automatically on every run's receipt,
 * with a channel for a Calculation to auto-emit other basic measures; the
 * most basic receipt fields should be automatic by construction, not
 * hand-written per Calculation.
 *
 * This module is that machinery for the compiled-plan op executions the
 * toolkit runner performs itself (ports/early/runEarly.mjs). Each execution
 * goes through executePlanInstrumented, which:
 *   - times the execution with performance.now();
 *   - after execution, reads each op's produced Parts from the board: if a
 *     produced Part is an object carrying an `emits` field whose value is a
 *     plain object of measures, the runner copies that object verbatim
 *     (JSON round-trip, detached from the board value) into the op's entry.
 *     That is the emit channel: a Calculation declares its measures on its
 *     output Part, and the runner receipts them without the Calculation
 *     knowing anything about receipts;
 *   - appends one entry per op: { site, op, calculation, calculations,
 *     elapsedMs, timingScope, emits }, where `calculation` is the op's
 *     single declared Calculation name (null when the op declares zero or
 *     several; the full list is always in `calculations`).
 *
 * The record is written as a SIDECAR (instrumentation.json) beside
 * run.receipt.json, never inside the receipt: elapsed times are
 * nondeterministic, the receipt's bytes are hashed into attempt evidence,
 * and hashed content must stay reproducible. The sidecar joins the attempt
 * evidence as its own new file; no existing artifact, snapshot, or receipt
 * byte changes because this module exists.
 *
 * Every Calculation call (Sam's "auto-instrument every Calculation"): the
 * run's PartStore (fg/store.mjs, built by ports/early/earlyStore.mjs) calls
 * the onCall hook once per invocation of any registered fn.* Calculation,
 * whoever invokes it (an FG, a fork-join implementation, a lazy Part read,
 * the provider's own stage contract through the gateway wrapper, another
 * Calculation). Each entry lands in `calculations` as { seq, parent, depth,
 * calculation, store, caller, site, inParts, outParts, elapsedMs, status,
 * error }: entry/exit in seq/parent/depth, the declared Part traffic in
 * inParts/outParts, the time in elapsedMs. The document also carries the
 * store manifest (every toolkit Part with its producedBy and inParts, every
 * registered Calculation). Same sidecar, same reason: never hashed.
 *
 * timingScope is 'op' when the plan carries exactly one op (every plan the
 * early runner executes today). For a multi-op plan the whole call is timed
 * once and every op entry carries that elapsed time with timingScope
 * 'plan', rather than the runner inventing per-op numbers it did not
 * measure.
 */
import { performance } from 'node:perf_hooks';

export function createInstrumentation() {
  const ops = [];
  const calculations = [];
  return {
    ops,
    calculations,
    document({ store = null } = {}) {
      return { schema: 'nctk-instrumentation@1', ops, calculations: [...calculations].sort((a, b) => a.seq - b.seq), ...(store ? { store } : {}) };
    }
  };
}

const roundMs = (ms) => Math.round(ms * 1000) / 1000;

function readEmits(board, op) {
  const produces = Array.isArray(op.produces) ? op.produces : (op.produces ? [op.produces] : []);
  for (const address of produces) {
    let value;
    try { value = typeof board.has === 'function' && board.has(address) ? board.get(address) : undefined; }
    catch { value = undefined; }
    if (value && typeof value === 'object' && !Array.isArray(value)
      && Object.prototype.hasOwnProperty.call(value, 'emits')
      && value.emits && typeof value.emits === 'object' && !Array.isArray(value.emits)) {
      return JSON.parse(JSON.stringify(value.emits));
    }
  }
  return null;
}

export function executePlanInstrumented(instrumentation, site, executeCompiledPlan, plan, board, ...rest) {
  const started = performance.now();
  const ticks = executeCompiledPlan(plan, board, ...rest);
  const elapsedMs = roundMs(performance.now() - started);
  const timingScope = plan.ops.length === 1 ? 'op' : 'plan';
  for (const op of plan.ops) {
    instrumentation.ops.push({
      site,
      op: op.id,
      calculation: Array.isArray(op.calculations) && op.calculations.length === 1 ? op.calculations[0] : null,
      calculations: op.calculations ?? [],
      elapsedMs,
      timingScope,
      emits: readEmits(board, op)
    });
  }
  return ticks;
}
