import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pxList, pxLabel, count, bbox, has, intersectCount, ownerPlane, forEach, ownedPx, pixelListsOf, resolvePxSet } from './pxset.mjs';
import { createPartStore } from './store.mjs';

// The same pixels in every backing must give the same answers: the property that lets a backing change behind the PxC.
export function pxsetProperties(sets) {
  const [ref, ...others] = sets, px = []; forEach(ref, (i) => px.push(i)); px.sort((a, b) => a - b);
  for (const s of others) {
    const mine = []; forEach(s, (i) => mine.push(i)); mine.sort((a, b) => a - b);
    assert.deepEqual(mine, px, `${s.backing} visits the same px as ${ref.backing}`);
    assert.equal(count(s), count(ref)); assert.deepEqual(bbox(s), bbox(ref));
    for (const i of px.slice(0, 50)) assert.ok(has(s, i));
  }
  if (px.length) { const b = bbox(ref); for (const i of px) { const x = i % ref.W, y = (i / ref.W) | 0; assert.ok(x >= b[0] && y >= b[1] && x < b[0] + b[2] && y < b[1] + b[3]); } }
}

test('one set, two backings, identical answers; intersections pattern-match on the pair', () => {
  const W = 8, H = 4, plane = new Int32Array(W * H);
  for (const i of [9, 10, 17, 18]) plane[i] = 5; for (const i of [3, 4]) plane[i] = 2;
  const asLabel = pxLabel(W, H, plane, 5), asList = pxList(W, H, [18, 9, 17, 10]);
  pxsetProperties([asList, asLabel]);
  assert.equal(intersectCount(asLabel, pxLabel(W, H, plane, 2)), 0, 'two labels of one plane are disjoint');
  assert.equal(intersectCount(asLabel, asList), 4);
  assert.equal(intersectCount(asList, pxList(W, H, [10, 11])), 1);
  const { plane: own, overlapPx } = ownerPlane(W, H, [asList, pxList(W, H, [10, 11])]);
  assert.equal(overlapPx, 1); assert.equal(own[11], 2); assert.equal(own[10], 1);
});

test('the store answers pxset queries by Part address, cached, unitful, profiled', () => {
  const W = 8, H = 4, labels = new Int32Array(W * H); for (const i of [9, 10, 17, 18]) labels[i] = 5;
  const store = createPartStore({ base: { has: (a) => ['px.image.cropped', 'px.components', 'px.badges'].includes(a),
    get: (a) => ({ 'px.image.cropped': { widthPx: W, heightPx: H }, 'px.components': { bright: { mask: { width: W, height: H }, labels } }, 'px.badges': [{ label: '1', px: [10, 11] }] })[a] } });
  const q = (fn, args) => store.call(`fn.q.pxset.${fn}`, args);
  assert.deepEqual(q('count', { a: 'px.components#bright:5' }), { value: 4, unit: 'px', emits: { computed: 1 } });
  assert.deepEqual(q('intersectCount', { a: 'px.components#bright:5', b: 'px.badges#0' }).value, 1);
  assert.deepEqual(q('count', { a: 'px.components#bright:5' }).emits, { cached: 1 }, 'same question, same answer, once');
  assert.deepEqual(q('bbox', { a: 'px.badges#0' }).value, [2, 1, 2, 1]);
  assert.equal(q('render', { a: 'px.badges#0' }).value.kind, 'pxset');
  const prof = store.calls().filter((e) => e.calculation.startsWith('fn.q.pxset.'));
  assert.equal(prof.length, 5);
});

test('a Part owns every pixel list in its tree, inferred from its structure, never picked by field', () => {
  const W = 10, H = 10;
  const basket = { bbox: [0, 0, 3, 3], whitePx: 3, blackPx: 2, px: Uint32Array.of(1, 2, 3, 11, 12), has: { findShellFamily: { blackPx: Uint32Array.of(11, 12) } } };
  const badge = { label: '4', px: Uint32Array.of(50, 51), has: { mute: { radiusPx: 2, px: Uint32Array.of(51, 52, 60) }, findPx: { parts: [{ bbox: [0, 5, 2, 1] }] } } };
  assert.deepEqual(pixelListsOf(basket).map((l) => l.path), ['px', 'has.findShellFamily.blackPx'], 'whitePx / blackPx counts are numbers, not pixel sets');
  assert.equal(count(ownedPx(W, H, basket)), 5, 'the shell is a subset of the basket');
  assert.deepEqual([...ownedPx(W, H, badge).px], [50, 51, 52, 60], 'a badge owns its mute ring');
  const get = (a) => ({ 'px.badges': [badge] })[a], dims = () => ({ widthPx: W, heightPx: H });
  assert.equal(count(resolvePxSet(get, 'px.badges#0', dims)), 4, 'a Part reference resolves to what the Part owns');
  assert.equal(count(resolvePxSet(get, 'px.badges#0.has.mute.px', dims)), 3, 'a path inside it names one list');
});
