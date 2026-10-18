import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPartStore, registerQueries } from '../../fg/store.mjs';
import { renderValue } from '../../fg/render.mjs';
import { PAIR_QUERIES, residual, unitAxis } from './residualQuery.mjs';

// The same structure for every query family: answers are unitful, cached, profiled, and the value renders.
test('fn.q.pair.residual: unitful, cached, profiled, renderable', () => {
  const store = createPartStore({ base: { has: () => false, get: () => undefined } });
  registerQueries(store, PAIR_QUERIES);
  const args = { center: [10, 10], axis: [1, 0], plate: [110, 12] };
  for (const fn of Object.keys(PAIR_QUERIES)) {
    const first = store.call(fn, args), again = store.call(fn, args);
    assert.equal(typeof first.unit, 'string', `${fn} answers with a unit`);
    assert.deepEqual(again.emits, { cached: 1 }, `${fn} answers the same question once`);
    assert.notEqual(renderValue(fn, first.value).kind, 'unrenderable', `${fn}'s value renders`);
  }
  assert.ok(store.calls().some((e) => e.calculation === 'fn.q.pair.residual'), 'every call is profiled');
});

test('fn.q.pair.residual: an axis, oriented toward the plate; the pinned S5 definitions', () => {
  assert.deepEqual(residual({ center: [0, 0], axis: [1, 0], plate: [100, 0] }), { angleResidualDeg: 0, signedPerpPx: 0, alongPx: 100, distancePx: 100 });
  assert.equal(residual({ center: [0, 0], axis: unitAxis(Math.PI), plate: [100, 0] }).alongPx, 100, 'an axis, not a direction');
  const r = residual({ center: [0, 0], axis: [1, 0], plate: [100, 2] });
  assert.equal(r.signedPerpPx, 2); assert.equal(r.angleResidualDeg, Math.round(Math.atan2(2, 100) * 180 / Math.PI * 1000) / 1000);
  assert.equal(residual({ center: [0, 0], axis: [-1, 0], plate: [100, -2] }).signedPerpPx, -2, 'the sign follows the axis oriented toward the plate');
  assert.equal(residual({ center: [0, 0], axis: [2, 0], plate: [100, 2] }).signedPerpPx, 2, 'a non-unit axis is normalized');
  assert.ok(residual({ center: [0, NaN], axis: [1, 0], plate: [1, 1] }).unavailable, 'a data condition is recorded, not thrown');
});
