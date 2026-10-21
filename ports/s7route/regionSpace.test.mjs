import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPartStore, RENDER_PART } from '../../fg/store.mjs';
import { SCENE_SCHEMA } from '../../fg/s7trace/sceneRender.mjs';
import { regionMeanOf, regionRouteAt, registerRegion, trainingSegments, REGION, REGION_MODEL_PART, REGION_SCENE_PART, REGION_HEAT_PART, REGION_MEAN_PART } from './regionSpace.mjs';
import { routeSensorAt, ribbonContrastAt, regionAssignTableOf } from './routeSpace.mjs';

/**
 * Fixture: a 360 x 240 px course whose ground is shade on the left (x < 180, dark green ~ (40, 60, 40)) and sunlit grass on the
 * right (~ (150, 160, 120)), with seeded texture. Two hallways of width 20 px drawn as the UDisc layer: inside = 0.4 x ground +
 * (120, 125, 120). Hole 1 is straight (tee cap (30, 60) -> BasketPoint (330, 60)), hole 2 bends (tee cap (30, 170) -> (200, 170)
 * -> BasketPoint (300, 120)). Badges sit on each first leg at x = 100. A light sidewalk 44 px wide crosses the sunlit ground at
 * y = 215 (no hallway layer). Nothing masked.
 */
function fixture() {
  const X = 360, Y = 240, rgba = new Uint8Array(X * Y * 4), W = 20;
  let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const segD = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy; let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
  const paths = [[[30, 60], [330, 60]], [[30, 170], [200, 170], [300, 120]]];
  for (let y = 0; y < Y; y++) for (let x = 0; x < X; x++) {
    const n = (rnd() - 0.5) * 50;
    let g = x < 180 ? [40 + n, 60 + n, 40 + n] : [150 + n, 160 + n, 120 + n];
    if (x >= 180 && Math.abs(y - 215) <= 22) g = [205 + n / 5, 205 + n / 5, 200 + n / 5];   // the sidewalk: light, smooth, 44 px
    let d = Infinity; for (const P of paths) for (let i = 0; i + 1 < P.length; i++) d = Math.min(d, segD([x, y], P[i], P[i + 1]));
    if (d <= W / 2) g = g.map((v, c) => 0.4 * v + [120, 125, 120][c]);
    const o = 4 * (y * X + x); for (let c = 0; c < 3; c++) rgba[o + c] = Math.max(0, Math.min(255, Math.round(g[c]))); rgba[o + 3] = 255;
  }
  const lum = new Float64Array(X * Y); for (let i = 0; i < X * Y; i++) lum[i] = (rgba[4 * i] + rgba[4 * i + 1] + rgba[4 * i + 2]) / 3;
  const scene = { schema: SCENE_SCHEMA, W: X, H: Y, lum, mask: new Uint8Array(X * Y), occluder: new Uint8Array(X * Y), bp: [[330, 60], [300, 120]], badges: { 1: [100, 60], 2: [100, 170] }, badgeHalf: { 1: 8, 2: 8 }, pads: [], L: 24, Wd: 16, R1: 15 };
  const start = { holes: [{ hole: '1', S: [30, 60], u: [1, 0], teeCenter: [20, 60], badgeAlongPx: 70 }, { hole: '2', S: [30, 170], u: [1, 0], teeCenter: [20, 170], badgeAlongPx: 70 }], conditions: [] };
  return { raster: { rgba, widthPx: X, heightPx: Y }, scene, start, W, paths };
}
function storeOf(f, { straight = { 1: 'straight', 2: 'bent' } } = {}) {
  const store = createPartStore({ name: 'region fixture' });
  store.constant('fn.tk.fixture.inputs', { 'px.image.cropped': f.raster, 'tk.s7.sceneS4': f.scene, 'tk.s7.routeStart': f.start, 'tk.s7.routeHallway': { widthPx: f.W }, ...(straight ? { 'tk.s7.straight': { verdicts: straight } } : {}) });
  registerRegion(store);
  return store;
}

test('the mean plane is the masked box mean (window W/4), exact against a brute-force mean', () => {
  const X = 23, Y = 17, rgba = new Uint8Array(X * Y * 4).map((_, i) => (i * 37 + 11) % 256), mask = new Uint8Array(X * Y).map((_, i) => (i % 7 === 0 ? 1 : 0));
  const m = regionMeanOf({ rgba, widthPx: X, heightPx: Y }, mask, 20), k = m.windowPx, r = k >> 1;
  assert.equal(k, 5);
  for (let y = 0; y < Y; y++) for (let x = 0; x < X; x++) {
    let n = 0; const s = [0, 0, 0];
    for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) { if (xx < 0 || yy < 0 || xx >= X || yy >= Y || mask[yy * X + xx]) continue; n++; for (let c = 0; c < 3; c++) s[c] += rgba[4 * (yy * X + xx) + c]; }
    const i = y * X + x;
    assert.equal(m.cover[i], Math.floor((255 * n) / (k * k) + 0.5));
    for (let c = 0; c < 3; c++) assert.equal(m.rgb[3 * i + c], n ? Math.floor(s[c] / n + 0.5) : 0);
  }
});

test('the model learns the layer per image: inside = a x under + b, a near the drawn 0.4; dark-under stations pass', () => {
  const store = storeOf(fixture()), m = store.get(REGION_MODEL_PART);
  assert.equal(m.condition, null);
  for (const a of m.overlay.a) assert.ok(a > 0.25 && a < 0.55, JSON.stringify(m.overlay));
  assert.ok(m.training.straight === 1 && m.training.teeBadge === 2, JSON.stringify(m.training));
  assert.ok(m.training.positivePass >= 0.9 && m.training.darkUnderPass >= 0.9 && m.training.negativePass <= 0.2, JSON.stringify(m.training));
  assert.ok(store.calls().find((e) => e.calculation === 'fn.tk.s7.regionModel').emits.trainStations > REGION.minTrainStations);
});

test('the region reading: the bent hallway reads hallway in shade and sun; the chord across ground and the sidewalk do not', () => {
  const f = fixture(), store = storeOf(f), S = store.get(REGION_SCENE_PART);
  const bent = regionRouteAt(S, f.paths[1], f.W), chord = regionRouteAt(S, [f.paths[1][0], f.paths[1][2]], f.W), walk = regionRouteAt(S, [[190, 215], [350, 215]], f.W);
  assert.ok(bent.passFrac >= 0.85 && bent.supportMean > 0.6, JSON.stringify(bent));
  assert.ok(chord.supportMean < bent.supportMean - 0.4, JSON.stringify(chord));
  assert.ok(walk.supportMean < 0.2, `a light sidewalk wider than W is no hallway: ${JSON.stringify(walk)}`);
  // the route measures dispatch on the region scene: [support, visible px] and { passFrac, stations: visible px }
  const [sup, px] = ribbonContrastAt(S, f.paths[1], f.W), sens = routeSensorAt(S, f.paths[1], f.W);
  assert.equal(sup, bent.supportMean); assert.equal(px, bent.stations); assert.equal(sens.passFrac, bent.passFrac);
  const q = store.call('fn.q.route.region', { verts: f.paths[1], widthPx: f.W }).value;
  assert.equal(q.passFrac, bent.passFrac);
});

test('no training stations is a recorded condition: the region scene falls back to edges', () => {
  const f = fixture(); f.scene = { ...f.scene, badges: {}, badgeHalf: {} };
  const store = storeOf(f, { straight: null }), m = store.get(REGION_MODEL_PART), S = store.get(REGION_SCENE_PART);
  assert.match(m.condition, /no region model/);
  assert.equal(S.region, null); assert.match(S.regionCondition, /read edges/);
  assert.deepEqual(routeSensorAt(S, f.paths[1], f.W), routeSensorAt(f.scene, f.paths[1], f.W));
  assert.equal(trainingSegments(f.scene, f.start, null, f.W).length, 0);
});

test('the region Parts render: the heat with its training segments and legend, the cover plane, the model ledger', () => {
  const store = storeOf(fixture());
  const heat = store.call(RENDER_PART, { a: REGION_HEAT_PART }).value;
  assert.equal(heat.kind, 'regionHeat');
  assert.ok(heat.parts.some((p) => p.kind === 'raster' && p.data.png) && heat.parts.some((p) => p.address.endsWith('#legend')));
  assert.equal(store.call(RENDER_PART, { a: REGION_MEAN_PART }).value.kind, 'regionMean');
  assert.notEqual(store.call(RENDER_PART, { a: REGION_MODEL_PART }).value.kind, 'unrenderable');
  assert.ok(store.get(REGION_HEAT_PART).emits.hotCellsPct > 0);
});

test('the region assignment table: the region columns, the edge routes', () => {
  const edge = { holes: ['1'], baskets: [{ name: 'Basket ca' }, { name: 'Basket cb' }], contrastMatrix: [[30, 10]], contrastRouteSensor: [[1, 0]], onAxisPrior: [[15, 0]], units: { contrastMatrix: 'lum' },
    rows: [{ hole: '1', cells: [{ contrast: { verts: [[0, 0], [5, 5]] } }, { contrast: { verts: [[0, 0], [9, 9]] } }] }], emits: {} };
  const region = { contrastMatrix: [[0.1, 0.7]], contrastRouteSensor: [[0.2, 0.9]], onAxisPrior: [[0.2, 0]], units: { contrastMatrix: 'support', contrastRouteSensor: 'frac' } };
  const t = regionAssignTableOf(edge, region);
  assert.deepEqual(t.contrastMatrix, [[0.1, 0.7]]); assert.deepEqual(t.onAxisPrior, [[0.2, 0]]); assert.deepEqual(t.edgeContrastMatrix, [[30, 10]]);
  assert.equal(t.rows, edge.rows); assert.equal(t.rowBest[0].contrastBasket, 1); assert.equal(t.rowBest[0].edgeContrastBasket, 0);
});
