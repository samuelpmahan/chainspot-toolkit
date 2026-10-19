import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTestimony, corridorOf } from './testimony.mjs';
import { loadHolePaths } from '../s7trace/holePaths.mjs';
import { judgeHoleTraces } from '../s7trace/judgeBends.mjs';

test("alex's old-schema corridors: each edge oriented by geometry, widths 28-35 px (not ~330 px from pairing opposite ends)", () => {
  const T = loadTestimony('alex');
  assert.deepEqual(T.annotated, [6, 13, 16]);
  for (const n of [16, 13, 6]) {
    const c = T.holes.get(n).corridor;
    assert.ok(c && c.widthsPx.length >= 3, `hole ${n}: no corridor`);
    for (const w of c.widthsPx) assert.ok(w >= 25 && w <= 40, `hole ${n}: corridor width ${w.toFixed(1)} px`);
    assert.deepEqual(c.centre[0], T.holes.get(n).tee); assert.deepEqual(c.centre.at(-1), T.holes.get(n).basket);
    assert.equal(T.holes.get(n).bends, null);   // midpoints are corridor samples, not bends
  }
  const P = loadHolePaths('alex');
  for (const h of P.holes) assert.ok(h.corridorWidthPx >= 25 && h.corridorWidthPx <= 40 && h.centre.length >= 5, JSON.stringify(h));
});

test('corridorOf orients either edge whichever way it was stored', () => {
  const tee = [0, 0], basket = [100, 0], left = [[10, -15], [50, -15], [90, -15]], right = [[10, 15], [50, 15], [90, 15]];
  for (const [l, r] of [[left, right], [left, [...right].reverse()], [[...left].reverse(), right], [[...left].reverse(), [...right].reverse()]]) {
    const c = corridorOf(tee, basket, l, r);
    assert.deepEqual(c.widthsPx, [30, 30, 30]); assert.deepEqual(c.centre, [[0, 0], [10, 0], [50, 0], [90, 0], [100, 0]]);
  }
});

test('the S7 judge judges an old-schema route on the corridor centreline; its bends stay unjudged', () => {
  const paths = { path: 'fixture', holes: [{ hole: '6', tee: [0, 0], basket: [200, 100], bends: null, corridorWidthPx: 30, centre: [[0, 0], [60, 0], [100, 0], [150, 50], [200, 100]] }] };
  const trace = (path) => [{ hole: '6', status: 'reached', path, bends: path.slice(1, -1), end: { point: path.at(-1) } }];
  const good = judgeHoleTraces(trace([[0, 0], [100, 2], [200, 100]]), paths, { widthPx: 30 }).rows[0];
  assert.equal(good.judged, true); assert.equal(good.ok, true); assert.equal(good.bendsJudged, false); assert.equal(good.bendsSam, null);
  const chord = judgeHoleTraces(trace([[0, 0], [200, 100]]), paths, { widthPx: 30 }).rows[0];
  assert.equal(chord.ok, false); assert.match(chord.why, /leaves the hallway/);
});
