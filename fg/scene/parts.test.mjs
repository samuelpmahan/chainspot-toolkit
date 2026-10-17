import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C1S, C2D, HolePath, ringsForBaskets, occludersOf } from './parts.mjs';

test('C1S / C2D cover their annulus; C2D sits at 2 x C1', () => {
  const r = { C1S: { radiusPx: 25, strokeFwhmPx: 2.75 }, C2D: { radiusPx: 50, strokeFwhmPx: 4 } };
  const [c1, c2] = ringsForBaskets([{ name: 'Basket ca', point: [100, 100] }], r);
  assert.equal(c1.name, 'C1S of Basket ca'); assert.equal(c2.kind, 'C2D');
  assert.ok(c1.covers([125, 100]) && !c1.covers([130, 100]));
  assert.ok(c2.covers([100, 151.5]) && !c2.covers([100, 155]));
});

test('HolePath: the TeeBadgeSegment is the first leg; coverage follows the polyline at width W', () => {
  const h = HolePath({ name: 'HolePath 9', vertices: [[0, 0], [100, 0], [100, 100]], widthPx: 20 });
  assert.deepEqual(h.teeBadgeSegment, [[0, 0], [100, 0]]);
  assert.ok(h.covers([50, 9]) && !h.covers([50, 11]) && h.covers([109, 50]));
});

test('occludersOf: names opaque and translucent occluders with the fraction of the footprint they cover', () => {
  const W = 1000, owned = new Map([['Badge 4', new Set([100 * W + 100, 100 * W + 101])]]);
  const ring = C1S({ name: 'C1S of Basket cb', centre: [100, 140], radiusPx: 40, strokeFwhmPx: 3 });
  const hits = occludersOf([100, 100], 5, { parts: [ring], ownedPx: owned, widthPx: W });
  assert.deepEqual(hits.map((h) => h.name).sort(), ['Badge 4', 'C1S of Basket cb']);
  assert.ok(hits.find((h) => h.name === 'Badge 4').opaque);
  assert.ok(!hits.find((h) => h.name === 'C1S of Basket cb').opaque);
});
