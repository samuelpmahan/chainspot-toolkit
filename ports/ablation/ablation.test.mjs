/**
 * Tests for the AblationForkJoin runner pieces that need no provider:
 *   1. fork points: names, addresses, the parameter-fork override restores
 *      FIX_BOUNDS even when the Calculation throws, and the basket fork
 *      removes the basket nearest Sam's tee point
 *   2. extractParts: frames (canonical -> source by cropTopPx), labels from
 *      badge plates, missing sources omitted
 *   3. the testimony judge on synthetic annotation + Parts
 *   4. evidence-backed (skips without a golden --until 7 Attempt): the S7
 *      tracer program lifted from ports/s7.mjs is the exact embedded text
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FORKS, DEFAULT_ROWS, withBounds } from './forks.mjs';
import { extractParts, COLUMNS } from './parts.mjs';
import { judgeRow, arcAt, attributeTee } from './testimony.mjs';
import { liftS7Tracer } from './branch.mjs';
import { REPO } from '../../scripts/golden-attempt.mjs';

test('fork points are named, addressed, and a parameter fork never leaks its override', () => {
  assert.equal(DEFAULT_ROWS[0], 'baseline');
  for (const [id, f] of Object.entries(FORKS)) { assert.equal(f.id, id); assert.equal(typeof f.apply, 'function'); }
  assert.deepEqual(FORKS['tees.structural.interiorTone=off'].at, { boundary: 'S3', part: 'px.tees', calculation: 'fn.Tee.findFamily.structural', parameter: 'FIX_BOUNDS.interiorToneFloor' });
  const bounds = { interiorToneFloor: 12 };
  assert.equal(withBounds(bounds, { interiorToneFloor: Infinity }, () => bounds.interiorToneFloor), Infinity);
  assert.throws(() => withBounds(bounds, { interiorToneFloor: 0 }, () => { throw new Error('calc failed'); }), /calc failed/);
  assert.equal(bounds.interiorToneFloor, 12, 'restored after a throw');
  assert.throws(() => withBounds(bounds, { nope: 1 }, () => 0), /no nope/);
  const parts = new Map([['px.baskets', [{ bbox: [0, 0, 10, 10] }, { bbox: [100, 100, 10, 10] }]]]);
  const delta = FORKS['baskets.minus=hole12-occluder'].apply(parts, { testimony: { holes: [{ number: 12, tee: { xPx: 104, yPx: 98 } }] }, cropTopPx: 4 });
  assert.deepEqual(parts.get('px.baskets'), [{ bbox: [0, 0, 10, 10] }]);
  assert.equal(delta.removed.index, 1);
  assert.deepEqual(delta.replaced, ['px.baskets']);
});

test('extractParts adapts frames and labels; absent sources are omitted', () => {
  const s3 = new Map([['px.tees', [{ center: [10, 20], angleRad: 0.1, bbox: [5, 15, 10, 10] }]], ['px.baskets', [{ bbox: [50, 60, 46, 72] }]]]);
  const geometry = { badgePlates: [{ detId: 'badge-0', holeRead: '7' }], baselineAxes: { visible: [{ detId: 'tee-clean-0', center: [10, 24], angleRad: 0.1, bbox: [5, 19, 10, 10] }], recovered: [] } };
  const hit = { id: 'ray:tee-clean-0:plus:badge-0', badgeId: 'badge-0', teeCenter: [10, 24], u: [1, 0], badgeCenter: [60, 24] };
  const parts = extractParts({ s3, geometry, s5Pairs: { rayBadgeHits: [hit] }, assignment: { assignment: { selected: [{ hit }] } }, cropTopPx: 4 });
  assert.deepEqual(Object.keys(parts), ['S3:px.tees', 'S3:px.baskets', 'S4:px.s5.axes', 'S5:px.s5.rayBadgeHits', 'S5:px.s5.globalAssignment']);
  assert.deepEqual(parts['S3:px.tees'][0].draw.bbox, [5, 19, 10, 10], 'canonical bbox drawn in source frame');
  assert.deepEqual(parts['S3:px.tees'][0].center, [10, 20], 'identity stays in the Part\'s own frame');
  assert.equal(parts['S5:px.s5.globalAssignment'][0].badgeLabel, '7');
  assert.equal(COLUMNS.find((c) => c.id === 'S5:px.s5.globalAssignment').label(parts['S5:px.s5.globalAssignment'][0]), 'B7<-tee@10,24');
  assert.throws(() => extractParts({ s3, cropTopPx: null }), /cropTopPx/);
});

test('testimony judge: tee precision, pair agreement with tee error, corridor ribbon and progress', () => {
  const annotation = { holes: [
    { number: 1, tee: { xPx: 10, yPx: 24 }, basket: { xPx: 210, yPx: 24 }, corridorBends: [], corridorWidthPx: 40 },
    { number: 2, tee: { xPx: 10, yPx: 124 }, basket: { xPx: 10, yPx: 324 }, corridorBends: [{ xPx: 110, yPx: 124 }], corridorWidthPx: 40 }
  ] };
  const parts = {
    'S3:px.tees': [{ center: [10, 20], bbox: [5, 15, 10, 10] }, { center: [500, 500], bbox: [495, 495, 10, 10] }],
    'S4:px.s5.axes': [{ kind: 'visible', center: [11, 24], bbox: [6, 19, 10, 10] }, { kind: 'visible', center: [10, 127], bbox: [5, 122, 10, 10] }],
    'S5:px.s5.globalAssignment': [{ badgeLabel: '1', teeCenter: [11, 24] }, { badgeLabel: '1', teeCenter: [10, 127] }],
    'S7:s7.traces': [{ badgeLabel: '1', path: [[40, 24], [110, 30]], outcome: 'unknown' }, { badgeLabel: '2', path: [[40, 124], [110, 200]], outcome: 'unknown' }]
  };
  const j = judgeRow(parts, annotation, { cropTopPx: 4 });
  assert.equal(j.S3.precision, 0.5);
  assert.deepEqual([j.S4.attributed, j.S4.holesCovered, j.S4.teeErrorPx.max], [2, 2, 3]);
  assert.equal(j.S5.agrees, 1);
  assert.deepEqual(j.S5.wrongHole, ['B1<-H2']);
  assert.deepEqual(j.S5.teeErrorPxByBadge, { 1: 1 });
  assert.equal(j.S7.inRibbon, 1);
  assert.equal(j.S7.progressByBadge['1'], 0.5);
  assert.deepEqual(arcAt([110, 200], [[10, 124], [110, 124], [10, 324]]), { at: 100 + Math.hypot(100, 200) * 0.304, length: 100 + Math.hypot(100, 200) });
  assert.equal(attributeTee([300, 300], null, annotation.holes).hole, null);
});

test('the S7 tracer is lifted verbatim from ports/s7.mjs', () => {
  const tracer = liftS7Tracer(REPO);
  const text = readFileSync(join(REPO, 'ports/s7.mjs'), 'utf8');
  assert.ok(text.includes('const code = String.raw`' + tracer.code + '`;'));
  assert.match(tracer.code, /traceBadgeToBasket/);
  assert.match(tracer.sha256, /^[0-9a-f]{64}$/);
});
