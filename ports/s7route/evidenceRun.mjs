#!/usr/bin/env node
/**
 * Runner for the S7 evidence table: tk.s7.cellEvidence on a completed attempt (node-only; never re-runs the provider), and the S7
 * default beside its evidence sibling on the same store (the cells are one store call, shared).
 *
 *   node ports/s7route/evidenceRun.mjs --specimen golden --attempt ID [--attempts-root DIR] [--out DIR] [--no-cas] [--no-write]
 *
 * The store is the S7 runner's (ports/s7trace/bench.mjs): the attempt's S3 PxC as its board, S7's lane outputs as root inputs, the
 * S4 and S7 Calculations, the fn.q.trace.* queries; plus the evidence (ports/s7route/evidenceSpace.mjs registerEvidence). Writes
 * under <out> (default <repo>/attempts/s7evidence/<specimen>/run-<ISO time>/): tk.s7.cellEvidence.json, its render (img/ files,
 * hardlinked as tk.s7.cellEvidence.hole<N>.png), instrumentation.json. Prints the picks, the judged result of both rule sets when the
 * course has testimony, and the time of each part of the evidence (from the profile).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { instrumentedStore, profileSummary, hotSpotLines } from '../../fg/profile.mjs';
import { assumptionLines } from '../../fg/assumptions.mjs';
import { RENDER_PART } from '../../fg/store.mjs';
import { runnerCache, casFlag } from '../../fg/casRunner.mjs';
import { canonicalJson } from '../../fg/canon.mjs';
import { imageFiles } from '../../fg/node-flipbook.mjs';
import { loadAttemptParts } from '../s4recover/run.mjs';
import { S4_CALCULATIONS } from '../s4recover/teeRecover.mjs';
import { S7_CALCULATIONS, registerTraceQueries, tracesOf } from '../s7trace/traceSpace.mjs';
import { loadS7Lanes, loadMatcher } from '../s7trace/run.mjs';
import { loadHolePaths } from '../s7trace/holePaths.mjs';
import { judgeHoleTraces } from '../s7trace/judgeBends.mjs';
import { RULE_SETS, S7_DEFAULT } from './match.mjs';
import { registerEvidence, CELL_EVIDENCE_PART } from './evidenceSpace.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
export const EVIDENCE_VARIANT = 'routeMatchKBendsSeq3SearchWEvidence';

/** The S7 store on an attempt, with the evidence registered. */
export function evidenceStore({ specimen, attempt, attemptsRoot = ROOT, root = ROOT, cas = true }) {
  const loaded = loadAttemptParts({ attempt, specimen, root: attemptsRoot }), holePaths = loadHolePaths(specimen, root);
  const { store, document } = instrumentedStore({ name: `s7evidence:${specimen}`, base: loaded.board, ...runnerCache({ root, entry: import.meta.filename, cas }) });
  store.constant('fn.tk.s7trace.laneOutputs', { ...loaded.values, ...loadS7Lanes({ out: loaded.out, upperRowsRemoved: loaded.upperRowsRemoved, values: loaded.values }), 'testimony.source.holePaths': holePaths });
  for (const [fn, spec] of S4_CALCULATIONS) store.register(fn, spec);
  for (const [fn, spec] of S7_CALCULATIONS) store.register(fn, spec);
  registerTraceQueries(store, { matcher: loadMatcher(root), board: loaded.board });
  registerEvidence(store);
  return { store, document, holePaths, loaded };
}

/** A rule set's solve on the store, its traces and (testimony) its judged rows. */
export function solveOn(store, holePaths, rules, name) {
  const solve = store.call('fn.q.trace.routeMatch', { rules }).value;
  const traces = tracesOf(solve, store.get('tk.s7.holes'), { rule: name }).traces;
  const judged = holePaths?.path ? judgeHoleTraces(traces, holePaths, { widthPx: store.get('tk.s7.hallway').widthPx }) : null;
  return { solve, traces, judged };
}

/** The time of each evidence part, from the call log: the summed own time of each Calculation / query under tk.s7.cellEvidence. */
export function evidenceTimings(doc) {
  const bySeq = new Map(doc.calculations.map((e) => [e.seq, e])), under = (e, fn) => { for (let p = e; p; p = bySeq.get(p.parent)) if (p.calculation === fn) return true; return false; };
  const out = {};
  for (const e of doc.calculations) if (under(e, `fn.${CELL_EVIDENCE_PART}`)) { const k = e.calculation; out[k] = (out[k] ?? 0) + (e.selfMs ?? e.elapsedMs ?? 0); }
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round(v)]));
}

export function runEvidence({ specimen, attempt, attemptsRoot = ROOT, root = ROOT, outDir = null, cas = true, write = true, weights = null }) {
  const { store, document, holePaths } = evidenceStore({ specimen, attempt, attemptsRoot, root, cas });
  const out = outDir ?? join(root, 'attempts', 's7evidence', specimen, `run-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  const t0 = performance.now(), base = solveOn(store, holePaths, RULE_SETS[S7_DEFAULT], S7_DEFAULT), tDefault = performance.now() - t0;
  const t1 = performance.now(), ev = store.get(CELL_EVIDENCE_PART), tEvidence = performance.now() - t1;
  const t2 = performance.now(), sib = solveOn(store, holePaths, { ...RULE_SETS[EVIDENCE_VARIANT], ...(weights ? { evidenceWeights: weights } : {}) }, EVIDENCE_VARIANT), tSibling = performance.now() - t2;
  const doc = document(), profile = profileSummary(doc);
  const timingsMs = { default: Math.round(tDefault), cellEvidence: Math.round(tEvidence), siblingAfterEvidence: Math.round(tSibling), parts: evidenceTimings(doc), wall: Math.round(doc.wallMs) };
  const renders = [];
  if (write) {
    mkdirSync(out, { recursive: true });
    const { emits, ...value } = ev;
    writeFileSync(join(out, `${CELL_EVIDENCE_PART}.json`), canonicalJson({ specimen, attempt, ...value }) + '\n');
    const r = store.call(RENDER_PART, { a: CELL_EVIDENCE_PART, deflate: (b) => deflateSync(b) }).value, images = imageFiles(out);
    for (const p of r.parts) if (p.kind === 'raster' && p.data?.png) { const name = `${CELL_EVIDENCE_PART}.${p.address.split('#')[1]}.png`; images.alias(images.png(p.data.png).src, name); renders.push(join(out, name)); }
    writeFileSync(join(out, 'instrumentation.json'), JSON.stringify(document()) + '\n');
  }
  return { out, specimen, attempt, evidence: ev, base, sibling: sib, timingsMs, profile, renders, holePaths, R1Px: ev.R1Px, widthPx: ev.widthPx };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
  const specimen = arg('--specimen'), attempt = arg('--attempt');
  if (!specimen || !attempt) { console.error('usage: node ports/s7route/evidenceRun.mjs --specimen golden --attempt ID [--attempts-root DIR] [--out DIR] [--no-cas] [--no-write]'); process.exit(2); }
  const r = runEvidence({ specimen, attempt, attemptsRoot: arg('--attempts-root') ?? ROOT, outDir: arg('--out'), cas: casFlag(), write: !process.argv.includes('--no-write') });
  const T = (j) => (j ? `${j.totals.agree}/${j.totals.judged}, bends ${j.totals.bendsHit}/${j.totals.bendsMissed}/${j.totals.extraBends}` : 'no testimony');
  const ends = (s) => Object.fromEntries(Object.entries(s.solve.holes).map(([h, v]) => [h, v.end]));
  const eb = ends(r.base), es = ends(r.sibling);
  console.log(JSON.stringify({ out: r.out, emits: r.evidence.emits, changedPicks: r.evidence.changed, timingsMs: r.timingsMs,
    judged: { [S7_DEFAULT]: T(r.base.judged), [EVIDENCE_VARIANT]: T(r.sibling.judged) },
    basketsChanged: Object.keys(eb).filter((h) => eb[h] !== es[h]).map((h) => `${h}: ${eb[h]} -> ${es[h]}`),
    hotSpots: hotSpotLines(r.profile.hotSpots ?? []), assumptions: assumptionLines(r.profile.assumptions ?? []),
    profile: r.profile.slice(0, 10).map((p) => `${p.calculation}: ${p.calls}x self ${p.selfMs} ms total ${p.totalMs} ms`), renders: r.renders.length }, null, 1));
}
