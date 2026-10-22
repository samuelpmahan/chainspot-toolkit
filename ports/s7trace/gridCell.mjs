/**
 * One course of an S7 grid sweep (node-only): every config on ONE store, the way bench.mjs runs several rule sets, so the Parts all
 * configs read (the scene, the hallway, the route starts, S6's straight verdicts, the route tables, the first legs, the evidence)
 * are produced once and a config pays only for the steps it changes. Each config's solve is judged here and written as one cell
 * (attempts/sweeps/<id>/cells/<course>/<config hash>.json), keyed by the config hash and the code digest of this module's closure
 * (fg/closure.mjs): a cell with the same key is never recomputed (the sweep resumes), a code change recomputes every cell.
 *
 * Time per config x course (the runner measures its own calls, as bench.mjs does; nothing timed goes into a Part or a record):
 *   paidMs  the wall time this sweep paid for the config's routeMatch, after the configs before it on the same store;
 *   ownMs   what the config costs alone on a store whose shared Parts are produced: paidMs, minus the Parts produced on first need
 *           inside it (lazy productions: shared by every config), plus the answers it reused from configs before it (the
 *           sequencing's cells, the follower's steps: their cost when first computed). ownMs is the number the sweep ranks on;
 *   sharedMs (per task) the shared Parts: the attempt load, the warm-up and every lazy production.
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { instrumentedStore } from '../../fg/profile.mjs';
import { closureSha } from '../../fg/closure.mjs';
import { sha256Hex, canonicalJson } from '../../fg/canon.mjs';
import { loadAttemptParts } from '../s4recover/run.mjs';
import { S4_CALCULATIONS } from '../s4recover/teeRecover.mjs';
import { S7_CALCULATIONS, registerTraceQueries, tracesOf } from './traceSpace.mjs';
import { judgeHoleTraces } from './judgeBends.mjs';
import { loadHolePaths } from './holePaths.mjs';
import { loadS7Lanes } from './run.mjs';
import { routeTableOn } from '../s7route/routeSpace.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
export const CELL_SCHEMA = 's7-sweep-cell@1';
/** The code a cell's answer depends on: every module reachable from this one (the S7 solve, the S4/S7 Calculations, the judge). */
export const cellCodeDigest = (root = ROOT) => closureSha(['ports/s7trace/gridCell.mjs'], { root }).slice(0, 16);
export const cellPath = (dir, course, hash) => join(dir, 'cells', course, `${hash}.json`);
/** A recorded cell under the same config hash, code digest and attempt, or null. */
export function recordedCell(dir, { course, attempt, hash, codeDigest }) {
  const p = cellPath(dir, course, hash);
  if (!existsSync(p)) return null;
  try { const c = JSON.parse(readFileSync(p, 'utf8')); return c.codeDigest === codeDigest && c.attempt === attempt && c.configHash === hash ? c : null; } catch { return null; }
}

const r2 = (v) => Math.round(v * 100) / 100;
const lengthPx = (V) => (V?.length > 1 ? V.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - V[i][0], p[1] - V[i][1]), 0) : 0);
// the follower's steps and the sequencing's cells are answered from caches keyed by their arguments (traceSpace.mjs): a hit is
// credited with what the answer cost when it was computed
const REUSED = /^fn\.q\.(trace\.(seqCells|routeMatch)|match\.follow)/;

/** Wrap store.call so the runner sees each config's shared productions and reused answers (timing only; values untouched). */
function attribution(store) {
  const orig = store.call, frames = [], costs = new Map();
  store.call = (fn, args, opts) => {
    const lazy = typeof opts?.caller === 'string' && opts.caller.startsWith('lazy:'), key = REUSED.test(fn) ? `${fn} ${JSON.stringify(args ?? {})}` : null;
    const frame = { saved: 0, shared: 0 }; frames.push(frame);
    const t0 = performance.now();
    let r;
    try { r = orig(fn, args, opts); } catch (e) { frames.pop(); store.lastFrame = { dt: performance.now() - t0, ...frame }; throw e; }
    frames.pop();
    const dt = performance.now() - t0, parent = frames.at(-1) ?? null;
    if (key) { if (r?.emits?.cached === 1) frame.saved += costs.get(key) ?? 0; else costs.set(key, dt - frame.shared + frame.saved); }
    if (parent) { if (lazy) parent.shared += dt; else { parent.saved += frame.saved; parent.shared += frame.shared; } }
    else if (lazy) attribution.top.shared += dt;
    store.lastFrame = { dt, ...frame };
    return r;
  };
  return store;
}
attribution.top = { shared: 0 };

/** The store bench.mjs builds, on one attempt. */
export function courseStore({ specimen, attempt, root = ROOT }) {
  const loaded = loadAttemptParts({ attempt, specimen, root }), holePaths = loadHolePaths(specimen, root);
  const { store } = instrumentedStore({ name: `s7sweep:${specimen}`, base: loaded.board });
  store.constant('fn.tk.s7trace.laneOutputs', { ...loaded.values, ...loadS7Lanes({ out: loaded.out, upperRowsRemoved: loaded.upperRowsRemoved, values: loaded.values }), 'testimony.source.holePaths': holePaths });
  for (const [fn, spec] of S4_CALCULATIONS) store.register(fn, spec);
  for (const [fn, spec] of S7_CALCULATIONS) store.register(fn, spec);
  registerTraceQueries(store, { matcher: null, board: loaded.board });
  return { store: attribution(store), holePaths, board: loaded.board };
}

/**
 * Run configs ([{ hash, sparse, canonical }]: fg/config.mjs, over the store's declared args) on one course; every finished cell is written and passed to onCell. Configs already recorded
 * under the same key are skipped. -> { cells: n computed, skipped, sharedMs }
 */
export function runCourseCells({ specimen, attempt, configs, dir, root = ROOT, codeDigest = cellCodeDigest(root), onCell = () => {} }) {
  const todo = configs.filter((c) => !recordedCell(dir, { course: specimen, attempt, hash: c.hash, codeDigest }));
  if (!todo.length) return { cells: 0, skipped: configs.length, sharedMs: 0 };
  const t0 = performance.now();
  const { store, holePaths, board } = courseStore({ specimen, attempt, root });
  // the shared Parts, before any config is timed: the scene, the hallway, the route starts, S6's verdicts, each edge route table
  const holesPart = store.get('tk.s7.holes'), W = store.get('tk.s7.hallway').widthPx;
  store.get('tk.s7.sceneS4'); if (store.has('tk.s7.straight')) store.get('tk.s7.straight');
  const rm = (c) => c.canonical['fn.q.trace.routeMatch'];
  const tables = new Set(todo.filter((c) => rm(c).sensor === 'edge').map((c) => `${rm(c).tableUnits} ${rm(c).tableSearch}`));
  for (const t of tables) { const [units, search] = t.split(' '); routeTableOn(store, { board, units, search }); }
  attribution.top.shared = 0;
  const warmMs = performance.now() - t0;
  mkdirSync(join(dir, 'cells', specimen), { recursive: true });
  let n = 0;
  for (const c of todo) {
    let r = null, condition = null;
    try { r = store.call('fn.q.trace.routeMatch', { config: c.sparse }).value; } catch (e) { condition = `routeMatch threw: ${e?.message ?? e}`; }
    const f = store.lastFrame, paidMs = f.dt, ownMs = f.dt - f.shared + f.saved;
    const S = r ? store.get(r.scene ?? 'tk.s7.sceneS4') : null, R1 = S?.R1 ?? null;
    const traces = r ? tracesOf(r, holesPart, { rule: c.hash }).traces : [];
    const holes = Object.fromEntries(traces.map((t) => [t.hole, { end: r.holes?.[t.hole]?.end ?? null, basket: t.end?.basket ?? null, bends: t.path.length ? Math.max(0, t.path.length - 2) : null,
      lengthR1: R1 && t.path.length > 1 ? r2(lengthPx(t.path) / R1) : null, verts: t.path.map((p) => [r2(p[0]), r2(p[1])]) }]));
    const judged = r && holePaths.path ? judgeHoleTraces(traces, holePaths, { widthPx: W }) : null;
    // the stated assumptions this solve's searches hit (fg/assumptions.mjs), and the seqFirstRanks bound's widenings
    const violations = {};
    for (const v of r?.assumptions ?? []) { const x = violations[v.assumption] ??= { violated: 0, recovered: 0 }; x.violated++; if (v.recovered) x.recovered++; }
    const widened = r?.sequencing?.widened?.length ?? 0;
    if (widened) violations.seqFirstRanks = { violated: widened, recovered: widened, note: 'holes whose first ranks\' route failed the gate, re-solved over the remaining ranks (seqWiden)' };
    const cell = { schema: CELL_SCHEMA, course: specimen, attempt, configHash: c.hash, codeDigest, R1Px: R1, widthPx: W,
      routesDigest: sha256Hex(canonicalJson(Object.fromEntries(Object.entries(holes).map(([h, v]) => [h, [v.end, v.verts]])))).slice(0, 16),
      holes, judged: judged ? { totals: judged.totals, rows: judged.rows.filter((x) => x.judged).map((x) => ({ hole: x.hole, ok: x.ok, bendsHit: x.bendsHit ?? null, bendsMissed: x.bendsMissed ?? null, extraBends: x.extraBends ?? null })) } : null,
      sequencing: r?.sequencing ? { cellsEvaluated: r.sequencing.cellsEvaluated, cellsFullTable: r.sequencing.cellsFullTable, widened: r.sequencing.widened } : null,
      violations, ms: { paid: Math.round(paidMs), own: Math.round(ownMs) }, condition: condition ?? r?.condition ?? null };
    writeFileSync(cellPath(dir, specimen, c.hash), JSON.stringify(cell) + '\n');
    n++; onCell(cell);
  }
  return { cells: n, skipped: configs.length - todo.length, sharedMs: Math.round(warmMs + attribution.top.shared) };
}
