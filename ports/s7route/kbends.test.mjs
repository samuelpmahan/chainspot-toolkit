import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KBENDS, legContrastsOf, bottleneckOf, kCellAt, kChainStartAt, kSplitAt, kChainAt } from './kbends.mjs';
import { badgeMidOf } from './routeSpace.mjs';
import { RULE_SETS, MATCH_RULES } from './match.mjs';

/**
 * Fixture: a flat 640 x 480 px course (lum 100), R1 = 15 px, a ribbon of width W = 24 px (lum 150) along a polyline. The hole's
 * tee centre (40, 100), its axis +x, the badge 50 px along it, so B* = tee + 100 px = (140, 100): the ribbon's first bend.
 */
const W = 24, T = [40, 100], START = { hole: '1', S: [52, 100], u: [1, 0], teeCenter: T, badgeAlongPx: 38 };
function scene(path) {
  const IW = 640, IH = 480, lum = new Float64Array(IW * IH).fill(100);
  const segD = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy; let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
  for (let y = 0; y < IH; y++) for (let x = 0; x < IW; x++) { let d = Infinity; for (let i = 0; i + 1 < path.length; i++) d = Math.min(d, segD([x, y], path[i], path[i + 1])); if (d <= W / 2) lum[y * IW + x] = 150; }
  return { W: IW, H: IH, lum, mask: new Uint8Array(IW * IH), R1: 15 };
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test('B* is the first bend of the fixture; the weakest leg is the route score', () => {
  assert.deepEqual(badgeMidOf(START).map(Math.round), [140, 100]);
  assert.equal(bottleneckOf([30, null, 12.5, 40]), 12.5);
  assert.equal(bottleneckOf([null, null]), null);
});

test('a 2-bend hallway: the K <= 1 routes cut across, the chain from B* finds both bends and its weakest leg reads higher', () => {
  const B2 = [300, 260], E = [480, 260], S = scene([T, [140, 100], B2, E]);
  const cell = kCellAt(S, START, E, W);
  const chain = kChainAt(S, START, E, W);
  assert.equal(chain.verts.length, 4, `bends ${chain.verts.length - 2}`);
  assert.ok(dist(chain.verts[2], B2) < 0.5 * W, `second bend ${chain.verts[2].map(Math.round)} vs ${B2}`);
  assert.ok(chain.bottleneck > cell.best.bottleneck + 5, `chain ${chain.bottleneck.toFixed(1)} vs K<=1 ${cell.best.bottleneck.toFixed(1)} lum`);
  // the chain's first leg is the straight tee axis to B*, never split
  assert.deepEqual(chain.verts[1], badgeMidOf(START));
});

test('a 3-bend hallway gets 3 bends: K is bounded by the score, not by a constant', () => {
  const path = [T, [140, 100], [260, 220], [420, 220], [520, 380]], S = scene(path), E = path.at(-1);
  const chain = kChainAt(S, START, E, W);
  assert.equal(chain.verts.length - 2, 3, `bends ${chain.verts.length - 2}: ${JSON.stringify(chain.verts.map((v) => v.map(Math.round)))}`);
  // the weakest-leg polish puts each corner within a hallway width; centring it is the bend placement's job (bends.mjs, after)
  for (const [i, P] of [[2, path[2]], [3, path[3]]]) assert.ok(dist(chain.verts[i], P) < W, `bend ${i} at ${chain.verts[i].map(Math.round)} vs ${P}`);
});

test('a straight corridor past B* takes no extra bend: a split off the ribbon lowers both halves', () => {
  const E = [520, 100], S = scene([T, E]);
  const start = kChainStartAt(S, START, E, W), split = kSplitAt(S, start.verts, start.legs, W);
  assert.ok(split === null || !(split.bottleneck > start.bottleneck), 'a split may not raise a straight route');
  assert.equal(kChainAt(S, START, E, W).verts.length, 3);
  // the K <= 1 cell reads the straight route as well as any bent one
  const cell = kCellAt(S, START, E, W);
  assert.ok(Math.abs(cell.best.bottleneck - legContrastsOf(S, [START.S, E], W)[0]) < 1e-9 || cell.best.verts.length === 3);
});

test('K = 1 keeps its first bend at or past the badge-at-0.57 point (never just past the badge)', () => {
  const E = [100, 300], S = scene([T, [70, 100], E]);
  const cell = kCellAt(S, START, E, W), lo = (12 + 38) / KBENDS.firstBadgeFrac;
  if (cell.one) assert.ok(cell.one.verts[1][0] - T[0] >= lo - 1e-6, `B1 ${cell.one.verts[1][0] - T[0]} px along vs ${lo.toFixed(1)}`);
});

test('every leg read goes through legsOf (the store passes its profiled query)', () => {
  const E = [480, 260], S = scene([T, [140, 100], [300, 260], E]);
  let n = 0;
  const legsOf = (Sc, V, Wd) => { n++; return legContrastsOf(Sc, V, Wd); };
  const a = kChainAt(S, START, E, W, { legsOf }), b = kChainAt(S, START, E, W);
  assert.ok(n > 10); assert.deepEqual(a, b);
});

test('the rule set routeMatchKBends is the accepted rule set plus kBends, and the recorded rule does not use it', () => {
  const rm = 'fn.q.trace.routeMatch', { kBends, ...rest } = RULE_SETS.routeMatchKBends[rm];
  assert.equal(kBends, 'bottleneck');
  assert.deepEqual({ ...RULE_SETS.routeMatchKBends, [rm]: rest }, { ...RULE_SETS.routeMatchTeeAxisBadgePrior, [rm]: (({ kBends: _k, ...r }) => r)(RULE_SETS.routeMatchTeeAxisBadgePrior[rm]) });
  assert.equal(RULE_SETS.routeMatchTeeAxisBadgePrior[rm].kBends, 'off');
  assert.equal(MATCH_RULES.kBends, undefined);
});

test('the assignment duals certify the pricing: every cell scores at or below its price, the pairs at it', async () => {
  const { assignWithDuals, assignMinCost } = await import('./match.mjs');
  const score = [[30, 12, -Infinity, 8], [25, 28, 10, -Infinity], [5, 26, 22, 14]];
  const cost = score.map((r) => r.map((v) => (Number.isFinite(v) ? -v : Infinity))), A = assignWithDuals(cost);
  assert.deepEqual(A.pairs, assignMinCost(cost));
  score.forEach((r, i) => r.forEach((v, k) => { if (Number.isFinite(v)) assert.ok(v <= A.price(i, k) + 1e-9, `cell ${i},${k}: ${v} > price ${A.price(i, k)}`); }));
  for (const [i, k] of A.pairs) assert.ok(Math.abs(score[i][k] - A.price(i, k)) < 1e-9);
});

test('the coarse pass (refines to coarseEndR1, grid coarseGridR1) finds the same bends on the 2-bend fixture as the fine search', () => {
  const B2 = [300, 260], E = [480, 260], S = scene([T, [140, 100], B2, E]);
  const fine = kChainAt(S, START, E, W), coarse = kChainAt(S, START, E, W, { endR1: KBENDS.coarseEndR1, gridR1: KBENDS.coarseGridR1 });
  assert.equal(coarse.verts.length, fine.verts.length);
  assert.ok(coarse.bottleneck <= fine.bottleneck + 1e-9, 'the coarse pass ranks; it does not out-read the fine search');
});

test('the hallway follower in W (hallway.mjs FOLLOW_W) traces the same route at two map scales and in both W / R1 regimes', async () => {
  const H = await import('../s7trace/hallway.mjs');
  // r1: R1 per unit scale; 15 px gives W / R1 = 1.6 (Lenard full's regime), 25.8 px gives 0.93 (golden's and the zoomed views')
  const runAt = (k, r1 = 15) => {
    const path = [T, [140, 100], [300, 260], [480, 260]].map((p) => p.map((c) => c * k)), Wk = W * k, IW = 640 * k, IH = 480 * k, lum = new Float64Array(IW * IH).fill(100);
    const segD = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy; let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
    for (let y = 0; y < IH; y++) for (let x = 0; x < IW; x++) { let d = Infinity; for (let i = 0; i + 1 < path.length; i++) d = Math.min(d, segD([x, y], path[i], path[i + 1])); if (d <= Wk / 2) lum[y * IW + x] = 150; }
    const S = { W: IW, H: IH, lum, mask: new Uint8Array(IW * IH), R1: r1 * k, bp: [path.at(-1)] }, res = H.FOLLOW_W;
    const r = H.trace(S, START.S.map((c) => c * k), 0, Wk, { maxLegs: 4, steps: { runEnd: (Sc, O, p, Wd, t0) => H.runEndW(Sc, O, p, Wd, t0, res), closeOnBp: (Sc, O, p, Wd, tE, u) => H.closeOnBpW(Sc, O, p, Wd, tE, u, res),
      onLeg: (Sc, O, p, Wd, tE, u) => H.bpOnLegW(Sc, O, p, Wd, tE, u, res),
      findBend: (Sc, O, p, Wd, tE, sC, tz) => H.findBendW(Sc, O, p, Wd, tE, sC, tz, H.findBendAtW, res) } });
    return { r, path, Wk };
  };
  const a = runAt(1), b = runAt(2), c = runAt(1, 25.8);
  for (const { r, path, Wk } of [a, b, c]) {
    assert.equal(r.end, 0, 'reaches the BasketPoint');
    assert.equal(r.verts.length - 2, 2, `bends ${r.verts.length - 2}: ${JSON.stringify(r.verts.map((v) => v.map(Math.round)))}`);
    r.verts.slice(1, -1).forEach((v, i) => assert.ok(dist(v, path[i + 1]) < 0.5 * Wk, `bend ${i + 1} ${v.map(Math.round)} vs ${path[i + 1]} (W ${Wk} px)`));
  }
  // the same route in units of W at both scales
  a.r.verts.forEach((v, i) => assert.ok(dist(v, b.r.verts[i].map((c) => c / 2)) < 0.25 * W, `vertex ${i}: ${v.map(Math.round)} vs ${b.r.verts[i].map((c) => Math.round(c / 2))} (x 1/2)`));
});

test('kRefineStarts: a bend peak narrower than the axis sweep step is found whatever the grid phase (golden 5, 2026-10-22)', () => {
  // the K = 1 objective along the axis: a tent peaking at 28 lum (half-width 20 px) between sweep samples, a plateau of 8 lum, and
  // far down the axis routes whose last leg is unread (null: masked) reading their first leg alone, 22 lum
  const R1 = 44.5, S = { W: 2000, H: 2000, R1 }, st = { hole: '5', S: [100, 500], u: [1, 0], teeCenter: [90, 500], badgeAlongPx: 60 };
  const E = [400, 300];
  for (const phase of [0, 6, 12, 18]) {
    const tPeak = (10 + 60) / KBENDS.firstBadgeFrac + 12 + phase;   // measured from the tee centre, as kCellAt's axis is
    const legsMany = (_S, Vs) => Vs.map((V) => {
      if (V.length === 2) return [-3];
      const t = V[1][0] - st.teeCenter[0];
      return t > tPeak + 70 ? [22, null] : [30, Math.max(8, 28 - Math.abs(t - tPeak))];
    });
    const one = kCellAt(S, st, E, 40, { legsMany }), many = kCellAt(S, st, E, 40, { legsMany, refineStarts: 3 });
    assert.ok(Math.abs(many.best.verts[1][0] - st.teeCenter[0] - tPeak) < 3, `phase ${phase}: refineStarts 3 finds the peak (t ${many.best.verts[1][0] - st.teeCenter[0]} vs ${tPeak})`);
    assert.ok(many.best.bottleneck >= 26);
    if (phase === 0) assert.equal(one.best.bottleneck, 22, 'one start keeps the far route whose last leg is unread');
  }
});
