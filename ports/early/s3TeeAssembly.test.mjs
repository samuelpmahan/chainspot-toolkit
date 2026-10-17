/**
 * Tests for the interior-first tee assembly Calculation
 * (ports/early/s3TeeAssembly.mjs; assembly refactor phase 4).
 *   1. A synthetic tee (bright frame band component, enclosed grey
 *      interior) assembles interior-first: the interior is derived from
 *      the bright mask as the enclosed complement component and gated
 *      against the ring record, the fused set is frame + interior, the
 *      ring-center anchor rides on the Part beside the frame centroid,
 *      window residue is accounted, and the independent re-derivation
 *      (rederiveTeeInterior) agrees set for set.
 *   2. Refusals: a ring whose recorded holeArea disagrees with the
 *      derived interior, an opaque tee (no findPx frame evidence), a
 *      frame component whose materialized size disagrees with its
 *      declared area, a ring missing from the rings candidates.
 *   3. Specimen evidence consistency, from the accepted artifacts only:
 *      in attempt-1792220456308's px.tees.json and
 *      px.tees.rings-family.json every baseline tee carries exactly one
 *      bright findPx frame ref whose area is its px count, its
 *      detectRings hole bbox is its innerBbox, its ring is among the
 *      rings candidates, the frame union is 4,884, and the recorded
 *      holeAreas are 338 to 345 for the 15 genuine pads and 68, 210, 79
 *      for impostor tees 16, 17, 18. (The full specimen proof of the
 *      Calculation itself is the lane-on run's fg.s3.pxTees.assembly
 *      gate.)
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { computeTeeAssembly, rederiveTeeInterior } from './s3TeeAssembly.mjs';
import { withAttempt } from '../../scripts/golden-attempt.mjs';

const W = 64, H = 64;
const idx = (x, y) => y * W + x;
const FRAME_BBOX = [10, 10, 24, 18];
// Band thickness: left 2, top 2, right 4, bottom 3.
const INNER_BBOX = [12, 12, 18, 13];

function syntheticTee() {
  const brightMask = new Uint8Array(W * H);
  const brightLabels = new Int32Array(W * H);
  const framePx = [];
  for (let y = FRAME_BBOX[1]; y < FRAME_BBOX[1] + FRAME_BBOX[3]; y++)
    for (let x = FRAME_BBOX[0]; x < FRAME_BBOX[0] + FRAME_BBOX[2]; x++) {
      const inner = x >= INNER_BBOX[0] && x < INNER_BBOX[0] + INNER_BBOX[2] && y >= INNER_BBOX[1] && y < INNER_BBOX[1] + INNER_BBOX[3];
      if (!inner) { brightMask[idx(x, y)] = 1; brightLabels[idx(x, y)] = 7; framePx.push(idx(x, y)); }
    }
  const interiorPx = [];
  for (let y = INNER_BBOX[1]; y < INNER_BBOX[1] + INNER_BBOX[3]; y++)
    for (let x = INNER_BBOX[0]; x < INNER_BBOX[0] + INNER_BBOX[2]; x++) interiorPx.push(idx(x, y));
  const hole = {
    cx: 20.5, cy: 18, holeArea: interiorPx.length,
    bboxX: INNER_BBOX[0], bboxY: INNER_BBOX[1], bboxW: INNER_BBOX[2], bboxH: INNER_BBOX[3],
    angle: 0, elongation: 1.4, ringFrac: 0.9, kind: 'tee-rect'
  };
  const frameRef = { polarity: 'bright', label: 7, bbox: [...FRAME_BBOX], area: framePx.length };
  const tee = {
    center: [hole.cx, hole.cy], bbox: [...FRAME_BBOX], innerBbox: [...INNER_BBOX], angleRad: 0,
    px: Uint32Array.from(framePx),
    has: {
      detectRings: { fn: 'fn.Tee.detectRings', hole },
      findFamily: { fn: 'fn.Tee.findFamily', frame: frameRef },
      findPx: { fn: 'fn.Tee.findPx', parts: [frameRef] }
    }
  };
  const rings = { enclosed: [hole], elongated: [hole], excludedByBadge: [], candidates: [hole] };
  const fields = {
    bright: { mask: { width: W, height: H, data: brightMask }, labels: brightLabels, components: [{ label: 7, bboxX: 10, bboxY: 10, bboxW: 24, bboxH: 18, area: framePx.length }] },
    dark: { mask: { width: W, height: H, data: new Uint8Array(W * H) }, labels: new Int32Array(W * H), components: [] }
  };
  return { tee, rings, fields, framePx, interiorPx };
}

test('a synthetic tee assembles interior-first and the witness agrees set for set', () => {
  const { tee, rings, fields, framePx, interiorPx } = syntheticTee();
  const part = computeTeeAssembly({ tees: [tee], rings, fields });
  assert.equal(part.totals.teeCount, 1);
  assert.equal(part.totals.framePx, 198);
  assert.equal(part.totals.interiorPx, 234);
  assert.equal(part.totals.fusedUnionPx, 432);
  assert.equal(part.totals.residueTotalPx, 0);
  assert.deepEqual(part.emits, { tees: 1, frameUnionPx: 198, interiorUnionPx: 234, fusedUnionPx: 432 });
  const rec = part.tees[0];
  assert.deepEqual(rec.components.map((c) => [c.name, c.role, c.pxCount]), [['interior', 'base', 234], ['frame', 'fused', 198]]);
  assert.deepEqual(rec.components[0].px, interiorPx);
  assert.deepEqual(rec.components[1].px, framePx);
  assert.equal(rec.componentOverlapPx, 0);
  assert.deepEqual(rec.fusedPx, [...framePx, ...interiorPx].sort((a, b) => a - b));
  assert.deepEqual(rec.anchor.value, [20.5, 18]);
  assert.ok(rec.anchor.distanceToFrameCentroidPx > 0, 'asymmetric band: ring center and frame centroid differ');
  assert.equal(rec.ownership.windowPx, 432);
  assert.equal(rec.ownership.ownedOutsideWindowPx, 0);
  assert.equal(rec.residuePx, 0);
  const witness = rederiveTeeInterior({ tee, fields });
  assert.deepEqual(witness.interior.px, interiorPx);
});

test('the assembly refuses holeArea drift, opaque tees, frame drift, and unlisted rings', () => {
  const { tee, rings, fields } = syntheticTee();
  const driftedHole = { ...tee, has: { ...tee.has, detectRings: { fn: 'fn.Tee.detectRings', hole: { ...tee.has.detectRings.hole, holeArea: 233 } } } };
  assert.throws(() => computeTeeAssembly({ tees: [driftedHole], rings, fields }), /tee 1 enclosed interior derived 234 px, its ring records holeArea 233/);
  const opaque = { ...tee, has: { ...tee.has, findPx: { fn: 'fn.Tee.findPx', parts: [] } } };
  assert.throws(() => computeTeeAssembly({ tees: [opaque], rings, fields }), /no bright findPx frame component evidence/);
  const holedFields = { ...fields, bright: { ...fields.bright, labels: Int32Array.from(fields.bright.labels) } };
  holedFields.bright.labels[idx(FRAME_BBOX[0], FRAME_BBOX[1])] = 0;
  assert.throws(() => computeTeeAssembly({ tees: [tee], rings, fields: holedFields }), /materialized 197 px, its declared area is 198/);
  const shiftedRing = { ...tee, has: { ...tee.has, detectRings: { fn: 'fn.Tee.detectRings', hole: { ...tee.has.detectRings.hole, cx: 21.5 } } } };
  assert.throws(() => computeTeeAssembly({ tees: [shiftedRing], rings, fields }), /ring is not among the px.tees.rings candidates/);
});

test('the accepted specimen evidence supports interior-first assembly for all 18 tees', (t) => {
  const attempt = withAttempt(t, ['stage-output/early/artifacts/s3/px.tees.json', 'stage-output/early/artifacts/s3/px.tees.rings-family.json']);
  if (!attempt) return;
  const base = attempt.path('stage-output/early/artifacts/s3');
  const teeArtifact = JSON.parse(readFileSync(resolve(base, 'px.tees.json'), 'utf8'));
  const ringsArtifact = JSON.parse(readFileSync(resolve(base, 'px.tees.rings-family.json'), 'utf8'));
  assert.equal(teeArtifact.teeCount, 18);
  assert.equal(teeArtifact.totals.claimedPx, 4884);
  const candidateKeys = new Set(ringsArtifact.rings.candidates.map((r) => JSON.stringify([r.cx, r.cy, r.bboxX, r.bboxY, r.bboxW, r.bboxH, r.kind])));
  const frameUnion = new Set();
  const rows = [];
  for (const tee of teeArtifact.tees) {
    assert.equal(tee.findPx.parts.length, 1, `tee ${tee.label} findPx parts`);
    const [part] = tee.findPx.parts;
    assert.equal(part.polarity, 'bright', `tee ${tee.label} frame polarity`);
    assert.equal(part.area, tee.pxCount, `tee ${tee.label} frame area is its px count`);
    assert.deepEqual(part.bbox, tee.bbox, `tee ${tee.label} frame bbox is the tee bbox`);
    const hole = tee.detectRings.hole;
    assert.deepEqual([hole.bboxX, hole.bboxY, hole.bboxW, hole.bboxH], tee.innerBbox, `tee ${tee.label} ring bbox is its innerBbox`);
    assert.ok(candidateKeys.has(JSON.stringify([hole.cx, hole.cy, hole.bboxX, hole.bboxY, hole.bboxW, hole.bboxH, hole.kind])), `tee ${tee.label} ring is a rings candidate`);
    for (const p of tee.px) frameUnion.add(p);
    rows.push([tee.label, tee.pxCount, hole.holeArea, tee.pxCount + hole.holeArea]);
  }
  assert.equal(frameUnion.size, 4884);
  for (const [label, , holeArea] of rows.slice(0, 15))
    assert.ok(holeArea >= 338 && holeArea <= 345, `genuine tee ${label} holeArea ${holeArea} in [338, 345]`);
  assert.deepEqual(rows.slice(15).map((r) => r[2]), [68, 210, 79], 'impostor tee holeAreas');
  console.log('label frame interior fused');
  for (const row of rows) console.log(row.join(' '));
  console.log(`18 baseline tees: frame union ${frameUnion.size}, interior total ${rows.reduce((n, r) => n + r[2], 0)}`);
});
