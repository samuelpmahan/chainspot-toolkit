import { test } from 'node:test';
import assert from 'node:assert/strict';
import { samSixOf, crossViewOf, devOf, devRegressions, paretoFront, shortlistOf, aggregate, markdownOf, OBJECTIVES } from './gridSweep.mjs';

const cell = (course, holes, extra = {}) => ({ course, widthPx: 40, holes, routesDigest: JSON.stringify(holes), ms: { own: 1000, paid: 1000 }, violations: {}, condition: null, ...extra });
const hole = (basket, verts, lengthR1 = 10) => ({ basket, verts, bends: verts.length - 2, lengthR1, end: 0 });

test('samSixOf: the called basket, and for the bend calls every hand bend matched within W / 2 and no extra bend', () => {
  const ref = { holes: [{ view: 'v', hole: '1', basket: 'Basket ca' }, { view: 'v', hole: '2', basket: 'Basket cb', bends: [[100, 100]] }, { view: 'w', hole: '3', basket: 'Basket cc' }] };
  const cells = { v: cell('v', { 1: hole('Basket ca', [[0, 0], [9, 9]]), 2: hole('Basket cb', [[0, 0], [110, 100], [150, 150], [200, 200]]) }) };
  const r = samSixOf(cells, ref);
  assert.equal(r.rows[0].right, true);
  assert.equal(r.rows[1].right, false, 'an extra bend');
  assert.match(r.rows[1].why, /1\/0\/1 hit\/missed\/extra/);
  assert.equal(r.rows[2].right, null, 'a view not run is not judged');
  assert.equal(r.right, 1); assert.equal(r.judged, 2);
  cells.v.holes[2] = hole('Basket cb', [[0, 0], [110, 100], [200, 200]]);
  assert.equal(samSixOf(cells, ref).right, 2);
});

test('crossViewOf: Full / Lazy holes against the Capture view, 15 % of the route length in R1', () => {
  const cells = { xCapture: cell('xCapture', { 1: hole('a', [], 10), 2: hole('b', [], 10) }), xFull: cell('xFull', { 1: hole('a', [], 11.4), 2: hole('b', [], 11.6) }), xLazy: cell('xLazy', { 1: hole('a', [], 8.6) }) };
  const r = crossViewOf(cells);
  assert.equal(r.compared, 3); assert.equal(r.agree, 2);
  assert.deepEqual(r.disagree, ['xFull 2: 11.6 vs 10 R1']);
});

test('dev regressions, the Pareto front and the shortlist rule', () => {
  const judged = (agree, hit, missed, extra) => ({ judged: { totals: { agree, judged: 18, bendsHit: hit, bendsMissed: missed, extraBends: extra, notAgreeing: [] } } });
  const ref = devOf({ g: cell('g', {}, judged(18, 10, 0, 0)), h: cell('h', {}, judged(18, 18, 1, 1)) });
  const worse = devOf({ g: cell('g', {}, judged(18, 10, 0, 1)), h: cell('h', {}, judged(17, 18, 1, 1)) });
  assert.deepEqual(devRegressions(worse, ref), ['g: extra bends 1 > 0', 'h: agree 17/18 < 18/18']);
  assert.deepEqual(devRegressions(ref, ref), []);
  const rows = [
    { hash: 'a', complete: true, devAgree: 36, bendErrors: 2, samSix: 6, samSixOf: 6, crossView: 120, ownMs: 100, devRegressions: [] },
    { hash: 'b', complete: true, devAgree: 36, bendErrors: 2, samSix: 6, samSixOf: 6, crossView: 125, ownMs: 200, devRegressions: [] },
    { hash: 'c', complete: true, devAgree: 36, bendErrors: 2, samSix: 6, samSixOf: 6, crossView: 119, ownMs: 300, devRegressions: [] },
    { hash: 'd', complete: true, devAgree: 35, bendErrors: 1, samSix: 5, samSixOf: 6, crossView: 130, ownMs: 50, devRegressions: ['h: agree'] }
  ];
  assert.deepEqual(paretoFront(rows, OBJECTIVES).map((r) => r.hash), ['a', 'b', 'd']);
  assert.deepEqual(shortlistOf(rows).map((r) => r.hash), ['b', 'a', 'c']);
});

test('aggregate and markdownOf: one row per config, the default as the reference, every number with its referent', () => {
  const courses = [{ course: 'g', kind: 'dev' }, { course: 'xCapture', kind: 'validation' }, { course: 'xFull', kind: 'validation' }];
  const judged = { judged: { totals: { agree: 18, judged: 18, bendsHit: 10, bendsMissed: 0, extraBends: 0, notAgreeing: [] } } };
  const cells = { D: { g: cell('g', { 1: hole('a', [[0, 0], [1, 1]]) }, judged), xCapture: cell('xCapture', { 1: hole('a', [], 10) }), xFull: cell('xFull', { 1: hole('a', [], 10.5) }) },
    E: { g: cell('g', { 1: hole('b', [[0, 0], [2, 2]]) }, judged), xCapture: cell('xCapture', { 1: hole('a', [], 10) }), xFull: cell('xFull', { 1: hole('a', [], 13) }, { violations: { seqFirstRanks: { violated: 2, recovered: 2 } } }) } };
  const configs = [{ hash: 'D', short: 'D', names: ['routeMatchKBendsSeq3SearchW'], labels: ['base'], sparse: {} }, { hash: 'E', short: 'E', names: [], labels: ['x'], sparse: { 'fn.q.trace.seqCells': { firstLegs: true } } }];
  const agg = aggregate({ configs, courses, cellsOf: (c, h) => cells[h][c], samSixRef: { holes: [] }, defaultHash: 'D' });
  const E = agg.rows.find((r) => r.hash === 'E');
  assert.equal(agg.reference, 'D');
  assert.equal(E.crossView, 0); assert.equal(E.crossViewCompared, 1);
  assert.deepEqual(E.changedCourses, ['g', 'xFull']);
  assert.deepEqual(E.violations.seqFirstRanks, { violated: 2, recovered: 2, courses: 1 });
  const md = markdownOf({ ...agg, id: 't', specFile: 's.json', spec: { name: 't' }, grid: { product: 2, sampled: 2, skipped: [], duplicates: 0 }, courses, codeDigest: 'c', sharedMs: {}, wallMs: 1, jobs: 1 });
  assert.match(md, /Referents: dev agree = holes whose route ends within 12 px of Sam's basket/);
  assert.match(md, /seqCells firstLegs=true/);
});
