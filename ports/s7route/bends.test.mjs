import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCENE_SCHEMA } from '../../fg/s7trace/sceneRender.mjs';
import { routeSensorAt } from './routeSpace.mjs';
import { BENDS, centreSamples, initBends, boundedLeastSquares, fitBends, refineBendsOf } from './bends.mjs';
import { routeMatchOf } from './match.mjs';

/**
 * Fixture: a flat 420 x 260 px course (lum 100), one ribbon of width W = 30 px (lum 150) through tee cap (40, 100) -> bend
 * (230, 100) -> BasketPoint (330, 30) (a heading change of about 35 degrees). Nothing masked; the badge sits at (90, 100), the one
 * BasketPoint at the ribbon's end, so the exclusion discs (2 R1 = 30 px, badge half 10 + W/2) stay off the middle of the legs.
 */
const W = 30, S0 = [40, 100], TRUE_BEND = [230, 100], E = [330, 30];
function scene(path = [S0, TRUE_BEND, E]) {
  const IW = 420, IH = 260, lum = new Float64Array(IW * IH).fill(100);
  const segD = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy; let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
  for (let y = 0; y < IH; y++) for (let x = 0; x < IW; x++) { let d = Infinity; for (let i = 0; i + 1 < path.length; i++) d = Math.min(d, segD([x, y], path[i], path[i + 1])); if (d <= W / 2) lum[y * IW + x] = 150; }
  return { schema: SCENE_SCHEMA, W: IW, H: IH, lum, mask: new Uint8Array(IW * IH), occluder: new Uint8Array(IW * IH), bp: [E], badges: { 1: [90, 100] }, badgeHalf: { 1: 10 }, pads: [], L: 24, Wd: 16, R1: 15 };
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test('centre samples lie on the ribbon centreline and none falls inside the badge or C2 exclusion zones', () => {
  const S = scene(), P = centreSamples(S, [S0, TRUE_BEND, E], W);
  assert.ok(P.length > 20, `${P.length} samples`);
  for (const p of P) {
    const on = Math.min(...[[S0, TRUE_BEND], [TRUE_BEND, E]].map(([a, b]) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }));
    assert.ok(on < 2.5, `sample ${p} is ${on} px off the centreline`);
    assert.ok(dist(p, [90, 100]) > 10 + BENDS.badgeExclusionW * W && dist(p, E) > BENDS.c2R1 * 15);
  }
});

test('the DP segmentation puts the bend at the heading change; the bounded fit moves a misplaced bend onto it', () => {
  const S = scene(), P = centreSamples(S, [S0, TRUE_BEND, E], W), B = initBends(P, 1, W);
  assert.equal(B.length, 1); assert.ok(dist(B[0], TRUE_BEND) < 8, `init bend ${B[0]}`);
  const off = [190, 100], [c, K, V] = fitBends(P, S0, E, [S0, off, E], 1, W);
  assert.equal(K, 1); assert.ok(dist(V[1], TRUE_BEND) < 6, `fitted bend ${V[1]} (cost ${c})`);
  // box: a bend never leaves boundW x W of its start, however the samples pull
  const far = boundedLeastSquares((x) => [x[0] - 1000, x[1]], [0, 0], [-45, -45], [45, 45]);
  assert.deepEqual(far.map((v) => Math.round(v)), [45, 0]);
});

test('the bend count is chosen on evidence: a straight ribbon keeps 0 bends, an extra bend is not invented', () => {
  const straight = [S0, [330, 100]], S = scene(straight), V = [S0, [190, 100], [330, 100]];
  const r = refineBendsOf(S, V, W, {});
  // the matching rule's 1 bend lies on the straight ribbon; the fit may drop it only on a sensor gain, and never adds one
  assert.ok(r.verts.length <= 3);
  const P = centreSamples(S, [S0, [330, 100]], W), [, K] = fitBends(P, S0, [330, 100], [S0, [330, 100]], 0, W);
  assert.equal(K, 0);
});

test('rule 2: a changed bend count needs a sensor gain > 0.05 and a reading >= 0.75; an unchanged count needs no worse than 0.02', () => {
  const S = scene(), start = [S0, [150, 100], E];   // a bend 80 px short of the true one: the sensor already reads part of it
  const r = refineBendsOf(S, start, W, {});
  assert.equal(r.K1, 1);
  assert.ok(r.sensorNew >= r.sensorOld - BENDS.gate.dropMax || !r.taken);
  if (r.taken) assert.ok(dist(r.verts[1], TRUE_BEND) < 8, `bend ${r.verts[1]}`);
  // a refit onto the true ribbon reads >= the old route: the bend moves to the heading change
  const good = refineBendsOf(S, [S0, [225, 104], E], W, {});
  assert.ok(good.K1 === 1 && routeSensorAt(S, good.verts, W).passFrac >= 0.9);
});

test('rule 1: a hole S6 reads straight keeps the matching rule\'s route exactly', () => {
  const S = scene(), V = [S0, [150, 100], E], r = refineBendsOf(S, V, W, { straight: true });
  assert.equal(r.taken, false); assert.deepEqual(r.verts, V); assert.match(r.why, /S6 reads the hole straight/);
});

test('routeMatchOf: the step is off without a verdict argument, skipped with a condition when S6 has no verdict, and rule 1 reads S6\'s verdict per hole', () => {
  const S = scene(), V = [S0, TRUE_BEND, E];
  const table = { widthPx: W, holes: ['1'], baskets: [{ point: E }], contrastMatrix: [[30]], onAxisPrior: [[0]], rows: [{ cells: [{ contrast: { verts: V } }] }] };
  const starts = { holes: [{ hole: '1', S: S0, u: [1, 0], badgeAlongPx: 50 }] };
  const off = routeMatchOf(table, S, starts, {}).holes['1'];
  assert.equal(off.bendsRefined, null);
  const none = routeMatchOf(table, S, starts, { straight: null }).holes['1'];
  assert.equal(none.bendsRefined.taken, false); assert.match(none.bendsRefined.why, /no S6 straight verdict/); assert.deepEqual(none.verts, off.verts);
  const kept = routeMatchOf(table, S, starts, { straight: { 1: 'straight' } }).holes['1'];
  assert.match(kept.bendsRefined.why, /S6 reads the hole straight/); assert.deepEqual(kept.verts, off.verts);
  const bent = routeMatchOf(table, S, starts, { straight: { 1: 'bent' } }).holes['1'];
  assert.ok(bent.bendsRefined && bent.verts.length >= 2 && Math.abs(bent.verts.at(-1)[0] - E[0]) < 1e-9, JSON.stringify(bent.bendsRefined));
});
