/**
 * ComparableForkJoin (Sam's term; browser-safe).
 *
 * Fork one Calculation slot ('fn.X') into N competing implementations, run
 * each branch on its own freshly restored board under the SAME
 * FunctionalGuarantees, then join the branches with a comparator into a
 * comparison Part that emits its own frames. Parallel models on identical
 * inputs under identical guarantees is what makes the comparison direct:
 * every branch's record has the same shape, so a disagreement is in the
 * Parts, never in how they were checked.
 *
 *   comparableForkJoin({
 *     slot,               'fn.toy.findFamily'
 *     implementations,    { name: fn }  (fg/discover.mjs discoverImplementations
 *                         loads impl/<slot>/<name>.mjs by convention)
 *     restore,            () => board   a fresh board per branch (e.g.
 *                         restorePxC(stageSnapshots.S1)); never shared
 *     apply?,             (board, impl, name) => void; default impl(board)
 *     guarantees,         defineGuarantee values, run via runGuarantees
 *     only?, lanes?, sink?  passed through; the sink is scoped per branch
 *                         (artifact ids become '<slot>/<name>/<id>')
 *     compare,            ({ branches, frame }) => value; branches is
 *                         { name: { board, records, frames, error } } and
 *                         frame() emits a comparison frame
 *   })
 *   -> { slot, branches: { name: { records, frames, error } },
 *        comparison: { address: 'cmp.<slot>', slot, implementations,
 *                      value, sha256, frames } }
 *
 * A branch that throws (in apply, or a GuaranteeFailure) does not stop the
 * fork: its error is recorded as { stage: 'apply'|'guarantee', guarantee?,
 * message } with whatever records and frames it reached, and compare still
 * runs, because "implementation B fails fg.X" is itself a comparison
 * result. Branch frames are stamped branch: <name> at emission, so the
 * joined frame stream stays one flat flipbook.
 */
import { createFrameEmitter, GuaranteeFailure } from './guarantee.mjs';
import { runGuarantees } from './registry.mjs';
import { createMemorySink, scopeSink } from './sinks.mjs';
import { digest, plain } from './canon.mjs';

export function comparableForkJoin({
  slot, implementations, restore, apply = (board, impl) => impl(board),
  guarantees, compare, only = null, lanes = [], sink = createMemorySink()
}) {
  if (typeof slot !== 'string' || !slot.startsWith('fn.')) throw new Error(`comparableForkJoin: slot ${JSON.stringify(slot)} is not a fn.* Calculation`);
  const names = Object.keys(implementations ?? {}).sort();
  if (names.length < 2) throw new Error(`comparableForkJoin ${slot}: needs at least two implementations, got ${names.length}`);
  if (typeof restore !== 'function' || typeof compare !== 'function') throw new Error(`comparableForkJoin ${slot}: restore and compare are required`);

  const live = {};
  for (const name of names) {
    const board = restore();
    const branchSink = scopeSink(sink, `${slot}/${name}`);
    try {
      apply(board, implementations[name], name);
    } catch (error) {
      live[name] = { board, records: {}, frames: [], error: { stage: 'apply', guarantee: null, message: String(error?.message ?? error) } };
      continue;
    }
    try {
      const { records, frames } = runGuarantees({ guarantees, board, sink: branchSink, only, lanes, branch: name });
      live[name] = { board, records, frames, error: null };
    } catch (error) {
      if (!(error instanceof GuaranteeFailure)) throw error;
      live[name] = { board, records: error.records ?? {}, frames: error.frames ?? [], error: { stage: 'guarantee', guarantee: error.guarantee, message: error.message } };
    }
  }

  const address = `cmp.${slot}`;
  const emitter = createFrameEmitter({ fg: address });
  const value = plain(compare({ branches: live, frame: emitter.emit }));
  const branches = Object.fromEntries(names.map((n) => [n, { records: live[n].records, frames: live[n].frames, error: live[n].error }]));
  return {
    slot,
    branches,
    comparison: { address, slot, implementations: names, value, sha256: digest(value), frames: emitter.frames }
  };
}

/** Every frame of a fork-join, branches in name order then the comparison. */
export const forkJoinFrames = (result) => [
  ...Object.keys(result.branches).sort().flatMap((n) => result.branches[n].frames),
  ...result.comparison.frames
];
