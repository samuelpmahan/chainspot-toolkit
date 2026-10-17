/**
 * Tests for the plate-first badge assembly Calculation
 * (ports/early/s1BadgeAssembly.mjs; assembly refactor phase 2).
 *   1. A synthetic badge (frame ring, plate, one glyph digit with an
 *      enclosed counter) assembles plate-first: fused set exact, counter
 *      attributed to its digit and kept outside the fused set, the owned
 *      ledger reconciles, window residue decomposes exactly, and the
 *      independent re-derivation (rederiveBadgeComponents) agrees role
 *      for role.
 *   2. Refusals: missing component evidence, two dark parts, a glyph
 *      enclosed by two digit bboxes.
 *   3. Specimen evidence consistency, from the accepted artifacts only:
 *      in attempt-1792188256180's px.badges.json every badge's findPx
 *      parts decompose as exactly one dark plate, one bright frame
 *      outside the plate, and glyphs inside the plate assignable to
 *      exactly one digit bbox from px.digits.json, and the accepted
 *      counter attribution is enclosure-unique; the ledger 37,002 + 293
 *      = 37,295 balances. (The full specimen proof of the Calculation
 *      itself is the lane-on run's fg.s1.pxBadges.assembly gate.)
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { computeBadgeAssembly, rederiveBadgeComponents } from './s1BadgeAssembly.mjs';

const W = 20, H = 16;
const idx = (x, y) => y * W + x;

function syntheticBadge() {
  const brightLabels = new Int32Array(W * H);
  const darkLabels = new Int32Array(W * H);
  const framePx = [], platePx = [], glyphPx = [];
  for (let y = 2; y < 12; y++) for (let x = 2; x < 14; x++)
    if (x === 2 || x === 13 || y === 2 || y === 11) { brightLabels[idx(x, y)] = 5; framePx.push(idx(x, y)); }
  for (let y = 3; y < 11; y++) for (let x = 3; x < 13; x++) { darkLabels[idx(x, y)] = 7; platePx.push(idx(x, y)); }
  for (let y = 5; y < 8; y++) for (let x = 5; x < 8; x++)
    if (!(x === 6 && y === 6)) { brightLabels[idx(x, y)] = 9; darkLabels[idx(x, y)] = 0; glyphPx.push(idx(x, y)); }
  darkLabels[idx(6, 6)] = 11;
  const plateFinal = platePx.filter((p) => darkLabels[p] === 7);
  const fused = [...framePx, ...plateFinal, ...glyphPx].sort((a, b) => a - b);
  const mute = [];
  for (let y = 2; y < 12; y++) for (let x = 2; x < 14; x++) mute.push(idx(x, y));
  const badge = {
    label: '0', source: 'bright-family', bbox: [2, 2, 12, 10],
    px: Uint32Array.from(fused), whitePx: framePx.length + glyphPx.length, blackPx: plateFinal.length,
    has: {
      findPx: {
        fn: 'fn.Badge.findPx',
        parts: [
          { polarity: 'bright', label: 5, bbox: [2, 2, 12, 10], area: framePx.length },
          { polarity: 'dark', label: 7, bbox: [3, 3, 10, 8], area: plateFinal.length },
          { polarity: 'bright', label: 9, bbox: [5, 5, 3, 3], area: glyphPx.length }
        ]
      },
      mute: { fn: 'fn.Badge.mute', radiusPx: 2, px: mute }
    }
  };
  const read = { label: '0', bbox: [2, 2, 12, 10], digits: [{ bbox: [5, 5, 3, 3], predicted: 0 }] };
  const comp = (label, bboxX, bboxY, bboxW, bboxH, area) => ({ label, bboxX, bboxY, bboxW, bboxH, area });
  const fields = {
    bright: { mask: { width: W, height: H, data: new Uint8Array(W * H) }, labels: brightLabels, components: [comp(5, 2, 2, 12, 10, framePx.length), comp(9, 5, 5, 3, 3, glyphPx.length)] },
    dark: { mask: { width: W, height: H, data: new Uint8Array(W * H) }, labels: darkLabels, components: [comp(7, 3, 3, 10, 8, plateFinal.length), comp(11, 6, 6, 1, 1, 1)] }
  };
  return { badge, read, fields, fused, counterPx: idx(6, 6) };
}

test('a synthetic badge assembles plate-first and the witness agrees role for role', () => {
  const { badge, read, fields, fused, counterPx } = syntheticBadge();
  const part = computeBadgeAssembly({ badges: [badge], reads: [read], fields });
  assert.equal(part.totals.badgeCount, 1);
  assert.equal(part.totals.fusedUnionPx, 119);
  assert.equal(part.totals.whitePx, 48);
  assert.equal(part.totals.blackPx, 71);
  assert.equal(part.totals.counterComponentCount, 1);
  assert.equal(part.totals.counterPx, 1);
  assert.equal(part.totals.ownedWithCountersPx, 120);
  assert.deepEqual(part.emits, { badges: 1, fusedUnionPx: 119, counterComponents: 1, counterPx: 1, ownedWithCountersPx: 120 });
  const rec = part.badges[0];
  assert.deepEqual(rec.fusedPx, fused);
  assert.deepEqual(rec.components.map((c) => [c.name, c.role, c.pxCount]), [['plate', 'base', 71], ['frame', 'fused', 40], ['digit-0', 'fused', 8]]);
  assert.equal(rec.componentOverlapPx, 0);
  assert.equal(rec.digits[0].counter.pxCount, 1);
  assert.deepEqual(rec.counters.map((c) => c.px), [[counterPx]]);
  assert.equal(rec.ownership.windowPx, 120);
  assert.equal(rec.ownership.residuePx, 1);
  assert.deepEqual(rec.residue, { windowResiduePx: 1, digitOwnedCounterPx: 1, unexplainedResiduePx: 0 });
  assert.equal(rec.anchor.exceedsThreshold, false);
  const witness = rederiveBadgeComponents({ badge, read, fields });
  const byName = Object.fromEntries(rec.components.map((c) => [c.name, c.px]));
  assert.deepEqual([...witness.plate.px].sort((a, b) => a - b), byName.plate);
  assert.deepEqual([...witness.frame.px].sort((a, b) => a - b), byName.frame);
  assert.deepEqual(witness.digits[0].glyphs.flatMap((g) => g.px).sort((a, b) => a - b), byName['digit-0']);
  assert.deepEqual(witness.counters.map((c) => c.px), [[counterPx]]);
});

test('the assembly refuses opaque badges, ambiguous plates, and ambiguous glyph ownership', () => {
  const { badge, read, fields } = syntheticBadge();
  const noParts = { ...badge, has: { mute: badge.has.mute, findPx: { fn: 'fn.Badge.findPx', parts: [] } } };
  assert.throws(() => computeBadgeAssembly({ badges: [noParts], reads: [read], fields }), /no findPx component evidence/);
  const twoPlates = {
    ...badge,
    has: {
      ...badge.has,
      findPx: { fn: 'fn.Badge.findPx', parts: [...badge.has.findPx.parts, { polarity: 'dark', label: 21, bbox: [3, 3, 2, 2], area: 4 }] }
    }
  };
  assert.throws(() => computeBadgeAssembly({ badges: [twoPlates], reads: [read], fields }), /expected exactly one \(the plate\)/);
  const twoDigits = { ...read, digits: [{ bbox: [5, 5, 3, 3], predicted: 0 }, { bbox: [4, 4, 5, 5], predicted: 1 }] };
  assert.throws(() => computeBadgeAssembly({ badges: [badge], reads: [twoDigits], fields }), /enclosed by 2 digit bboxes/);
});

test('the accepted specimen evidence decomposes plate-first for all 18 badges', () => {
  const base = resolve(import.meta.dirname, '../../attempts/stages/attempt-1792188256180-f51916a6db5f/fork/stage-output/early/artifacts/s1');
  const badgesArtifact = JSON.parse(readFileSync(resolve(base, 'px.badges.json'), 'utf8'));
  const digitsArtifact = JSON.parse(readFileSync(resolve(base, 'px.digits.json'), 'utf8'));
  assert.equal(badgesArtifact.totals.badgePx, 37002);
  assert.equal(digitsArtifact.totals.counterPx, 293);
  assert.equal(digitsArtifact.totals.counterComponentCount, 10);
  assert.equal(badgesArtifact.totals.badgePx + digitsArtifact.totals.counterPx, 37295);
  const contains = (outer, inner) => outer[0] <= inner[0] && outer[1] <= inner[1] && outer[0] + outer[2] >= inner[0] + inner[2] && outer[1] + outer[3] >= inner[1] + inner[3];
  let glyphTotal = 0;
  for (const badge of badgesArtifact.badges) {
    const parts = badge.findPx.parts;
    assert.equal(parts.reduce((n, p) => n + p.area, 0), badge.pxCount, `badge ${badge.label} parts sum to its px count`);
    const dark = parts.filter((p) => p.polarity === 'dark');
    assert.equal(dark.length, 1, `badge ${badge.label} has exactly one dark part (the plate)`);
    const plate = dark[0];
    const bright = parts.filter((p) => p.polarity === 'bright');
    const frames = bright.filter((p) => !contains(plate.bbox, p.bbox));
    const glyphs = bright.filter((p) => contains(plate.bbox, p.bbox));
    assert.equal(frames.length, 1, `badge ${badge.label} has exactly one frame part`);
    assert.deepEqual(frames[0].bbox, badge.bbox, `badge ${badge.label} frame bbox is the badge bbox`);
    const digits = digitsArtifact.badges[badge.index];
    assert.equal(digits.badgeLabel, badge.label, `badge index ${badge.index} alignment between artifacts`);
    for (const glyph of glyphs) {
      const owners = digits.digits.filter((d) => contains(d.bbox, glyph.bbox));
      assert.equal(owners.length, 1, `badge ${badge.label} glyph ${glyph.label} enclosed by exactly one digit`);
      glyphTotal++;
    }
    for (const counter of digits.counters) {
      const owners = digits.digits.filter((d) => contains(d.bbox, counter.bbox));
      assert.equal(owners.length, 1, `badge ${badge.label} counter ${counter.componentLabel} enclosed by exactly one digit`);
      assert.equal(owners[0] === digits.digits[counter.digitIndex] || digits.digits.indexOf(owners[0]) === counter.digitIndex, true);
    }
  }
  assert.equal(glyphTotal, digitsArtifact.totals.digitCount);
  console.log(`18 badges decompose plate-first; ${glyphTotal} glyph components each owned by exactly one digit; ledger 37002 + 293 = 37295`);
});
