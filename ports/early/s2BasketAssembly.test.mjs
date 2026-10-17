/**
 * Tests for the body-first basket assembly Calculation
 * (ports/early/s2BasketAssembly.mjs; assembly refactor phase 3).
 *   1. A synthetic basket (solid bright body component, six shell px at
 *      family consensus offsets) assembles body-first: fused set exact,
 *      tip anchor, window residue accounted, and the independent
 *      re-derivation (rederiveBasketDecomposition) agrees set for set.
 *   2. Refusals: missing findPx body evidence, shell count disagreeing
 *      with the recorded blackPx, shellFamily misalignment, a body
 *      component whose materialized size disagrees with its declared
 *      area.
 *   3. Specimen evidence consistency, from the accepted artifacts only:
 *      in attempt-1792188256180's px.baskets.json every basket's recorded
 *      decomposition (findPx body ref, shell margins, shell blackPx)
 *      is internally exact: the semantic bbox is the glyph window
 *      expanded by the margins, px minus shell is the white body count,
 *      and the window residue falls in the phase-1 band 1,172 to 1,177;
 *      the union is 36,362. (The full specimen proof of the Calculation
 *      itself is the lane-on run's fg.s2.pxBaskets.assembly gate.)
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { computeBasketAssembly, rederiveBasketDecomposition } from './s2BasketAssembly.mjs';
import { withAttempt } from '../../scripts/golden-attempt.mjs';

const W = 64, H = 96;
const idx = (x, y) => y * W + x;
const MARGINS = [2, 3, 2, 3];
const BODY_BBOX = [10, 12, 42, 66];
const SEMANTIC_BBOX = [8, 9, 46, 72];
const SHELL_LOCAL = [[0, 0], [45, 0], [23, 0], [0, 71], [45, 71], [23, 71]];

function syntheticBasket() {
  const brightLabels = new Int32Array(W * H);
  const darkLabels = new Int32Array(W * H);
  const darkMask = new Uint8Array(W * H);
  const bodyPx = [];
  for (let y = BODY_BBOX[1]; y < BODY_BBOX[1] + BODY_BBOX[3]; y++)
    for (let x = BODY_BBOX[0]; x < BODY_BBOX[0] + BODY_BBOX[2]; x++) { brightLabels[idx(x, y)] = 3; bodyPx.push(idx(x, y)); }
  const shellPx = SHELL_LOCAL.map(([x, y]) => idx(SEMANTIC_BBOX[0] + x, SEMANTIC_BBOX[1] + y)).sort((a, b) => a - b);
  for (const p of shellPx) { darkMask[p] = 1; darkLabels[p] = 9; }
  const shellOffsets = SHELL_LOCAL.map(([x, y]) => y * SEMANTIC_BBOX[2] + x);
  const bodyComp = { label: 3, bboxX: BODY_BBOX[0], bboxY: BODY_BBOX[1], bboxW: BODY_BBOX[2], bboxH: BODY_BBOX[3], area: bodyPx.length };
  const basket = {
    bbox: [...SEMANTIC_BBOX],
    px: Uint32Array.from([...bodyPx, ...shellPx].sort((a, b) => a - b)),
    whitePx: bodyPx.length, blackPx: shellPx.length,
    has: {
      detectFamily: { fn: 'fn.Basket.detectFamily', body: { polarity: 'bright', label: 3, bbox: [...BODY_BBOX], area: bodyPx.length } },
      findShellFamily: { fn: 'fn.Basket.findShellFamily', margins: [...MARGINS], blackPx: Uint32Array.from(shellPx) },
      findPx: { fn: 'fn.Basket.findPx', body: { polarity: 'bright', label: 3, bbox: [...BODY_BBOX], area: bodyPx.length } }
    }
  };
  const shellFamily = {
    margins: [...MARGINS], shellOffsets: Uint32Array.from(shellOffsets),
    members: [{ candidate: { body: bodyComp, areaRatio: 1, whiteCoverage: 1 }, bbox: [...SEMANTIC_BBOX], blackPx: Uint32Array.from(shellPx) }]
  };
  const fields = {
    bright: { mask: { width: W, height: H, data: new Uint8Array(W * H) }, labels: brightLabels, components: [bodyComp] },
    dark: { mask: { width: W, height: H, data: darkMask }, labels: darkLabels, components: [{ label: 9, bboxX: 8, bboxY: 9, bboxW: 46, bboxH: 72, area: shellPx.length }] }
  };
  return { basket, shellFamily, fields, bodyPx, shellPx };
}

test('a synthetic basket assembles body-first and the witness agrees set for set', () => {
  const { basket, shellFamily, fields, bodyPx, shellPx } = syntheticBasket();
  const part = computeBasketAssembly({ baskets: [basket], shellFamily, fields });
  assert.equal(part.totals.basketCount, 1);
  assert.equal(part.totals.bodyPx, 2772);
  assert.equal(part.totals.shellPx, 6);
  assert.equal(part.totals.fusedUnionPx, 2778);
  assert.equal(part.totals.residueTotalPx, 534);
  assert.deepEqual(part.emits, { baskets: 1, fusedUnionPx: 2778, residuePx: 534 });
  const rec = part.baskets[0];
  assert.deepEqual(rec.fusedPx, [...basket.px].sort((a, b) => a - b));
  assert.deepEqual(rec.components.map((c) => [c.name, c.role, c.pxCount]), [['body', 'base', 2772], ['shell', 'fused', 6]]);
  assert.equal(rec.componentOverlapPx, 0);
  assert.deepEqual(rec.anchor.tip, [BODY_BBOX[0] + 21, BODY_BBOX[1] + 70]);
  assert.equal(rec.ownership.windowPx, 3312);
  assert.equal(rec.ownership.ownedWithinWindowPx, 2778);
  assert.equal(rec.ownership.ownedOutsideWindowPx, 0);
  assert.equal(rec.residuePx, 534);
  const witness = rederiveBasketDecomposition({ basket, shellFamily, fields });
  assert.deepEqual(witness.body.px, bodyPx);
  assert.deepEqual(witness.shell.px, shellPx);
});

test('the assembly refuses opaque baskets, count drift, and misalignment', () => {
  const { basket, shellFamily, fields } = syntheticBasket();
  const opaque = { ...basket, has: { ...basket.has, findPx: { fn: 'fn.Basket.findPx', body: null } } };
  assert.throws(() => computeBasketAssembly({ baskets: [opaque], shellFamily, fields }), /no findPx body component evidence/);
  const drifted = { ...basket, blackPx: basket.blackPx + 1 };
  assert.throws(() => computeBasketAssembly({ baskets: [drifted], shellFamily, fields }), /records blackPx 7/);
  assert.throws(() => computeBasketAssembly({ baskets: [basket], shellFamily: { ...shellFamily, members: [] }, fields }), /not index-aligned/);
  const holedFields = { ...fields, bright: { ...fields.bright, labels: Int32Array.from(fields.bright.labels) } };
  holedFields.bright.labels[idx(BODY_BBOX[0], BODY_BBOX[1])] = 0;
  assert.throws(() => computeBasketAssembly({ baskets: [basket], shellFamily, fields: holedFields }), /materialized 2771 px, its declared area is 2772/);
});

test('the accepted specimen evidence decomposes body-first for all 17 baskets', (t) => {
  const file = 'stage-output/early/artifacts/s2/px.baskets.json';
  const attempt = withAttempt(t, [file]);
  if (!attempt) return;
  const artifactPath = attempt.path(file);
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
  assert.equal(artifact.basketCount, 17);
  assert.equal(artifact.totals.claimedPx, 36362);
  const rows = [];
  const union = new Set();
  let whiteTotal = 0, blackTotal = 0;
  for (const basket of artifact.baskets) {
    const shellSet = new Set(basket.shell.blackPx);
    assert.equal(shellSet.size, basket.blackPx, `basket ${basket.label} shell count`);
    assert.equal(basket.shell.blackPxCount, basket.blackPx, `basket ${basket.label} shell record count`);
    const bodyCount = basket.px.filter((p) => !shellSet.has(p)).length;
    assert.equal(bodyCount, basket.whitePx, `basket ${basket.label} body derivation`);
    const body = basket.findPx.body;
    assert.deepEqual([body.bbox[2], body.bbox[3]], [42, 66], `basket ${basket.label} glyph window`);
    const [l, t, r, b] = basket.shell.margins;
    assert.deepEqual(basket.bbox, [body.bbox[0] - l, body.bbox[1] - t, body.bbox[2] + l + r, body.bbox[3] + t + b],
      `basket ${basket.label} semantic bbox is the glyph window expanded by the shell margins`);
    for (const p of basket.px) {
      const x = p % artifact.image.widthPx, y = Math.floor(p / artifact.image.widthPx);
      assert.ok(x >= basket.bbox[0] && x < basket.bbox[0] + 46 && y >= basket.bbox[1] && y < basket.bbox[1] + 72,
        `basket ${basket.label} owns px outside its semantic window`);
      union.add(p);
    }
    const residue = 46 * 72 - basket.pxCount;
    assert.ok(residue >= 1172 && residue <= 1177, `basket ${basket.label} residue ${residue} inside the phase-1 band`);
    whiteTotal += basket.whitePx; blackTotal += basket.blackPx;
    rows.push([basket.label, basket.whitePx, basket.blackPx, basket.pxCount, residue, `tip ${body.bbox[0] + 21},${body.bbox[1] + 70}`]);
  }
  assert.equal(union.size, 36362);
  console.log('label body shell fused residue tip');
  for (const row of rows) console.log(row.join(' '));
  console.log(`17 baskets decompose body-first; body total ${whiteTotal}, shell total ${blackTotal}, union ${union.size}`);
});
