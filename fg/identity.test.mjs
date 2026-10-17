/**
 * Tests for GeometricIdentity (fg/identity.mjs) and contracts/tee.pose@1:
 *   1. the Contract is named, versioned and validated; tee.pose@1 compares
 *      ring centers within 2 px and frame angles within 2 deg modulo pi
 *   2. geometricJoin matches by pose, not by key: re-ordered members, keys
 *      that disagree, sub-pixel jitter and pi-flipped angles still join;
 *      a member just outside a tolerance does not
 *   3. one-to-one under competition: the closest pose wins, deterministic,
 *      and an ambiguous (too loose) neighbourhood and a within-branch
 *      collision are reported, not hidden
 *   4. N-way: three branches, complete linkage (a class member must equal
 *      EVERY member already in its class)
 *   5. a real fork-join over toy boards: two implementations, joined by the
 *      Contract in the comparator, with matched / only-in lists
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defineContract, geometricJoin, isContract } from './identity.mjs';
import { comparableForkJoin } from './forkjoin.mjs';
import { defineGuarantee } from './guarantee.mjs';
import teePose, { axisAngleDiffDeg } from '../contracts/tee.pose@1.mjs';

const deg = (d) => (d * Math.PI) / 180;
const tee = (x, y, a = 0, key = null) => ({ center: [x, y], angleRad: a, key });

test('tee.pose@1 is a named, versioned Contract with Sam\'s default tolerances', () => {
  assert.ok(isContract(teePose));
  assert.equal(teePose.address, 'contracts/tee.pose@1');
  assert.deepEqual({ ...teePose.tolerances }, { centerPx: 2, angleDeg: 2 });
  assert.throws(() => { teePose.tolerances.centerPx = 9; });
  assert.deepEqual(JSON.parse(JSON.stringify(teePose)).tolerances, { centerPx: 2, angleDeg: 2 });
  assert.equal(teePose.equal(tee(10, 10, 0), tee(11.9, 10, deg(1.9))).ok, true);
  assert.equal(teePose.equal(tee(10, 10, 0), tee(12.1, 10, 0)).ok, false, 'center beyond 2 px');
  assert.equal(teePose.equal(tee(10, 10, 0), tee(10, 10, deg(2.1))).ok, false, 'angle beyond 2 deg');
  assert.equal(teePose.equal(tee(10, 10, deg(-10)), tee(10, 10, Math.PI - deg(10.5))).ok, true, 'a frame axis is modulo pi');
  assert.ok(Math.abs(axisAngleDiffDeg(deg(89), deg(-89)) - 2) < 1e-9);
  assert.throws(() => defineContract({ id: 'x', version: 1, subject: 's', tolerances: {}, compare: () => ({}) }), /dotted/);
  assert.throws(() => defineContract({ id: 'a.b', version: 0, subject: 's', tolerances: {}, compare: () => ({}) }), /version/);
  assert.throws(() => defineContract({ id: 'a.b', version: 1, subject: 's', tolerances: { e: -1 }, compare: () => ({}) }), /non-negative/);
  const bad = defineContract({ id: 'a.b', version: 1, subject: 's', tolerances: {}, compare: () => ({ ok: true }) });
  assert.throws(() => bad.equal({}, {}), /score/);
});

test('geometricJoin matches by pose, never by key or list order', () => {
  const A = [tee(100, 100, 0.1, 'ringA1'), tee(200, 50, -0.2, 'ringA2'), tee(300, 300, 1.0, 'ringA3')];
  const B = [tee(300.7, 299.4, 1.0 - Math.PI, 'zzz'), tee(100.3, 100.2, 0.1 + deg(1), 'ringA2'), tee(500, 500, 0, 'ringA1')];
  const join = geometricJoin({ sets: { A, B }, contract: teePose });
  assert.equal(join.contract.address, 'contracts/tee.pose@1');
  const pairs = join.matched.map((id) => join.identities[id].members);
  assert.deepEqual(pairs, [{ A: 0, B: 1 }, { A: 2, B: 0 }], 'joined by pose although keys say otherwise');
  assert.deepEqual(join.only.A.map((id) => join.identities[id].members.A), [1]);
  assert.deepEqual(join.only.B.map((id) => join.identities[id].members.B), [2]);
  assert.deepEqual(join.ambiguous, []);
  assert.deepEqual(join.collisions, []);
  const detail = join.identities[join.matched[1]].pairs[0].detail;
  assert.equal(detail.centerDistPx, Math.round(Math.hypot(0.7, 0.6) * 1e4) / 1e4);
  assert.ok(detail.angleDiffDeg < 1e-6, 'pi-flipped angle is the same axis');
  // just outside the tolerance: no identity
  const off = geometricJoin({ sets: { A: [tee(0, 0)], B: [tee(2.01, 0)] }, contract: teePose });
  assert.deepEqual(off.matched, []);
  assert.equal(off.only.A.length + off.only.B.length, 2);
});

test('competition is one-to-one, closest first, deterministic; ambiguity and collisions are reported', () => {
  // B[0] is within tolerance of A[0] and A[1]; A[1] is closer.
  const A = [tee(10, 10), tee(11.5, 10)];
  const B = [tee(11.6, 10)];
  const join = geometricJoin({ sets: { A, B }, contract: teePose });
  assert.deepEqual(join.matched.map((id) => join.identities[id].members), [{ A: 1, B: 0 }]);
  assert.deepEqual(join.collisions, [{ branch: 'A', a: 0, b: 1 }], 'A admitted one thing twice under the Contract');
  assert.deepEqual(join.ambiguous, [{ branch: 'B', index: 0, candidates: [{ branch: 'A', index: 0 }, { branch: 'A', index: 1 }] }]);
  const again = geometricJoin({ sets: { B, A }, contract: teePose });
  assert.deepEqual(again, join, 'branch order in the input object does not matter');
});

test('N-way join uses complete linkage', () => {
  // a~b (1.5 px), b~c (1.5 px) but a !~ c (3 px): c may not join {a, b}.
  const join = geometricJoin({ sets: { a: [tee(0, 0)], b: [tee(1.5, 0)], c: [tee(3, 0)] }, contract: teePose });
  assert.deepEqual(join.identities.map((x) => x.members), [{ a: 0, b: 0, c: null }, { a: null, b: null, c: 0 }]);
  assert.deepEqual(join.matched, []);
  assert.deepEqual(join.partial, [0]);
  assert.deepEqual(join.only, { a: [], b: [], c: [1] });
  const all = geometricJoin({ sets: { a: [tee(0, 0)], b: [tee(1, 0)], c: [tee(0.5, 0.5)] }, contract: teePose });
  assert.deepEqual(all.matched, [0]);
});

test('a fork-join comparator joins two implementations by the Contract', () => {
  const board = () => {
    const parts = new Map([['px.cands', [tee(10, 10, 0), tee(40, 12, 0.5), tee(80, 80, 1.2)]]]);
    return { get: (a) => parts.get(a), set: (a, v) => parts.set(a, v), has: (a) => parts.has(a) };
  };
  const fg = defineGuarantee({ id: 'fg.toy.poses.materialize', guards: ['px.members'], run: (ctx) => ({ totals: { members: ctx.get('px.members').length } }) });
  const result = comparableForkJoin({
    slot: 'fn.toy.findTees',
    part: 'px.members',
    implementations: {
      all: { reads: ['px.cands'], calculate: (p) => p.get('px.cands').map((m) => ({ ...m, center: [m.center[0] + 0.4, m.center[1]] })) },
      firstTwo: { reads: ['px.cands'], calculate: (p) => p.get('px.cands').slice(0, 2).reverse() }
    },
    restore: board,
    guarantees: [fg],
    compare: ({ branches }) => geometricJoin({ sets: Object.fromEntries(Object.entries(branches).map(([n, br]) => [n, br.store.get('px.members')])), contract: teePose })
  });
  const v = result.comparison.value;
  assert.equal(v.matched.length, 2);
  assert.deepEqual(v.only.firstTwo, []);
  assert.deepEqual(v.only.all.map((id) => v.identities[id].members.all), [2]);
  assert.equal(result.branches.all.records['fg.toy.poses.materialize'].totals.members, 3);
});
