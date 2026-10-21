#!/usr/bin/env node
/**
 * The graduation proof (AGENTS.md "prove identical output") of S7 scoring against the Python prototype
 * (after-s4/match2.py), node-only:
 *
 *   node ports/s7route/prove.mjs --specimen golden --attempt ID [--attempts-root DIR]  [--fixtures DIR] [--sensor-only] [--save FILE]
 *
 * The prototype's numbers are fixtures written FIRST by its own code (match2.py and match18.py exec'd verbatim up to the
 * assignment: the unrounded sensor and edge-contrast matrices with each cell's route, the starts, W, the BasketPoints,
 * sensor() on 20 random routes; ports/s7route/fixtures/). The
 * system's Calculations (fn.tk.s7.routeStart, routeHallway, routeRow per hole, routeTable; fn.q.route.sensor) then run
 * on a store whose root Parts are the prototype's inputs: the S4 hallway scene with the prototype's unrounded
 * BasketPoint offset and the S3 family pad length, and its after-S4 tee baseline (S3 association poses + S4 recovered
 * tees, u to 4 decimals). Asserted: BasketPoints 1e-9 px, W 1e-9 px, starts 1e-9 px, random-route sensor 1e-9,
 * both matrices 1e-6 and every cell's route vertices 1e-6 px. The system run (ports/s7route/run.mjs) reads the system's own inputs; the difference is an input change.
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { deserialize } from '../../fg/pxcCodec.mjs';   // node:v8 with packed typed arrays
import { join, resolve } from 'node:path';
import { createPartStore, registerQueries } from '../../fg/store.mjs';
import { ownedPx } from '../../fg/pxset.mjs';
import { sceneOf } from '../s7trace/s3first.mjs';
import { sceneWithRecovered, holesView } from '../s7trace/traceSpace.mjs';
import { PROTOTYPE_BASKET_POINT_OFFSET } from '../s7trace/identity.mjs';
import { loadHolePaths } from '../s7trace/holePaths.mjs';
import { routeTableOn, ROUTE_QUERIES, ROUTE_START_PART, ROUTE_HALLWAY_PART } from './routeSpace.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
export const FIXTURES = join(import.meta.dirname, 'fixtures');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
export const fixtureFile = (specimen, dir = FIXTURES) => join(dir, `match2-${specimen}.fixture.json`);
export const fixture18File = (specimen, dir = FIXTURES) => join(dir, `match18-${specimen}.fixture.json`);
/** The sensor-only fixture (fixture_sensor.py: match2.py up to the matrix loop) on the attempt it names. */
export const sensorFixtureFile = (specimen, dir = FIXTURES) => join(dir, `sensor-${specimen}.fixture.json`);

/** The prototype's inputs as Parts: tk.s7.sceneS4 (prototype offset, S3 family L), tk.s7.holes (its after-S4 baseline). */
export function prototypeInputs({ specimen, attempt, fixture, attemptsRoot = ROOT, root = ROOT }) {
  const out = join(attemptsRoot, 'attempts', 'stages', attempt, 'fork', 'stage-output');
  const pxc = new Map(deserialize(readFileSync(join(out, 'early', 's3.pxc.bin'))));
  const raster = pxc.get('px.image.cropped'), W = raster.widthPx, H = raster.heightPx;
  const A = join(out, 'early', 'artifacts');
  const tees = readJson(join(A, 's3fix', 'px.tees.refined.json')).tees, m = readJson(join(A, 's3fix', 'px.tees.family-refined.json')).model;
  const ownedLists = [...pxc.get('px.baskets').map((k) => ownedPx(W, H, k).px), ...pxc.get('px.badges').map((b) => ownedPx(W, H, b).px), ...tees.map((t) => t.px)];
  const pads = tees.map((t) => ({ label: t.label, cx: t.center[0], cy: t.center[1], thDeg: t.angleRad * 180 / Math.PI }));
  const S0 = sceneOf({ raster, ownedLists, baskets: pxc.get('px.baskets'), badges: pxc.get('px.badges'), pads, template: { L: m.major.median, W: m.minor.median }, basketPointOffset: PROTOTYPE_BASKET_POINT_OFFSET });
  const bridge = join(out, 'basket-bridge', 'basket-recovery.part.json');
  const boxes = existsSync(bridge) ? (readJson(bridge).comparisons?.accepted ?? []).filter((d) => d.classification !== 'existing-s2-exact').map((d) => d.semanticBbox) : [];
  const scene = sceneWithRecovered(S0, boxes, { basketPointOffset: PROTOTYPE_BASKET_POINT_OFFSET });
  const named = holesView({ badges: pxc.get('px.badges'), baskets: pxc.get('px.baskets'), recoveredBoxes: boxes, association: { holes: {} }, recovered: { tees: [] } });
  const holes = Object.keys(fixture.holes).sort((a, b) => a - b).map((h) => ({ hole: h, tee: { teeCenter: fixture.holes[h].teeCenter, u: fixture.holes[h].u, straight3: null, source: fixture.holes[h].source }, condition: null }));
  return { board: Object.freeze({ has: (a) => pxc.has(a), get: (a) => pxc.get(a) }), scene, holes: { holes, baskets: named.baskets, conditions: [], emits: { holes: holes.length } }, holePaths: loadHolePaths(specimen, root) };
}

const maxAbs = (a, b) => Math.max(0, ...a.map((x, i) => Math.abs(x - b[i])));

export function prove({ specimen, attempt, attemptsRoot = ROOT, fixtures = FIXTURES, matrix = true, fixturePath = null }) {
  const fx = readJson(fixturePath ?? fixtureFile(specimen, fixtures));
  const inp = prototypeInputs({ specimen, attempt, fixture: fx, attemptsRoot });
  const store = createPartStore({ name: `s7route-prove:${specimen}`, base: inp.board });
  store.constant('fn.tk.s7route.prototypeInputs', { 'tk.s7.sceneS4': inp.scene, 'tk.s7.holes': inp.holes, 'testimony.source.holePaths': inp.holePaths });
  registerQueries(store, ROUTE_QUERIES, { note: 'S7 hallway sensor (ports/s7route)' });
  const bpDiff = Math.max(...fx.bp.map((p, k) => Math.hypot(p[0] - inp.scene.bp[k][0], p[1] - inp.scene.bp[k][1])), 0);
  const sensor = fx.random.map((r) => { const v = store.call('fn.q.route.sensor', { scene: 'tk.s7.sceneS4', verts: r.verts, widthPx: fx.widthPx }).value; return { hole: r.hole, py: r.passFrac, js: v.passFrac, pyStations: r.stations, jsStations: v.stations, diff: Math.abs(v.passFrac - r.passFrac) }; });
  const sensorOk = sensor.every((s) => s.diff <= 1e-9 && s.pyStations === s.jsStations);
  const sensorReport = { routes: sensor.length, maxDiff: Math.max(0, ...sensor.map((s) => s.diff)), stationsEqual: sensor.every((s) => s.pyStations === s.jsStations), rows: sensor };
  if (!matrix) return { specimen, attempt, basketPointsMaxDiffPx: bpDiff, sensor: sensorReport, ok: bpDiff <= 1e-9 && sensorOk };
  const table = routeTableOn(store, { board: inp.board, sensor: true });
  const start = store.get(ROUTE_START_PART), W = store.get(ROUTE_HALLWAY_PART).widthPx;
  const startDiff = Math.max(0, ...start.holes.map((h) => { const p = fx.starts[h.hole]; return Math.max(maxAbs(h.S, p.S), maxAbs(h.u, p.u), Math.abs(h.badgeAlongPx - p.badgeAlongPx)); }));
  const cmp = (M, P, key, verts) => {   // a JS matrix against a fixture matrix (null = the prototype's -99)
    const same = M.length === P.length && table.holes.every((h, i) => Number(h) === fx.order[i]) && M.every((r, i) => r.length === P[i].length);
    let maxDiff = 0, worst = null, routesDiffer = 0;
    if (same) M.forEach((r, i) => r.forEach((v, k) => {
      const d = Math.abs((v ?? -99) - P[i][k]); if (d > maxDiff) { maxDiff = d; worst = { hole: table.holes[i], basket: k, js: v, py: P[i][k] }; }
      const jv = verts(table.rows[i].cells[k]), pv = key(table.holes[i], k);
      if (jv && pv && (jv.length !== pv.length || maxAbs(jv.flat(), pv.flat()) > 1e-6)) routesDiffer++;
    }));
    return { sameShape: same, holes: M.length, baskets: M[0]?.length ?? 0, maxDiff, worst, cellsWhoseRouteDiffers: routesDiffer, ok: same && maxDiff <= 1e-6 && routesDiffer === 0 };
  };
  const sensorMatrix = cmp(table.sensorMatrix, fx.matrix, (h, k) => fx.routes[`${h}|${k}`]?.verts, (c) => (c.sensorBest.best === 'zero' ? c.sensorBest.zero.verts : c.sensorBest.best === 'one' ? c.sensorBest.one.verts : null));
  const f18 = existsSync(fixture18File(specimen, fixtures)) ? readJson(fixture18File(specimen, fixtures)) : null;
  const contrastMatrix = f18 ? { ...cmp(table.contrastMatrix, f18.matrix, (h, k) => f18.routes[`${h}|${k}`], (c) => c.contrast.verts), widthPyPx: f18.widthPx, pythonSeconds: f18.pythonSeconds }
    : { ok: false, condition: `no match18.py fixture for ${specimen}` };
  // the prototypes' recorded outputs (after-s4/match2-<course>.json, match18-<course>.json): their matrices are rounded
  // (3 and 2 decimals), so they agree within half the last digit; the unrounded fixtures above carry the 1e-6 proof
  const recorded = Object.fromEntries([['match2', 'sensorMatrix', 3], ['match18', 'contrastMatrix', 2]].map(([name, key, d]) => {
    const f = join(fixtures, 'recorded', `${name}-${specimen}.json`);
    if (!existsSync(f)) return [name, { condition: `no recorded ${name}-${specimen}.json` }];
    const P = readJson(f).matrix, tol = 0.5 * 10 ** -d + 1e-9;
    let maxDiff = 0; table[key].forEach((r, i) => r.forEach((v, k) => { maxDiff = Math.max(maxDiff, Math.abs((v ?? -99) - P[i][k])); }));
    return [name, { decimals: d, maxDiff, tolerance: tol, ok: maxDiff <= tol }];
  }));
  return {
    specimen, attempt, widthPx: { js: W, py: fx.widthPx, diff: Math.abs(W - fx.widthPx) }, basketPointsMaxDiffPx: bpDiff, startsMaxDiff: startDiff,
    sensor: sensorReport, sensorMatrix, contrastMatrix, recorded,
    js: { holes: table.holes, contrastMatrix: table.contrastMatrix, contrastRoutes: table.rows.map((r) => r.cells.map((c) => c.contrast.verts)), sensorMatrix: table.sensorMatrix },
    ok: bpDiff <= 1e-9 && Math.abs(W - fx.widthPx) <= 1e-9 && startDiff <= 1e-9 && sensorOk && sensorMatrix.ok && contrastMatrix.ok && Object.values(recorded).every((x) => x.ok !== false),
    pythonSeconds: fx.pythonSeconds
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
  const specimen = arg('--specimen'), attempt = arg('--attempt');
  if (!specimen || !attempt) { console.error('usage: node ports/s7route/prove.mjs --specimen golden --attempt ID [--attempts-root DIR] [--fixtures DIR]'); process.exit(2); }
  const r = prove({ specimen, attempt, attemptsRoot: arg('--attempts-root') ?? ROOT, fixtures: arg('--fixtures') ?? FIXTURES, matrix: !process.argv.includes('--sensor-only') });
  const { rows, ...sensor } = r.sensor, { js, ...rest } = r;
  if (js && arg('--save')) writeFileSync(arg('--save'), JSON.stringify(js));
  console.log(JSON.stringify({ ...rest, sensor }, null, 1));
  process.exit(r.ok ? 0 : 1);
}
