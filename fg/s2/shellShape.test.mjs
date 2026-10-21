// S2's basket frame shape (provider Basket.learnShellShape): learned by overlapping the members' frames, carried in from
// the dev prior when the members share none. Synthetic course: the prior's frame drawn around each body, and on every
// member a different blob of "canopy" touching its frame (BeaverRanch-Gold-full: 18 of 18 shells fused that way).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const ALG = join(import.meta.dirname, '../../source/provider/packages/alg/dist');
const { overlapShellFrames, shellShapeOf, shellWindow, registerBasket, BasketFn } = require(join(ALG, 'stages/S2/clean/Basket.js'));
const prior = require(join(ALG, 'detectors/threeFactor/assets/basket-shell.json'));
const [L, T] = prior.margins, BW = prior.width - L - prior.margins[2], BH = prior.height - T - prior.margins[3];

function course(n, { canopy = true } = {}) {
  const W = 120 * n + 60, H = 240, data = new Uint8Array(W * H), bodies = [];
  for (let i = 0; i < n; i++) {
    const bx = 40 + i * 120, by = 90;
    prior.rows.forEach((row, y) => [...row].forEach((v, x) => { if (v === '1') data[(by - T + y) * W + bx - L + x] = 1; }));
    if (canopy) {   // a 12 x 12 dark blob over the frame's top edge, at a different x on every member
      const cx = bx - L + 5 + ((i * 3) % 25), cy = by - T - 11;
      for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) data[(cy + y) * W + cx + x] = 1;
    }
    bodies.push({ bboxX: bx, bboxY: by, bboxW: BW, bboxH: BH, label: i + 1 });
  }
  return { dark: { width: W, height: H, data }, bodies };
}

test('the overlap of members whose frames all touch canopy still learns the frame (canopy contact is not shared)', () => {
  const { dark, bodies } = course(8);
  const shape = shellShapeOf(overlapShellFrames(bodies.map((body) => ({ body, dark })), shellWindow(BW, BH)), BW, BH);
  assert.deepEqual([...shape.margins], prior.margins);
  assert.equal(shape.offsets.length, prior.provenance.shellPx);
});

test('S2 uses the carried prior when its members share no frame, and records which shape it used', () => {
  const { dark, bodies } = course(1);
  // no enclosing frame at all (the dark frame px removed): the carried prior is used
  const empty = { ...dark, data: new Uint8Array(dark.data.length) };
  const calcs = new Map(); registerBasket({ register: (fn, calculate) => calcs.set(fn.address, calculate) });
  const family = { templateSize: [BW, BH], members: [{ body: bodies[0], areaRatio: 1, whiteCoverage: 1 }] };
  const shape = calcs.get(BasketFn.learnShellShape.address)({ family, fields: { dark: { mask: empty } } });
  assert.equal(shape.source, 'carried');
  assert.deepEqual([...shape.margins], prior.margins);
  assert.equal(shape.shellOffsets.length, prior.provenance.shellPx);
  assert.equal(shape.comparison, null);
  const learned = calcs.get(BasketFn.learnShellShape.address)({ family: { ...family, members: course(6).bodies.map((body) => ({ body, areaRatio: 1, whiteCoverage: 1 })) }, fields: { dark: { mask: course(6).dark } } });
  assert.equal(learned.source, 'learned');
  assert.equal(learned.comparison.marginsAgree, true);
  assert.equal(learned.comparison.iou, 1);
});
