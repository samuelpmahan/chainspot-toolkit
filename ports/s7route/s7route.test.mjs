import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPartStore, registerQueries } from '../../fg/store.mjs';
import { renderValue } from '../../fg/render.mjs';
import { SCENE_SCHEMA } from '../../fg/s7trace/sceneRender.mjs';
import { FRONT } from '../s7trace/hallway.mjs';
import { polyScore } from '../s7trace/hallway.mjs';
import { routeSensorAt, routeRowOf, routeTableOn, ribbonContrastAt, onAxisOf, ROUTE_QUERIES, ROUTE_TABLE_PART, rowAddress } from './routeSpace.mjs';

/**
 * Fixture: a flat 320 x 220 px course (lum 100) with one ribbon of width 30 px (lum 150) tee (30, 100) -> bend (170, 100)
 * -> BasketPoint (250, 40); hole 1's badge on the first leg at (120, 100); a second BasketPoint (290, 190) off the
 * ribbon; hole 2's tee on bare ground at (60, 190) facing its badge (140, 190). Nothing masked.
 */
function fixtureScene() {
  const W = 320, H = 220, lum = new Float64Array(W * H).fill(100), path = [[30, 100], [170, 100], [250, 40]];
  const segD = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy; let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const d = Math.min(segD([x, y], path[0], path[1]), segD([x, y], path[1], path[2])); if (d <= 15) lum[y * W + x] = 150; }
  return { schema: SCENE_SCHEMA, W, H, lum, mask: new Uint8Array(W * H), occluder: new Uint8Array(W * H), bp: [[250, 40], [290, 190]], badges: { 1: [120, 100], 2: [140, 190] }, badgeHalf: { 1: 12, 2: 12 },
    pads: [], L: 24, Wd: 16, R1: 40 };
}
const holesPart = (tee2 = [60, 190]) => ({
  holes: [{ hole: '1', tee: { teeCenter: [30, 100], u: [1, 0], source: 'fixture' } }, { hole: '2', tee: { teeCenter: tee2, u: [1, 0], source: 'fixture' } }],
  baskets: [{ index: 0, name: 'Basket ca', point: [250, 40], source: 'S2' }, { index: 1, name: 'Basket cb', point: [290, 190], source: 'S2' }]
});
const holePaths = { path: 'fixture.annotation.json', rule: 'fixture', holes: [{ hole: '1', tee: [30, 100], basket: [251, 41], bends: [[170, 100]] }] };
function storeOf(cache, holes = holesPart()) {
  const store = createPartStore({ name: 'fixture', cache });
  store.constant('fn.tk.fixture.inputs', { 'tk.s7.sceneS4': fixtureScene(), 'tk.s7.holes': holes, 'testimony.source.holePaths': holePaths });
  registerQueries(store, ROUTE_QUERIES);
  return store;
}

test('the sensor reads the ribbon: the true bent route passes, the chord across bare ground does not', () => {
  const S = fixtureScene(), start = [40, 100];
  const bent = routeSensorAt(S, [start, [170, 100], [250, 40]], 30), chord = routeSensorAt(S, [start, [250, 40]], 30);
  assert.ok(bent.passFrac > 0.95 && bent.stations > 100, JSON.stringify(bent));
  assert.ok(chord.passFrac < 0.3, JSON.stringify(chord));
  // ends and joints are skipped: first leg from 0.75 W, later legs from 0.5 W, each leg ends 0.5 W early
  assert.equal(bent.legs[0].stations, Math.ceil((130 - 15) - 22.5));
  assert.equal(routeSensorAt(S, [start, [50, 100]], 30).stations, 0);
});

test('the edge contrast visits only the px near the legs, in scan order: bit-identical to polyscore (hallway.mjs polyScore)', () => {
  const S = fixtureScene(); S.mask[100 * 320 + 100] = 1; for (let x = 200; x < 230; x++) S.mask[70 * 320 + x] = 1;
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const routes = [[[40, 100], [170, 100], [250, 40]], [[40, 100], [250, 40]], [[40, 100], [40.5, 210]], [[0, 0], [319, 219]]];
  for (let i = 0; i < 40; i++) { const n = 2 + Math.floor(rnd() * 3), V = []; for (let k = 0; k < n; k++) V.push([rnd() * 340 - 10, rnd() * 240 - 10]); routes.push(V); }
  for (const V of routes) for (const W of [30, 17.3]) {
    const [a, n] = ribbonContrastAt(S, V, W), [b, m] = polyScore(S, V, W);
    assert.equal(a === null ? -99 : a, b, JSON.stringify(V)); assert.equal(n, m);
  }
});

test('the memo is exact: a row read with and without it gives the same numbers', () => {
  const S = fixtureScene(), start = { hole: '1', S: [40, 100], u: [1, 0], badgeAlongPx: 80 };
  const row = routeRowOf(S, start, S.bp, 30);
  for (const { sensorBest: c, contrast } of row.cells) {
    const z = routeSensorAt(S, c.zero.verts, 30); assert.equal(z.passFrac, c.zero.passFrac); assert.equal(z.stations, c.zero.stations);
    if (c.one) { const o = routeSensorAt(S, c.one.verts, 30); assert.equal(o.passFrac, c.one.passFrac); assert.equal(o.stations, c.one.stations); }
    const s = routeSensorAt(S, contrast.verts, 30); assert.equal(s.passFrac, contrast.sensor.passFrac); assert.equal(s.stations, contrast.sensor.stations);
  }
  const c0 = row.cells[0].sensorBest;
  assert.equal(c0.best, 'one'); assert.equal(c0.bends, 1);
  assert.ok(Math.abs(c0.one.verts[1][0] - 170) <= 8 && c0.one.passFrac > 0.95, JSON.stringify(c0.one));
  assert.ok(row.cells[1].sensorBest.passFrac < c0.passFrac);
  // the edge contrast's best route bends on the ribbon too, and reads higher than to the off-ribbon basket
  const k0 = row.cells[0].contrast;
  assert.equal(k0.bends, 1); assert.ok(Math.abs(k0.verts[1][0] - 170) <= 6, JSON.stringify(k0.verts));
  assert.ok(k0.contrastLum > 30 && k0.contrastLum > row.cells[1].contrast.contrastLum);
});

test('the table: one cached row per hole; a change to one hole\'s tee recomputes that row alone', () => {
  const cache = new Map();
  const a = storeOf(cache), t = routeTableOn(a);
  assert.deepEqual(t.holes, ['1', '2']); assert.equal(t.sensorMatrix.length, 2); assert.equal(t.sensorMatrix[0].length, 2);
  assert.ok(Math.abs(t.widthPx - 30) <= 1.5, `W ${t.widthPx}`);
  assert.equal(t.rowBest[0].contrastBasket, 0); assert.equal(t.rowBest[0].sensorBasket, 0); assert.equal(t.sam.byHole['1'].basket, 0);
  assert.equal(t.contrastMatrix.length, 2); assert.equal(t.contrastRouteSensor[0].length, 2);
  assert.ok(a.has(rowAddress('1')) && a.has(rowAddress('2')));
  const rowCalls = (s) => s.calls().filter((e) => e.calculation === 'fn.tk.s7.routeRow');
  assert.deepEqual(rowCalls(a).map((e) => e.cached), [false, false]);
  const b = storeOf(cache); routeTableOn(b);
  assert.deepEqual(rowCalls(b).map((e) => e.cached), [true, true]);
  const c = storeOf(cache, holesPart([62, 192])), tc = routeTableOn(c);
  assert.equal(tc.widthPx, t.widthPx);
  assert.deepEqual(rowCalls(c).map((e) => e.cached), [true, false]);
});

test('conditions are recorded: a hole without a tee, a route query without a width', () => {
  const holes = holesPart(); holes.holes.push({ hole: '3', tee: null, condition: 'no tee (fixture)' });
  const s = storeOf(new Map(), holes), t = routeTableOn(s);
  assert.deepEqual(t.holes, ['1', '2']);
  assert.ok(t.conditions.some((c) => c.hole === '3'));
  assert.match(s.call('fn.q.route.sensor', { scene: 'tk.s7.sceneS4', verts: [[0, 0], [10, 10]], widthPx: 0 }).value.condition, /no hallway width/);
  assert.equal(s.call('fn.q.route.sensor', { scene: 'tk.s7.sceneS4', verts: [[40, 100], [170, 100], [250, 40]], widthPx: 30 }).value.stations > 100, true);
  assert.ok(s.call('fn.q.route.contrast', { scene: 'tk.s7.sceneS4', verts: [[40, 100], [170, 100], [250, 40]], widthPx: 30 }).value.contrastLum > 30);
  assert.equal(s.call('fn.q.route.contrast', { scene: 'tk.s7.sceneS4', verts: [[40, 100], [41, 100]], widthPx: 30 }).value.contrastLum, null);
});

test('tk.s7.routeTable renders: a heatmap raster with a legend', () => {
  const s = storeOf(new Map()); routeTableOn(s);
  const r = renderValue(ROUTE_TABLE_PART, s.get(ROUTE_TABLE_PART));
  assert.equal(r.kind, 'routeTable');
  const pngs = r.parts.filter((p) => p.kind === 'raster');
  assert.equal(pngs.length, 3);
  for (const png of pngs) assert.ok(png.data.png.length > 100 && png.data.width > 0);
  assert.ok(r.parts.some((p) => p.address.endsWith('#legend')));
  // and every row Part renders through the default union
  assert.notEqual(renderValue(rowAddress('1'), s.get(rowAddress('1'))).kind, 'unrenderable');
});

test('the start is the tee cap: S = T + u FRONT L, badge distance along u', () => {
  const s = storeOf(new Map()); routeTableOn(s);
  const h1 = s.get('tk.s7.routeStart').holes[0];
  assert.ok(Math.abs(h1.S[0] - (30 + FRONT * 24)) < 1e-12 && h1.S[1] === 100);
  assert.ok(Math.abs(h1.badgeAlongPx - (120 - 30 - FRONT * 24)) < 1e-12);
});

test('the on-axis prior (packet E03): the nearest BasketPoint past the badge within W / 2 of the tee ray gets 15, a column apart', () => {
  const start = { S: [0, 0], u: [1, 0], badgeAlongPx: 100 };
  const bp = [[80, 0], [300, 10], [200, -14], [150, 30], [400, 0]];   // before the badge; on axis; nearest on axis; too far off; farther on axis
  const a = onAxisOf(start, bp, 30);
  assert.deepEqual(a.map((x) => x.onAxisPrior), [0, 0, 15, 0, 0]);
  assert.deepEqual(a[2], { alongPx: 200, lateralPx: -14, onAxisPrior: 15 });
  const s = storeOf(new Map()), t = routeTableOn(s);
  assert.equal(t.onAxisPrior.length, 2); assert.equal(t.rows[0].cells[0].axis.onAxisPrior, t.onAxisPrior[0][0]);
  t.contrastMatrix.forEach((r, i) => r.forEach((v, k) => assert.equal(v, t.rows[i].cells[k].contrast.contrastLum)));   // never added into the contrast
});
