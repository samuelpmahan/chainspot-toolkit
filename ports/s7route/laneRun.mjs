#!/usr/bin/env node
/**
 * Runner for the S7 lane cross-check: tk.s7.laneCrosscheck on a completed attempt (node-only; never re-runs the provider).
 *
 *   node ports/s7route/laneRun.mjs --specimen golden --attempt ID [--attempts-root DIR] [--out DIR] [--no-cas]
 *
 * The store is the S7 runner's (ports/s7trace/bench.mjs): the attempt's S3 PxC as its board, S7's lane outputs as root inputs,
 * the S4 and S7 Calculations and the fn.q.trace.* queries; plus the lane queries and Calculations (ports/s7route/laneSpace.mjs).
 * Writes under <out> (default <repo>/attempts/s7lanes/<specimen>/run-<ISO time>/): tk.s7.laneCrosscheck.json, its render
 * (img/ files, hardlinked as tk.s7.laneCrosscheck.<panel>.png: the course, one crop per flagged hole), instrumentation.json.
 * Prints the verdicts per variant and each variant's time (the profile's total for fn.tk.s7.laneTracksFour / Three).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { instrumentedStore, profileSummary, hotSpotLines } from '../../fg/profile.mjs';
import { assumptionLines } from '../../fg/assumptions.mjs';
import { RENDER_PART, registerQueries } from '../../fg/store.mjs';
import { runnerCache, casFlag } from '../../fg/casRunner.mjs';
import { canonicalJson } from '../../fg/canon.mjs';
import { imageFiles } from '../../fg/node-flipbook.mjs';
import { loadAttemptParts } from '../s4recover/run.mjs';
import { S4_CALCULATIONS } from '../s4recover/teeRecover.mjs';
import { S7_CALCULATIONS, registerTraceQueries } from '../s7trace/traceSpace.mjs';
import { loadS7Lanes, loadMatcher } from '../s7trace/run.mjs';
import { loadHolePaths } from '../s7trace/holePaths.mjs';
import { registerLanes, LANE_CROSSCHECK_PART, LANE_TRACKS_PART } from './laneSpace.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');

export function runLaneCrosscheck({ specimen, attempt, attemptsRoot = ROOT, root = ROOT, outDir = null, cas = true, write = true }) {
  const loaded = loadAttemptParts({ attempt, specimen, root: attemptsRoot });
  const out = outDir ?? join(root, 'attempts', 's7lanes', specimen, `run-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  const { store, document: instrumentation } = instrumentedStore({ name: `s7lanes:${specimen}`, base: loaded.board, ...runnerCache({ root, entry: import.meta.filename, cas }) });
  store.constant('fn.tk.s7trace.laneOutputs', { ...loaded.values, ...loadS7Lanes({ out: loaded.out, upperRowsRemoved: loaded.upperRowsRemoved, values: loaded.values }), 'testimony.source.holePaths': loadHolePaths(specimen, root) });
  for (const [fn, spec] of S4_CALCULATIONS) store.register(fn, spec);
  for (const [fn, spec] of S7_CALCULATIONS) store.register(fn, spec);
  registerTraceQueries(store, { matcher: loadMatcher(root), board: loaded.board });
  registerLanes(store, registerQueries);
  const x = store.get(LANE_CROSSCHECK_PART);
  const doc = instrumentation(), profile = profileSummary(doc);
  const ms = (fn) => profile.find((p) => p.calculation === fn)?.totalMs ?? null;
  // a variant's time: its fn.q.route.laneTrack calls (with their nested laneStep calls), from the profile; the tracks
  // Calculation's own time also holds the store's one-time digest of the board for its cache key, which is not the tracker's
  const bySeq = new Map(doc.calculations.map((e) => [e.seq, e])), trackMs = { 4: 0, 3: 0 };
  for (const e of doc.calculations) if (e.calculation === 'fn.q.route.laneTrack') { const p = bySeq.get(e.parent)?.calculation; for (const k of [4, 3]) if (p === `fn.${LANE_TRACKS_PART[k]}`) trackMs[k] += e.elapsedMs ?? 0; }
  const timingsMs = { fourLane: Math.round(trackMs[4]), threeLane: Math.round(trackMs[3]), fourLaneCalculation: ms(`fn.${LANE_TRACKS_PART[4]}`), threeLaneCalculation: ms(`fn.${LANE_TRACKS_PART[3]}`), defaultRouteMatch: ms('fn.q.trace.routeMatch'), wall: Math.round(doc.wallMs) };
  let renders = [];
  if (write) {
    mkdirSync(out, { recursive: true });
    const { emits, ...value } = x;
    writeFileSync(join(out, `${LANE_CROSSCHECK_PART}.json`), canonicalJson({ specimen, attempt, ...value, tracks: { fourLane: store.get(LANE_TRACKS_PART[4]), threeLane: store.get(LANE_TRACKS_PART[3]) } }) + '\n');
    const r = store.call(RENDER_PART, { a: LANE_CROSSCHECK_PART, deflate: (b) => deflateSync(b) }).value, images = imageFiles(out);
    for (const p of r.parts) if (p.kind === 'raster' && p.data?.png) { const name = `${LANE_CROSSCHECK_PART}.${p.address.split('#')[1]}.png`; images.alias(images.png(p.data.png).src, name); renders.push(join(out, name)); }
    writeFileSync(join(out, 'instrumentation.json'), JSON.stringify(instrumentation()) + '\n');
  }
  return { out, crosscheck: x, tracks: { 4: store.get(LANE_TRACKS_PART[4]), 3: store.get(LANE_TRACKS_PART[3]) }, timingsMs, profile, renders, holePaths: store.get('testimony.source.holePaths'), widthPx: x.widthPx };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
  const specimen = arg('--specimen'), attempt = arg('--attempt');
  if (!specimen || !attempt) { console.error('usage: node ports/s7route/laneRun.mjs --specimen golden --attempt ID [--attempts-root DIR] [--out DIR] [--no-cas]'); process.exit(2); }
  const r = runLaneCrosscheck({ specimen, attempt, attemptsRoot: arg('--attempts-root') ?? ROOT, outDir: arg('--out'), cas: casFlag() });
  const v = r.crosscheck.variants;
  console.log(JSON.stringify({ out: r.out, widthPx: r.widthPx, timingsMs: r.timingsMs,
    totals: { fourLane: v.fourLane.totals, threeLane: v.threeLane.totals },
    flagged: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.rows.filter((y) => y.verdict !== 'agree').map((y) => `${y.hole} ${y.verdict} (${y.trackStop}${y.trackBasket ? ` ${y.trackBasket}` : ''} vs ${y.defaultBasket}; ${y.lateralW} W)`)])),
    hotSpots: hotSpotLines(r.profile.hotSpots ?? []), assumptions: assumptionLines(r.profile.assumptions ?? []),
    profile: r.profile.slice(0, 8).map((p) => `${p.calculation}: ${p.calls}x self ${p.selfMs} ms total ${p.totalMs} ms`), renders: r.renders }, null, 1));
}
