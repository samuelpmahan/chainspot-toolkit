/**
 * Profiling as a view over instrumentation, never code inside the work (browser-safe).
 *
 * The pattern (Sam, 2026-10-18: profiling, instrumentation and properties as reusable FunctionalGuarantee pieces):
 *   1. work worth measuring is a Calculation: the PartStore times every call (onCall) and copies the measures its
 *      output declares in `emits` onto the call's entry (fg/store.mjs emitsOf);
 *   2. a runner builds its store with instrumentedStore() and writes the sidecar with its document();
 *   3. profileSummary(doc) aggregates any sidecar per Calculation (calls, total / self ms, summed numeric emits) and
 *      profileFrame(summary) renders it as a ledger frame for any flipbook.
 * Elapsed times are nondeterministic, so they live in the sidecar and in frames, never in hashed records.
 */
import { createPartStore } from './store.mjs';

export const INSTRUMENTATION_CALLS = 'fn.tk.instrumentation.calls';

/** The calls made by `caller` (an FG id, an implementation, a Calculation) and everything nested under them. */
export function callSubtree(entries, caller) {
  const inTree = new Set();
  const sorted = [...entries].sort((a, b) => a.seq - b.seq);
  for (const e of sorted) if (e.caller === caller || (e.parent != null && inTree.has(e.parent))) inTree.add(e.seq);
  return sorted.filter((e) => inTree.has(e.seq));
}

/**
 * Any store whose calls are instrumented offers them back as one capability, so an FG property can read its own
 * profile through the same door it reads everything else: store.call / env.call.
 */
export function registerInstrumentation(store, entries) {
  store.register(INSTRUMENTATION_CALLS, { note: 'the instrumented calls made by args.caller and nested under them (sidecar data)',
    calculate: (io) => callSubtree(entries(), io.args?.caller ?? null).filter((e) => e.calculation !== INSTRUMENTATION_CALLS) });
}

const now = () => (globalThis.performance?.now ? globalThis.performance.now() : Date.now());

/** A PartStore whose every Calculation call lands in an instrumentation document (schema nctk-instrumentation@1). */
export function instrumentedStore({ name, base = null } = {}) {
  const calculations = [];
  const startedMs = now();
  const store = createPartStore({ name, base, onCall: (entry) => calculations.push({ ...entry }) });
  registerInstrumentation(store, () => calculations);
  return {
    store,
    document: () => ({ schema: 'nctk-instrumentation@1', wallMs: Math.round((now() - startedMs) * 1000) / 1000, ops: [], calculations: [...calculations].sort((a, b) => a.seq - b.seq), store: store.manifest() })
  };
}

/** Per Calculation: calls, total ms, self ms (minus nested calls), and the numeric emits summed over its calls. */
export function profileSummary(doc) {
  const rows = new Map(), childMs = new Map();
  for (const e of doc.calculations) if (e.parent != null) childMs.set(e.parent, (childMs.get(e.parent) ?? 0) + (e.elapsedMs ?? 0));
  for (const e of doc.calculations) {
    const r = rows.get(e.calculation) ?? { calculation: e.calculation, calls: 0, totalMs: 0, selfMs: 0, emits: {}, threw: 0 };
    r.calls++; r.totalMs += e.elapsedMs ?? 0; r.selfMs += (e.elapsedMs ?? 0) - (childMs.get(e.seq) ?? 0);
    if (e.status === 'threw') r.threw++;
    for (const [k, v] of Object.entries(e.emits ?? {})) if (typeof v === 'number') r.emits[k] = (r.emits[k] ?? 0) + v;
    rows.set(e.calculation, r);
  }
  const round = (v) => Math.round(v * 10) / 10;
  return [...rows.values()].map((r) => ({ ...r, totalMs: round(r.totalMs), selfMs: round(r.selfMs) })).sort((a, b) => b.selfMs - a.selfMs);
}

/** One ledger frame (fg/guarantee.mjs FRAME_KINDS) for a flipbook page. */
export function profileFrame(summary, { title = 'profile: every Calculation call, self time first', wallMs = null } = {}) {
  return {
    title: wallMs == null ? title : `${title} (wall ${Math.round(wallMs)} ms)`,
    calculation: 'fg.profile', tick: 'profile',
    parts: [{ address: 'tk.profile', kind: 'ledger', data: { rows: summary.map((r) => ({ calculation: r.calculation, calls: r.calls, selfMs: r.selfMs, totalMs: r.totalMs,
      emits: Object.entries(r.emits).map(([k, v]) => `${k} ${v}`).join(', '), threw: r.threw })) } }],
    verdicts: summary.filter((r) => r.threw).map((r) => ({ name: `${r.calculation} threw ${r.threw}x`, ok: false }))
  };
}
