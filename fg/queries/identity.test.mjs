import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPartStore, registerQueries } from '../store.mjs';
import { renderValue } from '../render.mjs';
import { IDENTITY_QUERIES } from './identity.mjs';

const course = (dx = 0, s = 1) => ({ badges: Array.from({ length: 8 }, (_, i) => ({ holeNumber: i + 1, xPx: s * (100 * i + 30 * Math.sin(i)) + dx, yPx: s * (50 * Math.cos(i * 1.3) + 10 * i) })), baskets: [], tees: [] });

// The same structure for every query family: answers are unitful, cached, profiled, and the value renders.
test('fn.q.identity.*: unitful, cached, profiled, renderable', () => {
  const store = createPartStore({ base: { has: (x) => x === 'tk.identity.points', get: () => course() } });
  registerQueries(store, IDENTITY_QUERIES);
  const args = { 'fn.q.identity.descriptor': { a: 'tk.identity.points' }, 'fn.q.identity.hash': { a: 'tk.identity.points' }, 'fn.q.identity.match': { source: course(), target: course(500, 2.2) } };
  for (const fn of Object.keys(IDENTITY_QUERIES)) {
    const first = store.call(fn, args[fn]), again = store.call(fn, args[fn]);
    assert.equal(typeof first.unit, 'string', `${fn} answers with a unit`);
    assert.deepEqual(again.emits, { cached: 1 }, `${fn} answers the same question once`);
    assert.notEqual(renderValue(fn, first.value).kind, 'unrenderable', `${fn}'s value renders`);
  }
  assert.ok(store.calls().some((e) => e.calculation.startsWith('fn.q.identity.')), 'every call is profiled');
  const m = store.call('fn.q.identity.match', args['fn.q.identity.match']).value;
  assert.ok(m.matched && m.model === 'similarity' && Math.abs(m.scale - 2.2) < 1e-9, 'a translated, 2.2x scaled copy matches with scale 2.2');
});
