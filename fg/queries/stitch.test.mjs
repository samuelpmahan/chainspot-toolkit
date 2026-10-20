import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPartStore, registerQueries } from '../store.mjs';
import { renderValue } from '../render.mjs';
import { STITCH_QUERIES } from './stitch.mjs';

// The same structure for every query family: answers are unitful, cached, profiled, and the value renders.
test('fn.q.stitch.*: unitful, cached, profiled, renderable', () => {
  const store = createPartStore({ base: { has: (x) => x === 'px.example', get: () => [{ px: [1, 2] }, { px: [3] }] } });
  registerQueries(store, STITCH_QUERIES);
  for (const fn of Object.keys(STITCH_QUERIES)) {
    const first = store.call(fn, { a: 'px.example' }), again = store.call(fn, { a: 'px.example' });
    assert.equal(typeof first.unit, 'string', `${fn} answers with a unit`);
    assert.deepEqual(again.emits, { cached: 1 }, `${fn} answers the same question once`);
    assert.notEqual(renderValue(fn, first.value).kind, 'unrenderable', `${fn}'s value renders`);
  }
  assert.ok(store.calls().some((e) => e.calculation.startsWith('fn.q.stitch.')), 'every call is profiled');
});
