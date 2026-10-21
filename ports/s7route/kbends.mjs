/**
 * S7 K-BEND ROUTES under one fair cost (lane s7bends, 2026-10-21). Sam: "double bends will be much more common as we get
 * to harder courses"; his calls on the validation courses (docs/evidence/validation-s7/sam-2026-10-21.md) were swaps and
 * missing bends on holes whose hallway turns more than once.
 *
 * The fair cost: a route is as good as its WEAKEST LEG. Each leg's edge contrast is read on its own (the route table's
 * ribbonContrastAt on the 2-vertex leg, lum); the route's score is the minimum over the legs with a reading (a leg wholly
 * masked, e.g. the approach inside a basket's rings, carries no evidence either way). Why this compares 0, 1, 2, ... bends
 * fairly: splitting a leg into two can only raise the score when BOTH halves read better than the leg did, so every
 * bend pays for itself in lum, and a bend placed off a straight corridor misaligns both halves and lowers it. The
 * whole-route mean contrast cannot do this: a leg that cuts across non-hallway (Beaver 4 -> Basket cn's last leg, -5.7 lum,
 * sensor 0.00) is diluted by the good legs before it.
 *
 * The route family (Sam's generative model: tee -> badge -> first bend on the tee axis -> ... -> basket):
 *   K = 0  tee cap S -> BasketPoint E
 *   K = 1  S -> B1 -> E, B1 on the tee axis at or past where the badge would sit at FIRST_BADGE_FRAC of the first leg (the
 *          badge-midpoint measurement: 0.51-0.57 on the annotated courses, heritage7 2026-10-20), so B1 is never just past
 *          the badge (Coleto 11 -> Basket cc: a bend at the badge that doubles back over the badge and the basket sprite,
 *          read on the first leg alone)
 *   K >= 2 S -> B* -> ... -> E (B* = the badge-midpoint bend, routeSpace.mjs badgeMidOf), the weakest leg after the first split
 *          in two while a split makes progress (kSplitAt), the best-scoring route kept; no bound on K but the minimum leg
 * Pure functions on the S7 scene ({ lum, mask, W, H, R1 }); every map-scaled length is in rC1px (S.R1) or W. Every leg read
 * goes through `legsOf` (default: direct); the S7 store passes its profiled query fn.q.match.kLegs, so each read is a store call.
 */
import { ribbonContrastAt, ROUTE, badgeMidOf } from './routeSpace.mjs';
import { BENDS } from './bends.mjs';

export const KBENDS = Object.freeze({
  firstBadgeFrac: 0.57,   // the badge sits at <= 0.57 of the first leg (tee centre -> B1): the recorded 0.51-0.57 band's upper end
  axisStepR1: 0.54,       // the K = 1 sweep along the tee axis: 4 x the table's 0.135 R1 step (routeSpace.mjs FAST.coarse)
  axisReachR1: ROUTE.bendReachR1,
  refineEndR1: 0.045,     // every refine halves its step down to this (match.mjs MATCH.secondBend.refineEndR1)
  coarseEndR1: 0.5,       // the coarse pass (ranking cells for the assignment) stops its refines here; the assigned route is fine
  coarseGridR1: 1.87,     // and splits on a grid twice as coarse (2 x gridR1)
  gridR1: 0.94,           // the split grid: 2 x match.mjs MATCH.secondBend.gridStepR1 (its coarse grid)
  acrossMinR1: 1.87,      // the split grid reaches max(this, half the leg) across the leg (MATCH.secondBend.bboxR1)
  minLegR1: 0.935,        // no leg shorter than this (MATCH.secondBend.minLegR1)
  top: 3,                 // grid candidates refined per split
  offsetW: ROUTE.onAxisLateralW   // a bend within 0.5 W of the leg it splits stays inside the straight ribbon: not a bend
});
export const KBENDS_UNITS = Object.freeze({
  legs: 'lum per leg (edge contrast of the leg read alone; null: fewer than 30 visible px in a band)',
  bottleneck: 'lum (the weakest leg with a reading; null when no leg reads)',
  verts: 'px (canonical frame): tee cap start, bends, BasketPoint'
});

const inside = (S, p) => p[0] >= 0 && p[1] >= 0 && p[0] < S.W && p[1] < S.H;
/**
 * Sam (2026-10-21): "enforce no passing through baskets". foreign = { pts: [[x, y], ...], r } (the other baskets' BasketPoints and
 * their ring radius, px); -> the index of the first foreign ring a leg a -> b enters, or -1 (none, or no foreign set).
 */
export function ringCrossed(a, b, foreign) {
  if (!foreign) return -1;
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = Math.max(dx * dx + dy * dy, 1e-9);
  for (let q = 0; q < foreign.pts.length; q++) {
    const p = foreign.pts[q], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
    if (Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy) < foreign.r) return q;
  }
  return -1;
}
/** The clearance (px) of a leg a -> b from the point p. */
export const legClearance = (a, b, p) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = Math.max(dx * dx + dy * dy, 1e-9), t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
const routeClear = (V, foreign) => { for (let i = 0; i + 1 < V.length; i++) if (ringCrossed(V[i], V[i + 1], foreign) >= 0) return false; return true; };
export const legContrastsOf = (S, V, W) => V.slice(1).map((b, i) => ribbonContrastAt(S, [V[i], b], W)[0]);
/** The batch reader of the K-bend search: every route's legs (one store call per grid, refine step or sweep). */
export const legsManyOf = (legsOf) => (S, Vs, W) => Vs.map((V) => legsOf(S, V, W));
export const bottleneckOf = (legs) => { let m = null; for (const c of legs) if (c !== null && (m === null || c < m)) m = c; return m; };
const offLeg = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = Math.max(dx * dx + dy * dy, 1e-9), t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};

/** The tee axis from the tee centre: the point at t px, and t's lower bound for B1 (the badge at FIRST_BADGE_FRAC of the first leg). */
function axisOf(start) {
  const T = start.teeCenter, u = start.u, toS = (start.S[0] - T[0]) * u[0] + (start.S[1] - T[1]) * u[1];
  return { at: (t) => [T[0] + u[0] * t, T[1] + u[1] * t], lo: (toS + start.badgeAlongPx) / KBENDS.firstBadgeFrac, toS };
}

/**
 * One cell's K <= 1 routes under the fair cost: the straight route, and the best S -> B1 -> E with B1 on the tee axis at or past
 * the bound (a sweep every axisStepR1, then a halving search). -> { zero, one, best } each { verts, legs, bottleneck }.
 */
export function kCellAt(S, start, E, W, { legsOf = legContrastsOf, legsMany = legsManyOf(legsOf), foreign = null } = {}) {
  const r1 = S.R1, ax = axisOf(start), minLeg = KBENDS.minLegR1 * r1;
  const zc = ringCrossed(start.S, E, foreign), zeroLegs = zc >= 0 ? [null] : legsMany(S, [[start.S, E]], W)[0];
  const zero = { verts: [start.S, E], legs: zeroLegs, bottleneck: zc >= 0 ? null : bottleneckOf(zeroLegs), ...(zc >= 0 ? { crosses: zc } : {}) };
  let firstCap = -Infinity;   // the highest first leg (tee cap -> B1 on the axis) read: what any route of this hole can reach at most
  const ok = (t) => { const B = ax.at(t); return !(t < ax.lo || !inside(S, B) || Math.hypot(E[0] - B[0], E[1] - B[1]) < minLeg || !routeClear([start.S, B, E], foreign)); };
  // every t's route read in one batch; null where the geometry rules it out or no leg reads
  const readMany = (ts) => {
    const live = ts.filter(ok), got = live.length ? legsMany(S, live.map((t) => [start.S, ax.at(t), E]), W) : [], m = new Map();
    live.forEach((t, q) => { if (got[q][0] !== null && got[q][0] > firstCap) firstCap = got[q][0]; const b = bottleneckOf(got[q]); m.set(t, b === null ? null : { t, verts: [start.S, ax.at(t), E], legs: got[q], bottleneck: b }); });
    return ts.map((t) => m.get(t) ?? null);
  };
  const sweep = [];
  for (let t = ax.lo; t <= ax.toS + start.badgeAlongPx + KBENDS.axisReachR1 * r1; t += KBENDS.axisStepR1 * r1) { if (!inside(S, ax.at(t))) break; sweep.push(t); }
  let one = null, n = 2 + sweep.length;
  for (const r of readMany(sweep)) if (r && (!one || r.bottleneck > one.bottleneck)) one = r;
  if (one) for (let step = KBENDS.axisStepR1 * r1 / 2; step >= KBENDS.refineEndR1 * r1;) {
    const [a, b] = readMany([one.t + step, one.t - step]); n += 2;
    const m = [a, b].filter((x) => x && x.bottleneck > one.bottleneck).sort((x, y) => y.bottleneck - x.bottleneck)[0];
    if (m) one = m; else step /= 2;
  }
  const strip = (x) => (x ? { verts: x.verts, legs: x.legs, bottleneck: x.bottleneck } : null);
  const best = one && (zero.bottleneck === null || one.bottleneck > zero.bottleneck) ? strip(one) : zero;
  // every K <= 1 route enters a foreign ring: the cell has no legal route (recorded: the basket the straight route crosses)
  if (best.bottleneck === null && zc >= 0) return { zero, one: null, best: { ...zero, bottleneck: null }, read: n, firstCap, rejected: { crosses: zc } };
  return { zero, one: strip(one), best, read: n, firstCap };
}

/** The K >= 2 chain's start: S -> B* -> E (null when B* is outside the image). */
export function kChainStartAt(S, start, E, W, { legsOf = legContrastsOf, legsMany = legsManyOf(legsOf), foreign = null } = {}) {
  const B = badgeMidOf(start);
  if (!inside(S, B) || ringCrossed(start.S, B, foreign) >= 0) return null;
  const legs = legsMany(S, [[start.S, B, E]], W)[0];
  return { verts: [start.S, B, E], legs, bottleneck: bottleneckOf(legs) };
}

/**
 * One split: the weakest leg after the first (tee -> B1 is the straight tee axis) gets a new bend, searched on a grid aligned
 * with the leg (every gridR1 along it, up to max(acrossMinR1, half the leg) across it), the best `top` refined by a halving
 * coordinate search on the two new legs' length-weighted mean contrast (how much of the leg they explain: a leg that needs
 * two more bends leaves one half off the ribbon whatever the split, so their minimum cannot guide the search), every candidate at least offsetW x W off the leg (closer, it stays inside the
 * straight ribbon: not a bend). -> { verts, legs, bottleneck, read, split } or null (nothing to split).
 */
export function kSplitAt(S, V, legs, W, { legsOf = legContrastsOf, legsMany = legsManyOf(legsOf), foreign = null, endR1 = KBENDS.refineEndR1, gridR1 = KBENDS.gridR1 } = {}) {
  const r1 = S.R1, g = gridR1 * r1, minLeg = KBENDS.minLegR1 * r1;
  let j = -1; legs.forEach((c, i) => { if (c !== null && (j < 0 || c < legs[j])) j = i; });
  if (j <= 0) return null;
  const a = V[j], b = V[j + 1], dx = b[0] - a[0], dy = b[1] - a[1], Lg = Math.hypot(dx, dy);
  if (Lg < 2 * minLeg) return null;
  const u = [dx / Lg, dy / Lg], n = [-u[1], u[0]], across = Math.max(KBENDS.acrossMinR1 * r1, Lg / 2);
  let read = 0;
  const ok = (P) => !(!inside(S, P) || Math.hypot(P[0] - a[0], P[1] - a[1]) < minLeg || Math.hypot(P[0] - b[0], P[1] - b[1]) < minLeg || offLeg(P, a, b) < KBENDS.offsetW * W || ringCrossed(a, P, foreign) >= 0 || ringCrossed(P, b, foreign) >= 0);
  // the search explores by how much of the leg the two halves explain (their length-weighted mean); the weakest leg judges.
  // Every candidate set is read in one batch (the grid; each refine step's four moves)
  const fMany = (Ps) => {
    const live = Ps.filter(ok), got = live.length ? legsMany(S, live.map((P) => [a, P, b]), W) : [], m = new Map();
    read += 2 * live.length;
    live.forEach((P, q) => { const [x, y] = got[q]; if (x === null || y === null) return; const la = Math.hypot(P[0] - a[0], P[1] - a[1]), lb = Math.hypot(b[0] - P[0], b[1] - P[1]); m.set(P, (x * la + y * lb) / (la + lb)); });
    return Ps.map((P) => (m.has(P) ? m.get(P) : null));
  };
  const grid = [];
  for (let s = minLeg; s <= Lg - minLeg + 1e-6; s += g) for (let d = -across; d <= across + 1e-6; d += g) grid.push([a[0] + u[0] * s + n[0] * d, a[1] + u[1] * s + n[1] * d]);
  const cands = [];
  fMany(grid).forEach((v, q) => { if (v !== null) cands.push([v, grid[q]]); });
  cands.sort((x, y) => y[0] - x[0]);
  let best = null;
  for (let [v, P] of cands.slice(0, KBENDS.top)) {
    for (let step = g / 2; step >= endR1 * r1;) {
      const Qs = [[step, 0], [-step, 0], [0, step], [0, -step]].map(([ex, ey]) => [P[0] + ex, P[1] + ey]), ws = fMany(Qs);
      let mv = null;
      Qs.forEach((Q, q) => { const w = ws[q]; if (w !== null && w > v && (!mv || w > mv[0])) mv = [w, Q]; });
      if (mv) [v, P] = mv; else step /= 2;
    }
    if (!best || v > best[0]) best = [v, P];
  }
  if (!best) return null;
  const verts = [...V.slice(0, j + 1), best[1], ...V.slice(j + 1)];
  const nl = [...legs.slice(0, j), ...legsMany(S, [[a, best[1], b]], W)[0], ...legs.slice(j + 1)];
  return { verts, legs: nl, bottleneck: bottleneckOf(nl), read, split: { leg: j, before: legs[j], halves: [nl[j], nl[j + 1]] } };
}

/** A route's length-weighted mean leg contrast (lum): how much of the route the ribbon explains (null legs weigh nothing). */
export function meanOf(V, legs) {
  let sw = 0, sc = 0;
  legs.forEach((c, i) => { if (c === null) return; const l = Math.hypot(V[i + 1][0] - V[i][0], V[i + 1][1] - V[i][1]); sw += l; sc += l * c; });
  return sw ? sc / sw : null;
}

/**
 * The K-bend route to a known basket. Two seeds: the chain S -> B* -> E (the badge-midpoint rule) and the cell's best K = 1
 * route (B1 free on the tee axis past the badge-at-0.57 point; `one`, from kCellAt). From each, the weakest leg is split while a
 * split makes progress (one half reads better than the leg it replaces; a leg that needs two more bends cannot raise the
 * weakest leg with one split). The route with the highest WEAKEST leg among all those seen wins (each bend pays for itself),
 * fewer bends on ties, and is polished on its weakest leg (B1 sliding on the tee axis, the other bends free). K is bounded only
 * by the minimum leg length and by progress.
 */
export function kChainAt(S, start, E, W, { legsOf = legContrastsOf, legsMany = legsManyOf(legsOf), one = null, foreign = null, sensorOf = null, endR1 = KBENDS.refineEndR1, gridR1 = KBENDS.gridR1 } = {}) {
  const seeds = [kChainStartAt(S, start, E, W, { legsMany, foreign }), one].filter((r) => r && r.bottleneck !== null);
  if (!seeds.length) return null;
  let best = null, splits = 0;
  const sBest = new Map(), sensorAt = (route) => { if (!sBest.has(route)) sBest.set(route, sensorOf(route.verts)); return sBest.get(route); };
  for (let r of seeds) {
    if (!best || r.bottleneck > best.bottleneck) best = r;
    for (;;) {
      // exact stops (they cannot change the answer): the first leg is never split, so no split of r reads above r's first leg;
      // and a passFrac is at most 1, so once the per-bend sensor gate asks for more, no longer route can become the best
      if (r.legs[0] !== null && r.legs[0] <= best.bottleneck) break;
      if (sensorOf && sensorAt(best) + BENDS.gate.gain * (r.verts.length + 1 - best.verts.length) >= 1) break;
      const nx = kSplitAt(S, r.verts, r.legs, W, { legsMany, foreign, endR1, gridR1 }); splits++;
      if (!nx || !(Math.max(...nx.split.halves.map((c) => c ?? -Infinity)) > nx.split.before)) break;
      r = { verts: nx.verts, legs: nx.legs, bottleneck: nx.bottleneck };
      // a longer route becomes the best only when its weakest leg rises, and (sensorOf given) the hallway sensor gains too: each
      // bend pays on both measures (the weakest leg alone let micro-bends through on SeaTac 21: 10 bends, sensor 0.90)
      // (the recorded gate of a bend-count change, bends.mjs BENDS.gate.gain: the sensor must gain more than 0.05 PER added bend)
      if (r.bottleneck !== null && r.bottleneck > best.bottleneck && (!sensorOf || sensorAt(r) > sensorAt(best) + BENDS.gate.gain * (r.verts.length - best.verts.length))) best = r;
    }
  }
  const p = polishAt(S, best, W, { legsMany, start, foreign, endR1 });
  // a chain whose every split crosses a foreign ring keeps its seed; a seed that crosses one is no route
  return routeClear(p.verts, foreign) ? { ...p, splits } : null;
}

/**
 * A route's bends polished together: a halving coordinate search on the weakest leg (each move re-reads the two legs at that
 * bend); B1 slides on the tee axis (at or past the badge-at-0.57 point) when `start` is given, else stays; the bend count kept.
 */
export function polishAt(S, route, W, { legsOf = legContrastsOf, legsMany = legsManyOf(legsOf), start = null, foreign = null, endR1 = KBENDS.refineEndR1 } = {}) {
  if (route.verts.length < 3) return route;
  const r1 = S.R1, minLeg = KBENDS.minLegR1 * r1, ax = start ? axisOf(start) : null;
  let V = route.verts.map((v) => v.slice()), legs = route.legs.slice(), b = bottleneckOf(legs);
  const tOf = (P) => (P[0] - start.teeCenter[0]) * start.u[0] + (P[1] - start.teeCenter[1]) * start.u[1];
  for (let step = KBENDS.gridR1 * r1 / 2; step >= endR1 * r1;) {
    let moved = false;
    for (let q = ax ? 1 : 2; q + 1 < V.length; q++) {
      const moves = q === 1 ? [step, -step].map((d) => (tOf(V[1]) + d >= ax.lo ? ax.at(tOf(V[1]) + d) : null)) : [[step, 0], [-step, 0], [0, step], [0, -step]].map(([ex, ey]) => [V[q][0] + ex, V[q][1] + ey]);
      // the moves of one bend read in one batch (each re-reads the two legs at the bend; its neighbours do not move meanwhile)
      const live = moves.filter((P) => P && inside(S, P) && Math.hypot(P[0] - V[q - 1][0], P[1] - V[q - 1][1]) >= (q === 1 ? 0 : minLeg) && Math.hypot(P[0] - V[q + 1][0], P[1] - V[q + 1][1]) >= minLeg && ringCrossed(V[q - 1], P, foreign) < 0 && ringCrossed(P, V[q + 1], foreign) < 0);
      const got = live.length ? legsMany(S, live.map((P) => [V[q - 1], P, V[q + 1]]), W) : [];
      live.forEach((P, m) => {
        const [x, y] = got[m], nl = [...legs.slice(0, q - 1), x, y, ...legs.slice(q + 1)], nb = bottleneckOf(nl);
        if (nb !== null && (b === null || nb > b)) { V = V.map((v, i) => (i === q ? P : v)); legs = nl; b = nb; moved = true; }
      });
    }
    if (!moved) step /= 2;
  }
  return { verts: V, legs, bottleneck: b };
}
