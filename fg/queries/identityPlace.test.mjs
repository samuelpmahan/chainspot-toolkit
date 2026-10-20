import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPartStore, registerQueries } from '../store.mjs';
import { renderValue } from '../render.mjs';
import { IDENTITY_PLACE_QUERIES, placeTiles } from './identityPlace.mjs';

const course = Array.from({ length: 18 }, (_, i) => ({ holeNumber: i + 1, xPx: 100 * i + 60 * Math.sin(i * 1.7), yPx: 200 + 45 * Math.cos(i * 0.9) + 15 * i }));
const tile = (name, holes, dx, dy) => ({ name, badges: course.filter((p) => holes.includes(p.holeNumber)).map((p) => ({ holeNumber: p.holeNumber, xPx: p.xPx + dx, yPx: p.yPx + dy })) });
const A = tile('A', [1, 2, 3, 4, 5, 6, 7], 10, -5), B = tile('B', [6, 7, 8, 9, 10, 11, 12], -300, 40), C = tile('C', [11, 12, 13, 14, 15, 16], 200, 90), D = tile('D', [16, 17, 18, 17], -50, 0);

test('tiles of one capture are placed from the badges they share, and the union is the course up to the seed frame', () => {
  const r = placeTiles([A, B, C]);
  assert.ok(r.connected && r.unplaced.length === 0);
  assert.deepEqual(r.unionHoles, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  const seed = [A, B, C].find((t) => t.name === r.seed), off = { x: seed.badges[0].xPx - course.find((p) => p.holeNumber === seed.badges[0].holeNumber).xPx, y: seed.badges[0].yPx - course.find((p) => p.holeNumber === seed.badges[0].holeNumber).yPx };
  for (const u of r.union) { const c = course.find((p) => p.holeNumber === u.holeNumber); assert.ok(Math.hypot(u.xPx - c.xPx - off.x, u.yPx - c.yPx - off.y) < 1e-6, `hole ${u.holeNumber}`); assert.ok(u.disagreementPx < 1e-6); }
});

test('a tile that shares too few badges is reported unplaced, not forced; one shared badge only places it as a hypothesis', () => {
  const lone = { name: 'L', badges: [{ holeNumber: 16, xPx: 5, yPx: 5 }, { holeNumber: 17, xPx: 100, yPx: 0 }, { holeNumber: 18, xPx: 150, yPx: 50 }] };
  const solid = placeTiles([A, B, C, lone]);
  assert.deepEqual(solid.unplaced.map((u) => u.tile), ['L']); assert.equal(solid.unplaced[0].bestSharedWithPlaced, 1); assert.ok(!solid.connected);
  assert.deepEqual(solid.unionHoles.includes(17), false);
  const hyp = placeTiles([A, B, C, lone], { minShared: 1 });
  assert.ok(hyp.connected && hyp.unionHoles.includes(18));
});

test('fn.q.identity.place is unitful, cached, profiled and renderable', () => {
  const store = createPartStore({ base: { has: () => false, get: () => null } }); registerQueries(store, IDENTITY_PLACE_QUERIES);
  const a = store.call('fn.q.identity.place', { tiles: [A, B, C] }), again = store.call('fn.q.identity.place', { tiles: [A, B, C] });
  assert.equal(typeof a.unit, 'string'); assert.deepEqual(again.emits, { cached: 1 }); assert.notEqual(renderValue('fn.q.identity.place', a.value).kind, 'unrenderable');
});
