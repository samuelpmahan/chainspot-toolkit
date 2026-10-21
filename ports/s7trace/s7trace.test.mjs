import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arange, samp, profile, edgePair, trace, judgeTrace, dilate4, fillHoles } from './hallway.mjs';
import { solveS3First } from './s3first.mjs';
import { solveEndpoints } from './endpoints.mjs';
import { judgeHoleTraces, matchBends } from './judgeBends.mjs';
import { tracesOf, pinnedSolve, simplify, STATUS } from './traceSpace.mjs';
import { compareRecorded } from './identity.mjs';
import { loadMatcher, acceptRule } from './run.mjs';
import { renderValue } from '../../fg/render.mjs';
import { SCENE_SCHEMA } from '../../fg/s7trace/sceneRender.mjs';

/**
 * Fixture: a flat 300 x 200 px course (lum 100) with one ribbon of width 30 px (lum 150) along tee (30, 100) -> bend
 * (170, 100) -> BasketPoint (250, 40); one badge on the first leg at (90, 100). Nothing masked.
 */
function fixtureScene() {
  const W = 300, H = 200, lum = new Float64Array(W * H).fill(100), path = [[30, 100], [170, 100], [250, 40]];
  const segD = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy; let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const d = Math.min(segD([x, y], path[0], path[1]), segD([x, y], path[1], path[2])); if (d <= 15) lum[y * W + x] = 150; }
  return { schema: SCENE_SCHEMA, W, H, lum, mask: new Uint8Array(W * H), occluder: new Uint8Array(W * H), bp: [[250, 40]], badges: { 1: [90, 100] }, badgeHalf: { 1: 12 },
    pads: [{ label: '1', cx: 30, cy: 100, thDeg: 0 }], L: 24, Wd: 16, R1: 40 };
}
const near = (a, b, px) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= px;

test('numpy equivalents: arange counts, bilinear sampling with replicated edges', () => {
  assert.equal(arange(-30, 30.01, 0.25).length, 241);
  assert.equal(arange(0, 360, 1.0).length, 360);
  const I = Float64Array.from([0, 10, 20, 30]);
  assert.equal(samp(I, 2, 2, 0.5, 0.5), 15);
  assert.equal(samp(I, 2, 2, -3, 0), 0);          // left of the image: the edge value
  const m = new Uint8Array(25); m[12] = 1;
  assert.equal(dilate4(m, 5, 5, 1).reduce((s, v) => s + v, 0), 5);
  const ring = Uint8Array.from([1, 1, 1, 1, 0, 1, 1, 1, 1]);
  assert.equal(fillHoles(ring, 3, 3)[4], 1);
});

test('the profile edge pair finds the ribbon width and centre', () => {
  const S = fixtureScene(), e = edgePair(profile(S, [40, 100], 0, 10, 100), 30);
  assert.ok(e && Math.abs(e.w - 30) <= 1.5 && Math.abs(e.c) <= 1, JSON.stringify(e));
});

test('the follower bends where the run ends and closes on the BasketPoint', () => {
  const S = fixtureScene(), r = trace(S, [40, 100], 0, 30);
  assert.equal(r.end, 0);
  assert.equal(r.verts.length, 3);
  assert.ok(near(r.verts[1], [170, 100], 6), `bend at ${r.verts[1]}`);
});

test('s3first: a bent hole with a tee is traced from its cap, one bend, ends on the BasketPoint', () => {
  const S = fixtureScene(), base = { 1: { teeCenter: [30, 100], u: [1, 0], straight3: { verdict: 'BENT_OR_BASKET_UNSEEN' } } };
  const r = solveS3First(S, base, { model: { widthPx: 30, source: 'fixture' } });
  assert.equal(r.holes[1].how, 'traced from the S3 tee');
  assert.equal(r.holes[1].end, 0); assert.equal(r.holes[1].bends, 1);
  assert.ok(near(r.holes[1].verts[1], [170, 100], 4), `bend at ${r.holes[1].verts[1]}`);
});

test('endpoints: the pair is scored, assigned by the exact matcher and traced back from the basket', () => {
  const matcher = loadMatcher();
  if (!matcher) return;   // the pinned provider is not in this checkout
  const S = fixtureScene();
  const r = solveEndpoints(S, [{ n: 1, c: [90, 100], half: 12, tee: { teeCenter: [30, 100], u: [1, 0] } }], 30, { matcher });
  assert.equal(r.assignment.locks.length, 1);
  assert.equal(r.holes[1].end, 0); assert.equal(r.holes[1].bends, 1);
  assert.ok(near(r.holes[1].verts[1], [170, 100], 4), `bend at ${r.holes[1].verts[1]}`);
  assert.ok(near(r.holes[1].verts.at(-1), [250, 40], 0.01));
});

test('the judge: ends at the basket, stays within W / 2 of the corridor; bends hit / missed / extra', () => {
  const sam = { hole: '1', tee: [30, 100], bends: [[172, 101]], basket: [251, 41], corridorWidthPx: 40 };
  assert.equal(judgeTrace({ verts: [[40, 100], [170, 100], [250, 40]], endPoint: [250, 40] }, sam, 30).ok, true);
  assert.equal(judgeTrace({ verts: [[40, 100], [250, 40]], endPoint: [250, 40] }, sam, 30).ok, false);   // the chord leaves the hallway
  const m = matchBends([[0, 0], [100, 0]], [[3, 0], [50, 50]], 20);
  assert.deepEqual([m.hits.length, m.missed, m.extra], [1, [1], [1]]);
  const traces = [{ hole: '1', status: STATUS.reached, path: [[40, 100], [170, 100], [250, 40]], bends: [[170, 100]], end: { basket: 'Basket ca', point: [250, 40] } }];
  const j = judgeHoleTraces(traces, { holes: [sam] }, { widthPx: 30 });
  assert.deepEqual([j.totals.agree, j.totals.bendsHit, j.totals.bendsMissed, j.totals.extraBends], [1, 1, 0, 0]);
  const lost = judgeHoleTraces([{ ...traces[0], status: STATUS.petered }], { holes: [sam] }, { widthPx: 30 });
  assert.equal(lost.totals.agree, 0);
  assert.equal(judgeHoleTraces(traces, { holes: [{ ...sam, bends: null }] }, { widthPx: 30 }).totals.judged, 0);   // old schema: unjudged
});

test('tracesOf names baskets and statuses; pinned is lane not run without native traces; simplify keeps corners', () => {
  const holesPart = { holes: [{ hole: '1' }, { hole: '2' }], baskets: [{ index: 0, name: 'Basket ca', point: [250, 40], source: 'S2' }] };
  const v = tracesOf({ widthPx: 30, holes: { 1: { verts: [[40, 100], [170, 100], [250, 40]], end: 0, legs: [{ passFrac: 1 }], how: 'x' } } }, holesPart, { rule: 'r' });
  assert.equal(v.traces[0].status, STATUS.reached); assert.equal(v.traces[0].end.basket, 'Basket ca'); assert.equal(v.traces[0].bends.length, 1);
  assert.equal(v.traces[1].status, STATUS.notTraced);
  assert.deepEqual(pinnedSolve({ condition: 'lane not run', traces: [] }, holesPart, 30), { condition: 'lane not run', holes: {} });
  assert.equal(simplify([[0, 0], [5, 0.2], [10, 0], [10, 10]], 1).length, 3);
});

test('the pointer: most agreeing holes, then fewest missed bends, then fewest extra, ties the S7 default, then fastest; unjudged follows --accept', () => {
  const value = { branches: { a: { agree: 16, bendsMissed: 1, extraBends: 2 }, b: { agree: 16, bendsMissed: 1, extraBends: 2 }, c: { agree: 15, bendsMissed: 0, extraBends: 0 } } };
  const branches = { a: {}, b: {}, c: {} }, timingsMs = { a: { ms: 9 }, b: { ms: 3 }, c: { ms: 1 } };
  assert.equal(acceptRule()(value, { names: ['a', 'b', 'c'], branches, timingsMs }), 'b');
  assert.equal(acceptRule({ judged: false, acceptedElsewhere: 'c' })(value, { names: ['a', 'b', 'c'], branches, timingsMs }), 'c');
  assert.equal(acceptRule({ judged: false })(value, { names: ['a', 'b', 'c'], branches, timingsMs }), null);
  // the S7 default wins a tie (not a loss): a slower tied default is taken, a better-judged variant still beats it
  assert.equal(acceptRule({ preferred: 'a' })(value, { names: ['a', 'b', 'c'], branches, timingsMs }), 'a');
  const better = { branches: { ...value.branches, b: { agree: 17, bendsMissed: 1, extraBends: 2 } } };
  assert.equal(acceptRule({ preferred: 'a' })(better, { names: ['a', 'b', 'c'], branches, timingsMs }), 'b');
});

test('identity comparison against a recorded prototype output', () => {
  const run = { widthPx: 30, holes: { 1: { how: 'x', end: 0, bends: 1, verts: [[0, 0], [10.4, 0], [20, 5]] } }, judge: { 1: { ok: true } } };
  const rec = { width: 30, holes: [{ hole: 1, end: 0, bends: 1, verts: [[0, 0], [10, 0], [20, 5]] }], judge: { 1: { ok: true } } };
  assert.equal(compareRecorded(run, rec).identicalHoles, 1);
  assert.equal(compareRecorded({ ...run, holes: { 1: { ...run.holes[1], verts: [[0, 0], [12, 0], [20, 5]] } } }, rec).identicalHoles, 0);
});

test('the hallway scene renders (S7 trace block of fg/render.mjs)', () => {
  const r = renderValue('tk.s7.scene', fixtureScene(), { widthPx: 300, heightPx: 200 });
  assert.equal(r.kind, 'hallwayScene');
  assert.ok(r.parts.some((p) => p.kind === 'raster' && p.data.png) && r.parts.some((p) => p.kind === 'ledger'));
});
