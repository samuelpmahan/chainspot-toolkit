import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPartStore, registerQueries, RENDER_PART } from '../../fg/store.mjs';
import { renderValue } from '../../fg/render.mjs';
import { PATH_QUERIES, spriteMaskOf, ringMaskOf, edgePairOf, profileAt, lumOf } from './pathSpace.mjs';
import { ribbonRaster, FIXTURE_PROFILE, FIXTURE_ALPHA } from './fixtures/ribbon.mjs';

// A ribbon |lateral| <= 8 px composited at alpha 0.4 along (20, 30) -> (180, 95): 17 px wide (px centres -8..8).
const W = 200, H = 120, FROM = [20, 30], TO = [180, 95], HALF = 8, RIBBON_PX = 2 * HALF + 1;
const PHI = Math.atan2(TO[1] - FROM[1], TO[0] - FROM[0]), LEN = Math.hypot(TO[0] - FROM[0], TO[1] - FROM[1]);
const along = (dy = 0) => ({ originPx: [FROM[0], FROM[1] + dy], phiRad: PHI, t0Px: 0, t1Px: LEN, stepPx: 1, widthPx: RIBBON_PX });
const storeOn = (parts) => {
  const store = createPartStore({ base: { has: (a) => a in parts, get: (a) => parts[a] } });
  registerQueries(store, PATH_QUERIES);
  return store;
};
const R = (extra = {}) => ({ raster: 'px.image.cropped', mask: null, ...extra });

// The same structure for every query family: answers are unitful, cached, profiled, and the value renders.
test('fn.q.path.*: unitful, cached, profiled, renderable', () => {
  const store = storeOn({ 'px.image.cropped': ribbonRaster({ W, H, from: FROM, to: TO, halfPx: HALF }) });
  const args = R({ ...along(), t0Px: 10, t1Px: 60, profile: FIXTURE_PROFILE, threshold: { frac: FIXTURE_ALPHA / 2, rule: 'half the fixture alpha' } });
  for (const fn of Object.keys(PATH_QUERIES)) {
    const first = store.call(fn, args), again = store.call(fn, args);
    assert.equal(typeof first.unit, 'string', `${fn} answers with a unit`);
    assert.equal(first.value.condition ?? null, null, `${fn}: ${first.value.condition}`);
    assert.deepEqual(again.emits, { cached: 1 }, `${fn} answers the same question once`);
    assert.notEqual(renderValue(fn, first.value).kind, 'unrenderable', `${fn}'s value renders`);
  }
  assert.ok(store.calls().some((e) => e.calculation.startsWith('fn.q.path.')), 'every call is profiled');
});

test('edge pair and width search find the ribbon edges (track.py edge_pair, teebadge.py search)', () => {
  const store = storeOn({ 'px.image.cropped': ribbonRaster({ W, H, from: FROM, to: TO, halfPx: HALF }) });
  const e = store.call('fn.q.path.edgePair', R({ ...along(), t0Px: 10, t1Px: 150, tolPx: 3, latLimPx: 3 })).value;
  assert.ok(Math.abs(e.wPx - 2 * HALF) <= 0.6 && Math.abs(e.cPx) <= 0.5, `edges ${e.lPx} .. ${e.rPx}`);
  const w = store.call('fn.q.path.width', R({ ...along(), t0Px: 10, t1Px: 150, widthsPx: [10, 30, 1] })).value;   // edges sit half-way between the last ribbon px and the first off it: 2 x 8 px
  assert.ok(Math.abs(w.wPx - 2 * HALF) <= 0.6, `width ${w.wPx}`);
  const p = store.call('fn.q.path.profile', R({ ...along(), t0Px: 10, t1Px: 150 })).value;
  assert.equal(p.profLum.length, 241); assert.equal(p.stationsCount, 140);
});

test('overlay fraction: within 0.05 of the composited alpha inside the ribbon, below 0.1 outside it', () => {
  const store = storeOn({ 'px.image.cropped': ribbonRaster({ W, H, from: FROM, to: TO, halfPx: HALF }) });
  const inside = store.call('fn.q.path.overlayFraction', R({ ...along(), t0Px: 2, t1Px: LEN - 2, profile: FIXTURE_PROFILE })).value;
  assert.equal(inside.alpha.condition, 'alpha profile');
  const vin = inside.overlayFrac.filter((v) => v != null);
  assert.ok(vin.length >= inside.stationsCount - 4, `measured ${vin.length} of ${inside.stationsCount}`);
  for (const v of vin) assert.ok(Math.abs(v - FIXTURE_ALPHA) <= 0.05, `inside ${v} vs alpha ${FIXTURE_ALPHA}`);
  const outside = store.call('fn.q.path.overlayFraction', R({ ...along(-50), t0Px: 2, t1Px: LEN - 2, profile: FIXTURE_PROFILE })).value;
  const vout = outside.overlayFrac.filter((v) => v != null);
  assert.ok(vout.length > 50);
  for (const v of vout) assert.ok(v < 0.1, `outside ${v}`);
});

test('loss: a 30 px gap is the overlay longest gap within 2 px; the edge test fails across it too', () => {
  const store = storeOn({ 'px.image.cropped': ribbonRaster({ W, H, from: FROM, to: TO, halfPx: HALF, gapAlongPx: [60, 90] }) });
  const L = store.call('fn.q.path.loss', R({ ...along(), t0Px: 2, t1Px: LEN - 2, profile: FIXTURE_PROFILE, threshold: { frac: FIXTURE_ALPHA / 2, rule: 'half alpha' } })).value;
  assert.equal(L.condition, null);
  assert.ok(Math.abs(L.overlay.longestGapPx - 30) <= 2, `overlay longest gap ${L.overlay.longestGapPx} px`);
  assert.ok(Math.abs(L.overlay.lossFrac - 30 / L.overlay.visibleCount) <= 3 / L.overlay.visibleCount, `overlay loss ${L.overlay.lossFrac}`);
  assert.ok(L.edge.longestGapPx >= 20 && L.edge.longestGapPx <= 36, `edge longest gap ${L.edge.longestGapPx} px`);
  assert.ok(L.edge.passFrac > 0.7 && L.edge.passFrac < 0.9, `edge pass ${L.edge.passFrac}`);
  const off = store.call('fn.q.path.loss', R({ ...along(-50), t0Px: 2, t1Px: LEN - 2, profile: FIXTURE_PROFILE, threshold: { frac: 0.2, rule: 'half alpha' } })).value;
  assert.ok(off.edge.passFrac < 0.05 && off.overlay.passFrac < 0.05, 'off the ribbon both measures fail');
  assert.ok(L.agreementCounts.edgePassOverlayPass > 50);
});

test('no alpha profile: recorded condition and a labelled proxy, never a throw', () => {
  const store = storeOn({ 'px.image.cropped': ribbonRaster({ W, H, from: FROM, to: TO, halfPx: HALF }) });
  const p = store.call('fn.q.path.overlayFraction', R({ ...along(), t0Px: 2, t1Px: LEN - 2, profile: { status: 'no alpha profile', reason: 'lane s7 not merged' } })).value;
  assert.equal(p.alpha.condition, 'no alpha profile'); assert.equal(p.alpha.mode, 'proxy');
  assert.match(p.kind, /PROXY/); assert.match(p.alpha.reason, /lane s7/);
  assert.ok(p.overlayFrac.filter((x) => x != null).every((x) => x > 0.15), 'the ribbon reads brighter than its background');
});

test('the mask: holes filled, 2 px cross dilation, rings; masked samples are no evidence', () => {
  const Wm = 12, Hm = 12, ring = [];   // a 3 x 3 square outline with a hole at (5, 5)
  for (let y = 4; y <= 6; y++) for (let x = 4; x <= 6; x++) if (!(x === 5 && y === 5)) ring.push(y * Wm + x);
  const { filled, sprite } = spriteMaskOf(Wm, Hm, [ring]);
  assert.equal(filled[5 * Wm + 5], 1, 'hole filled');
  assert.equal(sprite[5 * Wm + 2], 1); assert.equal(sprite[5 * Wm + 1], 0); assert.equal(sprite[2 * Wm + 2], 0, 'cross, not square');
  const rm = ringMaskOf(40, 40, [[20, 20]], 6);
  assert.equal(rm[20 * 40 + 26], 1); assert.equal(rm[20 * 40 + 20], 0); assert.equal(rm[20 * 40 + 32], 1);
  const raster = ribbonRaster({ W, H, from: FROM, to: TO, halfPx: HALF });
  const mask = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 90; x < 110; x++) mask[y * W + x] = 1;
  const store = storeOn({ 'px.image.cropped': raster, 'tk.s6.pathMask': { widthPx: W, heightPx: H, mask } });
  const L = store.call('fn.q.path.loss', R({ ...along(), mask: 'tk.s6.pathMask', t0Px: 2, t1Px: LEN - 2, profile: FIXTURE_PROFILE, threshold: { frac: 0.2, rule: 'half alpha' } })).value;
  assert.ok(L.edge.visibleCount < L.stationsCount - 15 && L.overlay.visibleCount < L.stationsCount - 15, 'the masked band hides stations');
  assert.ok(L.edge.passFrac > 0.9 && L.overlay.passFrac > 0.9, 'and costs nothing');
  const c = { lum: lumOf(raster), W, H, mask, raster };
  assert.ok(edgePairOf(profileAt(c, [FROM[0], FROM[1]], PHI, 2, LEN - 2), RIBBON_PX, { tolW: 3, latLim: 3 }));
});

test('data conditions are recorded: no raster, no corridor width, no stations', () => {
  const store = storeOn({ 'px.image.cropped': ribbonRaster({ W, H, from: FROM, to: TO, halfPx: HALF }) });
  assert.match(store.call('fn.q.path.loss', { ...along(), raster: null }).value.condition, /no raster/);
  assert.equal(store.call('fn.q.path.loss', R({ ...along(), widthPx: null })).value.condition, 'no corridor width');
  assert.match(store.call('fn.q.path.loss', R({ ...along(), t0Px: 50, t1Px: 40 })).value.condition, /no stations/);
  assert.equal(store.call('fn.q.path.edgePair', R({ ...along(-50), t0Px: 2, t1Px: 100, latLimPx: 1, tolPx: 0.1, widthPx: 40 })).value.condition, 'no edge pair');
  assert.equal(store.call(RENDER_PART, { a: 'px.image.cropped' }).value.kind, 'raster');
});
