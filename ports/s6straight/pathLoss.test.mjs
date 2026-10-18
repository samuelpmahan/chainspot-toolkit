import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPartStore, RENDER_PART } from '../../fg/store.mjs';
import { ALPHA_PROFILE_PART } from '../../contracts/alpha.profile@1.mjs';
import { registerPathLoss, registerAlphaAbsent, PATH_LOSS_PART, PATH_PAIRS_PART, PATH_CALLS, TESTIMONY_PART, localPathQueries, measurePairs } from './pathLoss.mjs';
import { ribbonRaster, FIXTURE_PROFILE, FIXTURE_ALPHA } from './fixtures/ribbon.mjs';

// A toy course: two tees, one straight hole (ribbon tee -> basket) and one bent (ribbon leaves the segment).
const W = 240, H = 160, HALF = 8;
const bbox = ([x, y]) => [x - 22.5 - 0.34, y - 71 - 0.73, 46, 72];   // BasketPoint(bbox) = [x, y]
function toyCourse() {
  const straight = { tee: [20, 40], basket: [200, 40] };
  const bent = { tee: [20, 120], corner: [110, 120], basket: [200, 90] };
  const a = ribbonRaster({ W, H, from: straight.tee, to: straight.basket, halfPx: HALF });
  // the bent hole: ribbon tee -> corner -> a point well off the tee -> basket segment
  const b1 = ribbonRaster({ W, H, from: bent.tee, to: bent.corner, halfPx: HALF, seed: 7 }), b2 = ribbonRaster({ W, H, from: bent.corner, to: [200, 150], halfPx: HALF, seed: 7 });
  const base = ribbonRaster({ W, H, from: [-100, -100], to: [-90, -100], halfPx: 1, seed: 7 });   // texture only
  const rgba = Uint8Array.from(base.rgba);
  for (let i = 0; i < rgba.length; i++) { const d = [a, b1, b2].map((r) => r.rgba[i] - base.rgba[i]); rgba[i] = base.rgba[i] + d.reduce((m, v) => (Math.abs(v) > Math.abs(m) ? v : m), 0); }
  const raster = { rgba, widthPx: W, heightPx: H };
  const rows = [
    { candidate: 'Tee ca', center: straight.tee, best: { badge: '1' }, straight3: { basket: 0, verdict: 'STRAIGHT', tlsMaxPx: 0.4 } },
    { candidate: 'Tee cb', center: bent.tee, best: { badge: '2' }, straight3: { basket: 1, verdict: 'BENT_OR_BASKET_UNSEEN', tlsMaxPx: 9 } },
    { candidate: 'Tee cc', center: [5, 5], best: null, straight3: null }
  ];
  const board = { 'px.image.cropped': raster, 'px.baskets': [{ bbox: bbox(straight.basket) }, { bbox: bbox(bent.basket) }] };
  return { board, rows, straight, bent };
}
function toyStore({ profile = null, testimony = true } = {}) {
  const { board, rows, straight, bent } = toyCourse();
  const store = createPartStore({ base: { has: (a) => a in board, get: (a) => board[a] } });
  store.constant('fn.tk.s6test.laneOutputs', {
    'px.tees.association': { rows }, 'tk.s4.evidence': { occ: new Uint8Array(W * H) }, 'tk.s4.hallway': { widthPx: 2 * HALF },
    [TESTIMONY_PART]: testimony ? { path: 'toy', holes: [{ hole: 1, teePx: straight.tee, basketPx: straight.basket, bent: false }, { hole: 2, teePx: bent.tee, basketPx: bent.basket, bent: true }] } : { path: null, holes: [] }
  });
  if (profile) store.constant('fn.tk.s7test.alphaProfile', { [ALPHA_PROFILE_PART]: profile }); else registerAlphaAbsent(store, 'lane s7 not merged into lane/s6');
  registerPathLoss(store);
  return store;
}

test('fn.tk.s6.pairs: one segment per associated tee with a basket beyond its badge; the rest recorded', () => {
  const p = toyStore().get(PATH_PAIRS_PART);
  assert.equal(p.pairs.length, 2);
  assert.deepEqual(p.pairs[0].basketPx, [200, 40]);
  assert.equal(p.skipped[0].reason, 'no badge associated');
  assert.match(p.pairs[0].pair, /^Tee ca -> Basket c[a-z]+ \(via Badge 1\)$/);
});

test('fn.tk.s6.pathLoss with a fixture profile: the straight hole keeps its ribbon, the bent one loses it', () => {
  const store = toyStore({ profile: FIXTURE_PROFILE });
  const v = store.get(PATH_LOSS_PART);
  assert.equal(v.alpha.condition, 'alpha profile');
  assert.equal(v.threshold.frac, FIXTURE_ALPHA / 2);
  const [s, b] = v.pairs;
  assert.ok(Math.abs(s.meanOverlayFrac - FIXTURE_ALPHA) <= 0.05, `straight mean ${s.meanOverlayFrac}`);
  assert.ok(s.lossFrac <= 0.02 && s.longestGapPx <= 2, `straight loss ${s.lossFrac}, gap ${s.longestGapPx}`);
  assert.ok(b.lossFrac > 0.25 && b.longestGapPx > 40, `bent loss ${b.lossFrac}, gap ${b.longestGapPx}`);
  assert.ok(Math.abs(v.pathLevel.learnedLevelFrac - FIXTURE_ALPHA) <= 0.05, 'the level learned on the straight hole is the alpha');
  const e = store.calls().find((x) => x.calculation === 'fn.tk.s6.pathLoss').emits;
  assert.equal(e.pairsCount, 2); assert.equal(e.alphaCondition, 'alpha profile'); assert.equal(e.samStraightCount, 1); assert.equal(e.samBentCount, 1);
  assert.ok(e.meanLossSamBentFrac > e.meanLossSamStraightFrac);
  assert.ok(store.calls().some((x) => x.calculation === PATH_CALLS.loss && x.caller === 'fn.tk.s6.pathLoss'), 'the queries are profiled under the Calculation');
  assert.notEqual(store.call(RENDER_PART, { a: PATH_LOSS_PART }).value.kind, 'unrenderable');
});

test('fn.tk.s6.pathLoss without a profile: no alpha profile recorded, the proxy level learned on the straight hole', () => {
  const store = toyStore();
  const v = store.get(PATH_LOSS_PART);
  assert.equal(v.alpha.condition, 'no alpha profile');
  assert.match(v.threshold.rule, /PROXY/);
  const [s, b] = v.pairs;
  assert.ok(s.lossFrac <= 0.02 && b.lossFrac > 0.25);
  assert.equal(store.calls().find((x) => x.calculation === 'fn.tk.s6.pathLoss').emits.alphaProfileCount, 0);
  assert.equal(store.provenance(ALPHA_PROFILE_PART).producedBy, 'fn.tk.s6.noAlphaProfile');
});

test('no testimony, no corridor: recorded, never thrown; the local queries give the store\'s answers', () => {
  const store = toyStore({ testimony: false });
  const v = store.get(PATH_LOSS_PART);
  assert.equal(v.agreement, null);
  const { board, rows } = toyCourse();
  const none = measurePairs(localPathQueries(board), { pairs: { pairs: [] }, hallway: null, profile: null, testimony: null });
  assert.equal(none.condition, 'no pairs');
  const local = measurePairs(localPathQueries({ ...board, 'tk.s4.evidence': { occ: new Uint8Array(W * H) } }), { pairs: store.get(PATH_PAIRS_PART), hallway: { widthPx: 2 * HALF }, profile: null, testimony: null });
  assert.deepEqual(local.pairs.map((p) => p.lossFrac), v.pairs.map((p) => p.lossFrac));
  assert.equal(rows.length, 3);
});
