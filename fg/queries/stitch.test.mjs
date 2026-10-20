import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPartStore, registerQueries } from '../store.mjs';
import { renderValue } from '../render.mjs';
import { STITCH_QUERIES, STITCH, placeCapture, compositeFrame, compositeRaster, sourcePoint, lumaOf, fullSearch } from './stitch.mjs';

// A synthetic course: textured terrain (deterministic), badges at known world points. Tiles are crops of it at pure shifts,
// with a screen-fixed overlay (a white box) at each tile's bottom-right, as the Maps switch is on a real capture.
const WW = 420, WH = 320;
const world = (() => {
  const rgba = new Uint8ClampedArray(WW * WH * 4); let s = 7;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const blobs = Array.from({ length: 90 }, () => [rnd() * WW, rnd() * WH, 6 + rnd() * 26, rnd() * 255]);
  for (let y = 0; y < WH; y++) for (let x = 0; x < WW; x++) {
    let v = 60 + 40 * Math.sin(x / 13) * Math.cos(y / 17) + 30 * rnd();
    for (const [bx, by, r, c] of blobs) if ((x - bx) ** 2 + (y - by) ** 2 < r * r) v = (v + c) / 2;
    const o = (y * WW + x) * 4; rgba[o] = v; rgba[o + 1] = (v * 0.8 + x) % 256; rgba[o + 2] = (v * 0.6 + y) % 256; rgba[o + 3] = 255;
  }
  return { widthPx: WW, heightPx: WH, rgba };
})();
const HOLES = [[1, 40, 40], [2, 150, 60], [3, 230, 110], [4, 330, 70], [5, 380, 250], [6, 260, 270], [7, 120, 230], [8, 60, 160]];
const TW = 240, TH = 200, TOP = 10;   // tile source raster: TOP rows of chrome above the crop
function tile(name, ox, oy, { relabel = null } = {}) {
  const rgba = new Uint8ClampedArray(TW * (TH + TOP) * 4);
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) { const s = ((oy + y) * WW + ox + x) * 4, d = ((y + TOP) * TW + x) * 4; for (let k = 0; k < 4; k++) rgba[d + k] = world.rgba[s + k]; }
  for (let y = TH - 12; y < TH - 4; y++) for (let x = TW - 36; x < TW - 6; x++) { const d = ((y + TOP) * TW + x) * 4; rgba[d] = rgba[d + 1] = rgba[d + 2] = 250; }
  const crop = { xPx: 0, yPx: TOP, widthPx: TW, heightPx: TH };
  const badges = HOLES.filter(([, x, y]) => x >= ox + 4 && y >= oy + 4 && x < ox + TW - 4 && y < oy + TH - 4).map(([h, x, y]) => ({ holeNumber: relabel?.[h] ?? h, xPx: x - ox, yPx: y - oy + TOP }));
  return { name, widthPx: TW, heightPx: TH + TOP, rgba, crop, gray: lumaOf({ rgba, widthPx: TW }, crop), badges, badgeWidthPx: 24 };
}

test('two tiles sharing badges: badges place, pixels confirm, the course raster is the world', () => {
  const A = tile('A', 0, 0), B = tile('B', 120, 70);
  const p = placeCapture([A, B]);
  assert.deepEqual(p.unplaced, []); assert.equal(p.links.length, 1); assert.ok(p.links[0].confirmed);
  assert.deepEqual(p.transforms.B, [1, 0, 0, 1, 120, 70]);
  assert.ok(p.links[0].residualLuma < 5 && p.links[0].contrast < STITCH.confirmContrast);
  const frame = compositeFrame([A, B], p.transforms), r = compositeRaster([A, B], frame);
  assert.equal(frame.widthPx, 120 + TW); assert.equal(frame.heightPx, 70 + TH);
  // every covered pixel is the world's pixel, except where only one tile covers its own overlay
  let diff = 0;
  for (let y = 0; y < frame.heightPx; y++) for (let x = 0; x < frame.widthPx; x++) { const k = y * frame.widthPx + x; if (!r.owner[k]) { assert.equal(r.rgba[k * 4 + 3], 255, 'uncovered is opaque'); continue; } if (r.rgba[k * 4] !== world.rgba[(y * WW + x) * 4]) diff++; }
  assert.ok(diff <= 2 * 30 * 8, `only an unoverlapped overlay differs (${diff} px)`);
  // A's overlay (bottom-right of A) lies inside B: the overlap rule paints it from B (B sees it deeper)
  const k = (TH - 8) * frame.widthPx + (TW - 20); assert.equal(r.owner[k], 2);
  assert.equal(r.rgba[k * 4], world.rgba[((TH - 8) * WW + TW - 20) * 4]);
  // a composite point maps back to every tile that covers it, the painting tile first
  const back = sourcePoint(frame, r.owner, { xPx: 200, yPx: 150 });
  assert.deepEqual(back.map((c) => c.tile), ['B', 'A']); assert.deepEqual([back[0].xPx, back[0].yPx], [80, 80 + TOP]); assert.deepEqual([back[1].xPx, back[1].yPx], [200, 150 + TOP]);
});

test('a one-badge link is a hypothesis: pixels confirm a true one and reject a false one', () => {
  const A = tile('A', 0, 0), B = tile('B', 120, 70);
  const shared = A.badges.filter((p) => B.badges.some((q) => q.holeNumber === p.holeNumber)).map((p) => p.holeNumber);
  const keep = shared[0], one = (t) => ({ ...t, badges: t.badges.filter((b) => b.holeNumber === keep || !shared.includes(b.holeNumber)) });
  const good = placeCapture([one(A), one(B)]);
  assert.ok(good.links[0].confirmed && good.links[0].shared === 1); assert.deepEqual(good.transforms.B, [1, 0, 0, 1, 120, 70]);
  // B reads hole `keep`'s label on a different badge: the predicted offset is wrong by far more than the window
  const other = B.badges.find((b) => !shared.includes(b.holeNumber));
  const lying = { ...one(B), badges: [{ ...other, holeNumber: keep }] };
  const bad = placeCapture([one(A), lying]);
  assert.equal(bad.rejected.length, 1); assert.equal(bad.rejected[0].confirmed, false);
  // the rejected badge link does not place B; pixels alone then do, at the true shift
  assert.equal(bad.tree[0].evidence, 'pixels'); assert.deepEqual(bad.transforms.B, [1, 0, 0, 1, 120, 70]);
});

test('no shared badge: pixels alone place the tile (full-overlap search, stitch.ts findBestTranslation)', () => {
  const A = tile('A', 0, 0), B = { ...tile('B', 110, 90), badges: [] };
  const p = placeCapture([A, B]);
  assert.deepEqual(p.unplaced, []); assert.equal(p.tree[0].evidence, 'pixels'); assert.deepEqual(p.transforms.B, [1, 0, 0, 1, 110, 90]);
  const f = fullSearch(A.gray, B.gray); assert.deepEqual(f.offset, [110, 90]);
});

test('one tile: no stitching, identity transform', () => {
  const A = tile('A', 0, 0), p = placeCapture([A]);
  assert.deepEqual(p.transforms, { A: [1, 0, 0, 1, 0, 0] }); assert.deepEqual(p.links, []);
});

test('fn.q.stitch.*: unitful, cached, profiled, renderable', () => {
  const A = tile('A', 0, 0), B = tile('B', 120, 70);
  const store = createPartStore({ base: { has: (x) => x === 'tk.source.captureTiles', get: () => [A, B] } });
  registerQueries(store, STITCH_QUERIES);
  const p = store.call('fn.q.stitch.place', { tiles: 'tk.source.captureTiles' }), again = store.call('fn.q.stitch.place', { tiles: 'tk.source.captureTiles' });
  assert.equal(typeof p.unit, 'string'); assert.deepEqual(again.emits, { cached: 1 });
  const f = store.call('fn.q.stitch.frame', { tiles: 'tk.source.captureTiles', transforms: p.value.transforms });
  const c = store.call('fn.q.stitch.composite', { tiles: 'tk.source.captureTiles', frame: f.value });
  for (const [fn, v] of [['fn.q.stitch.place', p.value], ['fn.q.stitch.frame', f.value], ['fn.q.stitch.composite', c.value]]) assert.notEqual(renderValue(fn, v).kind, 'unrenderable', `${fn}'s value renders`);
  assert.ok(store.calls().some((e) => e.calculation === 'fn.q.stitch.place'), 'every call is profiled');
});
