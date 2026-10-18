import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partKind, renderValue, partFrame } from './render.mjs';
import { pxList } from './pxset.mjs';
import { createPartStore, RENDER_PART } from './store.mjs';
import { FRAME_KINDS } from './guarantee.mjs';

/** The default property, written once: a value renders, and only to frame kinds the flipbook draws. */
export function assertRenders(address, value, dims) {
  const r = renderValue(address, value, dims);
  assert.notEqual(r.kind, 'unrenderable', `${address} does not render: add a case to fg/render.mjs`);
  assert.ok(r.parts.length > 0, `${address} renders to nothing (${r.kind}): an empty page is not a render`);
  for (const p of r.parts) { assert.ok(FRAME_KINDS.includes(p.kind), `${address}: part kind ${p.kind}`); assert.notEqual(p.data, undefined); }
  return r;
}

test('the union: each shape renders to the kind the flipbook draws', () => {
  const dims = { widthPx: 8, heightPx: 4 };
  assert.equal(partKind(pxList(8, 4, [1, 2])), 'pxset');
  assert.equal(assertRenders('a', [{ label: '1', bbox: [0, 0, 2, 2], px: [0, 1, 8, 9] }], dims).parts.map((p) => p.kind).join(), 'pxset,bbox');
  assert.equal(assertRenders('b', [{ center: [1, 2], label: 't' }], dims).parts[0].data.points[0][2], 't');
  assert.equal(assertRenders('c', { rgba: new Uint8Array(128), widthPx: 8, heightPx: 4 }, dims).parts[0].kind, 'raster');
  assert.deepEqual(assertRenders('d', 3, dims).parts[0].data, { value: 3, unit: null });
  const plane = assertRenders('e', { ev: new Uint8Array(32).fill(2), emits: { n: 1 } }, dims);
  assert.ok(plane.parts.some((p) => p.kind === 'raster') && plane.parts.some((p) => p.address === 'e.ev#values'));
  assert.equal(partKind(() => 1), 'unrenderable');
  assert.equal(partFrame('d', 3).verdicts[0].ok, true);
});

test('every store renders any Part by address, cached, profiled', () => {
  const store = createPartStore({ base: { has: (a) => a === 'px.badges' || a === 'px.image.cropped', get: (a) => (a === 'px.badges' ? [{ label: '1', bbox: [1, 1, 2, 2], px: [9, 10] }] : { rgba: new Uint8Array(128), widthPx: 8, heightPx: 4 }) } });
  const r = store.call(RENDER_PART, { a: 'px.badges' });
  assert.equal(r.value.kind, 'pxsets'); assert.equal(r.value.parts[0].data.width, 8);
  store.call(RENDER_PART, { a: 'px.badges' });
  assert.equal(store.calls().filter((e) => e.calculation === RENDER_PART).length, 2);
});
