import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPartStore } from '../../fg/store.mjs';
import { SCENE_SCHEMA } from '../../fg/s7trace/sceneRender.mjs';
import { routeTableOn, ROUTE_START_PART } from './routeSpace.mjs';
import { assignMinCost, routeMatchOf, MATCH } from './match.mjs';

// ------------------------------------------------------------------ assignMinCost vs brute force

let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
/** Every injection of the smaller side: minimise (forbidden cells used, then the finite sum). */
function brute(cost) {
  const n = cost.length, m = cost[0].length, T = n > m, C = T ? cost[0].map((_, j) => cost.map((r) => r[j])) : cost, N = C.length, M = C[0].length;
  let best = null;
  const rec = (i, used, inf, sum) => {
    if (i === N) { if (!best || inf < best[0] || (inf === best[0] && sum < best[1] - 1e-12)) best = [inf, sum]; return; }
    for (let j = 0; j < M; j++) if (!used.has(j)) { used.add(j); const c = C[i][j]; rec(i + 1, used, inf + (Number.isFinite(c) ? 0 : 1), sum + (Number.isFinite(c) ? c : 0)); used.delete(j); }
  };
  rec(0, new Set(), 0, 0);
  return best;
}

test('assignMinCost equals brute force on random rectangular matrices, Infinity cells forbidden', () => {
  for (let trial = 0; trial < 300; trial++) {
    const n = 1 + Math.floor(rnd() * 5), m = 1 + Math.floor(rnd() * 6), pInf = trial % 3 === 0 ? 0 : 0.3;
    const cost = Array.from({ length: n }, () => Array.from({ length: m }, () => (rnd() < pInf ? Infinity : Math.round((rnd() * 200 - 100) * 100) / 100)));
    if (trial % 17 === 0) cost[0] = cost[0].map(() => Infinity);   // a row with no allowed cell
    const pairs = assignMinCost(cost), [inf, sum] = brute(cost);
    assert.equal(new Set(pairs.map((p) => p[0])).size, pairs.length, 'a row used twice');
    assert.equal(new Set(pairs.map((p) => p[1])).size, pairs.length, 'a column used twice');
    assert.ok(pairs.every(([i, j]) => Number.isFinite(cost[i][j])), 'a forbidden cell returned');
    assert.equal(Math.min(n, m) - pairs.length, inf, JSON.stringify({ cost, pairs }));
    assert.ok(Math.abs(pairs.reduce((s, [i, j]) => s + cost[i][j], 0) - sum) <= 1e-9, JSON.stringify({ cost, pairs, sum }));
  }
  assert.deepEqual(assignMinCost([]), []);
  assert.deepEqual(assignMinCost([[Infinity]]), []);
});

// ------------------------------------------------------------------ routeMatchOf on a synthetic scene

/**
 * A flat 320 x 310 px course (lum 100) with three ribbons 24 px wide (lum 150), one per hole, tee cap -> BasketPoint:
 *   hole 1 straight      (20, 30) -> (290, 30)
 *   hole 2 one bend      (20, 110) -> (140, 110) -> (230, 170)
 *   hole 3 two bends     (20, 220) -> (80, 220) -> (120, 260) -> (200, 260); `faded`: its last leg lum 103 (edges
 *                        step 3 lum < 8: the sensor cannot read it, so the second bend fails the gate)
 * Tees 10 px behind each start on the axis (+x), badges 60 px along; pad length L = 24 px.
 */
function scene({ faded = false } = {}) {
  const W = 320, H = 310, lum = new Float64Array(W * H).fill(100);
  const paths = [[[20, 30], [290, 30]], [[20, 110], [140, 110], [230, 170]], [[20, 220], [80, 220], [120, 260], [200, 260]]];
  const segD = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy; let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    for (let h = 0; h < 3; h++) {
      const P = paths[h]; let d = Infinity, last = false;
      for (let i = 1; i < P.length; i++) { const di = segD([x, y], P[i - 1], P[i]); if (di < d) { d = di; last = i === P.length - 1; } }
      if (d <= 12) lum[y * W + x] = faded && h === 2 && last && x > 125 ? 103 : 150;
    }
  }
  return { schema: SCENE_SCHEMA, W, H, lum, mask: new Uint8Array(W * H), occluder: new Uint8Array(W * H), bp: [[290, 30], [230, 170], [200, 260]],
    badges: { 1: [70, 30], 2: [70, 110], 3: [70, 220] }, badgeHalf: { 1: 6, 2: 6, 3: 6 }, pads: [], L: 24, Wd: 16, R1: 40 };
}
const holes = { holes: [1, 2, 3].map((n) => ({ hole: String(n), tee: { teeCenter: [20 - (10.6 / 25.02) * 24, [30, 110, 220][n - 1]], u: [1, 0], source: 'fixture' } })),
  baskets: [0, 1, 2].map((k) => ({ index: k, name: `Basket c${'abc'[k]}`, point: [[290, 30], [230, 170], [200, 260]][k], source: 'S2' })) };
const tables = new Map();   // one route table per scene variant, shared by the tests
function matchOn(S, opts, key = 'plain') {
  if (tables.has(key)) return { table: tables.get(key).table, m: routeMatchOf(tables.get(key).table, S, tables.get(key).start, opts) };
  const store = createPartStore({ name: 'match-fixture' });
  store.constant('fn.tk.fixture.inputs', { 'tk.s7.sceneS4': S, 'tk.s7.holes': holes, 'testimony.source.holePaths': { path: null, rule: 'fixture', holes: [] } });
  const table = routeTableOn(store), start = store.get(ROUTE_START_PART); tables.set(key, { table, start });
  return { table, m: routeMatchOf(table, S, start, opts) };
}
const near = (a, b, px) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= px;

test('routeMatchOf: one to one; a straight hole stays straight, a bent hole takes one bend, a second bend passes the sensor gate', () => {
  const { table, m } = matchOn(scene());
  assert.ok(Math.abs(table.widthPx - 24) <= 1.5, `W ${table.widthPx}`);
  assert.deepEqual([1, 2, 3].map((n) => m.holes[String(n)].end), [0, 1, 2]);
  const [h1, h2, h3] = [1, 2, 3].map((n) => m.holes[String(n)]);
  assert.equal(h1.verts.length, 2); assert.match(h1.how, /^straight/);
  assert.equal(h2.verts.length, 3); assert.ok(near(h2.verts[1], [140, 110], 6), `hole 2 bend at ${h2.verts[1]}`);
  assert.equal(h3.verts.length, 4, h3.how); assert.match(h3.how, /^2-bend accepted/);
  const a3 = m.assignment.find((a) => a.hole === '3');
  assert.ok(a3.sensor >= MATCH.tau && a3.stations >= MATCH.minStations, JSON.stringify(a3));
  assert.ok(near(h3.verts[1], [80, 220], 8) && near(h3.verts[2], [120, 260], 8), JSON.stringify(h3.verts));
});

test('routeMatchOf: a second bend the sensor cannot confirm is rejected, and secondBends: false never tries one', () => {
  const { m } = matchOn(scene({ faded: true }), undefined, 'faded');
  const h3 = m.holes['3'];
  assert.equal(h3.end, 2);
  assert.equal(h3.verts.length, 3, h3.how); assert.match(h3.how, /2-bend rejected/);
  const { m: cheap } = matchOn(scene(), { secondBends: false });
  assert.equal(cheap.holes['3'].verts.length, 3); assert.doesNotMatch(cheap.holes['3'].how, /2-bend/);
  assert.equal(cheap.holes['1'].verts.length, 2); assert.equal(cheap.holes['2'].verts.length, 3);
});

test('E18: each refine iteration moves the bend at most one contrast grid step (2 iterations: <= 12 px); the default (prototype) span is unchanged', async () => {
  const { refineVertices } = await import('../s7trace/hallway.mjs');
  const S = scene(), W = 24, u = [1, 0], V = [[20, 110], [100, 110], [230, 170]];   // grid bend 40 px short of the corner (140, 110)
  assert.equal(MATCH.refineAxisSpanR1, 0.135);   // in rC1px: 6 px on golden (R1 44.5 px)
  const span = MATCH.refineAxisSpanR1 * 44.5;
  const near = refineVertices(S, V, W, u, 2, { axisSpanPx: span, unitPx: 44.5 })[0], far = refineVertices(S, V, W, u, 2)[0];
  assert.ok(Math.abs(near[1][0] - 100) <= 2 * span + 1e-9 && near[1][1] === 110, JSON.stringify(near[1]));
  assert.ok(Math.abs(far[1][0] - 140) <= 4, `the +-60 px span reaches the corner: ${far[1]}`);
});

test('minStationsOf: 20 stations by default; stationsUnits r1 is 0.449 R1 (golden R1 44.5 px keeps its floor of 20 stations)', async () => {
  const { minStationsOf, MATCH_RULES } = await import('./match.mjs');
  assert.equal(minStationsOf({ R1: 21 }), MATCH.minStations);
  assert.equal(minStationsOf({ R1: 21 }, MATCH_RULES), 20);
  const golden = minStationsOf({ R1: 44.5 }, { stationsUnits: 'r1' });
  assert.ok(golden <= 20 && golden > 19, `golden floor ${golden}`);
  assert.ok(Math.abs(minStationsOf({ R1: 21 }, { stationsUnits: 'r1' }) - 0.449 * 21) < 1e-12);
});
