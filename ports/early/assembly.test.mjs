/**
 * Proof for the assembly Calculation shape (ports/early/assembly.mjs),
 * phase 1 of the assembly refactor. Two levels:
 *   1. Shape unit tests on synthetic components: exactly-one-base
 *      enforcement, fusion, overlap accounting, window residue.
 *   2. Specimen proof on existing data, no stage rewired: the 17 accepted
 *      S2 basket Parts from attempt attempt-1792188256180-f51916a6db5f's
 *      px.baskets.json are re-assembled through the shape (base = bright
 *      body, fused = shell, window = the Part's semantic bbox) and the
 *      assembly's fused set must equal each Part's own px set exactly,
 *      with per-basket owned counts matching the artifact's totals
 *      (claimed union 36,362).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { assembleSprite } from './assembly.mjs';
import { withAttempt } from '../../scripts/golden-attempt.mjs';

const anchor = { value: [0, 0], derivation: 'synthetic anchor for shape tests' };

test('assembly fuses components onto exactly one declared base', () => {
  const part = assembleSprite({
    part: 'px.synthetic', calculation: 'fn.synthetic.assemble',
    components: [
      { name: 'body', role: 'base', px: [3, 1, 2] },
      { name: 'shell', role: 'fused', px: [2, 4] }
    ],
    anchor
  });
  assert.deepEqual(part.fusedPx, [1, 2, 3, 4]);
  assert.equal(part.fusedPxCount, 4);
  assert.equal(part.componentOverlapPx, 1);
  assert.deepEqual(part.components, [
    { name: 'body', role: 'base', pxCount: 3 },
    { name: 'shell', role: 'fused', pxCount: 2 }
  ]);
  assert.equal(part.ownership.ownedPx, 4);
  assert.equal(part.ownership.residuePx, undefined);
});

test('assembly refuses zero bases, two bases, and duplicate names', () => {
  assert.throws(() => assembleSprite({ part: 'p', calculation: 'c', components: [{ name: 'a', role: 'fused', px: [1] }], anchor }), /exactly one component must be declared the base/);
  assert.throws(() => assembleSprite({
    part: 'p', calculation: 'c', anchor,
    components: [{ name: 'a', role: 'base', px: [1] }, { name: 'b', role: 'base', px: [2] }]
  }), /exactly one component must be declared the base/);
  assert.throws(() => assembleSprite({
    part: 'p', calculation: 'c', anchor,
    components: [{ name: 'a', role: 'base', px: [1] }, { name: 'a', role: 'fused', px: [2] }]
  }), /duplicate component name/);
});

test('assembly accounts window residue as the px not owned', () => {
  const part = assembleSprite({
    part: 'px.synthetic', calculation: 'fn.synthetic.assemble',
    components: [{ name: 'body', role: 'base', px: [0, 1, 10] }],
    anchor,
    window: { x: 0, y: 0, widthPx: 3, heightPx: 2, rowWidthPx: 10 }
  });
  assert.equal(part.ownership.windowPx, 6);
  assert.equal(part.ownership.ownedWithinWindowPx, 3);
  assert.equal(part.ownership.ownedOutsideWindowPx, 0);
  assert.equal(part.ownership.residuePx, 3);
});

test('the 17 accepted S2 basket Parts re-assemble exactly through the shape', (t) => {
  const file = 'stage-output/early/artifacts/s2/px.baskets.json';
  const attempt = withAttempt(t, [file]);
  if (!attempt) return;
  const artifactPath = attempt.path(file);
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
  assert.equal(artifact.basketCount, 17);
  assert.equal(artifact.totals.claimedPx, 36362);
  const rows = [];
  let fusedTotal = 0;
  for (const basket of artifact.baskets) {
    const shellSet = new Set(basket.shell.blackPx);
    const whiteSet = basket.px.filter((pixel) => !shellSet.has(pixel));
    assert.equal(whiteSet.length, basket.whitePx, `basket ${basket.label} white derivation`);
    assert.equal(shellSet.size, basket.blackPx, `basket ${basket.label} shell derivation`);
    const part = assembleSprite({
      part: 'px.baskets', calculation: 'fn.Basket.assemble',
      components: [
        { name: 'brightBody', role: 'base', px: whiteSet },
        { name: 'shell', role: 'fused', px: basket.shell.blackPx }
      ],
      anchor: {
        value: [basket.bbox[0] + 23, basket.bbox[1] + 72],
        derivation: 'semantic bbox bottom-center: the basket tip, where the basket physically stands; the radial circle fits (renders/hidden-pads/circle-radial-fits-2026-10-17.md) anchor C1S/C2D centers within about half a px of this point'
      },
      window: { x: basket.bbox[0], y: basket.bbox[1], widthPx: basket.bbox[2], heightPx: basket.bbox[3], rowWidthPx: artifact.image.widthPx }
    });
    assert.deepEqual(part.fusedPx, [...basket.px].sort((a, b) => a - b), `basket ${basket.label} fused set differs from the Part's own px set`);
    assert.equal(part.fusedPxSha256, basket.pxSha256, `basket ${basket.label} fused sha differs`);
    assert.equal(part.componentOverlapPx, 0, `basket ${basket.label} component overlap`);
    assert.equal(part.ownership.ownedOutsideWindowPx, 0, `basket ${basket.label} owns px outside its semantic bbox`);
    fusedTotal += part.fusedPxCount;
    rows.push([basket.label, basket.whitePx, basket.blackPx, part.fusedPxCount, part.ownership.residuePx, 'EXACT']);
  }
  assert.equal(fusedTotal, 36362);
  console.log('label white black fused residue verdict');
  for (const row of rows) console.log(row.join(' '));
  console.log(`total fused ${fusedTotal} of artifact claimed union ${artifact.totals.claimedPx}: 17 of 17 EXACT`);
});
