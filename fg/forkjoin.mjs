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
 *     part,               the slot's output Part, written on each branch
 *     implementations,    { name: impl } where impl is a function carrying
 *                         optional .reads / .calls, or { calculate, reads,
 *                         calls } (fg/discover.mjs discoverImplementations
 *                         loads impl/<slot>/<name>.mjs by convention, whose
 *                         `reads` / `calls` named exports declare them)
 *     restore,            () => board | store  a fresh provider board per
 *                         branch (e.g. store.call('fn.provider.restore.S3'));
 *                         never shared
 *     store?,             the parent PartStore: each branch is
 *                         store.branch(restore()), so toolkit Parts (the
 *                         testimony, the crop receipt) and registered
 *                         Calculations resolve through it while provider
 *                         reads resolve only against the branch's own board
 *     apply?,             (parts, impl, name) => value of `part`; default
 *                         impl(parts). parts is the implementation's scoped
 *                         view: get/has its declared reads, call its
 *                         declared calls, nothing else
 *     guarantees,         defineGuarantee values, run via runGuarantees
 *     only?, lanes?, sink?  passed through; the sink is scoped per branch
 *                         (artifact ids become '<slot>/<name>/<id>')
 *     compare,            ({ branches, frame }) => value; branches is
 *                         { name: { store, records, frames, error } } and
 *                         frame() emits a comparison frame
 *   })
 *   -> { slot, branches: { name: { records, frames, error } },
 *        comparison: { address: 'cmp.<slot>', slot, implementations,
 *                      value, sha256, frames } }
 *
 * Each implementation runs as the registered Calculation `slot` on its own
 * branch store (inParts = its reads, outParts = [part], calls = its calls),
 * so it is auto-instrumented like any Calculation, its output Part records
 * producedBy = slot, and an implementation that reaches for an undeclared
 * address or Calculation fails by name exactly like an FG.
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
import { createPartStore, isPartStore } from './store.mjs';
import { digest, plain } from './canon.mjs';

const implementationSpec = (impl, slot, name) => {
  const calculate = typeof impl === 'function' ? impl : impl?.calculate;
  if (typeof calculate !== 'function') throw new Error(`comparableForkJoin ${slot}: implementation ${name} is neither a function nor { calculate }`);
  return { calculate, reads: [...(impl.reads ?? [])], calls: [...(impl.calls ?? [])] };
};

export function comparableForkJoin({
  slot, part, implementations, restore, store = null, apply = (parts, impl) => impl(parts),
  guarantees, compare, only = null, lanes = [], sink = createMemorySink()
}) {
  if (typeof slot !== 'string' || !slot.startsWith('fn.')) throw new Error(`comparableForkJoin: slot ${JSON.stringify(slot)} is not a fn.* Calculation`);
  if (typeof part !== 'string' || !part) throw new Error(`comparableForkJoin ${slot}: part (the slot's output Part address) is required`);
  const names = Object.keys(implementations ?? {}).sort();
  if (names.length < 2) throw new Error(`comparableForkJoin ${slot}: needs at least two implementations, got ${names.length}`);
  if (typeof restore !== 'function' || typeof compare !== 'function') throw new Error(`comparableForkJoin ${slot}: restore and compare are required`);
  const parent = store ?? createPartStore({ name: slot });

  const live = {};
  for (const name of names) {
    const restored = restore();
    const branch = isPartStore(restored) ? restored : parent.branch(restored, { name: `${slot}/${name}` });
    const branchSink = scopeSink(sink, `${slot}/${name}`);
    const spec = implementationSpec(implementations[name], slot, name);
    try {
      branch.register(slot, {
        inParts: spec.reads, outParts: [part], calls: spec.calls, note: `implementation ${name}`,
        code: digest({ implementation: name, source: String(spec.calculate) }),   // the implementation's own code, not the wrapper's
        calculate: (io) => ({ [part]: apply(Object.freeze({ get: io.in, has: io.board.has, call: io.call }), spec.calculate, name) })
      });
      branch.call(slot, undefined, { caller: `forkjoin:${name}` });
    } catch (error) {
      live[name] = { store: branch, records: {}, frames: [], error: { stage: 'apply', guarantee: null, message: String(error?.message ?? error) } };
      continue;
    }
    try {
      const { records, frames } = runGuarantees({ guarantees, store: branch, sink: branchSink, only, lanes, branch: name });
      live[name] = { store: branch, records, frames, error: null };
    } catch (error) {
      if (!(error instanceof GuaranteeFailure)) throw error;
      live[name] = { store: branch, records: error.records ?? {}, frames: error.frames ?? [], error: { stage: 'guarantee', guarantee: error.guarantee, message: error.message } };
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
