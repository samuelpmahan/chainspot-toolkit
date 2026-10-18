import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPartStore, RENDER_PART } from '../../fg/store.mjs';
import { ALPHA_PROFILE_PART } from '../../contracts/alpha.profile@1.mjs';
import { registerPathLoss, registerAlphaAbsent, PATH_LOSS_PART, PATH_PAIRS_PART, PATH_MASK_PART, HALLWAY_PART, PATH_CALLS, TESTIMONY_PART, localPathQueries, measurePairs } from './pathLoss.mjs';
import { ribbonRaster, FIXTURE_PROFILE, FIXTURE_ALPHA } from './fixtures/ribbon.mjs';

// A toy course: hole 1 straight (ribbon tee -> badge -> basket), hole 2 bent (the ribbon turns after its badge, away
// from the tee -> basket segment). Ribbon 20 px wide (|lateral| <= 10 px).
const W = 260, H = 180, HALF = 10;
const bboxAt = ([x, y]) => [x - 22.5 - 0.34, y - 71 - 0.73, 46, 72];   // BasketPoint(bbox) = [x, y]
const boxPx = ([x0, y0, w, h]) => { const px = []; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) px.push(y * W + x); return px; };
function toyCourse() {
  const straight = { tee: [24, 40], badge: [120, 40], basket: [230, 40] };
  const bent = { tee: [24, 130], badge: [90, 130], corner: [130, 130], basket: [230, 100] };
  const layers = [ribbonRaster({ W, H, from: straight.tee, to: straight.basket, halfPx: HALF }),
    ribbonRaster({ W, H, from: bent.tee, to: bent.corner, halfPx: HALF }), ribbonRaster({ W, H, from: bent.corner, to: [230, 175], halfPx: HALF })];
  const base = ribbonRaster({ W, H, from: [-100, -100], to: [-90, -100], halfPx: 1 });   // the texture alone
  const rgba = Uint8Array.from(base.rgba);
  for (let i = 0; i < rgba.length; i++) { let d = 0; for (const r of layers) { const v = r.rgba[i] - base.rgba[i]; if (Math.abs(v) > Math.abs(d)) d = v; } rgba[i] = base.rgba[i] + d; }
  const badge = (label, [x, y]) => { const bbox = [x - 5, y - 5, 10, 10]; return { label, bbox, px: boxPx(bbox), has: { mute: { px: [] } } }; };
  const board = {
    'px.image.cropped': { rgba, widthPx: W, heightPx: H },
    'px.baskets': [{ bbox: bboxAt(straight.basket), px: [] }, { bbox: bboxAt(bent.basket), px: [] }],
    'px.badges': [badge('1', straight.badge), badge('2', bent.badge)]
  };
  const rows = [
    { candidate: 'Tee ca', center: straight.tee, thDeg: 0, best: { badge: '1', sense: 1 }, straight3: { basket: 0, verdict: 'STRAIGHT', tlsMaxPx: 0.4 } },
    { candidate: 'Tee cb', center: bent.tee, thDeg: 0, best: { badge: '2', sense: 1 }, straight3: { basket: 1, verdict: 'BENT_OR_BASKET_UNSEEN', tlsMaxPx: 9 } },
    { candidate: 'Tee cc', center: [5, 5], thDeg: 0, best: null, straight3: null }
  ];
  return { board, rows, straight, bent };
}
function toyStore({ profile = null, testimony = true } = {}) {
  const { board, rows, straight, bent } = toyCourse();
  const store = createPartStore({ base: { has: (a) => a in board, get: (a) => board[a] } });
  store.constant('fn.tk.s6test.laneOutputs', {
    'px.tees.association': { rows, template: { L: 10 } }, 'px.tees.refined': [],
    [TESTIMONY_PART]: testimony ? { path: 'toy', holes: [{ hole: 1, teePx: straight.tee, basketPx: straight.basket, bent: false }, { hole: 2, teePx: bent.tee, basketPx: bent.basket, bent: true }] } : { path: null, holes: [] }
  });
  if (profile) store.constant('fn.tk.s7test.alphaProfile', { [ALPHA_PROFILE_PART]: profile }); else registerAlphaAbsent(store, 'lane s7 not merged into lane/s6');
  registerPathLoss(store);
  return store;
}

test('fn.tk.s6.pairs: tee cap -> straight3 BasketPoint per associated tee; the rest recorded', () => {
  const p = toyStore().get(PATH_PAIRS_PART);
  assert.equal(p.pairs.length, 2);
  assert.deepEqual(p.pairs[0].basketPx, [230, 40]);
  assert.ok(Math.abs(p.pairs[0].capPx[0] - (24 + 10 * 10.6 / 25.02)) < 1e-3, 'S = T + u FRONT L');
  assert.equal(p.skipped[0].reason, 'no badge associated');
  assert.match(p.pairs[0].pair, /^Tee ca -> Basket c[a-z]+ \(via Badge 1\)$/);
});

test('fn.tk.s6.pathMask and fn.tk.s6.hallway: owned px masked, the width learned on the tee -> badge segments', () => {
  const store = toyStore();
  const m = store.get(PATH_MASK_PART);
  assert.equal(m.mask[40 * W + 120], 1, 'the badge is masked');
  const h = store.get(HALLWAY_PART);
  assert.equal(h.condition, null);
  assert.ok(Math.abs(h.widthPx - 2 * HALF) <= 1, `width ${h.widthPx} px`);
  assert.equal(h.segments.filter((s) => s.usable).length, 2);
});

test('fn.tk.s6.pathLoss with a fixture profile: both measures keep the straight hole, lose the bent one', () => {
  const store = toyStore({ profile: FIXTURE_PROFILE });
  const v = store.get(PATH_LOSS_PART);
  assert.equal(v.alpha.condition, 'alpha profile');
  assert.equal(v.threshold.frac, FIXTURE_ALPHA / 2);
  const [s, b] = v.pairs;
  assert.ok(Math.abs(s.meanOverlayFrac - FIXTURE_ALPHA) <= 0.05, `straight mean ${s.meanOverlayFrac}`);
  assert.ok(s.edgePassFrac >= 0.9 && s.overlayLossFrac <= 0.05, `straight edge ${s.edgePassFrac}, overlay loss ${s.overlayLossFrac}`);
  assert.ok(b.edgePassFrac < 0.6 && b.overlayLossFrac > 0.3 && b.overlayLongestGapPx > 40, `bent edge ${b.edgePassFrac}, overlay loss ${b.overlayLossFrac}, gap ${b.overlayLongestGapPx}`);
  assert.ok(Math.abs(v.pathLevel.learnedLevelFrac - FIXTURE_ALPHA) <= 0.05, 'the level learned on the straight hole is the alpha');
  assert.ok(v.measures.measuresAgreeFrac > 0.8, `the two measures agree on ${v.measures.measuresAgreeFrac} of stations`);
  const e = store.calls().find((x) => x.calculation === 'fn.tk.s6.pathLoss').emits;
  assert.equal(e.pairsCount, 2); assert.equal(e.alphaCondition, 'alpha profile'); assert.equal(e.samStraightCount, 1); assert.equal(e.samBentCount, 1);
  assert.ok(e.edgePassSamStraightFrac > e.edgePassSamBentFrac && e.overlayLossSamBentFrac > e.overlayLossSamStraightFrac);
  assert.ok(store.calls().some((x) => x.calculation === PATH_CALLS.loss && x.caller === 'fn.tk.s6.pathLoss'), 'the queries are profiled under the Calculation');
  for (const a of [PATH_LOSS_PART, PATH_MASK_PART, HALLWAY_PART, PATH_PAIRS_PART]) assert.notEqual(store.call(RENDER_PART, { a }).value.kind, 'unrenderable', a);
});

test('fn.tk.s6.pathLoss without a profile: no alpha profile recorded, the proxy level learned on the straight hole', () => {
  const store = toyStore();
  const v = store.get(PATH_LOSS_PART);
  assert.equal(v.alpha.condition, 'no alpha profile');
  assert.match(v.threshold.rule, /PROXY/);
  const [s, b] = v.pairs;
  assert.ok(s.overlayLossFrac <= 0.05 && b.overlayLossFrac > 0.3);
  assert.equal(store.calls().find((x) => x.calculation === 'fn.tk.s6.pathLoss').emits.alphaProfileCount, 0);
  assert.equal(store.provenance(ALPHA_PROFILE_PART).producedBy, 'fn.tk.s6.noAlphaProfile');
});

test('no testimony, no pairs: recorded, never thrown; the local queries give the store\'s answers', () => {
  const store = toyStore({ testimony: false });
  const v = store.get(PATH_LOSS_PART);
  assert.equal(v.agreement, null);
  const none = measurePairs(localPathQueries({}), { pairs: { pairs: [] }, hallway: null, profile: null, testimony: null });
  assert.equal(none.condition, 'no pairs');
  const parts = { 'px.image.cropped': store.get('px.image.cropped'), [PATH_MASK_PART]: store.get(PATH_MASK_PART) };
  const local = measurePairs(localPathQueries(parts), { pairs: store.get(PATH_PAIRS_PART), hallway: store.get(HALLWAY_PART), profile: null, testimony: null });
  assert.deepEqual(local.pairs.map((p) => [p.edgePassFrac, p.overlayLossFrac]), v.pairs.map((p) => [p.edgePassFrac, p.overlayLossFrac]));
});
