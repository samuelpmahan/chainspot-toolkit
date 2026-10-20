/**
 * Profiling as a view over instrumentation, never code inside the work (browser-safe).
 *
 * The pattern (Sam, 2026-10-18: profiling, instrumentation and properties as reusable FunctionalGuarantee pieces):
 *   1. work worth measuring is a Calculation: the PartStore times every call (onCall) and copies the measures its
 *      output declares in `emits` onto the call's entry (fg/store.mjs emitsOf);
 *   2. every store keeps its call log (a default property, fg/store.mjs); a runner writes it as the sidecar
 *      (instrumentedStore().document());
 *   3. profileSummary(doc) aggregates any sidecar per Calculation (calls, total / self ms, summed numeric emits) and
 *      profileFrame(summary) renders it as a ledger frame for any flipbook.
 * Elapsed times are nondeterministic, so they live in the sidecar and in frames, never in hashed records.
 */
import { createPartStore } from './store.mjs';

export { INSTRUMENTATION_CALLS, callSubtree } from './store.mjs';

/** Kept for runners written before profiling became a default: every store already offers its calls. */
export function registerInstrumentation() {}

const now = () => (globalThis.performance?.now ? globalThis.performance.now() : Date.now());

/** A PartStore whose every Calculation call lands in an instrumentation document (schema nctk-instrumentation@1). */
export function instrumentedStore({ name, base = null, cache, codeSalt = null } = {}) {
  const startedMs = now();
  const store = createPartStore({ name, base, ...(cache ? { cache } : {}), codeSalt });
  return {
    store,
    document: () => ({ schema: 'nctk-instrumentation@1', wallMs: Math.round((now() - startedMs) * 1000) / 1000, ops: [], calculations: store.calls().sort((a, b) => a.seq - b.seq), store: store.manifest() })
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
  const summary = [...rows.values()].map((r) => ({ ...r, totalMs: round(r.totalMs), selfMs: round(r.selfMs) })).sort((a, b) => b.selfMs - a.selfMs);
  // default property: every summary carries its opaque hot spots, and every profile page shows them (profileFrame)
  Object.defineProperty(summary, 'hotSpots', { value: opaqueHotSpots(doc), enumerable: false });
  return summary;
}

/**
 * Opaque hot spots: a Calculation or query whose own (self) time, outside its nested store calls, is a large share of the
 * run, so its inner steps never reach the profile. That is work happening outside the walled garden in all but name
 * (2026-10-20: routeMatch's second-bend search hid 53 s per course inside one query). The fix is to make its steps store
 * calls (queries or Calculations), each profiled. share: of the run's wall time (or, without one, of the summed root time).
 */
export const HOT_SPOT = Object.freeze({ share: 0.05, minMs: 1000 });
export function opaqueHotSpots(doc, { share = HOT_SPOT.share, minMs = HOT_SPOT.minMs } = {}) {
  // self time = elapsed minus the nested store calls: a call that makes some store calls can still hide most of its work
  // (routeMatch before 2026-10-20 fetched the route table through the store and spent 59 s more in plain functions)
  const calls = doc.calculations ?? [], childMs = new Map();
  for (const e of calls) if (e.parent != null) childMs.set(e.parent, (childMs.get(e.parent) ?? 0) + (e.elapsedMs ?? 0));
  const rootMs = calls.filter((e) => e.parent == null).reduce((s, e) => s + (e.elapsedMs ?? 0), 0);
  const runMs = doc.wallMs > 0 ? doc.wallMs : rootMs, by = new Map();
  for (const e of calls) {
    const r = by.get(e.calculation) ?? { calculation: e.calculation, calls: 0, selfMs: 0 };
    r.calls++; r.selfMs += (e.elapsedMs ?? 0) - (childMs.get(e.seq) ?? 0); by.set(e.calculation, r);
  }
  return [...by.values()].filter((r) => r.selfMs >= minMs && runMs > 0 && r.selfMs / runMs >= share)
    .map((r) => ({ ...r, selfMs: Math.round(r.selfMs), shareOfRun: Math.round((r.selfMs / runMs) * 1000) / 1000,
      fix: 'its own time is spent outside any nested store call, so the profile cannot see its steps: make each step a store query or Calculation' }))
    .sort((a, b) => b.selfMs - a.selfMs);
}
/**
 * The profile as text (pxc profile, the runners' stderr): wall time, time inside store calls and outside them (outside = not
 * itemised), the costliest Calculations by self time with their emits, then the opaque hot spots.
 */
export function profileLines(doc, { top = 8, title = null } = {}) {
  const calls = doc.calculations ?? [], rootMs = calls.filter((e) => e.parent == null).reduce((s, e) => s + (e.elapsedMs ?? 0), 0);
  const wall = doc.wallMs > 0 ? doc.wallMs : null, s = (ms) => `${(ms / 1000).toFixed(1)} s`, summary = profileSummary(doc);
  const out = [`${title ? `${title}: ` : ''}${wall == null ? 'wall not recorded' : `wall ${s(wall)}`}, inside store calls ${s(rootMs)}${wall == null ? '' : `, outside ${s(Math.max(0, wall - rootMs))} (${Math.round((100 * Math.max(0, wall - rootMs)) / wall)}%: not itemised)`}${doc.processMs > 0 ? `; process ${s(doc.processMs)} (module loading included)` : ''}; ${calls.length} calls`];
  for (const r of summary.slice(0, top)) out.push(`  ${String(Math.round(r.selfMs)).padStart(7)} ms self ${String(Math.round(r.totalMs)).padStart(7)} ms total  ${r.calls}x ${r.calculation}${Object.keys(r.emits).length ? `  (${Object.entries(r.emits).map(([k, v]) => `${k} ${Math.round(v * 100) / 100}`).join(', ')})` : ''}`);
  for (const l of hotSpotLines(summary.hotSpots)) out.push(`  ${l}`);
  return out;
}
export const hotSpotLines = (spots) => spots.map((h) => `OPAQUE HOT SPOT ${h.calculation}: ${h.calls}x ${h.selfMs} ms (${Math.round(h.shareOfRun * 100)}% of the run) of its own time; ${h.fix}`);

/** One ledger frame (fg/guarantee.mjs FRAME_KINDS) for a flipbook page. */
export function profileFrame(summary, { title = 'profile: every Calculation call, self time first', wallMs = null, hotSpots = summary.hotSpots ?? [] } = {}) {
  return {
    title: wallMs == null ? title : `${title} (wall ${Math.round(wallMs)} ms)`,
    calculation: 'fg.profile', tick: 'profile',
    parts: [{ address: 'tk.profile', kind: 'ledger', data: { rows: summary.map((r) => ({ calculation: r.calculation, calls: r.calls, selfMs: r.selfMs, totalMs: r.totalMs,
      emits: Object.entries(r.emits).map(([k, v]) => `${k} ${v}`).join(', '), threw: r.threw })) } }],
    verdicts: [...summary.filter((r) => r.threw).map((r) => ({ name: `${r.calculation} threw ${r.threw}x`, ok: false })),
      ...hotSpots.map((h) => ({ name: `opaque hot spot: ${h.calculation} ${h.selfMs} ms (${Math.round(h.shareOfRun * 100)}% of the run) of its own time, not itemised in the store`, ok: false }))]
  };
}
