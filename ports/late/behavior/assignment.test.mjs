import assert from 'node:assert/strict';
import { resolveS5GlobalAssignment } from './assignment.mjs';

const axes = (...ids) => ({ visible: ids.map((detId, i) => ({ detId, center: [10 + i * 10, 10], angleRad: 0 })), recovered: [], unknown: [] });
const badges = (...ids) => ids.map((detId, i) => ({ detId, center: [20 + i * 10, 10], plateBbox: [18 + i * 10, 8, 4, 4], holeRead: String(i + 1) }));
function edge(teeId, badgeId, teeCenter, badgeCenter, rayHitOrdinal = 1, id = `${teeId}-${badgeId}`) {
  return { id, teeId, badgeId, teeCenter, badgeCenter, u: [1, 0], rayHitOrdinal };
}
const run = (axisSet, badgeSet, rayBadgeHits, width = 100, height = 100) => resolveS5GlobalAssignment({
  sealedAxes: axisSet, badgePlates: badgeSet, sourceWidth: width, sourceHeight: height, rayBadgeHits
});

// Collision requiring an augmenting reassignment: a local Tx→Bn preference
// must yield to Ty→Bn so Tx can take its only alternative Bm.
{
  const result = run(axes('Tx', 'Ty'), badges('Bn', 'Bm'), [
    edge('Tx', 'Bn', [10, 10], [11, 10]), edge('Ty', 'Bn', [20, 10], [21, 10]),
    edge('Tx', 'Bm', [10, 10], [22, 10])
  ]);
  assert.equal(result.status, 'FULL');
  assert.deepEqual(result.selected.map(x => [x.teeId, x.badgeId]).sort(), [['Tx', 'Bm'], ['Ty', 'Bn']]);
}
// Duplicate hits on the same pair cannot consume two owners; best actual hit wins.
{
  const result = run(axes('T'), badges('B'), [
    edge('T', 'B', [10, 10], [30, 10], 2, 'far'), edge('T', 'B', [10, 10], [12, 10], 1, 'near')
  ]);
  assert.equal(result.selected.length, 1);
  assert.equal(result.selected[0].id, 'near');
  assert.equal(result.candidateRows.find(x => x.id === 'far').disposition, 'DUPLICATE_HIT');
}
// A sole distant real hit is preserved; there is no invented cutoff or edge.
{
  const result = run(axes('T'), badges('B'), [edge('T', 'B', [5, 5], [85, 5])], 100, 100);
  assert.equal(result.selected.length, 1);
  assert.equal(result.selected[0].distanceDiagonalFraction, 80 / Math.hypot(100, 100));
  assert.equal(result.status, 'FULL');
  assert.equal(result.physicalStatus, 'UNKNOWN');
}
// No fitted axes means unmatched badges and an explicit partial process result.
{
  const result = run({ visible: [], recovered: [], unknown: [{ detId: 'unknown-T', reason: 'no axis' }] }, badges('B'), []);
  assert.equal(result.status, 'PARTIAL');
  assert.deepEqual(result.unmatchedBadgeIds, ['B']);
  assert.equal(result.unknownAxes[0].status, 'UNKNOWN_NO_FITTED_AXIS');
}
// Equal-sized augmenting chain reproduces a greedy trap (T1-A, T1-B, T2-A).
{
  const result = run(axes('T1', 'T2'), badges('A', 'B'), [
    edge('T1', 'A', [10, 10], [11, 10]), edge('T1', 'B', [10, 10], [15, 10]), edge('T2', 'A', [20, 10], [21, 10])
  ]);
  assert.equal(result.status, 'FULL');
  assert.deepEqual(result.selected.map(x => [x.teeId, x.badgeId]).sort(), [['T1', 'B'], ['T2', 'A']]);
}
console.log('S5 global assignment contracts passed');
