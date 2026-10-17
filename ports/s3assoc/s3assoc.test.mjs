import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverageAt, fitPadPose, nelderMead } from './padPose.mjs';
import { associate, basketPoint, BASKET_POINT_OFFSET } from './associate.mjs';

// Render a pad with the same AA model over a textured background, then fit from a perturbed seed.
function renderPad({ W = 90, H = 80, cx, cy, th, L, Wd, se, ss, frame = [247, 247, 247], inner = [158, 157, 159], occ = null }) {
  const rgba = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const bg = [90 + 20 * Math.sin(x / 5) + 10 * Math.cos(y / 7), 110 + 15 * Math.cos(x / 6), 70 + 10 * Math.sin((x + y) / 9)];
    const [ao, ai] = coverageAt(x, y, cx, cy, th, L, Wd, se, ss), af = ao - ai, g = (y * W + x) * 4;
    for (let c = 0; c < 3; c++) rgba[g + c] = Math.round(bg[c] * (1 - ao) + af * frame[c] + ai * inner[c]);
    rgba[g + 3] = 255;
  }
  return { raster: { rgba, widthPx: W, heightPx: H }, occ };
}

test('nelderMead: finds a quadratic minimum', () => {
  const r = nelderMead((p) => (p[0] - 3) ** 2 + 2 * (p[1] + 1) ** 2, [0, 0], [1, 1], 400);
  assert.ok(Math.abs(r.x[0] - 3) < 1e-3 && Math.abs(r.x[1] + 1) < 1e-3);
});

test('fitPadPose: recovers an AA-rendered pad pose to 0.05 px and 0.1 deg from a 1 px / 2 deg seed', () => {
  const truth = { cx: 44.3, cy: 39.6, th: (-37.4 * Math.PI) / 180, L: 25.02, Wd: 17.38, se: 3.56, ss: 3.04 };
  const { raster } = renderPad(truth);
  const fit = fitPadPose({ raster, occ: null, seed: { cx: 45.3, cy: 39.0, th: truth.th + (2 * Math.PI) / 180 }, tmpl: { L: 24.3, W: 16.7, se: 3.6, ss: 3.0 } });
  assert.ok(Math.abs(fit.cx - truth.cx) < 0.05, `cx ${fit.cx}`);
  assert.ok(Math.abs(fit.cy - truth.cy) < 0.05, `cy ${fit.cy}`);
  assert.ok(Math.abs(fit.thDeg - -37.4) < 0.1, `th ${fit.thDeg}`);
  assert.ok(Math.abs(fit.L - truth.L) < 0.1 && Math.abs(fit.W - truth.Wd) < 0.1, `size ${fit.L} x ${fit.W}`);
  assert.equal(fit.clean, true);
});

test('fitPadPose: occluded pixels are not evidence and mark the fit unclean', () => {
  const truth = { cx: 44, cy: 40, th: 0.3, L: 25, Wd: 17.4, se: 3.5, ss: 3.0 };
  const { raster } = renderPad(truth);
  const occ = new Uint8Array(90 * 80);
  for (let y = 0; y < 80; y++) for (let x = 0; x < 40; x++) { occ[y * 90 + x] = 1; for (let c = 0; c < 3; c++) raster.rgba[(y * 90 + x) * 4 + c] = 255; }
  const fit = fitPadPose({ raster, occ, seed: { cx: 44.5, cy: 40.4, th: 0.33 }, tmpl: { L: 25, W: 17.4, se: 3.5, ss: 3.0 }, fixShape: true });
  assert.equal(fit.clean, false);
  assert.ok(Math.hypot(fit.cx - 44, fit.cy - 40) < 0.3, `centre ${fit.cx}, ${fit.cy}`);
});

test('basketPoint: sprite bottom-centre plus the spoke-solved offset', () => {
  assert.deepEqual(basketPoint([100, 200, 46, 72]), [122.5 + BASKET_POINT_OFFSET[0], 271 + BASKET_POINT_OFFSET[1]]);
});

test('associate: one obvious badge, straight hole to a BasketPoint, exclusivity, ambiguity and no consistent badge', () => {
  const th = (30 * Math.PI) / 180, u = [Math.cos(th), Math.sin(th)];
  const at = (t, lat = 0, o = [100, 100]) => [o[0] + u[0] * t - u[1] * lat, o[1] + u[1] * t + u[0] * lat];
  const bp = at(260, 0.8); // BasketPoint 260 px down the axis, 0.8 px off it
  const basket = { index: 4, bbox: [bp[0] - 22.5 - BASKET_POINT_OFFSET[0], bp[1] - 71 - BASKET_POINT_OFFSET[1], 46, 72] };
  const badges = [{ label: '7', center: at(120, 0.4) }, { label: '9', center: at(-150, 5.5) }, { label: '3', center: at(40, 30) }];
  const [r] = associate({ tees: [{ label: '1', center: [100, 100], thRad: th }], badges, baskets: [basket], padLengthPx: 25 });
  assert.equal(r.best.badge, '7'); assert.equal(r.verdict, 'ASSOCIATED'); assert.ok(r.best.z < 1);
  assert.equal(r.straight.basket, 4); assert.equal(r.straight.verdict, 'STRAIGHT_CANDIDATE'); assert.ok(Math.abs(r.straight.latPx - 0.8) < 0.02);
  assert.equal(r.nearest.length, 3, 'nothing is dropped: the 3 lowest-z badges are tracked');
  // exclusivity: pad A sees badges a (z~1.2) and b (z~0.5); pad B sees b at z~0.1, so A gets a
  const thB = th + Math.PI / 2, bC = at(-120, 0.4), Bc = [bC[0] - Math.cos(thB) * 100, bC[1] - Math.sin(thB) * 100]; // B's own axis runs through b
  const ex2 = associate({ tees: [{ label: 'A', center: [100, 100], thRad: th }, { label: 'B', center: Bc, thRad: thB }],
    badges: [{ label: 'a', center: at(120, 1.0) }, { label: 'b', center: at(-120, 0.4) }], baskets: [], padLengthPx: 25 });
  const A = ex2.find((x) => x.tee === 'A'), Bt = ex2.find((x) => x.tee === 'B');
  assert.equal(Bt.best.badge, 'b'); assert.equal(A.best.badge, 'a'); assert.equal(A.verdict, 'ASSOCIATED_BY_EXCLUSIVITY');
  assert.equal(A.resolvedBy[0].takenByTee, 'B');
  // ambiguous: two consistent badges, nobody else claims the loser
  const amb = associate({ tees: [{ label: '2', center: [100, 100], thRad: th }], badges: [{ label: 'a', center: at(120, 1.0) }, { label: 'b', center: at(-120, 1.4) }], baskets: [], padLengthPx: 25 });
  assert.equal(amb[0].verdict, 'AMBIGUOUS'); assert.equal(amb[0].inspect, true);
  const none = associate({ tees: [{ label: '3', center: [100, 100], thRad: th }], badges: [{ label: 'a', center: at(100, 40) }], baskets: [], padLengthPx: 25 });
  assert.equal(none[0].verdict, 'NO_CONSISTENT_BADGE'); assert.equal(none[0].nearest[0].badge, 'a');
});

test('pathSide: finds the side a light ribbon leaves the pad and is recorded beside the association', async () => {
  const { pathSide } = await import('./associate.mjs');
  const W = 200, H = 120, rgba = new Uint8Array(W * H * 4), th = 0.2, c = [100, 60], ax = [Math.cos(th), Math.sin(th)];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x - c[0], dy = y - c[1], u = dx * ax[0] + dy * ax[1], v = -dx * ax[1] + dy * ax[0];
    const tex = 80 + 25 * Math.sin(x * 1.7) * Math.cos(y * 1.3), lum = u > 8 && Math.abs(v) <= 16.8 ? tex * 0.6 + 0.4 * 200 : tex;
    const g = (y * W + x) * 4; rgba[g] = rgba[g + 1] = rgba[g + 2] = Math.round(lum); rgba[g + 3] = 255;
  }
  const side = pathSide({ raster: { rgba, widthPx: W, heightPx: H }, center: c, thRad: th, L: 25, W: 17.4 });
  assert.equal(side.sense, 1); assert.equal(side.decisive, true);
  const at = (t) => [c[0] + ax[0] * t, c[1] + ax[1] * t];
  const [r] = associate({ tees: [{ label: 't', center: c, thRad: th, pathSide: side }], badges: [{ label: 'ahead', center: at(140) }], baskets: [], padLengthPx: 25 });
  assert.equal(r.best.badge, 'ahead'); assert.equal(r.badgeOnPathSide, true);
});

test('hungarian: minimum-cost assignment beats greedy', async () => {
  const { hungarian } = await import('./associate.mjs');
  // greedy takes (0,0)=1 then (1,1)=10 -> 11; optimum (0,1)=2 + (1,0)=3 -> 5
  assert.deepEqual(hungarian([[1, 2], [3, 10]]), [1, 0]);
});
