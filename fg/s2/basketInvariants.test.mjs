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
