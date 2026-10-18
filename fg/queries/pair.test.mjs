import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPartStore, registerQueries } from '../store.mjs';
import { renderValue } from '../render.mjs';
import { PAIR_QUERIES, axisResidual } from './pair.mjs';

// The same structure for every query family: answers are unitful, cached, profiled, and the value renders.
test('fn.q.pair.*: unitful, cached, profiled, renderable', () => {
  const store = createPartStore({ base: { has: () => false, get: () => undefined } });
  registerQueries(store, PAIR_QUERIES);
  const args = { center: [10, 10], angleRad: 0, target: [110, 12] };
  for (const fn of Object.keys(PAIR_QUERIES)) {
    const first = store.call(fn, args), again = store.call(fn, args);
    assert.equal(typeof first.unit, 'string', `${fn} answers with a unit`);
    assert.deepEqual(again.emits, { cached: 1 }, `${fn} answers the same question once`);
    assert.notEqual(renderValue(fn, first.value).kind, 'unrenderable', `${fn}'s value renders`);
  }
  assert.ok(store.calls().some((e) => e.calculation.startsWith('fn.q.pair.')), 'every call is profiled');
});

test('fn.q.pair.axisResidual: an axis, oriented toward the badge; the pinned S5 definitions', () => {
  // straight at it: zero residual, along = distance
  assert.deepEqual(axisResidual({ center: [0, 0], angleRad: 0, target: [100, 0] }), { angleResidualDeg: 0, signedPerpPx: 0, alongPx: 100, distancePx: 100 });
  // an axis, not a direction: pi flips nothing
  assert.deepEqual(axisResidual({ center: [0, 0], angleRad: Math.PI, target: [100, 0] }).alongPx, 100);
  // 2 px below the axis (y down) at 100 px: +2 px, atan(2/100) deg
  const r = axisResidual({ center: [0, 0], angleRad: 0, target: [100, 2] });
  assert.equal(r.signedPerpPx, 2); assert.equal(r.angleResidualDeg, Math.round(Math.atan2(2, 100) * 180 / Math.PI * 1000) / 1000);
  assert.equal(axisResidual({ center: [0, 0], angleRad: Math.PI, target: [100, -2] }).signedPerpPx, -2, 'the sign follows the axis oriented toward the target');
  // a data condition is recorded, not thrown
  assert.ok(axisResidual({ center: [0, NaN], angleRad: 0, target: [1, 1] }).unavailable);
});
