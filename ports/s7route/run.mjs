#!/usr/bin/env node
/**
 * Runner for S7 scoring: tk.s7.routeTable on a completed attempt (node-only; never re-runs the provider).
 *
 *   node ports/s7route/run.mjs --specimen golden --attempt ID [--attempts-root DIR] [--out DIR] [--no-cas]
 *
 * The store sits on the attempt's S3 PxC (early/s3.pxc.bin) as its board, with S7's lane outputs as root inputs
 * (ports/s7trace/run.mjs loadS7Lanes) and the persistent cache on (fg/cas.mjs under <repo>/attempts/cas, keyed with the
 * runner's module closure): a second run is served from the cache, and a change to one hole's tee recomputes one row.
 * --attempts-root: where attempts/stages/<ID> lives when this checkout has none (read only; nothing is written there).
 * Writes under <out> (default <repo>/attempts/s7route/<specimen>/run-<ISO time>/): tk.s7.routeTable.json, its render
 * (tk.s7.routeTable.<panel>.png: contrast, contrastRouteSensor, sensor heatmaps), keyspace.json, instrumentation.json.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { instrumentedStore, profileSummary } from '../../fg/profile.mjs';
import { RENDER_PART, registerQueries } from '../../fg/store.mjs';
import { runnerCache, casFlag } from '../../fg/casRunner.mjs';
import { canonicalJson } from '../../fg/canon.mjs';
import { loadAttemptParts } from '../s4recover/run.mjs';
import { S4_CALCULATIONS } from '../s4recover/teeRecover.mjs';
import { S7_CALCULATIONS } from '../s7trace/traceSpace.mjs';
import { loadS7Lanes } from '../s7trace/run.mjs';
import { loadHolePaths } from '../s7trace/holePaths.mjs';
import { routeTableOn, ROUTE_QUERIES, ROUTE_TABLE_PART, ROUTE_SENSOR_TABLE_PART, ROUTE_HALLWAY_PART } from './routeSpace.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');

export function runRouteTable({ specimen, attempt, attemptsRoot = ROOT, root = ROOT, outDir = null, cas = true }) {
  const loaded = loadAttemptParts({ attempt, specimen, root: attemptsRoot });
  const out = outDir ?? join(root, 'attempts', 's7route', specimen, `run-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  const { cache, codeSalt } = runnerCache({ root, entry: import.meta.filename, cas });
  const { store, document: instrumentation } = instrumentedStore({ name: `s7route:${specimen}`, base: loaded.board, cache, codeSalt });
  store.constant('fn.tk.s7trace.laneOutputs', { ...loaded.values, ...loadS7Lanes({ out: loaded.out, upperRowsRemoved: loaded.upperRowsRemoved, values: loaded.values }), 'testimony.source.holePaths': loadHolePaths(specimen, root) });
  for (const [fn, spec] of S4_CALCULATIONS) store.register(fn, spec);
  for (const [fn, spec] of S7_CALCULATIONS) store.register(fn, spec);
  registerQueries(store, ROUTE_QUERIES, { note: 'S7 hallway sensor (ports/s7route)' });
  const table = routeTableOn(store, { board: loaded.board, sensor: true });   // the scoring view: the sensor's own routes too
  const render = store.call(RENDER_PART, { a: ROUTE_SENSOR_TABLE_PART }).value;
  mkdirSync(out, { recursive: true });
  const { emits, ...value } = table;
  writeFileSync(join(out, `${ROUTE_TABLE_PART}.json`), canonicalJson({ specimen, attempt, ...value }) + '\n');
  for (const p of render.parts) if (p.kind === 'raster' && p.data?.png) writeFileSync(join(out, `${ROUTE_TABLE_PART}.${p.address.split('#')[1]}.png`), Buffer.from(p.data.png, 'base64'));
  writeFileSync(join(out, 'keyspace.json'), canonicalJson({ schema: 'nctk-keyspace@1', specimen, attempt, store: store.manifest().store, parts: store.keyspace() }) + '\n');
  const doc = instrumentation();
  writeFileSync(join(out, 'instrumentation.json'), JSON.stringify(doc) + '\n');
  return { out, table, hallway: store.get(ROUTE_HALLWAY_PART), doc, profile: profileSummary(doc), cache: cache?.stats?.() ?? null };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
  const specimen = arg('--specimen'), attempt = arg('--attempt');
  if (!specimen || !attempt) { console.error('usage: node ports/s7route/run.mjs --specimen golden --attempt ID [--attempts-root DIR] [--out DIR] [--no-cas]'); process.exit(2); }
  const r = runRouteTable({ specimen, attempt, attemptsRoot: arg('--attempts-root') ?? ROOT, outDir: arg('--out'), cas: casFlag() });
  const t = r.table, sam = t.sam.byHole;
  const judged = t.rowBest.filter((b) => sam[b.hole]?.basket != null).length;
  const agree = (key) => `${t.rowBest.filter((b) => sam[b.hole]?.basket != null && sam[b.hole].basket === b[key]).length}/${judged}`;
  console.log(JSON.stringify({ out: r.out, wallMs: r.doc.wallMs, widthPx: t.widthPx, holes: t.holes.length, baskets: t.baskets.length,
    rowMaximumAtSamsBasket: { contrast: agree('contrastBasket'), sensor: agree('sensorBasket'), note: "row maximum only (holes with testimony); the one-to-one assignment is the matching packet's" }, conditions: t.conditions,
    profile: r.profile.slice(0, 8).map((p) => `${p.calculation}: ${p.calls}x self ${p.selfMs} ms ${JSON.stringify(p.emits)}`), cache: r.cache }, null, 1));
}
