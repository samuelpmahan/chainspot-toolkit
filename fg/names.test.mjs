import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidateCode, nameCandidates, displayName, CANDIDATE_RE, IDENTIFIED_RE } from './names.mjs';

test('candidateCode: spreadsheet-style letters after c', () => {
  assert.equal(candidateCode(0), 'ca');
  assert.equal(candidateCode(25), 'cz');
  assert.equal(candidateCode(26), 'caa');
  assert.equal(candidateCode(27), 'cab');
  assert.equal(candidateCode(26 + 26 * 26), 'caaa');
  assert.throws(() => candidateCode(-1));
});

test('nameCandidates: raster order of centres, returned in input order, stable', () => {
  const items = [{ c: [500, 40] }, { c: [10, 300] }, { c: [20, 40] }];
  const names = nameCandidates('Tee', items, (it) => it.c);
  assert.deepEqual(names, ['Tee cb', 'Tee cc', 'Tee ca']);
  assert.deepEqual(nameCandidates('Tee', items, (it) => it.c), names);
  assert.ok(names.every((n) => CANDIDATE_RE.test(n)));
});

test('displayName: proven identity wins; candidates never look like holes', () => {
  assert.equal(displayName('Tee', 'Tee cf', 12), 'Tee 12');
  assert.equal(displayName('Basket', 'Basket cb'), 'Basket cb');
  assert.ok(IDENTIFIED_RE.test('Tee 12') && !IDENTIFIED_RE.test('Tee cf') && !CANDIDATE_RE.test('Tee 12'));
});
