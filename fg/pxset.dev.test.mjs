// The PixelSet properties (fg/pxset.test.mjs) over real inputs: every dev course's S1 bright components, each in both
// backings (a label of the shared plane, and the same px as a list), plus every badge's px. Same test, any input: a
// course whose attempt is not on this machine is reported as skipped, never failed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { deserialize } from './pxcCodec.mjs';   // node:v8 with packed typed arrays
import { join } from 'node:path';
import { pxList, pxLabel, labelBoxes, forEach, intersectCount, ownedPx, pixelListsOf, count } from './pxset.mjs';
import { pxsetProperties } from './pxset.test.mjs';

const ROOT = join(import.meta.dirname, '..');
const ATTEMPTS = existsSync(join(ROOT, 'docs/evidence/dev-s1s4/ATTEMPTS'))
  ? readFileSync(join(ROOT, 'docs/evidence/dev-s1s4/ATTEMPTS'), 'utf8').trim().split('\n').map((l) => l.split(' ')) : [];

for (const [course, attempt] of ATTEMPTS) {
  const snap = join(ROOT, 'attempts/stages', attempt, 'fork/stage-output/early/s3.pxc.bin');
  test(`pxset properties on ${course}'s real Parts`, { skip: existsSync(snap) ? false : `attempt ${attempt} is not on this machine` }, () => {
    const pxc = new Map(deserialize(readFileSync(snap)));
    const { bright } = pxc.get('px.components'), W = bright.mask.width, H = bright.mask.height;
    const byLabel = new Map();
    for (let i = 0; i < bright.labels.length; i++) { const l = bright.labels[i]; if (l) { if (!byLabel.has(l)) byLabel.set(l, []); byLabel.get(l).push(i); } }
    let checked = 0; const boxes = labelBoxes(W, H, bright.labels);
    for (const [l, px] of byLabel) { pxsetProperties([pxLabel(W, H, bright.labels, l, boxes.get(l)), pxList(W, H, px)]); checked++; }
    // every badge's px intersect the components exactly where the plane says so
    for (const b of pxc.get('px.badges')) {
      const set = pxList(W, H, b.px); let inPlane = 0; forEach(set, (i) => { if (bright.labels[i]) inPlane++; });
      const viaQueries = [...new Set([...b.px].map((i) => bright.labels[i]).filter(Boolean))].reduce((n, l) => n + intersectCount(set, pxLabel(W, H, bright.labels, l, boxes.get(l))), 0);
      assert.equal(viaQueries, inPlane, `Badge ${b.label}`);
    }
    // what a Part owns is inferred from its structure: a basket's shell is inside its px; a badge also owns its mute ring
    for (const k of pxc.get('px.baskets')) assert.equal(count(ownedPx(W, H, k)), k.px.length, `basket ${k.label ?? ''}: shell px are basket px`);
    for (const b of pxc.get('px.badges')) {
      const all = new Set(pixelListsOf(b).flatMap((l) => [...l.px]));
      assert.equal(count(ownedPx(W, H, b)), all.size, `Badge ${b.label} owns px and has.mute.px`);
    }
    assert.ok(checked > 0);
  });
}
