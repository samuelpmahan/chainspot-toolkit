import assert from 'node:assert/strict';
import test from 'node:test';
import { isolatedBatch, codeSalt, closureParts } from './recipe.mjs';

const expectedSalt = '8c0b1b3490d5a77d67fd8a00eb0f27b86b58634746a5a9e3fe47785dc9ac830a';
const expectedClosureHashes = Object.freeze([
  '05182d53c3b03cce77b7601e0b14d8ff534462b63838651850c72316066b572f',
  '66cc93a4e742fa8ed9b3cfcba94d0d936bf73c907007c21f1e7af59061e62ad5',
  '122d624e0311e18f596db37bf292d9c31f47a364e75c8808ca6788c3449a3074',
  '3cc0319f4678eaf8679adcbfaa9db054841417a966c079019b0f72e24ba24406',
  '01e68e82741d4af56901b3306a304ca540e8ab0d73a12ba20a0afbe0e788f5d5',
  '39a24a645c222430464592546eb6bdc1a8b190902ed5708ecd951b0bb639315a',
  '7668bab9de6a19a2cc6f44e5ac47d6e89373da130764365cf32011187a980241',
  '4d17e1da77b1e5ceb6a4a2609d26c010caa6c43df8392e9599544299d9e1c549',
  '9d1f316af6af2887e0c59bd7a2b0bc13d3305a817cfb6efffb42c8f3b238396f'
]);
const original = Object.freeze([
  [1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12], [13, 14, 15], [16, 17, 18]
].map(values => Object.freeze(values)));
const permutedSlot = Object.freeze([8, 7, 9]);
const fixture = permuted => original.map((values, i) => new Uint8Array(i === 2 && permuted ? permutedSlot : values));
const onlyCall = (entries, calculation) => {
  const calls = entries.filter(entry => entry.calculation === calculation);
  assert.equal(calls.length, 1, `one ${calculation} call`);
  assert.equal(calls[0].status, 'ok');
  assert.equal(calls[0].error, null);
  return calls[0];
};

// FIRST-GREEN property of the delivered recipe, not an observed RED regression.
test('same-answer permutation changes only slot3 lineage and misses aggregate; restore is warm', () => {
  assert.equal(codeSalt, expectedSalt);
  assert.deepEqual(closureParts.map(part => part.sha256), expectedClosureHashes);
  const inputs = [fixture(false), fixture(true), fixture(false)];
  const before = inputs.map(batch => batch.map(bytes => [...bytes]));
  const cache = new Map();
  const phases = inputs.map(uploads => isolatedBatch(uploads, { cache }));
  const [first, permuted, restored] = phases;
  const expectedSummary = { values: [6, 15, 24, 33, 42, 51], value: 171,
    unit: 'byte-value sum', count: 6, countUnit: 'uploads' };
  const leafCalls = phases.map(batch => batch.leaves.map(leaf => onlyCall(leaf.calls, 'fn.lab12.upload.sum')));
  const aggregateCalls = phases.map(batch => onlyCall(batch.aggregate.calls, 'fn.lab12.batch.sum'));
  const leafCached = leafCalls.map(calls => calls.map(call => call.cached));
  const computations = leafCached.map(flags => flags.filter(cached => !cached).length);
  const queryCalls = phases.map(batch => batch.leaves.reduce((count, leaf) => {
    const queries = leaf.calls.filter(entry => entry.calculation === 'fn.q.lab12.byteSum');
    for (const query of queries) { assert.equal(query.status, 'ok'); assert.equal(query.error, null); }
    return count + queries.length;
  }, 0));
  const aggregateCached = aggregateCalls.map(call => call.cached);
  assert.deepEqual(computations, [6, 1, 0]);
  assert.deepEqual(queryCalls, [6, 1, 0]);
  assert.deepEqual(leafCached, [
    [false, false, false, false, false, false],
    [true, true, false, true, true, true],
    [true, true, true, true, true, true]
  ]);
  assert.deepEqual(aggregateCached, [false, false, true]);
  for (const [phaseIndex, batch] of phases.entries()) {
    assert.deepEqual(batch.summary, expectedSummary);
    assert.equal(batch.codeSalt, expectedSalt);
    assert.equal(batch.aggregate.codeKey, first.aggregate.codeKey);
    assert.equal(aggregateCalls[phaseIndex].key, batch.aggregate.key);
    assert.equal(batch.leaves.length, 6);
    for (const [slotIndex, leaf] of batch.leaves.entries()) {
      assert.deepEqual(leaf.codeKeys, first.leaves[0].codeKeys);
      assert.equal(leafCalls[phaseIndex][slotIndex].key, leaf.bridge.producerKey);
    }
  }
  for (let i = 0; i < 6; i++) {
    const initial = first.leaves[i].bridge, changed = permuted.leaves[i].bridge;
    assert.equal(initial.sourceKey === changed.sourceKey, i !== 2);
    assert.equal(initial.producerKey === changed.producerKey, i !== 2);
    assert.equal(initial.value, changed.value);
    assert.equal(initial.unit, changed.unit);
    if (i === 2) assert.notDeepEqual(initial, changed);
    else assert.deepEqual(initial, changed);
    assert.deepEqual(restored.leaves[i].bridge, initial);
  }
  assert.notEqual(first.aggregate.key, permuted.aggregate.key);
  assert.equal(first.aggregate.key, restored.aggregate.key);
  assert.deepEqual(inputs.map(batch => batch.map(bytes => [...bytes])), before);
  assert.equal(new Set(inputs.flat()).size, 18);
  assert.equal(new Set(inputs.flat().map(bytes => bytes.buffer)).size, 18);
  console.log(JSON.stringify({ sameAnswer: { codeSalt, closureParts,
    codeKeys: first.leaves[0].codeKeys, aggregateCodeKey: first.aggregate.codeKey,
    computations, queryCalls, leafCached, aggregateCached,
    phases: phases.map(batch => ({ summary: batch.summary,
      sourceKeys: batch.leaves.map(leaf => leaf.bridge.sourceKey),
      producerKeys: batch.leaves.map(leaf => leaf.bridge.producerKey), aggregateKey: batch.aggregate.key })) } }));
});
