import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPartStore, RENDER_PART } from '../../fg/store.mjs';
import { renderValue } from '../../fg/render.mjs';
import { coverageAt } from '../s3assoc/padPose.mjs';
import { basketPoint } from '../s3assoc/associate.mjs';
import { composite, noProfile, ALPHA_PROFILE_PART, ALPHA_PROFILE_SCHEMA } from '../../contracts/alpha.profile@1.mjs';
import { registerPairQueries, padWindow, fillDiscs, residualOf, axisOf, PAIR_QUERY_NAMES } from './pairSpace.mjs';
import { S5_RESIDUAL_CALCULATIONS, RESIDUAL_PROFILE_PART, RESIDUAL_STRIPS_PART, STRAIGHT_TRUTH_PART, distribution } from './residualProfile.mjs';

const D2R = Math.PI / 180;
const FRAME = [247, 247, 247], INNER = [158, 157, 159];
const bgAt = (x, y) => [90 + 20 * Math.sin(x / 5) + 10 * Math.cos(y / 7), 110 + 15 * Math.cos(x / 6), 70 + 10 * Math.sin((x + y) / 9)];

/** Pads rendered with the AA model over a textured background; returns the float scene too (before quantisation). */
function scene({ W, H, pads }) {
  const rgba = new Uint8ClampedArray(W * H * 4), exact = new Float64Array(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let c = bgAt(x, y);
    for (const p of pads) {
      const [ao, ai] = coverageAt(x, y, p.cx, p.cy, p.th, p.L, p.Wd, p.se, p.ss), af = ao - ai;
      if (ao > 0) c = c.map((b, k) => b * (1 - ao) + af * FRAME[k] + ai * INNER[k]);
    }
    const g = y * W + x;
    for (let k = 0; k < 3; k++) { exact[g * 3 + k] = c[k]; rgba[g * 4 + k] = Math.round(c[k]); }
    rgba[g * 4 + 3] = 255;
  }
  return { rgba, exact };
}
const framePx = (W, H, p) => { const px = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [ao, ai] = coverageAt(x, y, p.cx, p.cy, p.th, p.L, p.Wd, p.se, p.ss); if (ao - ai > 0.5) px.push(y * W + x); } return Uint32Array.from(px); };
const board = (values) => ({ has: (a) => a in values, get: (a) => values[a] });
/** A basket bbox whose BasketPoint lands at [x, y] (the sprite itself is off the pad, owning no px here). */
const basketAt = ([x, y]) => { const bb = [0, 0, 46, 72], p = basketPoint(bb); return { bbox: [bb[0] + x - p[0], bb[1] + y - p[1], 46, 72], px: [] }; };
const fixtureProfile = ({ c1, c2 = null, r1Px }) => ({
  schema: ALPHA_PROFILE_SCHEMA, course: 'fixture', r1Px,
  overlays: { path: { status: 'not fitted', reason: 'fixture' }, c1Fill: c1, c2Fill: c2 ?? { status: 'not fitted', reason: 'fixture' }, c2Dash: { status: 'not fitted', reason: 'fixture' } },
  method: 'fixture: known rgb and alpha'
});

const PAD = { cx: 44.3, cy: 40.6, th: -21.4 * D2R, L: 25.02, Wd: 17.38, se: 3.56, ss: 3.04 };

/** The clean pad, and the same pad composited (then quantised) under a C2 fill over all of it and a C1 fill over part. */
function compositedFixture() {
  const W = 96, H = 84, clean = scene({ W, H, pads: [PAD] });
  const basket = basketAt([PAD.cx + 30, PAD.cy - 8]);   // C1 disc (r 26 px) crosses the pad; C2 disc (r 52 px) covers it
  const profile = fixtureProfile({ r1Px: 26, c1: { rgb: [235, 92, 88], alpha: 0.35 }, c2: { rgb: [60, 120, 230], alpha: 0.22 } });
  const discs = fillDiscs([basket], profile);
  const rgba = new Uint8ClampedArray(clean.rgba);
  let under = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const g = y * W + x; let c = [0, 1, 2].map((k) => clean.exact[g * 3 + k]), hit = false;
    for (const D of discs) if (Math.hypot(x - D.center[0], y - D.center[1]) <= D.rPx) { c = composite(c, D.overlay); hit = true; }
    if (hit) under++;
    for (let k = 0; k < 3; k++) rgba[g * 4 + k] = Math.round(c[k]);
  }
  return { W, H, clean, rgba, basket, profile, discs, under };
}

test('padWindow: a pad composited under known C2 and C1 fills unmixes back within 1/255 per channel', () => {
  const { W, H, clean, rgba, discs, under } = compositedFixture();
  const win = padWindow({ rgba, widthPx: W, heightPx: H }, 0, 0, Math.min(W, H), discs);
  assert.ok(win.unmixedPx > 1000 && win.unmixedPx <= under, `unmixed ${win.unmixedPx} px of ${under} px under a disc`);
  let worst = 0;
  for (let y = 0; y < Math.min(W, H); y++) for (let x = 0; x < Math.min(W, H); x++) for (let k = 0; k < 3; k++) {
    worst = Math.max(worst, Math.abs(win.raster.rgba[(y * Math.min(W, H) + x) * 4 + k] - clean.exact[(y * W + x) * 3 + k]));
  }
  assert.ok(worst <= 1, `worst channel error ${worst} RGB levels (1/255 = 1 level)`);
});

test('fn.q.pair.axis: the unmixed composited pad fits the clean pad axis within 0.5 deg; raw is the recorded fallback', () => {
  const { W, H, clean, rgba, basket, profile } = compositedFixture();
  const tees = [{ center: [PAD.cx + 0.7, PAD.cy - 0.5], angleRad: PAD.th + 1.5 * D2R, px: framePx(W, H, PAD) }];
  const mk = (raster) => { const s = createPartStore({ base: board({ 'px.image.cropped': { widthPx: W, heightPx: H, rgba: raster }, 'px.tees': tees, 'px.badges': [], 'px.baskets': [basket] }) }); s.constant('fn.t.alpha', { [ALPHA_PROFILE_PART]: profile }); registerPairQueries(s); return s; };
  const args = { raster: 'px.image.cropped', tees: 'px.tees', badges: 'px.badges', baskets: 'px.baskets', teeIndex: 0 };
  const sClean = mk(clean.rgba), sComp = mk(rgba);
  const a0 = sClean.call('fn.q.pair.axis', args).value;
  const aU = sComp.call('fn.q.pair.axis', { ...args, alphaProfile: ALPHA_PROFILE_PART }).value;
  const aR = sComp.call('fn.q.pair.axis', args).value;
  const dAxis = (a, b) => { const d = Math.abs(a.angleDeg - b.angleDeg) % 180; return Math.min(d, 180 - d); };
  assert.ok(Math.abs(a0.angleDeg - -21.4) < 0.2, `clean axis ${a0.angleDeg} deg vs truth -21.4 deg`);
  assert.ok(dAxis(aU, a0) < 0.5, `unmixed axis ${aU.angleDeg} deg vs clean ${a0.angleDeg} deg`);
  assert.equal(aU.alpha.status, 'applied');
  assert.deepEqual(aU.alpha.classes, ['c2Fill', 'c1Fill']);
  assert.ok(aU.unmixedPx > 0 && aR.unmixedPx === 0);
  assert.equal(aR.alpha.status, 'no alpha profile');
  assert.ok(Math.hypot(aU.center[0] - PAD.cx, aU.center[1] - PAD.cy) < 0.3, `unmixed centre ${aU.center}`);
  const e = sComp.calls().filter((c) => c.calculation === 'fn.q.pair.axis');
  assert.ok(e.some((c) => c.emits?.unmixedPx > 0), 'the store records how many px were unmixed');
});

test('fn.q.pair.*: unitful, cached, profiled, renderable', () => {
  const W = 96, H = 84, { rgba } = scene({ W, H, pads: [PAD] });
  const s = createPartStore({ base: board({ 'px.image.cropped': { widthPx: W, heightPx: H, rgba }, 'px.tees': [{ center: [PAD.cx, PAD.cy], angleRad: PAD.th, px: framePx(W, H, PAD) }], 'px.badges': [{ label: '1', bbox: [80, 10, 11, 11], px: [] }], 'px.baskets': [] }) });
  registerPairQueries(s);
  const calls = {
    'fn.q.pair.axis': { raster: 'px.image.cropped', tees: 'px.tees', badges: 'px.badges', baskets: 'px.baskets', teeIndex: 0 },
    'fn.q.pair.plate': { badges: 'px.badges', index: 0 },
    'fn.q.pair.residual': { axis: { center: [0, 0], dirUnit: [1, 0] }, badge: [100, 2] }
  };
  for (const fn of PAIR_QUERY_NAMES) {
    const first = s.call(fn, calls[fn]), again = s.call(fn, calls[fn]);
    assert.equal(typeof first.unit, 'string', `${fn} answers with a unit`);
    assert.deepEqual(again.emits, { cached: 1 }, `${fn} answers the same question once`);
    assert.notEqual(renderValue(fn, first.value).kind, 'unrenderable', `${fn}'s value renders`);
  }
  assert.deepEqual(s.call('fn.q.pair.plate', calls['fn.q.pair.plate']).value.center, [85, 15]);
  assert.ok(s.calls().some((e) => e.calculation.startsWith('fn.q.pair.')), 'every call is profiled');
  assert.ok(s.call('fn.q.pair.axis', { ...calls['fn.q.pair.axis'], teeIndex: 5 }).value.condition, 'a missing tee is a recorded condition');
});

test('residualOf / axisOf: an axis mod pi faces the badge; sign + = right of the axis on screen', () => {
  const ax = { center: [10, 10], ...axisOf(Math.PI) };   // the same axis as angle 0
  assert.ok(Math.abs(ax.angleDeg) < 1e-9);
  const r = residualOf(ax, [110, 12]);
  assert.ok(Math.abs(r.alongPx - 100) < 0.05 && Math.abs(r.signedPerpPx - 2) < 1e-9);
  assert.ok(Math.abs(r.angleResidualDeg - (Math.atan2(2, 100) * 180) / Math.PI) < 1e-9);
  const l = residualOf(ax, [-90, 12]);   // badge behind: the axis turns to face it; below the line is now its left
  assert.ok(Math.abs(l.alongPx - 100) < 0.05 && Math.abs(l.signedPerpPx + 2) < 1e-9);
  assert.deepEqual(distribution([], 'Deg').n, 0);
  assert.deepEqual(distribution([1, 3], 'Px'), { n: 2, meanPx: 2, sigmaPx: 1.414, medianPx: 2, maxAbsPx: 3 });
});

/** A toy board: three pads, three badges at known angle offsets off each pad's axis (holes 1, 2 straight; 3 bent). */
function toyBoard({ withTruth = true } = {}) {
  const W = 230, H = 200, pads = [
    { cx: 40.2, cy: 40.4, th: 3 * D2R, L: 25, Wd: 17.4, se: 3.56, ss: 3.04, delta: 0.5, along: 150 },
    { cx: 40.6, cy: 100.3, th: -6 * D2R, L: 25, Wd: 17.4, se: 3.56, ss: 3.04, delta: -0.3, along: 160 },
    { cx: 39.7, cy: 160.1, th: 0, L: 25, Wd: 17.4, se: 3.56, ss: 3.04, delta: 4, along: 155 }];
  const { rgba } = scene({ W, H, pads });
  const tees = pads.map((p) => ({ center: [p.cx + 0.4, p.cy - 0.3], angleRad: p.th - 1 * D2R, px: framePx(W, H, p) }));
  const badges = pads.map((p, i) => { const a = p.th + p.delta * D2R, c = [p.cx + p.along * Math.cos(a), p.cy + p.along * Math.sin(a)]; return { label: String(i + 1), bbox: [c[0] - 5, c[1] - 5, 11, 11], px: [] }; });
  const truth = withTruth ? { course: 'toy', source: 'fixture', rule: 'fixture', matchTeePx: 8, holes: pads.map((p, i) => ({ hole: i + 1, tee: [p.cx, p.cy], bent: i === 2 })) } : { course: 'toy', status: 'no testimony', holes: [], matchTeePx: 8 };
  return { pads, values: { 'px.image.cropped': { widthPx: W, heightPx: H, rgba }, 'px.tees': tees, 'px.badges': badges, 'px.baskets': [] }, truth };
}
const toyStore = ({ withTruth = true, profile = noProfile('S7 lane not merged (fixture)') } = {}) => {
  const t = toyBoard({ withTruth }), s = createPartStore({ base: board(t.values) });
  s.constant('fn.t.roots', { [STRAIGHT_TRUTH_PART]: t.truth, [ALPHA_PROFILE_PART]: profile });
  registerPairQueries(s);
  for (const [fn, spec] of S5_RESIDUAL_CALCULATIONS) s.register(fn, spec);
  return { s, t };
};

test('tk.s5.residualProfile: the straight-pair distribution on a toy board, bent pairs a referent, no alpha profile recorded', () => {
  const { s, t } = toyStore();
  const P = s.get(RESIDUAL_PROFILE_PART);
  assert.equal(P.condition, null);
  assert.equal(P.alpha.status, 'no alpha profile');
  assert.equal(P.straight.unmixed.status, 'no alpha profile');
  assert.equal(P.counts.straightPairs, 2); assert.equal(P.counts.bentPairs, 1);
  for (const r of P.rows) {
    const p = t.pads[r.hole - 1];
    assert.ok(Math.abs(r.angleResidualDeg - p.delta) < 0.15, `${r.identity}: ${r.angleResidualDeg} deg vs ${p.delta} deg`);
    assert.ok(Math.abs(r.signedPerpPx - p.along * Math.sin(p.delta * D2R)) < 0.4, `${r.identity}: ${r.signedPerpPx} px`);
  }
  assert.ok(Math.abs(P.straight.raw.angleResidualDeg.meanDeg - 0.1) < 0.15);
  assert.equal(P.straight.raw.angleResidualDeg.n, 2);
  assert.equal(P.bentReferent.angleResidualDeg.n, 1);
  const e = s.calls().find((c) => c.calculation === 'fn.tk.s5.residualProfile');
  assert.equal(e.emits.straightPairs, 2); assert.equal(e.emits.alphaProfile, 0);
  assert.notEqual(s.call(RENDER_PART, { a: RESIDUAL_PROFILE_PART }).value.kind, 'unrenderable');
  const strips = s.call(RENDER_PART, { a: RESIDUAL_STRIPS_PART }).value;
  assert.equal(strips.kind, 'strips');
  const pngs = strips.parts.filter((p) => p.kind === 'raster' && p.data.png);
  assert.equal(pngs.length, 3);
  assert.ok(pngs[0].address.startsWith('Tee 1 (Tee c'), pngs[0].address);
  assert.ok(strips.parts.some((p) => p.address.endsWith('#legend')));
});

test('tk.s5.residualProfile: with a fixture alpha profile both raw and unmixed are profiled; without testimony a condition', () => {
  const { s } = toyStore({ profile: fixtureProfile({ r1Px: 30, c1: { rgb: [235, 92, 88], alpha: 0.3 } }) });
  const P = s.get(RESIDUAL_PROFILE_PART);
  assert.equal(P.alpha.status, 'applied');
  assert.equal(P.straight.unmixed.angleResidualDeg.n, 2);   // no basket on the toy board: nothing under a disc, same numbers
  assert.equal(P.straight.unmixed.angleResidualDeg.meanDeg, P.straight.raw.angleResidualDeg.meanDeg);
  const { s: blind } = toyStore({ withTruth: false });
  const B = blind.get(RESIDUAL_PROFILE_PART);
  assert.equal(B.condition, 'no testimony');
  assert.equal(B.counts.paired, 0);
  assert.equal(B.straight.raw.angleResidualDeg.n, 0);
  assert.notEqual(blind.call(RENDER_PART, { a: RESIDUAL_STRIPS_PART }).value.kind, 'unrenderable');
});
