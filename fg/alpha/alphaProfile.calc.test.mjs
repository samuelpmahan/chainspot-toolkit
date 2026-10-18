// fn.tk.s7.alphaProfile on a toy board: produces tk.s7.alphaProfile in the contract's shape, emits its measures,
// renders, and records every missing input as a condition.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPartStore, RENDER_PART } from '../store.mjs';
import { ALPHA_PROFILE_PART, ALPHA_PROFILE_SCHEMA, OVERLAY_CLASSES } from '../../contracts/alpha.profile@1.mjs';
import { registerAlphaQueries } from './alphaSpace.mjs';
import { ALPHA_CALCULATIONS, ASSOCIATION_PART, COURSE_PART } from './alphaProfile.calc.mjs';
import { toyBoard } from './synthetic.mjs';
import { FRAME_KINDS } from '../guarantee.mjs';

const C1 = { rgb: [150, 240, 190], alpha: 0.3 }, C2 = { rgb: [150, 220, 180], alpha: 0.2 }, PATH = { rgb: [225, 228, 232], alpha: 0.35 };
const TOY = toyBoard({ c1: C1, c2: C2, path: PATH });

function storeOn(t, { association = t.association, hallway = t.hallway } = {}) {
  const parts = { 'px.image.cropped': t.raster, 'px.baskets': t.baskets, 'px.badges': t.badges, 'px.tees': t.tees, 'px.tees.refined': t.tees };
  const store = createPartStore({ base: { has: (a) => a in parts, get: (a) => parts[a] } });
  store.constant('fn.tk.toy.laneOutputs', { 'tk.s4.hallway': hallway, [ASSOCIATION_PART]: association, [COURSE_PART]: 'toy' });
  for (const [fn, spec] of ALPHA_CALCULATIONS) store.register(fn, spec);
  registerAlphaQueries(store);
  return store;
}

test('fn.tk.s7.alphaProfile: the contract shape, the known composite recovered, emits recorded, renders', () => {
  const store = storeOn(TOY), p = store.get(ALPHA_PROFILE_PART);
  assert.equal(p.schema, ALPHA_PROFILE_SCHEMA); assert.equal(p.course, 'toy'); assert.ok(Math.abs(p.r1Px - 30) <= 1, `R1 ${p.r1Px} px`);
  assert.deepEqual(Object.keys(p.overlays), [...OVERLAY_CLASSES]);
  for (const [cls, want] of [['c1Fill', C1], ['c2Fill', C2], ['path', PATH]]) {
    const o = p.overlays[cls];
    assert.deepEqual(Object.keys(o).sort(), ['alpha', 'fitOn', 'residualRms', 'rgb', 'samplesPx', 'sigmaAlpha', 'sigmaRgb'], `${cls}: exactly the contract's fields`);
    assert.ok(Math.abs(o.alpha - want.alpha) <= 0.03, `${cls} alpha ${o.alpha} vs ${want.alpha}`);
    o.rgb.forEach((v, c) => assert.ok(Math.abs(v - want.rgb[c]) <= 10, `${cls} rgb[${c}] ${v} vs ${want.rgb[c]}`));
  }
  assert.equal(p.overlays.c2Dash.status, 'not fitted');
  assert.equal(typeof p.method, 'string');
  const call = store.calls().find((e) => e.calculation === 'fn.tk.s7.alphaProfile');
  assert.equal(call.emits.classesFitted, 3, 'emits recorded by the store');
  assert.ok(store.calls().some((e) => e.calculation === 'fn.q.alpha.fitOverlay' && e.parent === call.seq), 'the math is asked of the store (fn.q.alpha.*), profiled under the Calculation');
  const r = store.call(RENDER_PART, { a: ALPHA_PROFILE_PART }).value;
  assert.equal(r.kind, 'alphaProfile');
  for (const part of r.parts) assert.ok(FRAME_KINDS.includes(part.kind), part.kind);
  assert.ok(r.parts.some((x) => x.address.includes('#swatch:c1Fill')) && r.parts.some((x) => x.address.includes(':unmixed')), 'swatches and unmixed crops');
});

test('missing inputs are recorded conditions, never throws', () => {
  const p = storeOn(TOY, { association: { absent: 'S3 association not run' } }).get(ALPHA_PROFILE_PART);
  assert.equal(p.overlays.path.status, 'not fitted'); assert.match(p.overlays.path.reason, /not run/);
  assert.ok(p.overlays.c1Fill.alpha != null, 'the fills do not need the path');
  const q = storeOn(TOY, { hallway: null }).get(ALPHA_PROFILE_PART);
  assert.match(q.overlays.path.reason, /hallway/);
  const none = storeOn({ ...TOY, baskets: [] }).get(ALPHA_PROFILE_PART);
  assert.equal(none.r1Px, null); assert.equal(none.overlays.c1Fill.status, 'not fitted');
});
