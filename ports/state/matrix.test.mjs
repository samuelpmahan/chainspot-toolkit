import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELLS, statusOf, matrixRows, matrixMarkdown, registerStateMatrix, MATRIX_PART, MATRIX_CALCULATION } from './matrix.mjs';
import { createPartStore } from '../../fg/store.mjs';
import { renderValue } from '../../fg/render.mjs';

const cell = (key) => CELLS.find((c) => c.key === key);
const fresh = { recipe: { state: 'VERIFIED', changed: [] }, s3assoc: { state: 'VERIFIED', changed: [] }, s4recover: { state: 'VERIFIED', changed: [] } };
const complete = { annotatedHoles: Array.from({ length: 18 }, (_, i) => i + 1), complete: true };
const partial = { annotatedHoles: [6, 13, 16], complete: false };
const outputs = { early: true, s3fix: true, s3assoc: true, basketBridge: true, s4recover: true };
const judged = (TP, FN, FP, extra = {}) => ({ TP, FN, FP, found: TP + FP, tp: [], fn: [], fp: [], ...extra });

const course = (name, testimony, judgement, freshness = fresh, over = {}) => ({
  course: name, attempt: `attempt-${name}`, request: null, testimony, N: 18,
  counts: { badges: 18, baskets: 17, tees: 15, associated: 15, s4baskets: 1, s4tees: 3 }, judgement, outputs, freshness, ...over
});
const golden = course('golden', complete, {
  S1: { found: 18, labelsMissing: [], duplicates: [] }, S2: judged(17, 1, 0), S3: judged(15, 3, 0),
  S3association: { associatedCorrectly: 15, associatedIncorrectly: 0, notAssociated: 0 },
  S4baskets: judged(18, 0, 0, { recovered: 1 }), S4tees: { branches: { greedyOccluded: judged(18, 0, 0, { recovered: 3, recoveredForHoleCorrectly: 3 }) } }
});

test('the status rule as written: stale > missing > unjudged > met / unmet', () => {
  assert.equal(statusOf(cell('S2'), golden, golden.judgement.S2, fresh), 'unmet', 'FN = 1 with no S4 rows is unmet');
  assert.equal(statusOf(cell('S4baskets'), golden, golden.judgement.S4baskets, fresh), 'met');
  assert.equal(statusOf(cell('S1'), golden, golden.judgement.S1, fresh), 'met');
  assert.equal(statusOf(cell('S1'), golden, { found: 18, labelsMissing: ['Badge 7'], duplicates: [] }, fresh), 'unmet');
  assert.equal(statusOf(cell('S3association'), golden, { associatedCorrectly: 14, associatedIncorrectly: 0, notAssociated: 1 }, fresh), 'unmet');
  // S2 and S3 expect occlusion: an FN that S4 recovers does not count (Sam: "they should pass as long as S4 recovers for them")
  const withS4 = (s4rows) => ({ ...golden, judgement: { ...golden.judgement, S2: { ...golden.judgement.S2, rows: [{ hole: 6, verdict: 'FN' }] }, S4baskets: { ...golden.judgement.S4baskets, rows: s4rows } } });
  assert.equal(statusOf(cell('S2'), withS4([{ hole: 6, verdict: 'recoveredTP' }]), withS4([]).judgement.S2, fresh), 'met', 'the FN basket was recovered by S4');
  assert.equal(statusOf(cell('S2'), withS4([{ hole: 7, verdict: 'TP' }]), withS4([]).judgement.S2, fresh), 'unmet', 'S4 recovered a different hole');
  // FP counts only where testimony is complete
  const alex = course('alex', partial, {});
  assert.equal(statusOf(cell('S2'), alex, judged(3, 0, 5), fresh), 'met', 'FP is not judged on partial testimony');
  assert.equal(statusOf(cell('S2'), golden, judged(17, 0, 1), fresh), 'unmet', 'FP is judged on complete testimony');
  // unjudged never met
  assert.equal(statusOf(cell('S2'), course('northpark', null, null), '17 of N = 18', fresh), 'unjudged');
  // missing
  assert.equal(statusOf(cell('S4tees'), golden, null, fresh), 'missing');
  // stale overrides everything, only for the closures the cell was computed with
  const stale = { ...fresh, s4recover: { state: 'STALE', changed: ['ports/s4recover/teeRecover.mjs'] } };
  assert.equal(statusOf(cell('S4tees'), golden, golden.judgement.S4tees.branches.greedyOccluded, stale), 'stale');
  assert.equal(statusOf(cell('S2'), golden, golden.judgement.S2, stale), 'unmet', 'an S4 code change does not stale S2');
  assert.equal(statusOf(cell('S2'), golden, golden.judgement.S2, { ...fresh, recipe: { state: 'STALE', changed: ['fg/pxset.mjs'] } }), 'stale', 'a recipe change stales every cell');
});

test('the matrix: one row per stage x course, emits, units, markdown, frozen comparison', () => {
  const northpark = course('northpark', null, null, { ...fresh, s4recover: { state: 'UNVERIFIED', changed: [] } });
  const inputs = { declarations: { S1: { responsibility: 'badges' }, S2: { responsibility: 'baskets' }, S3: { responsibility: 'tees' }, S4: { responsibility: 'recover' } }, courses: [golden, northpark] };
  const m = matrixRows(inputs);
  assert.equal(m.rows.length, 2 * CELLS.length);
  assert.deepEqual(m.emits, { cells: 12, met: 4, unmet: 2, unjudged: 6, missing: 0, stale: 0 }, 'no S4 rows in this fixture, so the S2 and S3 FNs stay unmet');
  assert.ok(Object.keys(m.units).includes('stale'));
  const np = m.rows.find((r) => r.course === 'northpark' && r.key === 'S4tees');
  assert.equal(np.status, 'unjudged'); assert.equal(np.freshness, 'UNVERIFIED'); assert.equal(np.result, '18 of N = 18');
  assert.match(m.rows.find((r) => r.course === 'golden' && r.key === 'S4tees').result, /18\/0\/0 TP\/FN\/FP \(\+3 recovered, 3 right hole\)/);
  const md = matrixMarkdown(m);
  assert.match(md, /\| golden \| S2 baskets \| baskets within 12 px of all 18 holes, or recovered by S4 \(occlusion is expected\) \|/); assert.match(md, /12 cells: 4 met, 2 unmet, 6 unjudged/);
  // against a frozen record: same, changed, new
  const frozen = { rows: m.rows.filter((r) => r.course === 'golden').map((r) => ({ ...r, result: r.key === 'S2' ? '16/2/0 TP/FN/FP' : r.result })) };
  const again = matrixRows(inputs, frozen);
  assert.equal(again.rows.find((r) => r.course === 'golden' && r.key === 'S1').vsFrozen, 'same');
  assert.match(again.rows.find((r) => r.course === 'golden' && r.key === 'S2').vsFrozen, /^changed \(was unmet: 16\/2\/0/);
  assert.equal(again.rows.find((r) => r.course === 'northpark' && r.key === 'S1').vsFrozen, 'new');
});

test('tk.state.matrix is a Part: derived on a store, profiled with emits, renderable', () => {
  const inputs = { declarations: { S1: { responsibility: 'badges' } }, courses: [golden] };
  const store = registerStateMatrix(createPartStore({ name: 'state-test' }), inputs);
  const m = store.get(MATRIX_PART);
  assert.equal(m.rows.length, CELLS.length);
  const call = store.calls().find((e) => e.calculation === MATRIX_CALCULATION);
  assert.deepEqual(call.emits, m.emits, 'the store records the emits');
  assert.deepEqual(store.provenance(MATRIX_PART).inParts, ['tk.state.inputs', 'tk.state.frozen']);
  const r = renderValue(MATRIX_PART, { rows: m.rows.map(({ changedPaths, goal, ...row }) => row), ...m.emits });
  assert.notEqual(r.kind, 'unrenderable'); assert.ok(r.parts.some((p) => p.kind === 'ledger'));
});
