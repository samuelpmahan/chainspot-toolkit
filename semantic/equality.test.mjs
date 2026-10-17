import test from 'node:test';
import assert from 'node:assert/strict';
import { compareBytesAndGeometry, geometryObservationEquals, parsedPartEquals, GEOMETRY_EQUALITY, PART_EQUALITY } from './equality.mjs';

const selector = { teeId: 'tee-7', badgeId: 'badge-9', basketId: 'basket-10' };
const row = { id: 'row-1', teeId: 'tee-7', badgeId: 'badge-9', basketId: 'basket-10', s5MeasuredRelationId: 's5:tee-7:badge-9', sign: 1,
  u: [0.9988, 0.0478], teeCenter: [366.97, 982.52], badgeCenter: [443.41, 982.58], templateTop: [1032.5, 1017],
  topAlongPx: 666.4, topSignedPerpPx: 2.57, topProvenance: 'BASKET_SPRITE_TEMPLATE_PREDICTION',
  status: 'TWO_RAY_ZERO_BEND_GEOMETRY_CANDIDATE_UNOWNED' };
const document = () => ({ schema: 'chainspot-s6-two-ray@1', imageId: 'IMG_5641', paramsHash: 'params', sourceSha256: 'source', rows: [structuredClone(row)] });

test('formatting-only serialization differs under crisp but equals under named semantic contract', () => {
  const compact = Buffer.from(JSON.stringify(document()));
  const formatted = Buffer.from(`${JSON.stringify(document(), null, 3)}\n`);
  const result = compareBytesAndGeometry(compact, formatted, selector);
  assert.notEqual(result.leftSha256, result.rightSha256);
  assert.equal(result.crisp.equal, false);
  assert.equal(result.candidatePartEqual, true);
  assert.equal(result.geometryObservationEqual, true);
});

test('changing the selected axis is a semantic inequality and changes byte identity', () => {
  const changed = document(); changed.rows[0].u[1] += 0.001;
  const left = Buffer.from(JSON.stringify(document())), right = Buffer.from(JSON.stringify(changed));
  const result = compareBytesAndGeometry(left, right, selector);
  assert.equal(result.crisp.equal, false);
  assert.equal(result.candidatePartEqual, false);
  assert.equal(result.geometryObservationEqual, false);
});

test('equality contract is explicitly named/versioned and selected row must be unambiguous', () => {
  assert.throws(() => parsedPartEquals(document(), document(), selector, 's5-row-part-equals@1'), /unsupported equality contract/);
  const duplicate = document(); duplicate.rows.push(structuredClone(row));
  assert.throws(() => parsedPartEquals(duplicate, duplicate, selector), /exactly one selected row/);
  assert.equal(GEOMETRY_EQUALITY, 's5-row-geometry-observation-equals@1.0.0');
  assert.equal(PART_EQUALITY, 's5-row-part-equals@1.0.0');
});

test('whole Part equality detects row facts outside the selected geometry projection', () => {
  const changed = document(); changed.rows[0].association = 'REASSIGNED';
  assert.equal(parsedPartEquals(document(), changed, selector), false);
  assert.equal(geometryObservationEquals(document(), changed, selector), true);
});

test('source, status, and finite-axis guards block semantic comparison', () => {
  const changedSource = document(); changedSource.sourceSha256 = 'other';
  assert.throws(() => parsedPartEquals(document(), changedSource, selector), /source identity guard/);
  const invalidAxis = document(); invalidAxis.rows[0].u = [Infinity, 0];
  assert.throws(() => geometryObservationEquals(document(), invalidAxis, selector), /u guard/);
});
