import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyLocalDarkRule, localDarkMasks, noBadgesOf, NoBadgesCondition, S1_LOCAL_DARK } from './earlyStore.mjs';

const FINDPX = "PxC: Tick 'Badge.findPx' access contradicts its declaration; missing reads=[px.badges.stage, px.components] extra reads=[] missing writes=[] extra writes=[].";
const board = (reads) => ({ has: (a) => a === 'badges', get: () => reads });

test('an empty badge read set is recorded as a no-badges condition, anything else still throws', () => {
  const c = noBadgesOf(new Error(FINDPX), board([]));
  assert.ok(c instanceof NoBadgesCondition); assert.deepEqual([c.condition.stage, c.condition.result], ['S1', 'no badges']);
  assert.equal(noBadgesOf(new Error(FINDPX), board([{ label: '1' }])), null, 'with a badge read the same error is a real failure');
  assert.equal(noBadgesOf(new Error(FINDPX.replace('px.components', 'px.other')), board([])), null, 'another access mismatch is a real failure');
  assert.equal(noBadgesOf(new Error('boom'), board([])), null);
});

// a stand-in for the provider's computeBrightDarkMasks: the pinned absolute rule, bright = V >= 210, dark = V <= 45
const pinned = (image) => { const n = image.width * image.height, bright = new Uint8Array(n), dark = new Uint8Array(n); for (let i = 0; i < n; i++) { const v = image.data[i * 4]; if (v <= 45) dark[i] = 1; if (v >= 210) bright[i] = 1; } return { bright: { width: image.width, height: image.height, data: bright }, dark: { width: image.width, height: image.height, data: dark } }; };
const image = (w, h, v) => ({ width: w, height: h, data: Uint8ClampedArray.from({ length: w * h * 4 }, (_, i) => (i % 4 === 3 ? 255 : v(Math.floor(i / 4) % w, Math.floor(Math.floor(i / 4) / w)))) });

test('the local dark rule (applied only to a thrown round) marks a plate darker than its surroundings, opaque or translucent, and nothing on uniform ground', () => {
  // a 54 x 42 badge on V = 130 ground: a 5 px white frame, the plate, a white numeral block in the middle
  const plate = (x, y) => (x >= 40 && x < 94 && y >= 40 && y < 82 ? (x < 45 || x >= 89 || y < 45 || y >= 77 || (x >= 62 && x < 72 && y >= 52 && y < 70) ? 235 : PLATE) : 130);
  let PLATE = 8; const opaque = localDarkMasks(pinned, S1_LOCAL_DARK)(image(140, 120, plate)).dark.data;
  PLATE = 62; const translucent = localDarkMasks(pinned, S1_LOCAL_DARK)(image(140, 120, plate)).dark.data;
  const at = (m, x, y) => m[y * 140 + x];
  assert.equal(at(opaque, 52, 60), 1); assert.equal(at(translucent, 52, 60), 1, 'V 62 is above the absolute ceiling 45 but far below its surroundings');
  assert.equal(at(translucent, 10, 10), 0, 'open ground is not dark'); assert.equal(at(translucent, 66, 60), 0, 'the white numeral is not dark');
  PLATE = 130; assert.equal(localDarkMasks(pinned, S1_LOCAL_DARK)(image(140, 120, plate)).dark.data.some(Boolean), false, 'uniform ground has no dark pixel');
  PLATE = 62; const shadow = (x) => (x < 70 ? 62 : 62); assert.equal(localDarkMasks(pinned, S1_LOCAL_DARK)(image(140, 120, shadow)).dark.data[60 * 140 + 60], 0, 'uniformly dim ground (a shadow) is not dark: it is not darker than what surrounds it');
});

test('the rule is installed on the provider raster module for the gateway and restored after', () => {
  const mod = { computeBrightDarkMasks: pinned }, restore = applyLocalDarkRule(mod);
  assert.notEqual(mod.computeBrightDarkMasks, pinned); restore(); assert.equal(mod.computeBrightDarkMasks, pinned);
});
