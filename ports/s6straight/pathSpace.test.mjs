import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPartStore, registerQueries, RENDER_PART } from '../../fg/store.mjs';
import { renderValue } from '../../fg/render.mjs';
import { PATH_QUERIES } from './pathSpace.mjs';
import { ribbonRaster, FIXTURE_PROFILE, FIXTURE_ALPHA } from './fixtures/ribbon.mjs';

const W = 200, H = 120, FROM = [20, 30], TO = [180, 95], HALF = 8;
const seg = (dy = 0) => ({ fromPx: [FROM[0], FROM[1] + dy], toPx: [TO[0], TO[1] + dy] });
const storeOn = (parts) => {
  const store = createPartStore({ base: { has: (a) => a in parts, get: (a) => parts[a] } });
  registerQueries(store, PATH_QUERIES);
  return store;
};

// The same structure for every query family: answers are unitful, cached, profiled, and the value renders.
test('fn.q.path.*: unitful, cached, profiled, renderable', () => {
  const raster = ribbonRaster({ W, H, from: FROM, to: TO, halfPx: HALF });
  const store = storeOn({ 'px.image.cropped': raster });
  const args = { raster: 'px.image.cropped', opaque: null, segment: seg(), windowPx: HALF, profile: FIXTURE_PROFILE, threshold: { frac: FIXTURE_ALPHA / 2, rule: 'half the fixture alpha' } };
  for (const fn of Object.keys(PATH_QUERIES)) {
    const first = store.call(fn, args), again = store.call(fn, args);
    assert.equal(typeof first.unit, 'string', `${fn} answers with a unit`);
    assert.deepEqual(again.emits, { cached: 1 }, `${fn} answers the same question once`);
    assert.notEqual(renderValue(fn, first.value).kind, 'unrenderable', `${fn}'s value renders`);
  }
  assert.ok(store.calls().some((e) => e.calculation.startsWith('fn.q.path.')), 'every call is profiled');
});

test('fn.q.path.samples: 1 px steps, lateral window +-2w, centre colour per sample', () => {
  const raster = ribbonRaster({ W, H, from: FROM, to: TO, halfPx: HALF });
  const s = storeOn({ 'px.image.cropped': raster }).call('fn.q.path.samples', { raster: 'px.image.cropped', segment: seg(), windowPx: HALF }).value;
  const L = Math.hypot(TO[0] - FROM[0], TO[1] - FROM[1]);
  assert.equal(s.samplesCount, Math.floor(L) + 1);
  assert.deepEqual(s.offsetsPx, [-16, 16]);
  assert.equal(s.lateralRgbLevel.length, s.samplesCount * 33 * 3);
  assert.equal(s.hiddenCount, 0);
});

test('overlay fraction: within 0.05 of the composited alpha inside the ribbon, below 0.1 outside it', () => {
  const raster = ribbonRaster({ W, H, from: FROM, to: TO, halfPx: HALF });
  const store = storeOn({ 'px.image.cropped': raster });
  const inside = store.call('fn.q.path.overlayFraction', { raster: 'px.image.cropped', segment: seg(), windowPx: HALF, profile: FIXTURE_PROFILE }).value;
  assert.equal(inside.alpha.condition, 'alpha profile');
  const vin = inside.overlayFrac.filter((v) => v != null);
  assert.ok(vin.length >= inside.samplesCount - 2, 'every sample measured');
  for (const v of vin) assert.ok(Math.abs(v - FIXTURE_ALPHA) <= 0.05, `inside ${v} vs alpha ${FIXTURE_ALPHA}`);
  const outside = store.call('fn.q.path.overlayFraction', { raster: 'px.image.cropped', segment: seg(-50), windowPx: HALF, profile: FIXTURE_PROFILE }).value;
  const vout = outside.overlayFrac.filter((v) => v != null);
  assert.ok(vout.length > 50);
  for (const v of vout) assert.ok(v < 0.1, `outside ${v}`);
});

test('loss: a 30 px gap in the ribbon is the longest gap within 2 px; the loss fraction is its share', () => {
  const raster = ribbonRaster({ W, H, from: FROM, to: TO, halfPx: HALF, gapAlongPx: [60, 90] });
  const L = storeOn({ 'px.image.cropped': raster }).call('fn.q.path.loss', { raster: 'px.image.cropped', segment: seg(), windowPx: HALF, profile: FIXTURE_PROFILE, threshold: { frac: FIXTURE_ALPHA / 2, rule: 'half alpha' } }).value;
  assert.equal(L.condition, null);
  assert.ok(Math.abs(L.longestGapPx - 30) <= 2, `longest gap ${L.longestGapPx} px`);
  assert.ok(Math.abs(L.lossFrac - 30 / L.visiblePx) <= 3 / L.visiblePx, `loss ${L.lossFrac}`);
  assert.ok(L.meanOverlayFrac > 0.25 && L.meanOverlayFrac < FIXTURE_ALPHA);
});

test('no alpha profile: recorded condition and a labelled proxy, never a throw', () => {
  const raster = ribbonRaster({ W, H, from: FROM, to: TO, halfPx: HALF });
  const p = storeOn({ 'px.image.cropped': raster }).call('fn.q.path.overlayFraction', { raster: 'px.image.cropped', segment: seg(), windowPx: HALF, profile: { status: 'no alpha profile', reason: 'lane s7 not merged' } }).value;
  assert.equal(p.alpha.condition, 'no alpha profile');
  assert.equal(p.alpha.mode, 'proxy');
  assert.match(p.kind, /PROXY/);
  assert.match(p.alpha.reason, /lane s7/);
  const v = p.overlayFrac.filter((x) => x != null);
  assert.ok(v.length && v.every((x) => x > 0.15), 'the ribbon reads brighter than its background');
});

test('opaque sprites hide samples (no evidence either way) and end a gap', () => {
  const raster = ribbonRaster({ W, H, from: FROM, to: TO, halfPx: HALF, gapAlongPx: [60, 90] });
  const occ = new Uint8Array(W * H);
  // an opaque box over the middle of the gap
  const u = [(TO[0] - FROM[0]), (TO[1] - FROM[1])], L = Math.hypot(...u), c = [FROM[0] + u[0] / L * 75, FROM[1] + u[1] / L * 75];
  for (let y = Math.round(c[1]) - 4; y <= Math.round(c[1]) + 4; y++) for (let x = Math.round(c[0]) - 4; x <= Math.round(c[0]) + 4; x++) occ[y * W + x] = 1;
  const r = storeOn({ 'px.image.cropped': raster, 'tk.s4.evidence': { occ } }).call('fn.q.path.loss', { raster: 'px.image.cropped', opaque: 'tk.s4.evidence', segment: seg(), windowPx: HALF, profile: FIXTURE_PROFILE, threshold: { frac: 0.2, rule: 'half alpha' } }).value;
  assert.ok(r.hiddenPx >= 8, `hidden ${r.hiddenPx}`);
  assert.ok(r.longestGapPx < 25, `the box splits the gap: ${r.longestGapPx}`);
});

test('data conditions are recorded: no raster, no corridor width, degenerate segment', () => {
  const store = storeOn({ 'px.image.cropped': ribbonRaster({ W, H, from: FROM, to: TO, halfPx: HALF }) });
  assert.match(store.call('fn.q.path.loss', { raster: null, segment: seg(), windowPx: HALF }).value.condition, /no raster/);
  assert.equal(store.call('fn.q.path.loss', { raster: 'px.image.cropped', segment: seg(), windowPx: null }).value.condition, 'no corridor width');
  assert.match(store.call('fn.q.path.samples', { raster: 'px.image.cropped', segment: { fromPx: [5, 5], toPx: [5.2, 5] }, windowPx: HALF }).value.condition, /degenerate/);
  assert.equal(store.call(RENDER_PART, { a: 'px.image.cropped' }).value.kind, 'raster');
});
