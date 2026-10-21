import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPartStore, registerQueries } from '../store.mjs';
import { renderValue } from '../render.mjs';
import { SPRITE_QUERIES, spriteOverlap, poolOverlaps } from './sprite.mjs';

// A synthetic image of one sprite (a hollow 6 x 4 px dark frame) stamped at several places, plus "canopy" that touches
// a different side of every instance: the overlap keeps the frame and drops the canopy.
function stamped(n, { canopy = true } = {}) {
  const W = 20 * n + 10, H = 20, data = new Uint8Array(W * H), instances = [];
  for (let k = 0; k < n; k++) {
    const x0 = 5 + 20 * k, y0 = 6;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 6; x++) if (y === 0 || y === 3 || x === 0 || x === 5) data[(y0 + y) * W + x0 + x] = 1;
    if (canopy) { const cx = x0 - 2 + (k % 4) * 3, cy = k % 2 ? y0 - 2 : y0 + 4; for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) data[(cy + y) * W + cx + x] = 1; }
    instances.push({ bbox: [x0 + 1, y0 + 1, 4, 2] });   // the anchor box: the frame's interior (a "body")
  }
  return { mask: { width: W, height: H, data }, instances };
}
const WINDOW = { width: 10, height: 8, anchorAt: [3, 3] };   // the interior's top-left sits at (3, 3) of the frame window

test('fn.q.sprite.*: unitful, cached, profiled, renderable', () => {
  const { mask, instances } = stamped(4);
  const store = createPartStore({ base: { has: (x) => x === 'px.example', get: () => mask } });
  registerQueries(store, SPRITE_QUERIES);
  const args = { source: 'px.example', instances, window: WINDOW, level: 0.75 };
  const first = store.call('fn.q.sprite.overlap', args), again = store.call('fn.q.sprite.overlap', args);
  assert.equal(typeof first.unit, 'string');
  assert.deepEqual(again.emits, { cached: 1 });
  assert.equal(renderValue('fn.q.sprite.overlap', first.value).kind, 'spriteOverlap');
  assert.ok(store.calls().some((e) => e.calculation === 'fn.q.sprite.overlap'));
});

test('the overlap keeps what the instances share and drops what touches each one alone', () => {
  const { mask, instances } = stamped(8);
  const o = spriteOverlap({ source: mask, instances, window: WINDOW, level: 0.75 });
  const cells = []; for (let y = 0; y < 8; y++) for (let x = 0; x < 10; x++) if (o.shape[y * 10 + x]) cells.push([x, y]);
  assert.equal(cells.length, 16, 'the 6 x 4 frame has 16 px');
  assert.deepEqual([Math.min(...cells.map((c) => c[0])), Math.min(...cells.map((c) => c[1])), Math.max(...cells.map((c) => c[0])), Math.max(...cells.map((c) => c[1]))], [2, 2, 7, 5]);
  assert.equal(o.agreementCount, 6);
  assert.ok(o.members.every((m) => m.residual < 0.1));
  // pooling two halves gives the same agreement as the whole
  const a = spriteOverlap({ source: mask, instances: instances.slice(0, 3), window: WINDOW, level: 0.75 }), b = spriteOverlap({ source: mask, instances: instances.slice(3), window: WINDOW, level: 0.75 });
  assert.deepEqual([...poolOverlaps([a, b]).agree], [...o.agree]);
});

test('component fields pick their mask by polarity; a raster gets coverage from local levels', () => {
  const { mask, instances } = stamped(4, { canopy: false });
  const viaFields = spriteOverlap({ source: { dark: { mask }, bright: { mask: { ...mask, data: new Uint8Array(mask.data.length) } } }, instances, window: WINDOW });
  assert.deepEqual([...viaFields.shape], [...spriteOverlap({ source: mask, instances, window: WINDOW }).shape]);
  const rgba = new Uint8ClampedArray(mask.width * mask.height * 4);
  for (let i = 0; i < mask.data.length; i++) { const v = mask.data[i] ? 30 : 140; rgba.set([v, v + 20, v, 255], i * 4); }
  const viaRaster = spriteOverlap({ source: { widthPx: mask.width, heightPx: mask.height, rgba }, instances, window: WINDOW, polarity: 'dark' });
  assert.deepEqual([...viaRaster.shape], [...viaFields.shape]);
});

test('instances at different sub-pixel phases resolve an edge finer than a px, and refine finds a mis-stated anchor', () => {
  // one sprite (dark left of an edge, light right of it) rendered at 8 sub-pixel phases: each px is area-blended, and the
  // anchor is the true edge. At factor 4 the mean coverage crosses 0.5 within 0.1 px of the anchor.
  const W = 200, H = 4, rgba = new Uint8ClampedArray(W * H * 4), instances = [];
  for (let k = 0; k < 8; k++) {
    const t = 10.5 + 22 * k + k / 8;   // the edge, continuous (px centres at integers, so px x spans x - 0.5 .. x + 0.5)
    for (let x = Math.floor(t) - 4; x <= Math.floor(t) + 8; x++) {
      const dark = Math.min(1, Math.max(0, t - (x - 0.5))), v = Math.round(140 - 110 * dark);
      for (let y = 0; y < H; y++) rgba.set([v, v, v, 255], (y * W + x) * 4);
    }
    instances.push({ anchor: [t, 1] });
  }
  for (let i = 3; i < rgba.length; i += 4) if (!rgba[i]) rgba.set([140, 140, 140, 255], i - 3);
  const source = { widthPx: W, heightPx: H, rgba }, window = { width: 12, height: 2, anchorAt: [4, 0] };
  const o = spriteOverlap({ source, instances, window, factor: 4 });
  const xs = Array.from({ length: o.fineWidth }, (_, u) => (u + 0.5) / 4 - 0.5 - window.anchorAt[0]), m = Array.from({ length: o.fineWidth }, (_, u) => o.mean[u]);
  const u = m.findIndex((v, i) => i > 0 && m[i - 1] >= 0.5 && v < 0.5);
  const crossPx = xs[u - 1] + ((m[u - 1] - 0.5) / (m[u - 1] - m[u])) * (xs[u] - xs[u - 1]);
  assert.ok(Math.abs(crossPx) < 0.1, `the super-resolved edge sits at the anchor (${crossPx.toFixed(3)} px)`);
  assert.deepEqual(o.members.map((mm) => Number(mm.phase[0].toFixed(3))), instances.map((it) => Number((it.anchor[0] % 1).toFixed(3))));
  // one instance stated 1 px off: refine re-registers it
  const off = instances.map((it, k) => (k === 3 ? { anchor: [it.anchor[0] + 1, 1] } : it));
  const r = spriteOverlap({ source, instances: off, window, factor: 4, refinePx: 1.5 });
  assert.equal(r.members[3].shift[0], -1);
});
