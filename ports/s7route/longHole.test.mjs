import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kCellAt } from './kbends.mjs';
import { contrastRouteAt, FIRST_BEND_REACH } from './routeSpace.mjs';
import { refineBendsOf, BEND_MOVE } from './bends.mjs';
import { associate } from '../s3assoc/associate.mjs';

/**
 * The long hole (Sam, 2026-10-21: "What happens to your tee-pad-length-to-badge ratio when a hole is 1,700 feet long?"). R1 = 15 px
 * (C1 = 10 m, so 1 R1 = 32.8 ft), a ribbon W = 24 px: tee cap (52, 100) along +x, the first bend 600 px out (37 R1 past the
 * badge: the dev courses' first bends lie 1.3-6.9 R1 past it, the stated FIRST_BEND_REACH is 18 R1), then 260 px to the basket.
 * The hole is 56 R1 = 1,840 ft. No bound may refuse it: each stated assumption it outgrows reports a violation and recovers.
 */
const W = 24, R1 = 15, T = [40, 100], START = { hole: '1', S: [52, 100], u: [1, 0], teeCenter: T, badgeAlongPx: 38 };
const B1 = [690, 100], E = [690, 360];
function scene(path) {
  const IW = 900, IH = 420, lum = new Float64Array(IW * IH).fill(100);
  const segD = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy; let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
  for (let y = 0; y < IH; y++) for (let x = 0; x < IW; x++) { let d = Infinity; for (let i = 0; i + 1 < path.length; i++) d = Math.min(d, segD([x, y], path[i], path[i + 1])); if (d <= W / 2) lum[y * IW + x] = 150; }
  return { W: IW, H: IH, lum, mask: new Uint8Array(IW * IH), occluder: new Uint8Array(IW * IH), R1, bp: [E], badges: { 1: [90, 100] }, badgeHalf: { 1: 10 }, pads: [] };
}
const S = scene([T, B1, E]);
const lenR1 = (Math.hypot(B1[0] - START.S[0], 0) + Math.hypot(0, E[1] - B1[1])) / R1;

test(`long hole (${(lenR1 * 10 / 0.3048).toFixed(0)} ft): the K <= 1 sweep violates FIRST_BEND_REACH loudly and recovers the far bend by widening`, () => {
  assert.ok((B1[0] - START.S[0] - START.badgeAlongPx) / R1 > FIRST_BEND_REACH.value, 'the fixture\'s first bend lies past the stated reach');
  const kc = kCellAt(S, START, E, W);
  assert.ok(kc.violation, 'a violation is recorded');
  assert.equal(kc.violation.assumption, 'firstBendReachR1'); assert.equal(kc.violation.recovered, true);
  assert.ok(kc.violation.tries.length >= 2, JSON.stringify(kc.violation.tries));
  assert.equal(kc.best.verts.length, 3, 'a 1-bend route');
  assert.ok(Math.hypot(kc.best.verts[1][0] - B1[0], kc.best.verts[1][1] - B1[1]) < W / 2, `bend ${kc.best.verts[1].map(Math.round)} vs ${B1}`);
});

test('long hole: the route table\'s contrast search violates FIRST_BEND_REACH loudly and recovers the far bend', () => {
  const r = contrastRouteAt(S, START, E, W);
  assert.equal(r.violation?.assumption, 'firstBendReachR1'); assert.equal(r.violation.recovered, true);
  assert.ok(Math.hypot(r.best.verts[1][0] - B1[0], r.best.verts[1][1] - B1[1]) < W / 2, `bend ${r.best.verts[1].map(Math.round)} vs ${B1}`);
});

test('long hole: a matched bend far from the true one moves past BEND_MOVE loudly, and the placement lands on the bend', () => {
  const off = [B1[0] - 3 * R1, B1[1] + 3 * R1];   // 4.2 R1 off: 3x the stated 1.4 R1
  const r = refineBendsOf(S, [START.S, off, E], W, {});
  assert.ok(r.assumptions?.some((v) => v.assumption === BEND_MOVE.name && v.recovered), JSON.stringify(r.assumptions));
  const fitted = r.taken ? r.verts[1] : r.refit[1];
  assert.ok(Math.hypot(fitted[0] - B1[0], fitted[1] - B1[1]) < W / 2, `fitted bend ${fitted.map(Math.round)} vs ${B1}`);
});

test('long hole: the S3 association has no distance window: a badge 40 pad lengths out is still the pad\'s', () => {
  const L = 18, th = 0, badge = { label: '1', center: [100 + 40 * L, 100], sizePx: [54, 42] };
  const [r] = associate({ tees: [{ label: 't', center: [100, 100], thRad: th }], badges: [badge], baskets: [], padLengthPx: L, padWidthPx: 12.6 });
  assert.equal(r.best?.badge, '1');
  // the skeleton's floor: a badge overlapping its own pad is never its pairing
  const [o] = associate({ tees: [{ label: 't', center: [100, 100], thRad: th }], badges: [{ ...badge, center: [100 + L / 2 + 20, 100] }], baskets: [], padLengthPx: L, padWidthPx: 12.6 });
  assert.equal(o.best, null);
});

test('long hole: the hallway follower in W rides the 37 R1 first leg and reaches the basket (its run is capped only by the image)', async () => {
  const H = await import('../s7trace/hallway.mjs'), res = H.FOLLOW_W;
  const r = H.trace(S, START.S, 0, W, { maxLegs: 8, steps: { runEnd: (Sc, O, p, Wd, t0) => H.runEndW(Sc, O, p, Wd, t0, res), closeOnBp: (Sc, O, p, Wd, tE, u) => H.closeOnBpW(Sc, O, p, Wd, tE, u, res),
    onLeg: (Sc, O, p, Wd, tE, u) => H.bpOnLegW(Sc, O, p, Wd, tE, u, res), findBend: (Sc, O, p, Wd, tE, sC, tz) => H.findBendW(Sc, O, p, Wd, tE, sC, tz, H.findBendAtW, res) } });
  assert.equal(r.end, 0, JSON.stringify(r.legs));
  assert.equal(r.verts.length, 3, `bends ${r.verts.length - 2}: ${JSON.stringify(r.verts.map((v) => v.map(Math.round)))}`);
  assert.ok(Math.hypot(r.verts[1][0] - B1[0], r.verts[1][1] - B1[1]) < W / 2);
});
