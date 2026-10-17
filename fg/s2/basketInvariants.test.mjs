import { test } from 'node:test';
import assert from 'node:assert/strict';
import { observeBaskets, basketPoint, BASKET_POINT_OFFSET } from './fg.s2.basketInvariants.observe.fg.mjs';

test('basketPoint: bottom-centre pixel plus the spoke-solved offset', () => {
  assert.deepEqual(basketPoint([100, 200, 46, 72]), [122.5 + BASKET_POINT_OFFSET[0], 271 + BASKET_POINT_OFFSET[1]]);
});

test('size, deficit vs badges, touching and duplicates are findings', () => {
  const badges = Array.from({ length: 18 }, (_, i) => ({ label: i + 1, bbox: [1000, i * 50, 54, 42] }));
  const baskets = [{ bbox: [0, 0, 46, 72] }, { bbox: [40, 0, 46, 72] }, { bbox: [990, 0, 46, 72] }, { bbox: [2, 1, 46, 72] }, { bbox: [500, 500, 47, 72] }];
  const o = observeBaskets(baskets, badges);
  assert.equal(o.findings.deficit, 13);
  assert.equal(o.findings.sizeConstant, false); assert.deepEqual(o.findings.offSize, ['Basket ce']);
  assert.deepEqual(o.findings.duplicates, [['Basket ca', 'Basket cd']]);
  assert.ok(o.findings.touchingBadges.some((t) => t.basket === 'Basket cc' && t.badges.includes('Badge 1')));
  assert.ok(o.findings.touchingBaskets.some((t) => t.basket === 'Basket ca' && t.baskets.includes('Basket cb')));
});

test('partial view: more baskets than badges is not a finding, and there is no S4 deficit to hand off', () => {
  const badges = [1, 2, 3, 4, 11, 12].map((l, i) => ({ label: l, bbox: [1000, i * 50, 54, 42] }));
  const baskets = Array.from({ length: 7 }, (_, i) => ({ bbox: [i * 100, 600, 46, 72] }));
  const o = observeBaskets(baskets, badges);
  assert.equal(o.findings.view, 'partial');
  assert.equal(o.findings.deficit, null); assert.equal(o.findings.overBadgeCount, null);
  const full = observeBaskets(baskets.concat(baskets.map((k) => ({ bbox: [k.bbox[0], 800, 46, 72] }))).concat(baskets.map((k) => ({ bbox: [k.bbox[0], 900, 46, 72] }))),
    Array.from({ length: 18 }, (_, i) => ({ label: i + 1, bbox: [1100, i * 50, 54, 42] })));
  assert.equal(full.findings.view, 'full'); assert.equal(full.findings.overBadgeCount, true);
});
