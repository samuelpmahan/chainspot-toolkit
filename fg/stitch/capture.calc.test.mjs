import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPartStore, registerQueries, RENDER_PART } from '../store.mjs';
import { STITCH_QUERIES, lumaOf } from '../queries/stitch.mjs';
import { renderValue } from '../render.mjs';
import { STITCH_CALCULATION, CAPTURE_VIEW_CALCULATION } from './capture.calc.mjs';

// two tiles of a textured strip, shifted by (60, 0); badges 1-3 in A, 2-4 in B (2 and 3 shared)
function tiles() {
  const W = 120, H = 80, world = (x, y) => (x * 37 + y * 11 + ((x * y) % 23) * 7) % 256;
  const mk = (name, ox, holes) => {
    const rgba = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 4, v = world(x + ox, y); rgba[o] = v; rgba[o + 1] = (v * 3) % 256; rgba[o + 2] = 255 - v; rgba[o + 3] = 255; }
    const crop = { xPx: 0, yPx: 0, widthPx: W, heightPx: H };
    return { name, widthPx: W, heightPx: H, rgba, crop, gray: lumaOf({ rgba, widthPx: W }, crop), badgeWidthPx: 12,
      badges: holes.map(([h, x, y]) => ({ holeNumber: h, xPx: x - ox, yPx: y })) };
  };
  return [mk('A', 0, [[1, 20, 20], [2, 70, 40], [3, 100, 60]]), mk('B', 60, [[2, 70, 40], [3, 100, 60], [4, 150, 30]])];
}

test('fn.tk.source.stitch: one course raster from a capture; coverage from the badges; emits; the view renders over the course', () => {
  const store = createPartStore();
  registerQueries(store, STITCH_QUERIES);
  store.constant('fn.test.tiles', { 'tk.source.captureTiles': tiles(), 'tk.source.cropReceipt': { upperRowsRemoved: 2, lowerRowsRemoved: 2 } });
  store.register(...STITCH_CALCULATION); store.register(...CAPTURE_VIEW_CALCULATION);
  const c = store.get('tk.source.capture'), r = store.get('tk.source.courseRaster');
  assert.equal(r.widthPx, 180); assert.equal(r.heightPx, 80);
  assert.equal(c.coverage.text, '4/4'); assert.deepEqual(c.conditions, []);
  assert.deepEqual(c.tiles.map((t) => t.transform.coefficients), [[1, 0, 0, 1, 0, 0], [1, 0, 0, 1, 60, 0]]);
  assert.equal(c.tiles[0].ownedPx + c.tiles[1].ownedPx, 180 * 80, 'every course pixel is painted by exactly one tile');
  assert.ok(c.badges.find((b) => b.holeNumber === 2).seenIn.length === 2);
  assert.equal(c.overlapRule, 'deepest-inside-tile-v1');
  const e = store.calls().find((x) => x.calculation === 'fn.tk.source.stitch').emits;
  assert.equal(e.holesCovered, 4); assert.equal(e.linksConfirmed, 1);
  const v = store.get('tk.source.captureView');
  assert.equal(v.badges[0].yPx, c.badges[0].yPx - 2, 'canonical = composite y - S0 top rows');
  // the view renders over the canonical course raster (dims), with a header band legend
  const dims = { widthPx: 180, heightPx: 76, rgba: r.rgba.subarray(180 * 2 * 4, 180 * 78 * 4) };
  const rendered = store.call(RENDER_PART, { a: 'tk.source.capture' }).value;
  assert.equal(rendered.kind, 'capture');
  const out = renderValue('tk.source.captureView', v, dims);
  assert.equal(out.kind, 'capture'); assert.ok(out.parts.some((p) => p.kind === 'raster' && p.data.png && p.data.headerBandPx > 0));
});

test('a capture tile with no badge and no overlap stays unplaced: recorded, never thrown', () => {
  const [A, B] = tiles(), lone = { ...B, name: 'C', badges: [], rgba: new Uint8ClampedArray(B.rgba.length).fill(255), gray: { ...B.gray, gray: new Uint8Array(B.gray.gray.length).fill(128) } };
  const store = createPartStore();
  registerQueries(store, STITCH_QUERIES);
  store.constant('fn.test.tiles', { 'tk.source.captureTiles': [A, B, lone] });
  store.register(...STITCH_CALCULATION);
  const c = store.get('tk.source.capture');
  assert.deepEqual(c.unplaced, ['C']); assert.ok(c.conditions.some((s) => s.includes('tile C is not placed')));
});
