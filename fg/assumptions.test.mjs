import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stateAssumption, underAssumption, violationEmits, assumptionViolations, assumptionLines, ASSUMPTIONS } from './assumptions.mjs';
import { profileLines, profileSummary } from './profile.mjs';

const A = stateAssumption({ name: 'testReachR1', quantity: 'a test distance', value: 2, unit: 'R1', evidence: 'a test', widening: { factor: 2, limit: 'the test limit' } });

test('stated: an assumption names its quantity, value, unit, evidence and widening, once', () => {
  assert.equal(ASSUMPTIONS.get('testReachR1'), A);
  assert.throws(() => stateAssumption({ name: 'testReachR1', quantity: 'other', value: 3, unit: 'R1', evidence: 'x' }), /stated twice/);
  assert.throws(() => stateAssumption({ name: 'noEvidence', quantity: 'q', value: 1, unit: 'R1' }), /required/);
});

test('the stated bound holds: no violation, the search runs once', () => {
  let runs = 0;
  const r = underAssumption(A, { unitPx: 10, limitPx: 1000, run: (b) => { runs++; return { result: 5, found: true, atEdge: 5 >= b } } });
  assert.deepEqual([r.result, r.boundPx, r.violation, runs], [5, 20, null, 1]);
});

test('loud and self-correcting: an answer at the edge widens x2 until it is inside; nothing found widens to the limit', () => {
  const truth = 70;   // px: the quantity is 7 R1, the assumption says 2
  const r = underAssumption(A, { unitPx: 10, limitPx: 1000, detail: { hole: '1' }, run: (b) => ({ result: Math.min(truth, b), found: true, atEdge: truth >= b, at: Math.min(truth, b) }) });
  assert.equal(r.result, 70); assert.equal(r.boundPx, 80);
  assert.equal(r.violation.assumption, 'testReachR1'); assert.equal(r.violation.outcome, 'the answer sits at the bound');
  assert.deepEqual(r.violation.tries.map((t) => t.boundPx), [20, 40, 80]); assert.equal(r.violation.recovered, true); assert.equal(r.violation.hole, '1');
  const none = underAssumption(A, { unitPx: 10, limitPx: 100, run: (b) => ({ result: null, found: b >= 1000, atEdge: false }) });
  assert.deepEqual(none.violation.tries.map((t) => t.boundPx), [20, 40, 80, 100]); assert.equal(none.violation.recovered, false);
  assert.equal(none.violation.outcome, 'nothing found inside the bound');
});

test('loud: violations become emits, the profile lists them like opaque hot spots', () => {
  const v = underAssumption(A, { unitPx: 10, limitPx: 1000, run: (b) => ({ result: 1, found: b > 30, atEdge: false }) }).violation;
  const emits = violationEmits([v, null]);
  assert.deepEqual(emits, { assumptionsViolated: 1, assumptionsRecovered: 1, 'violated:testReachR1': 1, 'recovered:testReachR1': 1 });
  const doc = { wallMs: 10, calculations: [{ seq: 1, calculation: 'fn.q.test', elapsedMs: 1, emits }, { seq: 2, calculation: 'fn.q.other', elapsedMs: 1, emits: {} }] };
  assert.deepEqual(assumptionViolations(doc), [{ calculation: 'fn.q.test', assumption: 'testReachR1', violated: 1, recovered: 1, calls: 1 }]);
  assert.match(assumptionLines(assumptionViolations(doc))[0], /ASSUMPTION VIOLATED testReachR1 in fn\.q\.test: 1x over 1 call\(s\), 1 recovered by widening \(stated 2 R1/);
  assert.ok(profileLines(doc).some((l) => l.includes('ASSUMPTION VIOLATED testReachR1')));
  assert.equal(profileSummary(doc).assumptions.length, 1);
});
