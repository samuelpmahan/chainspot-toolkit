import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecoveryContext, greedyRecover, evaluatePose, fitPadTemplate, axisDiffDeg, OCC } from './teeRecover.mjs';
import { judgeRecovered } from './guarantees.mjs';

// A synthetic course: rigid pads (30 x 21 px outer, 3.5 px end / 3.0 px side
// white stroke, interior grey 158/157/159) rendered with 4x4 supersampling
// over a green background; three fully visible anchor pads (the "S3 tees"),
// four dark badge plates (48 x 36 px), and one target pad whose axis points
// at badge 4, partly covered by a white basket with a black outline.
const W = 400, H = 300;
const PAD = { L: 30, S: 21, endPx: 3.5, sidePx: 3.0 };
const FRAME = [250, 250, 250], INTERIOR = [158, 157, 159], BG = [96, 128, 84];
const DEG = Math.PI / 180;

function padClass(u, v) {
  const a = Math.abs(u), b = Math.abs(v), Lo = PAD.L / 2, So = PAD.S / 2;
  if (a > Lo || b > So) return null;
  return a <= Lo - PAD.endPx && b <= So - PAD.sidePx ? 'interior' : 'frame';
}

function renderCourse({ pads, basket }) {
  const rgba = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const acc = [0, 0, 0];
    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
      const px = x + (sx + 0.5) / 4 - 0.5, py = y + (sy + 0.5) / 4 - 0.5;
      let col = BG;
      for (const p of pads) {
        const dx = px - p.cx, dy = py - p.cy, c = Math.cos(p.th), s = Math.sin(p.th);
        const k = padClass(dx * c + dy * s, -dx * s + dy * c);
        if (k) col = k === 'frame' ? FRAME : INTERIOR;
      }
      for (let i = 0; i < 3; i++) acc[i] += col[i];
    }
    const k = (y * W + x) * 4;
    rgba[k] = Math.round(acc[0] / 16); rgba[k + 1] = Math.round(acc[1] / 16); rgba[k + 2] = Math.round(acc[2] / 16); rgba[k + 3] = 255;
  }
  // occluders painted OVER the pads: badge plates (dark) and the basket (white body, black 2 px outline)
  const paint = ([x0, y0, w, h], col, list) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const k = (y * W + x) * 4; rgba[k] = col[0]; rgba[k + 1] = col[1]; rgba[k + 2] = col[2]; list?.push(y * W + x);
    }
  };
  const basketPx = [];
  if (basket) {
    paint(basket, [10, 10, 10], basketPx);
    paint([basket[0] + 2, basket[1] + 2, basket[2] - 4, basket[3] - 4], [236, 236, 242]);
  }
  return { rgba, basketPx, paint };
}

const anchors = [{ cx: 60, cy: 60, th: 0 }, { cx: 60, cy: 150, th: 0 }, { cx: 60, cy: 240, th: 10 * DEG }];
const target = { cx: 281.3, cy: 151.6, th: 20 * DEG };
const badgeAt = (p, d) => [p.cx + d * Math.cos(p.th), p.cy + d * Math.sin(p.th)];
const plates = [badgeAt(anchors[0], 80), badgeAt(anchors[1], 80), badgeAt(anchors[2], 80), badgeAt(target, -90)];

function course({ basket = [284, 136, 28, 40] } = {}) {
  const { rgba, basketPx, paint } = renderCourse({ pads: [...anchors, target], basket });
  const badges = plates.map(([x, y], i) => {
    const px = [];
    paint([Math.round(x - 24), Math.round(y - 18), 48, 36], [30, 30, 34], px);
    return { index: i, label: String(i + 1), bbox: [Math.round(x - 24), Math.round(y - 18), 48, 36], px, mutePx: [], plateCenter: [x, y], plateHalfMinPx: 18 };
  });
  const raster = { rgba, widthPx: W, heightPx: H };
  return {
    raster, badges, baskets: basket ? [{ px: basketPx }] : [], recoveredBasketBoxes: [],
    tees: anchors.map((a) => ({ center: [a.cx, a.cy], angleRad: a.th, px: [] })),
    anchors: anchors.map((a) => ({ center: [a.cx, a.cy], angleRad: a.th, frameMajorPx: PAD.L })),
    interiorTone: { median: INTERIOR, tolerance: 12 }, seeds: []
  };
}

test('the rigid pad template is measured from the anchors: 30 x 21 px, strokes 3.5 / 3.0 px', () => {
  const inputs = course();
  const tpl = fitPadTemplate(inputs.raster, inputs.anchors, inputs.interiorTone);
  assert.ok(Math.abs(tpl.lengthPx - PAD.L) <= 0.5, `length ${tpl.lengthPx} px`);
  assert.ok(Math.abs(tpl.widthPx - PAD.S) <= 0.5, `width ${tpl.widthPx} px`);
  assert.ok(Math.abs(tpl.strokeEndPx - PAD.endPx) <= 0.4, `end stroke ${tpl.strokeEndPx} px`);
  assert.ok(Math.abs(tpl.strokeSidePx - PAD.sidePx) <= 0.4, `side stroke ${tpl.strokeSidePx} px`);
});

for (const badgeRay of [true, false]) {
  test(`greedy search recovers a pad half under a basket within 1 px / 2 deg (badgeRay ${badgeRay})`, async () => {
    const ctx = createRecoveryContext(course());
    assert.deepEqual(ctx.assignment.map((a) => a.label), ['1', '2', '3'], 'anchors pair with their badges by the badge-ray rule');
    const coveredBefore = evaluatePose(ctx, target.cx, target.cy, target.th).evidence.occludedBy;
    assert.ok(coveredBefore.basket + coveredBefore.basketFringe >= 60, `the target is substantially occluded (${JSON.stringify(coveredBefore)} px)`);
    const g = greedyRecover(ctx, { badgeRay });
    assert.equal(g.recovered.length, 1);
    const t = g.recovered[0];
    assert.equal(t.hole, '4');
    const errPx = Math.hypot(t.center[0] - target.cx, t.center[1] - target.cy);
    const errDeg = axisDiffDeg(t.angleRad, target.th);
    assert.ok(errPx <= 1, `center error ${errPx} px`);
    assert.ok(errDeg <= 2, `angle error ${errDeg} deg`);
    assert.ok(t.evidence.occludedBy.basket > 0, 'occluded px are counted per occluder');
    // ownership is an argument of the questions (poseSpace views), never a mutation of the context: pure
    assert.ok(ctx.owned.every((v) => v === 0), 'recovery never writes into the context it was given');
    const { poseSpace } = await import('./poseSpace.mjs');
    const v = poseSpace(ctx).evaluate({ owned: [{ center: t.center, angleRad: t.angleRad }], center: t.center, angleRad: t.angleRad });
    assert.ok(v.evidence.occludedBy.recoveredTee > 0, 'in the view that owns the recovered pad, its px are owned');
    // the judge: Sam marks an occluded pad at the centroid of its VISIBLE hole
    // (interior px not under the opaque basket); that point lands it on hole 4,
    // and the recovered visibleCenter reproduces it within 1 px
    const [bx, by, bw, bh] = [284, 136, 28, 40];
    let sx = 0, sy = 0, n = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (x >= bx && x < bx + bw && y >= by && y < by + bh) continue;
      const dx = x - target.cx, dy = y - target.cy, c = Math.cos(target.th), s = Math.sin(target.th);
      if (padClass(dx * c + dy * s, -dx * s + dy * c) === 'interior') { sx += x; sy += y; n++; }
    }
    const samPoint = [sx / n, sy / n];
    assert.ok(Math.hypot(t.visibleCenter[0] - samPoint[0], t.visibleCenter[1] - samPoint[1]) <= 1, `visible-hole centroid ${t.visibleCenter} vs ${samPoint}`);
    const j = judgeRecovered(g.recovered, [{ hole: 4, canonical: samPoint }], ctx.tees);
    assert.equal(j.totals.landsOwnHole, 1);
  });
}

test('negative evidence: the template off the pad on unoccluded background scores below the true pose', () => {
  const ctx = createRecoveryContext(course());
  const at = evaluatePose(ctx, target.cx, target.cy, target.th);
  const off = evaluatePose(ctx, target.cx - 6, target.cy - 2, target.th);
  assert.ok(off.evidence.negativeFramePx + off.evidence.negativeInteriorPx > at.evidence.negativeFramePx + at.evidence.negativeInteriorPx);
  assert.ok(off.score < at.score);
});

test('cardinality: nothing is recovered when S3 already holds N tees', () => {
  const inputs = course();
  inputs.badges = inputs.badges.slice(0, 3);
  const g = greedyRecover(createRecoveryContext(inputs));
  assert.equal(g.need, 0);
  assert.equal(g.recovered.length, 0);
});

test('no S3 anchors is data, not a stop: recovery returns nothing recovered, every pending badge missed with the reason', () => {
  const W = 40, H = 40, rgba = new Uint8Array(W * H * 4).fill(90);
  const badges = [{ index: 0, label: '1', bbox: [5, 5, 10, 8], px: [], mutePx: [], plateCenter: [10, 9] }];
  const ctx = createRecoveryContext({ raster: { rgba, widthPx: W, heightPx: H }, badges, baskets: [], recoveredBasketBoxes: [], tees: [], anchors: [], interiorTone: { median: [158, 157, 159], tolerance: 22.5 } });
  assert.equal(ctx.tpl, null); assert.match(ctx.unavailable, /no S3 anchors/);
  const g = greedyRecover(ctx);
  assert.deepEqual(g.recovered, []); assert.equal(g.missed.length, 1); assert.match(g.missed[0].reason, /no pad template/);
});
