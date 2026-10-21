import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KBENDS, legContrastsOf, bottleneckOf, kCellAt, kChainStartAt, kSplitAt, kChainAt } from './kbends.mjs';
import { badgeMidOf } from './routeSpace.mjs';
import { RULE_SETS, MATCH_RULES } from './match.mjs';

/**
 * Fixture: a flat 640 x 480 px course (lum 100), R1 = 15 px, a ribbon of width W = 24 px (lum 150) along a polyline. The hole's
 * tee centre (40, 100), its axis +x, the badge 50 px along it, so B* = tee + 100 px = (140, 100): the ribbon's first bend.
 */
const W = 24, T = [40, 100], START = { hole: '1', S: [52, 100], u: [1, 0], teeCenter: T, badgeAlongPx: 38 };
function scene(path) {
  const IW = 640, IH = 480, lum = new Float64Array(IW * IH).fill(100);
  const segD = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy; let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
  for (let y = 0; y < IH; y++) for (let x = 0; x < IW; x++) { let d = Infinity; for (let i = 0; i + 1 < path.length; i++) d = Math.min(d, segD([x, y], path[i], path[i + 1])); if (d <= W / 2) lum[y * IW + x] = 150; }
  return { W: IW, H: IH, lum, mask: new Uint8Array(IW * IH), R1: 15 };
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test('B* is the first bend of the fixture; the weakest leg is the route score', () => {
  assert.deepEqual(badgeMidOf(START).map(Math.round), [140, 100]);
  assert.equal(bottleneckOf([30, null, 12.5, 40]), 12.5);
  assert.equal(bottleneckOf([null, null]), null);
});

test('a 2-bend hallway: the K <= 1 routes cut across, the chain from B* finds both bends and its weakest leg reads higher', () => {
  const B2 = [300, 260], E = [480, 260], S = scene([T, [140, 100], B2, E]);
  const cell = kCellAt(S, START, E, W);
  const chain = kChainAt(S, START, E, W);
  assert.equal(chain.verts.length, 4, `bends ${chain.verts.length - 2}`);
  assert.ok(dist(chain.verts[2], B2) < 0.5 * W, `second bend ${chain.verts[2].map(Math.round)} vs ${B2}`);
  assert.ok(chain.bottleneck > cell.best.bottleneck + 5, `chain ${chain.bottleneck.toFixed(1)} vs K<=1 ${cell.best.bottleneck.toFixed(1)} lum`);
  // the chain's first leg is the straight tee axis to B*, never split
  assert.deepEqual(chain.verts[1], badgeMidOf(START));
});

test('a 3-bend hallway gets 3 bends: K is bounded by the score, not by a constant', () => {
  const path = [T, [140, 100], [260, 220], [420, 220], [520, 380]], S = scene(path), E = path.at(-1);
  const chain = kChainAt(S, START, E, W);
  assert.equal(chain.verts.length - 2, 3, `bends ${chain.verts.length - 2}: ${JSON.stringify(chain.verts.map((v) => v.map(Math.round)))}`);
  // the weakest-leg polish puts each corner within a hallway width; centring it is the bend placement's job (bends.mjs, after)
  for (const [i, P] of [[2, path[2]], [3, path[3]]]) assert.ok(dist(chain.verts[i], P) < W, `bend ${i} at ${chain.verts[i].map(Math.round)} vs ${P}`);
});

test('a straight corridor past B* takes no extra bend: a split off the ribbon lowers both halves', () => {
  const E = [520, 100], S = scene([T, E]);
  const start = kChainStartAt(S, START, E, W), split = kSplitAt(S, start.verts, start.legs, W);
  assert.ok(split === null || !(split.bottleneck > start.bottleneck), 'a split may not raise a straight route');
  assert.equal(kChainAt(S, START, E, W).verts.length, 3);
  // the K <= 1 cell reads the straight route as well as any bent one
  const cell = kCellAt(S, START, E, W);
  assert.ok(Math.abs(cell.best.bottleneck - legContrastsOf(S, [START.S, E], W)[0]) < 1e-9 || cell.best.verts.length === 3);
});

test('K = 1 keeps its first bend at or past the badge-at-0.57 point (never just past the badge)', () => {
  const E = [100, 300], S = scene([T, [70, 100], E]);
  const cell = kCellAt(S, START, E, W), lo = (12 + 38) / KBENDS.firstBadgeFrac;
  if (cell.one) assert.ok(cell.one.verts[1][0] - T[0] >= lo - 1e-6, `B1 ${cell.one.verts[1][0] - T[0]} px along vs ${lo.toFixed(1)}`);
});

test('every leg read goes through legsOf (the store passes its profiled query)', () => {
  const E = [480, 260], S = scene([T, [140, 100], [300, 260], E]);
  let n = 0;
  const legsOf = (Sc, V, Wd) => { n++; return legContrastsOf(Sc, V, Wd); };
  const a = kChainAt(S, START, E, W, { legsOf }), b = kChainAt(S, START, E, W);
  assert.ok(n > 10); assert.deepEqual(a, b);
});

test('the rule set routeMatchKBends is the accepted rule set plus kBends, and the default rules do not use it', () => {
  const { kBends, ...rest } = RULE_SETS.routeMatchKBends;
  assert.equal(kBends, 'bottleneck');
  assert.deepEqual(rest, RULE_SETS.routeMatchTeeAxisBadgePrior);
  assert.equal(MATCH_RULES.kBends, undefined);
});
