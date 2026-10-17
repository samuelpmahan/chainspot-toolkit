import assert from 'node:assert/strict';
import { intersectRayBadgePlate, measureS5Pairs, measureS6TwoRay } from './index.mjs';

const rgb = { width: 40, height: 40, data: new Uint8Array(40 * 40 * 4).fill(220) };
const tee = { detId: 't1', state: 'visible', center: [5, 10], angleRad: 0, sourceMark: 'tee-mark' };
const badge = { detId: 'b1', center: [12, 10], plateBbox: [10, 8, 3, 5], holeRead: '12', sourceMark: 'badge-mark' };
const axes = { visible: [tee], recovered: [], unknown: [{ detId: 'H12', reason: 'no observed major axis', center: [3, 3] }] };
const tops = [{ basketId: 'basket-fwd', top: [22, 10] }, { basketId: 'basket-before', top: [7, 10] }];

assert.deepEqual(intersectRayBadgePlate(tee, [1, 0], [10, 8, 3, 5], 0), { enterPx: 5, exitPx: 7 });
assert.deepEqual(intersectRayBadgePlate(tee, [1, 0], [10, 8, 3, 5], 0.5), { enterPx: 4.5, exitPx: 7.5 });
const s5 = measureS5Pairs({ sealedAxes: axes, badgePlates: [badge], templateTops: tops, sourceRgb: rgb });
assert.equal(s5.length, 1);
assert.equal(s5[0].status, 'MEASURED_PAIR_UNOWNED');
assert.equal(s5[0].signedPerpPx, 0);
const s6 = measureS6TwoRay({ sealedAxes: axes, badgePlates: [badge], templateTops: tops, sourceRgb: rgb, s5Pairs: s5 });
assert.equal(s6.hits.length, 1);
assert.equal(s6.hits[0].sign, 1, 'hit is on positive ray only');
assert.equal(s6.rows.length, 2);
assert.equal(s6.rows.find(x => x.basketId === 'basket-fwd').status, 'TWO_RAY_ZERO_BEND_GEOMETRY_CANDIDATE_UNOWNED');
assert.deepEqual(s6.rows.find(x => x.basketId === 'basket-before').reasons, ['TOP_NOT_BEYOND_BADGE_PLATE']);
assert.deepEqual(s6.unknown, [{ ...axes.unknown[0], status: 'UNKNOWN_NO_FITTED_AXIS' }]);

// Reverse direction catches a different plate only if that plate lies behind the tee.
const reverseBadge = { ...badge, detId: 'b2', center: [-2, 10], plateBbox: [-4, 8, 3, 5] };
const both = measureS6TwoRay({ sealedAxes: axes, badgePlates: [badge, reverseBadge], templateTops: [], sourceRgb: rgb });
assert.deepEqual(both.hits.map(h => h.sign), [-1, 1]);
assert.equal(both.hits[0].badgeId, 'b2');

const nearBadge = { ...badge, detId: 'b-near', center: [10, 10], plateBbox: [9, 8, 2, 5] };
const multiple = measureS6TwoRay({ sealedAxes: axes, badgePlates: [badge, nearBadge],
  templateTops: [{ basketId: 'off-axis', top: [20, 20] }], sourceRgb: rgb, topPerpLimitPx: 2 });
assert.deepEqual(multiple.hits.map(h => [h.badgeId, h.rayHitOrdinal, h.rayHitCount]), [
  ['b-near', 1, 2], ['b1', 2, 2]
]);
assert.deepEqual(multiple.rows.map(r => r.reasons), [['TEMPLATE_TOP_OFF_RAY'], ['TEMPLATE_TOP_OFF_RAY']]);
assert.ok(multiple.rows.every(r => r.status === 'REJECTED_GEOMETRY'));

console.log('recovery behavior contracts passed');
