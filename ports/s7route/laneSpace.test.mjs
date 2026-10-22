import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPartStore, registerQueries } from '../../fg/store.mjs';
import { fourLaneAt, threeLaneAt, laneTrackOf, laneStepAt, discEntered, maxLateralW, crosscheckOf, LANE_QUERIES, LANE, LANE_REACH } from './laneSpace.mjs';

/** A synthetic scene: ground lum 100, a ribbon (lum 145, width w, round joins) along a polyline: east from (10, 100) to (130, 100),
 *  then 45 deg south-east to the BasketPoint (195, 165) with C1 = R1 px; straightOnly: east to the image border, no basket. */
const segD = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
export const BEND = [[10, 100], [130, 100], [195, 165]];
function lScene({ w = 20, R1 = 10, W = 220, H = 220, mask = null, straightOnly = false } = {}) {
  const lum = new Float64Array(W * H).fill(100), m = new Uint8Array(W * H), V = straightOnly ? [[10, 100], [W + 50, 100]] : BEND;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let d = Infinity; for (let i = 0; i + 1 < V.length; i++) d = Math.min(d, segD([x, y], V[i], V[i + 1]));
    if (d <= w / 2) lum[y * W + x] = 145;
    if (mask && mask(x, y)) m[y * W + x] = 1;
  }
  return { W, H, lum, mask: m, R1, bp: straightOnly ? [] : [[195, 165]], badges: { 1: [60, 100] }, badgeHalf: { 1: 6 } };
}
const start = { hole: '1', S: [20, 100], u: [1, 0], badgeAlongPx: 40 };
const stepOn = (c, lanes, W) => (x, y, h, straight) => laneStepAt(c, lanes, x, y, h, W, straight);

test('the four-lane cross-section reads 1 centred on the ribbon, rails paired; less off-centre', () => {
  const c = lScene(), o = fourLaneAt(c, 80, 100, 0, 20);
  assert.equal(o.railMode, 'paired');
  assert.equal(o.score, 1);
  const off = fourLaneAt(c, 80, 108, 0, 20);
  assert.ok(off.score < 0.5, `off-centre by 0.4 W reads ${off.score}`);
  assert.equal(threeLaneAt(c, 80, 100, 0, 20).score, 1);
});

test('a masked sample is UNKNOWN, never evidence: a masked cross-section reads null', () => {
  const c = lScene({ mask: (x) => x >= 70 && x <= 90 });
  const o = fourLaneAt(c, 80, 100, 0, 20);
  assert.equal(o.score, null);
  assert.equal(o.railMode, 'occluded');
});

test('the tracker follows the bent ribbon to the BasketPoint whose C1 it enters; the track closes on it', () => {
  for (const lanes of [4, 3]) {
    const c = lScene(), t = laneTrackOf(c, start, 20, stepOn(c, lanes, 20));
    assert.equal(t.stop, 'basket', `${lanes}-lane stop ${t.stop}`);
    assert.equal(t.basket, 0);
    assert.deepEqual(t.path.at(-1), [195, 165]);
    assert.equal(t.violations.length, 0);
    assert.ok(maxLateralW(t.path, [[20, 100], ...BEND.slice(1)], 20) < LANE.agreeLateralW, `${lanes}-lane stays within W/2 of the L`);
  }
});

test('discEntered: the entry into the C1 disc, exempt baskets skipped', () => {
  assert.deepEqual(discEntered([0, 0], [20, 0], [[15, 0]], 5, new Set()), { k: 0, t: 0.5, kind: 'C1' });
  assert.deepEqual(discEntered([0, 0], [20, 0], [[15, 30]], 5, new Set(), [[12, -4, 6, 8]]), { k: 0, t: 0.625, kind: 'sprite' });
  assert.equal(discEntered([0, 0], [20, 0], [[15, 0]], 5, new Set([0])), null);
  assert.equal(discEntered([0, 0], [20, 0], [[15, 9]], 5, new Set()), null);
});

test('the reach is a stated assumption: a long hole is a recorded violation, widened, never clipped silently', () => {
  // R1 2 px: the stated reach is 24 R1 = 48 px; the straight ribbon runs to the image border (210 px)
  const c = lScene({ straightOnly: true, R1: 2 }), t = laneTrackOf(c, start, 20, stepOn(c, 4, 20));
  assert.equal(t.stop, 'image-border');
  const v = t.violations.find((x) => x.assumption === LANE_REACH.name);
  assert.ok(v && v.recovered, 'the reach violation is recorded and recovered by widening');
  assert.ok(v.tries.length >= 2);
});

test('the lane queries answer with units on a store; the track calls laneStep per step', () => {
  const store = createPartStore();
  store.constant('fn.tk.fixture.scene', { 'tk.s7.sceneS4': lScene() });
  registerQueries(store, LANE_QUERIES);
  const o = store.call('fn.q.route.fourLane', { scene: 'tk.s7.sceneS4', x: 80, y: 100, heading: 0, widthPx: 20 });
  assert.equal(o.value.score, 1); assert.match(o.unit, /fraction/);
  const t = store.call('fn.q.route.laneTrack', { scene: 'tk.s7.sceneS4', lanes: 4, start, widthPx: 20 }).value;
  assert.equal(t.stop, 'basket');
  assert.equal(store.calls().filter((e) => e.calculation === 'fn.q.route.laneStep').length, t.steps);
  const none = store.call('fn.q.route.laneTrack', { scene: 'tk.s7.sceneS4', lanes: 4, start, widthPx: 0 }).value;
  assert.match(none.condition, /no hallway width/);
});

test('crosscheckOf: agree, basket-differs, no-basket', () => {
  const holes = { baskets: [{ name: 'Basket ca' }, { name: 'Basket cb' }] };
  const tracks = { R1Px: 10, holes: [
    { hole: '1', stop: 'basket', basket: 0, path: [[0, 0], [100, 0]], verts: [[0, 0], [100, 0]], walkedR1: 10 },
    { hole: '2', stop: 'basket', basket: 1, path: [[0, 50], [100, 90]], verts: [], walkedR1: 10 },
    { hole: '3', stop: 'evidence-lost', basket: null, path: [[0, 200], [30, 200]], verts: [], walkedR1: 3 }] };
  const solve = { holes: { 1: { end: 0, verts: [[0, 0], [100, 2]] }, 2: { end: 0, verts: [[0, 50], [100, 50]] }, 3: { end: 1, verts: [[0, 200], [100, 200]] } } };
  const x = crosscheckOf(tracks, solve, holes, 20);
  assert.deepEqual(x.rows.map((r) => r.verdict), ['agree', 'basket-differs', 'no-basket']);
  assert.equal(x.totals.flagged, 2);
});

test('a basket on the tee -> badge segment is recorded, never a stop (the skeleton: tee, badge, basket)', () => {
  const c = lScene();
  c.bp = [[45, 100], [195, 165]];   // Basket 0 sits on the transit, before the badge (along 40 px past S)
  const t = laneTrackOf(c, { ...start, badgeAlongPx: 60 }, 20, stepOn(c, 4, 20));
  assert.equal(t.stop, 'basket');
  assert.equal(t.basket, 1);
  assert.deepEqual(t.transitCrossed.map((q) => [q.basket, q.kind]), [[0, 'C1']]);
});
