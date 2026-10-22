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
import { ribbonContrastAt, ROUTE, badgeMidOf, FIRST_BEND_REACH } from './routeSpace.mjs';
import { underAssumption } from '../../fg/assumptions.mjs';
import { BENDS } from './bends.mjs';

export const KBENDS = Object.freeze({
  firstBadgeFrac: 0.57,   // the badge sits at <= 0.57 of the first leg (tee centre -> B1): the recorded 0.51-0.57 band's upper end
  axisStepR1: 0.54,       // the K = 1 sweep along the tee axis: 4 x the table's 0.135 R1 step (routeSpace.mjs FAST.coarse)
  // the K = 1 sweep along the tee axis reaches as far as the route table's: the FIRST_BEND_REACH assumption (routeSpace.mjs), widened on a violation
  refineEndR1: 0.045,     // every refine halves its step down to this (match.mjs MATCH.secondBend.refineEndR1)
  coarseEndR1: 0.5,       // the coarse pass (ranking cells for the assignment) stops its refines here; the assigned route is fine
  coarseGridR1: 1.87,     // and splits on a grid twice as coarse (2 x gridR1)
  gridR1: 0.94,           // the split grid: 2 x match.mjs MATCH.secondBend.gridStepR1 (its coarse grid)
  acrossMinR1: 1.87,      // the split grid reaches max(this, half the leg) across the leg (MATCH.secondBend.bboxR1)
  minLegR1: 0.935,        // no leg shorter than this (MATCH.secondBend.minLegR1)
  top: 3,                 // grid candidates refined per split
  offsetW: ROUTE.onAxisLateralW,  // a bend within 0.5 W of the leg it splits stays inside the straight ribbon: not a bend
  // the steps above are hallway geometry (bend positions, leg lengths, the split grid), set in R1 on golden, where W = 0.934 R1.
  // Rule set option kUnits 'w' reads them in W instead: the unit is W / goldenWPerR1, so each value in W is value / 0.934 (grid
  // 1.0 W, minimum leg 1.0 W, across 2.0 W, axis step 0.58 W, refine end 0.048 W). W / R1 runs 0.76-1.56 over the 9 courses.
  // The axis reach (FIRST_BEND_REACH) and the foreign rings stay in R1 (basket and course geometry)
  goldenWPerR1: 0.934
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
  // rule set option seqFirstLegs (firstLegs.mjs): the other holes' badge plates are foreign too; a plate's index follows the rings'
  if (foreign.boxes) for (let q = 0; q < foreign.boxes.length; q++) if (segmentHitsBox(a, b, foreign.boxes[q].box)) return foreign.pts.length + q;
  return -1;
}
/** Does the segment a -> b pass over the box [x, y, w, h] (px)? Liang-Barsky clipping. */
export function segmentHitsBox(a, b, [x, y, w, h]) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  let t0 = 0, t1 = 1;
  for (const [p, q] of [[-dx, a[0] - x], [dx, x + w - a[0]], [-dy, a[1] - y], [dy, y + h - a[1]]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return t0 <= t1;
}
/** What a foreign crossing index names: { basket: index } for a ring, { badge: label } for a badge plate. */
export const crossedOf = (foreign, q) => (q < 0 ? null : q < foreign.pts.length ? { basket: foreign.idx[q] } : { badge: foreign.boxes[q - foreign.pts.length].hole });
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

/**
 * Corridors are owned (rule set option ownCorridors): a leg a -> b RUNS ALONG an owned route when most of it (> 1/2 of its
 * samples, W/4 apart) lies within W/2 of that route and roughly parallel to it (within 30 deg); crossing one is allowed.
 * owned: [[x, y], ...] polylines (other holes' confirmed routes). -> true when the leg runs along any of them.
 */
export const OWN = Object.freeze({ nearW: 0.5, parallelDeg: 30, alongFrac: 0.5, sampleW: 0.25 });
export function legRunsAlong(a, b, owned, W) {
  if (!owned || !owned.length) return false;
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-6) return false;
  // only the owned corridors whose box, widened by W/2, meets the leg's box can hold its samples (the same answer, fewer tests)
  const r = OWN.nearW * W, lx0 = Math.min(a[0], b[0]) - r, lx1 = Math.max(a[0], b[0]) + r, ly0 = Math.min(a[1], b[1]) - r, ly1 = Math.max(a[1], b[1]) + r;
  owned = owned.filter((O) => { let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const p of O) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; } return !(x1 < lx0 || x0 > lx1 || y1 < ly0 || y0 > ly1); });
  if (!owned.length) return false;
  const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], cosMin = Math.cos(OWN.parallelDeg * Math.PI / 180), step = OWN.sampleW * W;
  let n = 0, along = 0;
  for (let t = 0; t <= L; t += step) {
    n++;
    const p = [a[0] + u[0] * t, a[1] + u[1] * t];
    let hit = false;
    for (const O of owned) { for (let i = 0; i + 1 < O.length && !hit; i++) {
      const c = O[i], d = O[i + 1], dx = d[0] - c[0], dy = d[1] - c[1], L2 = dx * dx + dy * dy; if (L2 < 1e-9) continue;
      const tt = Math.max(0, Math.min(1, ((p[0] - c[0]) * dx + (p[1] - c[1]) * dy) / L2));
      if (Math.hypot(p[0] - c[0] - tt * dx, p[1] - c[1] - tt * dy) < OWN.nearW * W && Math.abs((u[0] * dx + u[1] * dy) / Math.sqrt(L2)) >= cosMin) hit = true;
    } if (hit) break; }
    if (hit) along++;
  }
  return along > OWN.alongFrac * n;
}
const routeRunsAlong = (V, owned, W) => { for (let i = 0; i + 1 < V.length; i++) if (legRunsAlong(V[i], V[i + 1], owned, W)) return true; return false; };
/** A route's turning angles (deg) at its bends. */
export const turnsOf = (V) => V.slice(1, -1).map((B, i) => { const A = V[i], C = V[i + 2], d1 = [B[0] - A[0], B[1] - A[1]], d2 = [C[0] - B[0], C[1] - B[1]]; return Math.acos(Math.max(-1, Math.min(1, (d1[0] * d2[0] + d1[1] * d2[1]) / (Math.hypot(...d1) * Math.hypot(...d2) || 1)))) * 180 / Math.PI; });
/**
 * The price of turning (rule set option turnKappa, lum): kappa x sum over the bends of (1 - cos theta)^2. A 90 deg bend costs kappa,
 * 35 deg 0.03 kappa, 72 deg 0.48 kappa, 112 deg 1.9 kappa: dev bends (14-72 deg, Sam's testimony) stay cheap, 86-112 deg wanders
 * pay; sharper doglegs are priced, never forbidden. A route's value = its weakest leg - this price.
 */
export const turnCostOf = (V, kappa) => (kappa ? kappa * turnsOf(V).reduce((s, t) => s + (1 - Math.cos(t * Math.PI / 180)) ** 2, 0) : 0);

/** The tee axis from the tee centre: the point at t px, and t's lower bound for B1 (the badge at FIRST_BADGE_FRAC of the first leg). */
function axisOf(start) {
  const T = start.teeCenter, u = start.u, toS = (start.S[0] - T[0]) * u[0] + (start.S[1] - T[1]) * u[1];
  return { at: (t) => [T[0] + u[0] * t, T[1] + u[1] * t], lo: (toS + start.badgeAlongPx) / KBENDS.firstBadgeFrac, toS };
}

/**
 * One cell's K <= 1 routes under the fair cost: the straight route, and the best S -> B1 -> E with B1 on the tee axis at or past
 * the bound (a sweep every axisStepR1, then a halving search). -> { zero, one, best } each { verts, legs, bottleneck }.
 */
export function kCellAt(S, start, E, W, { legsOf = legContrastsOf, legsMany = legsManyOf(legsOf), foreign = null, unitPx = null, owned = null } = {}) {
  const r1 = unitPx ?? S.R1, ax = axisOf(start), minLeg = KBENDS.minLegR1 * r1;
  // owned (rule set option seqFirstLegs): corridors no leg may run along; the straight route along one is ruled out like a crossing
  const zOwned = Boolean(owned && routeRunsAlong([start.S, E], owned, W));
  const zc0 = ringCrossed(start.S, E, foreign), zc = zc0 < 0 && zOwned ? Infinity : zc0, zeroLegs = zc >= 0 ? [null] : legsMany(S, [[start.S, E]], W)[0];
  const zero = { verts: [start.S, E], legs: zeroLegs, bottleneck: zc >= 0 ? null : bottleneckOf(zeroLegs), ...(zc >= 0 ? { crosses: zc === Infinity ? null : zc, ...(zc === Infinity ? { runsAlong: true } : {}) } : {}) };
  let firstCap = -Infinity;   // the highest first leg (tee cap -> B1 on the axis) read: what any route of this hole can reach at most
  const ok = (t) => { const B = ax.at(t); return !(t < ax.lo || !inside(S, B) || Math.hypot(E[0] - B[0], E[1] - B[1]) < minLeg || !routeClear([start.S, B, E], foreign) || (owned && routeRunsAlong([start.S, B, E], owned, W))); };
  // every t's route read in one batch; null where the geometry rules it out or no leg reads
  const readMany = (ts) => {
    const live = ts.filter(ok), got = live.length ? legsMany(S, live.map((t) => [start.S, ax.at(t), E]), W) : [], m = new Map();
    live.forEach((t, q) => { if (got[q][0] !== null && got[q][0] > firstCap) firstCap = got[q][0]; const b = bottleneckOf(got[q]); m.set(t, b === null ? null : { t, verts: [start.S, ax.at(t), E], legs: got[q], bottleneck: b }); });
    return ts.map((t) => m.get(t) ?? null);
  };
  // the sweep reaches the FIRST_BEND_REACH assumption past the badge (routeSpace.mjs): a best bend on the sweep's last step of a
  // reach-cut axis is a violation (recorded on the cell), and the sweep runs again with the reach doubled, up to the image border
  let n = 2;
  const sweepTo = (reachPx) => {
    const sweep = []; let cut = true;
    for (let t = ax.lo; t <= ax.toS + start.badgeAlongPx + reachPx; t += KBENDS.axisStepR1 * r1) { if (!inside(S, ax.at(t))) { cut = false; break; } sweep.push(t); }
    let one = null; n += sweep.length;
    const reads = readMany(sweep);
    for (const r of reads) if (r && (!one || r.bottleneck > one.bottleneck)) one = r;
    // at the bound: the best bend is the sweep's last, or the tee axis still reads as hallway at the reach's end (its first leg
    // reads no lower there than the best route's): the hole runs on past the stated reach
    const last = reads.at(-1), runsOn = Boolean(last && one && last.legs[0] !== null && one.legs[0] !== null && last.legs[0] >= one.legs[0]);
    const atEdge = Boolean(cut && one && sweep.length && (one.t >= sweep.at(-1) - 1e-9 || runsOn));
    if (one) for (let step = KBENDS.axisStepR1 * r1 / 2; step >= KBENDS.refineEndR1 * r1;) {
      const [a, b] = readMany([one.t + step, one.t - step]); n += 2;
      const m = [a, b].filter((x) => x && x.bottleneck > one.bottleneck).sort((x, y) => y.bottleneck - x.bottleneck)[0];
      if (m) one = m; else step /= 2;
    }
    return { result: one, found: true, atEdge, at: one ? one.t - ax.toS - start.badgeAlongPx : null };
  };
  const under = underAssumption(FIRST_BEND_REACH, { unitPx: S.R1, limitPx: Math.hypot(S.W, S.H), detail: { hole: start.hole ?? null, step: 'K <= 1 sweep on the tee axis' }, run: sweepTo });
  const one = under.result, violation = under.violation;
  const strip = (x) => (x ? { verts: x.verts, legs: x.legs, bottleneck: x.bottleneck } : null);
  const best = one && (zero.bottleneck === null || one.bottleneck > zero.bottleneck) ? strip(one) : zero;
  // every K <= 1 route enters a foreign ring: the cell has no legal route (recorded: the basket the straight route crosses)
  if (best.bottleneck === null && zc >= 0) return { zero, one: null, best: { ...zero, bottleneck: null }, read: n, firstCap, rejected: { crosses: zc === Infinity ? null : zc, ...(zc === Infinity ? { runsAlong: true } : {}) }, ...(violation ? { violation } : {}) };
  return { zero, one: strip(one), best, read: n, firstCap, ...(violation ? { violation } : {}) };
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
export function kSplitAt(S, V, legs, W, { legsOf = legContrastsOf, legsMany = legsManyOf(legsOf), foreign = null, endR1 = KBENDS.refineEndR1, gridR1 = KBENDS.gridR1, owned = null, unitPx = null } = {}) {
  const r1 = unitPx ?? S.R1, g = gridR1 * r1, minLeg = KBENDS.minLegR1 * r1;
  let j = -1; legs.forEach((c, i) => { if (c !== null && (j < 0 || c < legs[j])) j = i; });
  if (j <= 0) return null;
  const a = V[j], b = V[j + 1], dx = b[0] - a[0], dy = b[1] - a[1], Lg = Math.hypot(dx, dy);
  if (Lg < 2 * minLeg) return null;
  const u = [dx / Lg, dy / Lg], n = [-u[1], u[0]], across = Math.max(KBENDS.acrossMinR1 * r1, Lg / 2);
  let read = 0;
  const ok = (P) => !(!inside(S, P) || Math.hypot(P[0] - a[0], P[1] - a[1]) < minLeg || Math.hypot(P[0] - b[0], P[1] - b[1]) < minLeg || offLeg(P, a, b) < KBENDS.offsetW * W || ringCrossed(a, P, foreign) >= 0 || ringCrossed(P, b, foreign) >= 0 || (owned && (legRunsAlong(a, P, owned, W) || legRunsAlong(P, b, owned, W))));
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
export function kChainAt(S, start, E, W, { legsOf = legContrastsOf, legsMany = legsManyOf(legsOf), one = null, foreign = null, sensorOf = null, endR1 = KBENDS.refineEndR1, gridR1 = KBENDS.gridR1,
  polishEach = false, owned = null, turnKappa = 0, firstCap = null, unitPx = null } = {}) {
  // rule set options: polishEach = every candidate polished on its weakest leg before it competes; owned = other holes' confirmed
  // corridors no leg may run along; turnKappa = the price of turning (turnCostOf), a route's value = weakest leg - that price
  const pol = (r) => (polishEach && r ? polishAt(S, r, W, { legsMany, start, foreign, endR1, owned, unitPx }) : r);
  const val = (r) => r.bottleneck - turnCostOf(r.verts, turnKappa);
  const seeds = [kChainStartAt(S, start, E, W, { legsMany, foreign }), one].filter((r) => r && r.bottleneck !== null && !(owned && routeRunsAlong(r.verts, owned, W))).map(pol).filter((r) => r.bottleneck !== null);
  if (!seeds.length) return null;
  let best = null, raw = null, splits = 0;
  const sBest = new Map(), sensorAt = (route) => { if (!sBest.has(route)) sBest.set(route, sensorOf(route.verts)); return sBest.get(route); };
  const gate = (r, b) => !sensorOf || sensorAt(r) > sensorAt(b) + BENDS.gate.gain * (r.verts.length - b.verts.length);
  for (let r of seeds) {
    if (!best || val(r) > val(best)) best = r;
    if (!raw || r.bottleneck > raw.bottleneck) raw = r;
    for (;;) {
      // exact stops: no later route of r reads above the bound (unpolished: r's first leg, never split; polished: the hole's
      // best first leg on the axis, firstCap); a passFrac is at most 1, so the per-bend sensor gate ends the search
      const bound = polishEach ? firstCap : r.legs[0];
      if (bound !== null && bound <= val(best) && (!turnKappa || bound <= raw.bottleneck)) break;
      if (sensorOf && sensorAt(best) + BENDS.gate.gain * (r.verts.length + 1 - best.verts.length) >= 1) break;
      const nx = kSplitAt(S, r.verts, r.legs, W, { legsMany, foreign, endR1, gridR1, owned, unitPx }); splits++;
      if (!nx || !(Math.max(...nx.split.halves.map((c) => c ?? -Infinity)) > nx.split.before)) break;
      r = pol({ verts: nx.verts, legs: nx.legs, bottleneck: nx.bottleneck });
      // a longer route becomes the best only when its value rises, and (sensorOf given) the hallway sensor gains too: each
      // bend pays on both measures (the weakest leg alone let micro-bends through on SeaTac 21: 10 bends, sensor 0.90)
      // (the recorded gate of a bend-count change, bends.mjs BENDS.gate.gain: the sensor must gain more than 0.05 PER added bend)
      if (r.bottleneck !== null && val(r) > val(best) && gate(r, best)) best = r;
      if (turnKappa && r.bottleneck !== null && r.bottleneck > raw.bottleneck && gate(r, raw)) raw = r;
    }
  }
  const p = polishAt(S, best, W, { legsMany, start, foreign, endR1, owned, unitPx });
  // a chain whose every split crosses a foreign ring keeps its seed; a seed that crosses one is no route
  if (!routeClear(p.verts, foreign)) return null;
  return { ...p, splits, ...(turnKappa ? { turnCost: turnCostOf(p.verts, turnKappa), turnsDeg: turnsOf(p.verts).map((t) => Math.round(t)), turnDecided: raw !== best ? { rawBends: raw.verts.length - 2, rawTurnsDeg: turnsOf(raw.verts).map((t) => Math.round(t)), rawBottleneck: raw.bottleneck } : null } : {}) };
}

/**
 * A route's bends polished together: a halving coordinate search on the weakest leg (each move re-reads the two legs at that
 * bend); B1 slides on the tee axis (at or past the badge-at-0.57 point) when `start` is given, else stays; the bend count kept.
 */
export function polishAt(S, route, W, { legsOf = legContrastsOf, legsMany = legsManyOf(legsOf), start = null, foreign = null, endR1 = KBENDS.refineEndR1, owned = null, unitPx = null } = {}) {
  if (route.verts.length < 3) return route;
  const r1 = unitPx ?? S.R1, minLeg = KBENDS.minLegR1 * r1, ax = start ? axisOf(start) : null;
  let V = route.verts.map((v) => v.slice()), legs = route.legs.slice(), b = bottleneckOf(legs);
  const tOf = (P) => (P[0] - start.teeCenter[0]) * start.u[0] + (P[1] - start.teeCenter[1]) * start.u[1];
  for (let step = KBENDS.gridR1 * r1 / 2; step >= endR1 * r1;) {
    let moved = false;
    for (let q = ax ? 1 : 2; q + 1 < V.length; q++) {
      const moves = q === 1 ? [step, -step].map((d) => (tOf(V[1]) + d >= ax.lo ? ax.at(tOf(V[1]) + d) : null)) : [[step, 0], [-step, 0], [0, step], [0, -step]].map(([ex, ey]) => [V[q][0] + ex, V[q][1] + ey]);
      // the moves of one bend read in one batch (each re-reads the two legs at the bend; its neighbours do not move meanwhile)
      const live = moves.filter((P) => P && inside(S, P) && Math.hypot(P[0] - V[q - 1][0], P[1] - V[q - 1][1]) >= (q === 1 ? 0 : minLeg) && Math.hypot(P[0] - V[q + 1][0], P[1] - V[q + 1][1]) >= minLeg && ringCrossed(V[q - 1], P, foreign) < 0 && ringCrossed(P, V[q + 1], foreign) < 0 && !(owned && (legRunsAlong(V[q - 1], P, owned, W) || legRunsAlong(P, V[q + 1], owned, W))));
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
