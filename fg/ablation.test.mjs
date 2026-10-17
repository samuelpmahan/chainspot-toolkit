/**
 * Tests for the AblationForkJoin join half (fg/ablation.mjs) and the
 * per-kind Contracts it joins with, on synthetic Parts only:
 *   1. a re-ordered, sub-tolerance-jittered, re-keyed Part is UNCHANGED
 *      (identity is geometric; positional ids are ignored) and its drift
 *      is reported in tolerance units
 *   2. a member moved past tolerance is lost + gained, and the geometric
 *      magnitude (nearestScore) says how far its counterpart is
 *   3. a matched member whose verdict differs is a FLIP (changed), not a
 *      new identity; a different badge label is never the same pairing
 *   4. effectMatrix: rows vs baseline, baseline vs reference, absent cells
 *   5. ablationFrames: ledger page first, then changed cells by weight,
 *      always three drawn slots (lost red / gained green / flipped blue)
 *   6. s7.trace@1 ribbon/endpoint, basket.pose@1, s4.resolution@1, s6.row@1
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { joinPart, effectMatrix, ablationFrames, cellText, matrixLedger } from './ablation.mjs';
import teePose from '../contracts/tee.pose@1.mjs';
import basketPose from '../contracts/basket.pose@1.mjs';
import s4Resolution from '../contracts/s4.resolution@1.mjs';
import s5Pair from '../contracts/s5.pair@1.mjs';
import s6Row from '../contracts/s6.row@1.mjs';
import s7Trace, { hausdorffPx } from '../contracts/s7.trace@1.mjs';

const deg = (d) => (d * Math.PI) / 180;
const tee = (x, y, a = 0, id = null) => ({ id, center: [x, y], angleRad: a, draw: { bbox: [x - 5, y - 4, 10, 8] } });
const teeCol = { id: 'S3:px.tees', stage: 'S3', part: 'px.tees', contract: teePose, label: (m) => `tee@${m.center.join(',')}` };
const pair = (label, x, y, ux = 1, uy = 0, extra = {}) => ({ badgeLabel: label, teeCenter: [x, y], u: [ux, uy], draw: { path: [[x, y], [x + 50 * ux, y + 50 * uy]] }, ...extra });
const pairCol = { id: 'S5:pairs', stage: 'S5', part: 'px.s5.pairs', contract: s5Pair, label: (m) => `B${m.badgeLabel}` };
const row = (label, x, y, top, status) => ({ ...pair(label, x, y), templateTop: top, status });
const rowCol = { id: 'S6:rows', stage: 'S6', part: 'px.s6.twoRayRows', contract: s6Row, verdictOf: (m) => m.status, label: (m) => `B${m.badgeLabel}` };

test('a re-ordered, jittered, re-keyed Part is unchanged; drift is reported in tolerance units', () => {
  const base = [tee(10, 10, 0, 'tee-clean-0'), tee(100, 50, deg(30), 'tee-clean-1'), tee(300, 200, deg(-80), 'tee-clean-2')];
  const branch = [tee(300.5, 200, deg(100.5), 'tee-clean-0'), tee(10, 11, 0, 'tee-clean-1'), tee(100, 50, deg(30), 'tee-clean-2')];
  const cell = joinPart({ column: teeCol, base, branch });
  assert.equal(cell.status, 'unchanged');
  assert.deepEqual([cell.matched, cell.lost, cell.gained, cell.flipped], [3, 0, 0, 0]);
  assert.equal(cell.maxDriftScore, 0.5, 'worst matched pair: 1 px of a 2 px tolerance');
  assert.equal(cellText(cell), '=3 d0.5');
});

test('a member moved past tolerance is lost + gained, with the geometric distance to its counterpart', () => {
  const base = [tee(10, 10), tee(100, 50), tee(500, 500)];
  const branch = [tee(10, 10), tee(105, 50)];
  const cell = joinPart({ column: teeCol, base, branch });
  assert.equal(cell.status, 'changed');
  assert.deepEqual([cell.matched, cell.lost, cell.gained], [1, 2, 1]);
  const moved = cell.changes.find((c) => c.kind === 'gained');
  assert.equal(moved.nearestScore, 2.5, '5 px from its nearest baseline member = 2.5 tolerances');
  assert.equal(moved.detail.centerDistPx, 5);
  const gone = cell.changes.find((c) => c.kind === 'lost' && c.label === 'tee@500,500');
  assert.ok(gone.nearestScore > 100, 'a removed member is far from everything left');
  assert.equal(cellText(cell), '-2 +1 /3->2');
});

test('verdict flips on matched members are changes; labels are identity, positional ids are not', () => {
  const base = [row('3', 10, 10, [200, 10], 'CANDIDATE'), row('4', 50, 50, [200, 50], 'REJECTED')];
  const branch = [row('4', 50.4, 50, [200, 50.5], 'REJECTED', { id: 's6ray:tee-clean-9' }), row('3', 10, 10, [200, 10], 'REJECTED', { id: 's6ray:tee-clean-0' })];
  const cell = joinPart({ column: rowCol, base, branch });
  assert.equal(cell.status, 'changed');
  assert.deepEqual([cell.matched, cell.lost, cell.gained, cell.flipped], [2, 0, 0, 1]);
  assert.deepEqual(cell.changes.map((c) => [c.kind, c.label, c.from, c.to]), [['flipped', 'B3', 'CANDIDATE', 'REJECTED']]);
  const relabeled = joinPart({ column: pairCol, base: [pair('3', 10, 10)], branch: [pair('5', 10, 10)] });
  assert.deepEqual([relabeled.lost, relabeled.gained], [1, 1]);
  assert.ok(relabeled.changes[0].nearestScore >= 1000, 'same geometry, different badge: no counterpart');
  const reversed = joinPart({ column: pairCol, base: [pair('3', 10, 10, 1, 0)], branch: [pair('3', 10, 10, -1, 0)] });
  assert.equal(reversed.status, 'changed', 'a ray is signed: the opposite direction is a different pairing');
});

test('effectMatrix: rows vs baseline, baseline vs reference, absent cells', () => {
  const columns = [teeCol, pairCol];
  const ref = { id: 'attempt:X', parts: { 'S3:px.tees': [tee(10, 10), tee(50, 50)] } };
  const rows = [
    { id: 'baseline', fork: { id: 'baseline', at: null }, parts: { 'S3:px.tees': [tee(50, 50), tee(10, 10)], 'S5:pairs': [pair('1', 10, 10)] } },
    { id: 'drop', fork: { id: 'drop', at: { boundary: 'S3', part: 'px.tees' }, describe: 'drop one' }, parts: { 'S3:px.tees': [tee(10, 10)], 'S5:pairs': [pair('1', 10, 10), pair('2', 50, 50, 0, 1)] } }
  ];
  const m = effectMatrix({ columns, rows, baseline: 'baseline', reference: ref });
  assert.equal(m.schema, 'nctk-ablation-effect-matrix@1');
  assert.deepEqual(m.columns.map((c) => c.contract), ['contracts/tee.pose@1', 'contracts/s5.pair@1']);
  const [b, d] = m.rows;
  assert.equal(b.against, 'attempt:X');
  assert.equal(b.cells['S3:px.tees'].status, 'unchanged');
  assert.equal(b.cells['S5:pairs'].status, 'absent', 'the reference does not carry this Part');
  assert.equal(d.against, 'baseline');
  assert.equal(cellText(d.cells['S3:px.tees']), '-1 +0 /2->1');
  assert.equal(cellText(d.cells['S5:pairs']), '-0 +1 /1->2');
  assert.deepEqual(matrixLedger(m)[1], { row: 'drop', fork: 'drop one', vs: 'baseline', 'S3:px.tees': '-1 +0 /2->1', 'S5:pairs': '-0 +1 /1->2' });
  assert.throws(() => effectMatrix({ columns: [teeCol, teeCol], rows, baseline: 'baseline' }), /duplicate column/);
  assert.throws(() => effectMatrix({ columns, rows, baseline: 'nope' }), /baseline row/);

  const frames = ablationFrames(m, { members: { 'attempt:X': ref.parts, baseline: rows[0].parts, drop: rows[1].parts } });
  assert.equal(frames[0].parts[0].kind, 'ledger');
  assert.equal(frames.length, 3, 'ledger + two changed cells');
  for (const f of frames.slice(1)) {
    assert.deepEqual(f.parts.slice(0, 3).map((p) => p.address.split(' ')[1]), ['lost', 'gained', 'flipped'], 'fixed palette slots');
    assert.ok(f.parts.slice(0, 3).every((p) => ['bbox', 'points'].includes(p.kind)));
  }
  const teePage = frames.find((f) => f.title.includes('S3:px.tees'));
  assert.deepEqual(teePage.parts[0].data.boxes.map((x) => x.slice(0, 4)), [[45, 46, 10, 8]], 'the lost tee is drawn from its own geometry');
});

test('per-kind Contracts: s7.trace ribbon + endpoint, basket.pose, s4.resolution, s6.row', () => {
  const p = (pts) => ({ badgeLabel: '9', path: pts });
  assert.equal(hausdorffPx([[0, 0], [10, 0]], [[0, 1], [5, 1], [10, 1]]), 1);
  assert.equal(s7Trace.equal(p([[0, 0], [10, 0], [20, 0]]), p([[0, 3], [20, 3]])).ok, true, 'within the 4 px ribbon');
  assert.equal(s7Trace.equal(p([[0, 0], [20, 0]]), p([[0, 0], [20, 0], [28, 0]])).ok, false, 'one walked further than 4 px');
  assert.equal(s7Trace.equal(p([[0, 0], [20, 0]]), { badgeLabel: '8', path: [[0, 0], [20, 0]] }).ok, false);
  assert.equal(s7Trace.equal(p([]), p([[0, 0]])).ok, false, 'an empty path is never the same trace');
  assert.equal(basketPose.equal({ bbox: [0, 0, 46, 72] }, { bbox: [1, 1, 46, 73] }).ok, true);
  assert.equal(basketPose.equal({ bbox: [0, 0, 46, 72] }, { bbox: [0, 0, 46, 76] }).ok, false);
  assert.equal(s4Resolution.equal({ hole: 3, center: [5, 5] }, { hole: 3, center: [6, 6] }).ok, true);
  assert.equal(s4Resolution.equal({ hole: 3, center: [5, 5] }, { hole: 4, center: [5, 5] }).ok, false);
  assert.equal(s6Row.equal(row('1', 0, 0, [100, 0], 'A'), row('1', 0, 0, [103, 0], 'A')).ok, false, 'a different basket top is a different row');
  assert.equal(s6Row.equal(row('1', 0, 0, [100, 0], 'A'), row('1', 0, 0, [101, 0], 'B')).ok, true, 'status is not identity');
});
