// fn.q.alpha.*: the queries answer with units, cached, profiled, renderable; the math recovers a known composite on a
// synthetic scene (flat and textured backgrounds); the contract's pure functions round-trip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPartStore } from '../store.mjs';
import { renderValue } from '../render.mjs';
import { ALPHA_QUERIES, registerAlphaQueries, fitOverlay, ringSamples, ribbonSamples, opaquePlane, ringScale } from './alphaSpace.mjs';
import { scene, toyBoard } from './synthetic.mjs';
import { composite, unmix, overlayFraction, noProfile, hasOverlay, ALPHA_PROFILE_PART, OVERLAY_CLASSES } from '../../contracts/alpha.profile@1.mjs';

const FILL = { rgb: [120, 220, 140], alpha: 0.3 }, PATH = { rgb: [235, 235, 235], alpha: 0.35 };
const W = 1200, H = 900;
const CENTRES = []; for (let i = 0; i < 9; i++) for (let j = 0; j < 5; j++) CENTRES.push([70 + i * 130, 70 + j * 130]);
const RIBBONS = [[[20, 700], [1180, 680]], [[20, 760], [1180, 790]], [[20, 870], [1180, 840]]].map(([a, b], k) => ({ a, b, widthPx: 30, overlay: PATH, name: `ribbon ${k}` }));
const near = (got, want, tol, what) => assert.ok(Math.abs(got - want) <= tol, `${what}: ${got} vs ${want} (tolerance ${tol})`);

for (const bg of ['flat', 'textured']) {
  test(`a disc and a ribbon composited at known rgb / alpha are recovered (${bg} background): alpha within 0.02, rgb within 3 levels`, () => {
    const { raster } = scene({ W, H, bg, seed: 7, discs: CENTRES.map((c) => ({ centre: c, radiusPx: 40 })), fill: FILL, stroke: { rgb: [200, 200, 210], alpha: 0.6, widthPx: 3 }, ribbons: RIBBONS });
    const op = opaquePlane(raster, []);
    const disc = fitOverlay(ringSamples(raster, { centres: CENTRES, r1Px: 40, ring: 'c1', opaque: op }).pairs,
      { control: ringSamples(raster, { centres: CENTRES, r1Px: 40, ring: 'c1', opaque: op, edgeRadiusPx: 25 }).pairs });
    near(disc.alpha, FILL.alpha, 0.02, `disc alpha (${disc.method})`);
    disc.rgb.forEach((v, c) => near(v, FILL.rgb[c], 3, `disc rgb[${c}]`));
    const ribbon = fitOverlay(ribbonSamples(raster, { segments: RIBBONS, widthPx: 30, opaque: op }).pairs,
      { control: ribbonSamples(raster, { segments: RIBBONS, widthPx: 30, opaque: op, edgeOffsetPx: 15 + 2 * (2.5 + 4) + 1 }).pairs });
    near(ribbon.alpha, PATH.alpha, 0.02, `ribbon alpha (${ribbon.method})`);
    ribbon.rgb.forEach((v, c) => near(v, PATH.rgb[c], 3, `ribbon rgb[${c}]`));
    assert.equal(disc.method, bg === 'flat' ? 'calibrated' : 'contrast', 'flat terrain: regression; texture: contrast (the control decides)');
  });
}

test('on texture, regression of inside on outside is attenuated; the contrast estimator is not (why the default is what it is)', () => {
  const { raster } = scene({ W: 900, H: 700, bg: 'textured', seed: 3, discs: CENTRES.filter(([x, y]) => x < 880 && y < 680).map((c) => ({ centre: c, radiusPx: 40 })), fill: FILL });
  const op = opaquePlane(raster, []), cs = CENTRES.filter(([x, y]) => x < 880 && y < 680);
  const pairs = ringSamples(raster, { centres: cs, r1Px: 40, ring: 'c1', opaque: op }).pairs;
  assert.ok(fitOverlay(pairs, { method: 'ols' }).alpha > FILL.alpha + 0.1, 'OLS alpha comes out high on texture');
  near(fitOverlay(pairs, { method: 'contrast' }).alpha, FILL.alpha, 0.02, 'contrast alpha');
});

test('data conditions are recorded, never thrown', () => {
  assert.equal(fitOverlay([]).status, 'not fitted');
  assert.equal(fitOverlay(Array.from({ length: 20 }, () => ({ in: [10, 10, 10], out: [5, 5, 5], varIn: 0, varOut: 0, px: 1 })), { method: 'ols' }).status, 'not fitted');
  const { raster } = scene({ W: 60, H: 40, bg: 'flat' });
  assert.equal(ringScale(raster, [], opaquePlane(raster, [])).status, 'not fitted');
});

test('R1 from the rings: the (R, 2R) pair of a toy board', () => {
  const t = toyBoard({ c1: FILL, c2: { rgb: [150, 215, 180], alpha: 0.2 }, path: PATH, r1Px: 30 });
  const s = ringScale(t.raster, t.centres, opaquePlane(t.raster, [t.baskets, t.badges, t.tees]));
  near(s.r1Px, 30, 1, 'R1 px (the fill step beside the stroke peak pulls it inward by < 1 px)'); near(s.ratio, 2, 0.06, 'C2 / C1');
});

test('fn.q.alpha.*: unitful, cached, profiled, renderable', () => {
  const t = toyBoard({ W: 600, H: 400, c1: FILL, c2: { rgb: [150, 215, 180], alpha: 0.2 }, path: PATH });
  const parts = { 'px.image.cropped': t.raster, 'px.baskets': t.baskets, 'px.badges': t.badges, 'px.tees': t.tees };
  const store = createPartStore({ base: { has: (a) => a in parts, get: (a) => parts[a] } });
  registerAlphaQueries(store);
  const sprites = ['px.baskets', 'px.badges', 'px.tees'], centres = t.centres.filter(([x, y]) => x < 600 && y < 400);
  const samples = store.call('fn.q.alpha.ringSamples', { raster: 'px.image.cropped', centres, sprites, r1Px: 30, ring: 'c1' }).value;
  const args = {
    'fn.q.alpha.fitOverlay': { pairs: samples.pairs, options: { method: 'contrast' } },
    'fn.q.alpha.unmix': { raster: 'px.image.cropped', px: [0, 1, 2], overlay: FILL },
    'fn.q.alpha.overlayFraction': { raster: 'px.image.cropped', px: [0, 1, 2], background: [100, 100, 100], overlay: FILL },
    'fn.q.alpha.ringScale': { raster: 'px.image.cropped', centres, sprites },
    'fn.q.alpha.ringSamples': { raster: 'px.image.cropped', centres, sprites, r1Px: 30, ring: 'c2' },
    'fn.q.alpha.ribbonSamples': { raster: 'px.image.cropped', segments: [{ a: [40, 300], b: [560, 300], name: 's' }], widthPx: 30, sprites },
    'fn.q.alpha.spritesInWindow': { raster: 'px.image.cropped', sprites, centre: centres[0], size: 100 }
  };
  for (const fn of Object.keys(ALPHA_QUERIES)) {
    assert.ok(args[fn], `${fn} has a test case`);
    const first = store.call(fn, args[fn]), again = store.call(fn, args[fn]);
    assert.equal(typeof first.unit, 'string', `${fn} answers with a unit`);
    assert.deepEqual(again.emits, { cached: 1 }, `${fn} answers the same question once`);
    assert.notEqual(renderValue(fn, first.value).kind, 'unrenderable', `${fn}'s value renders`);
  }
  assert.ok(store.calls().some((e) => e.calculation.startsWith('fn.q.alpha.')), 'every call is profiled');
  const ps = store.call('fn.q.alpha.ringSamples', args['fn.q.alpha.ringSamples']).value;
  assert.ok(ps.counts.spritePx > 0 && ps.counts.ringStrokeAaPx > 0, 'sprite px and the stroke AA band are excluded by geometry and counted, never muted');
});

test('contract alpha.profile@1: composite, unmix and overlayFraction round-trip', () => {
  for (const bg of [[0, 0, 0], [255, 255, 255], [37, 120, 201], [128, 128, 128]]) for (const o of [FILL, PATH, { rgb: [10, 20, 30], alpha: 0.9 }]) {
    const seen = composite(bg, o);
    unmix(seen, o).forEach((v, c) => near(v, bg[c], 1e-9, 'unmix(composite(bg)) = bg'));
    if (bg.some((v, c) => v !== o.rgb[c])) near(overlayFraction(seen, bg, o), o.alpha, 1e-9, 'overlayFraction(composite) = alpha');
    near(overlayFraction(bg, bg, o) ?? 0, 0, 1e-9, 'no overlay: fraction 0');
  }
  assert.equal(unmix([1, 2, 3], { rgb: [1, 2, 3], alpha: 1 }), null, 'opaque: nothing behind it');
  assert.equal(overlayFraction([5, 5, 5], [9, 9, 9], { rgb: [9, 9, 9] }), null, 'background = overlay colour: undecidable');
  assert.equal(noProfile('lane not run').status, 'no alpha profile');
  assert.equal(hasOverlay({ overlays: { path: { alpha: 0.3 } } }, 'path'), true);
  assert.equal(hasOverlay({ overlays: { path: { status: 'not fitted' } } }, 'path'), false);
  assert.equal(ALPHA_PROFILE_PART, 'tk.s7.alphaProfile');
  assert.deepEqual([...OVERLAY_CLASSES], ['path', 'c1Fill', 'c2Fill', 'c2Dash']);
});
