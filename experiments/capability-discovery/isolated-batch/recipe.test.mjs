import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createPartStore, registerQueries } from '../probes/root-inventory/source/fg/store.mjs';
import { enumerableBoard } from '../enumerable-board/board.mjs';
import { isolatedBatch, codeSalt } from './recipe.mjs';

const slots = Array.from({ length: 6 }, (_, i) => `tk.lab12.upload${i + 1}.summary`);
const salt = createHash('sha256').update(codeSalt).update(readFileSync(new URL(import.meta.url))).digest('hex');
const fixture = changed => Array.from({ length: 6 }, (_, i) => new Uint8Array(
  i === 2 && changed ? [70, 8, 9] : [i * 3 + 1, i * 3 + 2, i * 3 + 3]));

// Existing whole-board composition: every query caller sees all six roots.
function globalBatch(uploads, { cache, shape = 'loader' }) {
  const roots = uploads.map((_, i) => `tk.lab12.upload${i + 1}.bytes`);
  const board = new Map(roots.map((a, i) => [a, uploads[i]]));
  const loader = { addresses: [...board.keys()], has(a) { return board.has(a); }, get(a) { return board.get(a); } };
  const store = createPartStore({ base: shape === 'map' ? board : enumerableBoard(loader), cache, codeSalt: salt });
  registerQueries(store, { 'fn.q.lab12.byteSum': ({ a }) => ({
    value: [...a].reduce((sum, byte) => sum + byte, 0), unit: 'byte-value sum'
  }) });
  const leaves = roots.map((root, i) => {
    const out = slots[i], fn = `fn.lab12.upload${i + 1}.sum`;
    store.register(fn, { inParts: [root], outParts: [out], calls: ['fn.q.lab12.byteSum'],
      calculate: io => { const answer = io.call('fn.q.lab12.byteSum', { a: root });
        return { [out]: { value: answer.value, unit: answer.unit } }; } });
    const value = store.get(out);
    return { bridge: { ...value, sourceKey: store.keyOf(root), producerKey: store.keyOf(out) },
      calls: store.calls().filter(e => e.calculation === fn || e.caller === fn) };
  });
  store.register('fn.lab12.batch.sum', { inParts: slots, outParts: ['tk.lab12.batch.summary'], calls: [],
    calculate: io => { const values = slots.map(a => io.in(a).value);
      return { 'tk.lab12.batch.summary': { values, value: values.reduce((a, b) => a + b, 0),
        unit: 'byte-value sum', count: 6, countUnit: 'uploads' } }; } });
  const summary = store.get('tk.lab12.batch.summary');
  return { summary, leaves, aggregate: { key: store.keyOf('tk.lab12.batch.summary'),
    calls: store.calls().filter(e => e.calculation === 'fn.lab12.batch.sum') } };
}
const runBatch = isolatedBatch;

test('changing one upload recomputes only that query leaf; restore is warm', () => {
  const cache = new Map(), inputs = [fixture(false), fixture(true), fixture(false)];
  const before = inputs.map(batch => batch.map(bytes => [...bytes]));
  const [first, changed, restored] = inputs.map(uploads => runBatch(uploads, { cache }));
  const computed = batch => batch.leaves.filter(leaf => !leaf.calls.find(e => e.outParts.length).cached).length;
  const queries = batch => batch.leaves.reduce((n, leaf) => n + leaf.calls.filter(e => e.calculation === 'fn.q.lab12.byteSum').length, 0);
  assert.deepEqual(first.summary, { values: [6, 15, 24, 33, 42, 51], value: 171, unit: 'byte-value sum', count: 6, countUnit: 'uploads' });
  assert.deepEqual(changed.summary, { values: [6, 15, 87, 33, 42, 51], value: 234, unit: 'byte-value sum', count: 6, countUnit: 'uploads' });
  assert.deepEqual(restored.summary, first.summary);
  console.log(JSON.stringify({ locality: { computations: [first, changed, restored].map(computed), queries: [first, changed, restored].map(queries) } }));
  assert.equal(computed(first), 6);
  assert.equal(computed(changed), 1);
  assert.equal(computed(restored), 0);
  assert.deepEqual([first, changed, restored].map(queries), [6, 1, 0]);
  for (let i = 0; i < 6; i++) {
    assert.equal(first.leaves[i].bridge.sourceKey === changed.leaves[i].bridge.sourceKey, i !== 2);
    assert.equal(first.leaves[i].bridge.producerKey === changed.leaves[i].bridge.producerKey, i !== 2);
    assert.deepEqual(restored.leaves[i].bridge, first.leaves[i].bridge);
  }
  assert.notEqual(first.aggregate.key, changed.aggregate.key);
  assert.equal(first.aggregate.key, restored.aggregate.key);
  assert.deepEqual([first, changed, restored].map(batch => batch.aggregate.calls[0].cached), [false, false, true]);
  assert.deepEqual(inputs.map(batch => batch.map(bytes => [...bytes])), before);
  assert.equal(new Set(inputs.flat()).size, 18);
  console.log(JSON.stringify({ isolated: { codeSalt, codeKeys: first.leaves[0].codeKeys,
    aggregateCodeKey: first.aggregate.codeKey, phases: [first, changed, restored] } }));
});

test('first-GREEN control: global Map and complete wrapped loader remain broad on the same 18-byte fixture', () => {
  const arms = ['map', 'loader'].map(shape => {
    const cache = new Map();
    return [false, true, false].map(changed => globalBatch(fixture(changed), { cache, shape }));
  });
  for (const phases of arms) {
    assert.deepEqual(phases.map(batch => batch.summary.value), [171, 234, 171]);
    assert.deepEqual(phases.map(batch => batch.leaves.filter(leaf => !leaf.calls.find(e => e.outParts.length).cached).length), [6, 6, 0]);
    assert.deepEqual(phases.map(batch => batch.leaves.reduce((n, leaf) => n + leaf.calls.filter(e => e.calculation === 'fn.q.lab12.byteSum').length, 0)), [6, 6, 0]);
    for (let i = 0; i < 6; i++) {
      assert.equal(phases[0].leaves[i].bridge.sourceKey === phases[1].leaves[i].bridge.sourceKey, i !== 2);
      assert.notEqual(phases[0].leaves[i].bridge.producerKey, phases[1].leaves[i].bridge.producerKey);
      assert.deepEqual(phases[0].leaves[i].bridge, phases[2].leaves[i].bridge);
    }
  }
  const comparable = phases => phases.map(batch => ({ summary: batch.summary,
    leaves: batch.leaves.map(leaf => ({ bridge: leaf.bridge,
      cached: leaf.calls.find(e => e.outParts.length).cached })),
    aggregate: { key: batch.aggregate.key, cached: batch.aggregate.calls[0].cached } }));
  assert.deepEqual(comparable(arms[0]), comparable(arms[1]));
  console.log(JSON.stringify({ globalControls: arms.map((phases, i) => ({ shape: ['map', 'loader'][i], phases })) }));
});

test('first-GREEN contracts: reject non-Uint8 snapshots; retain six ordered duplicate slots and exact immutable bridges', () => {
  for (const bad of [null, [], fixture(false).slice(1), [...fixture(false).slice(1), new DataView(new ArrayBuffer(3))],
    [...fixture(false).slice(1), new Uint16Array([1, 2, 3])]]) assert.throws(() => isolatedBatch(bad), TypeError);
  const batch = isolatedBatch(Array.from({ length: 6 }, () => new Uint8Array([1, 2, 3])));
  assert.deepEqual(batch.summary.values, [6, 6, 6, 6, 6, 6]);
  assert.equal(batch.summary.value, 36);
  assert.equal(batch.leaves.length, 6);
  assert.ok(Object.isFrozen(batch.summary) && Object.isFrozen(batch.summary.values));
  for (const leaf of batch.leaves) {
    assert.deepEqual(Object.keys(leaf.bridge), ['value', 'unit', 'sourceKey', 'producerKey']);
    assert.ok(Object.isFrozen(leaf.bridge));
    assert.equal(leaf.bridge.unit, 'byte-value sum');
    assert.equal(leaf.codeKeys.leaf, batch.leaves[0].codeKeys.leaf);
    assert.equal(leaf.codeKeys.query, batch.leaves[0].codeKeys.query);
  }
});
