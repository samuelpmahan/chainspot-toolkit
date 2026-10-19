import assert from 'node:assert/strict';
import test from 'node:test';
import { createPartStore, registerQueries } from '../probes/root-inventory/source/fg/store.mjs';
import { enumerableBoard } from './board.mjs';

function read(value, shape, cache) {
  const pxc = new Map([['px.toy.scalar', value], ['px.toy.fixed', 7]]);
  const board = shape === 'map' ? pxc : Object.freeze({
    has(a) { return pxc.has(a); }, get(a) { return pxc.get(a); }, addresses: [...pxc.keys()]
  });
  const store = createPartStore({ base: shape === 'loader' ? enumerableBoard(board) : board, cache });
  registerQueries(store, { 'fn.q.toy.identity': ({ scalar }) => ({ value: scalar, unit: 'toy scalar' }) });
  store.register('fn.toy.dependent', {
    outParts: ['tk.toy.dependent'], calls: ['fn.q.toy.identity'],
    calculate: io => ({ 'tk.toy.dependent': io.call('fn.q.toy.identity', { scalar: 'px.toy.scalar' }).value })
  });
  store.register('fn.toy.unrelated', {
    inParts: ['px.toy.fixed'], outParts: ['tk.toy.unrelated'],
    calculate: io => ({ 'tk.toy.unrelated': io.in('px.toy.fixed') * 2 })
  });
  const actual = store.get('tk.toy.dependent'), unrelated = store.get('tk.toy.unrelated');
  const dependent = store.calls().find(r => r.calculation === 'fn.toy.dependent');
  const fixed = store.calls().find(r => r.calculation === 'fn.toy.unrelated');
  return { actual, unrelated, key: dependent.key, cached: dependent.cached === true,
    unrelatedCached: fixed.cached === true, rootKey: store.keyOf('px.toy.scalar'),
    queryCalls: store.calls().filter(r => r.calculation === 'fn.q.toy.identity').length };
}

for (const shape of ['map', 'loader']) test(`${shape}: fresh immutable boards 1 -> 9 -> 1 share cache correctly`, () => {
  const cache = new Map();
  const first = read(1, shape, cache), changed = read(9, shape, cache), restored = read(1, shape, cache);
  console.log(JSON.stringify({ shape, first, changed, restored }));
  assert.equal(first.actual, 1);
  assert.equal(changed.actual, 9);
  assert.equal(restored.actual, 1);
  assert.notEqual(first.rootKey, changed.rootKey);
  assert.notEqual(first.key, changed.key);
  assert.equal(first.key, restored.key);
  assert.equal(first.cached, false);
  assert.equal(changed.cached, false);
  assert.equal(restored.cached, true);
  assert.equal(restored.queryCalls, 0);
  assert.equal(changed.unrelated, 14);
  assert.equal(changed.unrelatedCached, true);
  assert.equal(restored.unrelatedCached, true);
});

// Additional contract checks are first-GREEN coverage, not claimed as observed RED regressions.
test('first-GREEN: forwarding preserves receiver, get identity, and original board surface', () => {
  const value = Object.freeze({ scalar: 4 });
  const board = Object.freeze({
    addresses: Object.freeze(['px.toy.object']), value,
    has(a) { assert.equal(this, board); return a === 'px.toy.object'; },
    get(a) { assert.equal(this, board); return a === 'px.toy.object' ? this.value : undefined; }
  });
  const view = enumerableBoard(board);
  assert.equal(view.has('px.toy.object'), true);
  assert.equal(view.has('absent'), false);
  assert.equal(view.get('px.toy.object'), value);
  assert.equal(view.get('absent'), undefined);
  assert.equal('keys' in board, false);
  assert.equal(Object.isFrozen(view), true);
  assert.equal(Object.isFrozen(view.addresses), true);
  assert.notEqual(view.keys(), view.keys());
  assert.deepEqual([...view.keys()], ['px.toy.object']);
  assert.deepEqual([...view.keys()], ['px.toy.object']);
});

test('first-GREEN: Map keys work and Part object identity survives', () => {
  const value = { scalar: 3 }, board = new Map([['px.toy.object', value]]);
  const view = enumerableBoard(board);
  assert.deepEqual([...view.keys()], ['px.toy.object']);
  assert.equal(view.get('px.toy.object'), value);
  assert.equal(view.has('absent'), false);
});

test('first-GREEN: empty complete boards are valid', () => {
  for (const board of [new Map(), { has: () => false, get: () => undefined, addresses: [] }])
    assert.deepEqual([...enumerableBoard(board).keys()], []);
});

test('first-GREEN: invalid or missing enumeration fails visibly without silent fallback', () => {
  const valid = { has: () => true, get: () => 1 };
  for (const board of [null, {}, { get: valid.get, addresses: [] }, { has: valid.has, addresses: [] },
    valid, { ...valid, addresses: 'px.a' }, { ...valid, addresses: [''] },
    { ...valid, addresses: [1] }, { ...valid, addresses: ['px.a', 'px.a'] },
    { ...valid, addresses: ['px.a'], has: () => false },
    { ...valid, keys: null, addresses: ['px.a'] }, { ...valid, keys: () => null, addresses: ['px.a'] }])
    assert.throws(() => enumerableBoard(board), TypeError);
});
