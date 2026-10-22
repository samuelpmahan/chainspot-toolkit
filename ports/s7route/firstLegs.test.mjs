import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segmentHitsBox, firstLegsOf, firstLegViolationsOf, firstLegCheckOf } from './firstLegs.mjs';
import { ringCrossed, crossedOf, kCellAt } from './kbends.mjs';
import { foreignRingsOf, straightClaimsOf } from './seq.mjs';

// two holes: hole 1's tee cap at (0, 0) along +x, its badge at (50, 0) (B* at (100, 0)); hole 2's tee cap at (0, 100), badge (50, 100)
const start = { holes: [{ hole: '1', S: [0, 0], u: [1, 0], teeCenter: [0, 0], badgeAlongPx: 50 }, { hole: '2', S: [0, 100], u: [1, 0], teeCenter: [0, 100], badgeAlongPx: 50 }] };
const badges = [{ label: 1, bbox: [40, -8, 20, 16] }, { label: 2, bbox: [40, 92, 20, 16] }];
const FL = firstLegsOf(start, badges);

test('segmentHitsBox: through, past, touching, inside', () => {
  assert.equal(segmentHitsBox([0, 0], [100, 0], [40, -8, 20, 16]), true);
  assert.equal(segmentHitsBox([0, 20], [100, 20], [40, -8, 20, 16]), false);
  assert.equal(segmentHitsBox([45, 0], [46, 1], [40, -8, 20, 16]), true);
  assert.equal(segmentHitsBox([0, -30], [30, -30], [40, -8, 20, 16]), false);
});

test('first legs: S -> B* per hole, the plates by label', () => {
  assert.deepEqual(FL.holes.map((h) => [h.hole, h.leg]), [['1', [[0, 0], [100, 0]]], ['2', [[0, 100], [100, 100]]]]);
  assert.deepEqual(FL.plates.map((p) => p.hole), ['1', '2']);
});

test('a route may cross another hole\'s first leg, not run along it nor pass over its badge plate', () => {
  const W = 20;
  assert.deepEqual(firstLegViolationsOf([[60, 150], [60, -50]], '3', { ...FL, plates: [] }, W), [], 'crossing both first legs is allowed');
  const along = firstLegViolationsOf([[0, 105], [100, 105]], '1', FL, W);
  assert.deepEqual(along.map((v) => [v.kind, v.of]), [['runs along', '2'], ['badge plate', '2']]);
  assert.deepEqual(firstLegViolationsOf([[0, 0], [100, 0]], '1', FL, W), [], 'its own first leg and badge are its own');
});

test('foreign badge plates: ringCrossed indexes them after the rings; the default (no plates) is unchanged', () => {
  const s = { hole: '1', S: [0, 0], u: [1, 0] }, bp = [[200, 100], [300, 300]];
  const f0 = foreignRingsOf(s, bp, 0, 10), f1 = foreignRingsOf(s, bp, 0, 10, FL.plates);
  assert.equal(f0.boxes, undefined);
  assert.equal(ringCrossed([0, 100], [200, 100], f0), -1);
  const q = ringCrossed([0, 100], [200, 100], f1);
  assert.equal(q, 1); assert.deepEqual(crossedOf(f1, q), { badge: '2' });
  assert.equal(ringCrossed([0, 0], [200, 0], f1), -1, 'its own plate is not foreign');
});

test('a straight claim that breaks a rule is not made', () => {
  const s = [{ hole: '1', S: [0, 0], u: [1, 0] }], bp = [[200, 0]];
  assert.deepEqual(straightClaimsOf(s, bp, 10, { 1: 'straight' }).claims, { 1: 0 });
  const g = straightClaimsOf(s, bp, 10, { 1: 'straight' }, [], () => 'passes over badge 2');
  assert.deepEqual(g.claims, {}); assert.match(g.rows[0].why, /passes over badge 2: treated as bent/);
});

test('kCellAt with owned: the straight route along an owned corridor is ruled out', () => {
  const S = { W: 400, H: 400, R1: 10 }, st = { hole: '1', S: [0, 50], u: [1, 0], teeCenter: [0, 50], badgeAlongPx: 20 };
  const legsMany = (_S, Vs) => Vs.map((V) => V.slice(1).map(() => 10));
  const free = kCellAt(S, st, [300, 50], 20, { legsMany });
  assert.notEqual(free.best.bottleneck, null);
  const r = kCellAt(S, st, [300, 50], 20, { legsMany, owned: [[[0, 52], [300, 52]]] });
  assert.equal(r.zero.bottleneck, null); assert.equal(r.zero.runsAlong, true);
});

test('the check reads Sam\'s routes and the default\'s; a route over a plate is listed', () => {
  const x = firstLegCheckOf({ firstLegs: FL, W: 20, R1: 10, holePaths: { holes: [{ hole: '1', tee: [0, 0], bends: [], basket: [100, 0] }] },
    solve: { holes: { 1: { end: 0, verts: [[0, 0], [50, 100], [200, 100]] } } }, holesPart: { baskets: [{ name: 'Basket ca', point: [200, 100] }] } });
  assert.equal(x.totals.testimonyBadgePlate, 0);
  assert.equal(x.totals.defaultBadgePlate, 1);
});
