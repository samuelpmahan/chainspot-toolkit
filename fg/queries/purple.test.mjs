import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPartStore, registerQueries } from '../store.mjs';
import { renderValue } from '../render.mjs';
import { PURPLE_QUERIES, purpleShare, THROWN_CUT } from './purple.mjs';

const image = (w, h, f) => ({ widthPx: w, heightPx: h, rgba: Uint8ClampedArray.from({ length: w * h * 4 }, (_, i) => { const p = Math.floor(i / 4), c = i % 4; return c === 3 ? 255 : f(p % w, Math.floor(p / w))[c]; }) });
const GREEN = [70, 90, 60], WALK = [101, 66, 179], PIN = [60, 140, 230], WHITE = [235, 235, 235];

test('the walk line (hue ~260) counts, the blue pins and the map do not', () => {
  const walk = purpleShare(image(100, 100, (x, y) => (y >= 40 && y < 44 ? WALK : GREEN)));
  assert.equal(walk.pixels, 400); assert.ok(Math.abs(walk.share - 0.04) < 1e-9);
  assert.equal(purpleShare(image(100, 100, (x, y) => (y < 10 ? PIN : GREEN))).pixels, 0, 'blue (210 deg) is not purple');
  assert.equal(purpleShare(image(100, 100, (x, y) => (y < 10 ? WHITE : GREEN))).pixels, 0, 'the walk line\'s white core is not purple');
});

test('thrown means purple present: the cut sits between a clean capture (no purple px) and the thinnest walk line seen (0.5 %)', () => {
  const store = createPartStore({ base: { has: () => false, get: () => null } }); registerQueries(store, PURPLE_QUERIES);
  const clean = store.call('fn.q.s0.purple', { a: image(100, 100, () => GREEN) }), thin = store.call('fn.q.s0.purple', { a: image(100, 100, (x, y) => (y === 0 && x < 50 ? WALK : GREEN)) });
  assert.equal(clean.value.thrown, false); assert.equal(thin.value.thrown, true, '0.5 % purple is thrown');
  assert.ok(THROWN_CUT > 0 && THROWN_CUT < 0.005, 'the cut is between 0 and the lowest thrown share');
  assert.equal(typeof clean.unit, 'string'); assert.notEqual(renderValue('fn.q.s0.purple', clean.value).kind, 'unrenderable');
});
