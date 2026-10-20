/**
 * S7 route-match bench (node-only): the same store the S7 runner builds, one rule set, no artifacts written. Prints the
 * profile (self time first, opaque hot spots) and, with --out FILE, the solve's holes (verts, how) to diff two code versions.
 *   node ports/s7trace/bench.mjs --specimen heritage --attempt ID [--variant routeMatchLeanPxRefineCoarse2] [--out FILE] [--root TOOLKIT]
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { instrumentedStore, profileSummary, hotSpotLines } from '../../fg/profile.mjs';
import { loadAttemptParts } from '../s4recover/run.mjs';
import { S4_CALCULATIONS } from '../s4recover/teeRecover.mjs';
import { S7_CALCULATIONS, registerTraceQueries } from './traceSpace.mjs';
import { loadHolePaths } from './holePaths.mjs';
import { loadS7Lanes, loadMatcher } from './run.mjs';
import { RULE_SETS } from '../s7route/match.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
export function benchRouteMatch({ specimen, attempt, variant = 'routeMatchLeanPxRefineCoarse2', root = ROOT }) {
  const loaded = loadAttemptParts({ attempt, specimen, root });
  const { store, document } = instrumentedStore({ name: `s7bench:${specimen}`, base: loaded.board });
  store.constant('fn.tk.s7trace.laneOutputs', { ...loaded.values, ...loadS7Lanes({ out: loaded.out, upperRowsRemoved: loaded.upperRowsRemoved, values: loaded.values }), 'testimony.source.holePaths': loadHolePaths(specimen, root) });
  for (const [fn, spec] of S4_CALCULATIONS) store.register(fn, spec);
  for (const [fn, spec] of S7_CALCULATIONS) store.register(fn, spec);
  registerTraceQueries(store, { matcher: loadMatcher(root), board: loaded.board });
  const t0 = performance.now();
  const r = store.call('fn.q.trace.routeMatch', { rules: RULE_SETS[variant] }).value;
  const ms = performance.now() - t0, doc = document();
  return { ms, holes: r.holes, profile: profileSummary(doc), doc };
}

if (import.meta.main ?? process.argv[1] === import.meta.filename) {
  const a = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map((s) => s.trim().split(/\s+/)));
  const b = benchRouteMatch({ specimen: a.specimen, attempt: a.attempt, variant: a.variant, ...(a.root ? { root: a.root } : {}) });
  console.log(`${a.specimen} ${a.variant ?? 'routeMatchLeanPxRefineCoarse2'}: routeMatch ${Math.round(b.ms)} ms (scene, hallway and table included)`);
  for (const r of b.profile.slice(0, 12)) console.log(`  ${String(Math.round(r.selfMs)).padStart(7)} ms self ${String(Math.round(r.totalMs)).padStart(7)} total  ${r.calls}x ${r.calculation}  ${Object.entries(r.emits).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  for (const l of hotSpotLines(b.profile.hotSpots)) console.log(`  ${l}`);
  if (a.out) writeFileSync(a.out, JSON.stringify(Object.fromEntries(Object.entries(b.holes).map(([h, v]) => [h, { end: v.end, verts: v.verts, how: v.how }])), null, 1) + '\n');
}
