/**
 * S7 MATCHING over tk.s7.routeTable (Sam, 2026-10-19: "start from 18x18 matching"; "the POINT of score -> rank -> match";
 * "assignment + bend refinement passes using the hallway sensor"). Graduates docs/evidence/s7after/match6.py:
 *
 *   1. assignment: maximum total of (edge contrast of the hole's best route to the basket + onAxisPrior), one-to-one
 *      over the whole table (no greedy claims); a cell without a contrast reading scores -99 (the prototype's value);
 *   2. the assigned 1-bend route is refined by coordinate search (polyscore refine_vertices, 2 iterations, the bend
 *      sliding on the tee axis +- one 6 px grid step per iteration from the contrast route's bend, E18; the prototype slid +-60 px
 *      and on a flat contrast that relocates the bend). Deliberate divergence from the prototype (review R02): match5.py left a hole that the
 *      on-axis prior reassigned on its unrefined route; here every assigned 1-bend route is refined the same way, so
 *      the rule does not depend on which pass chose the basket;
 *   3. bends by the hallway sensor: the straight route if it reads >= TAU on >= MIN_STATIONS visible stations, else the
 *      contrast route; a second bend (B1 on the tee axis, B2 free) only when the 1-bend route reads < TAU and the best
 *      2-bend route reads >= TAU, gains >= 0.15 and has >= MIN_STATIONS stations;
 *   4. bend placement (bends.mjs, graduated from after-s4-e09): each bend moves to where the ribbon's heading changes, on a
 *      sensor gate; a hole S6 reads STRAIGHT keeps the route of step 3 (rule 1).
 *
 * Pure functions on the S7 scene ({ lum, mask, W, H }) and the table; no thresholds hide anywhere else.
 */
import { routeSensorAt, ribbonContrastAt, ROUTE, badgeMidAlongPx, badgeMidOf } from './routeSpace.mjs';
import { refineVertices, arange, trace as followHallway, runEnd as followRunEnd, closeOnBp as followCloseOnBp, findBendAt as followBendAt, runEndW as followRunEndWOf, closeOnBpW as followCloseOnBpWOf, findBendAtW as followBendAtWOf, findBendW, bpOnLegW, FOLLOW_W, CLOSE_ON_BP_REACH } from '../s7trace/hallway.mjs';
import { underAssumption } from '../../fg/assumptions.mjs';
import { refineBendsOf } from './bends.mjs';
import { kCellAt, kChainAt, legContrastsOf, KBENDS, turnCostOf, turnsOf, legRunsAlong, bottleneckOf, polishAt } from './kbends.mjs';
import { straightClaimsOf, neighbourhoodsOf, foreignRingsOf, SEQ } from './seq.mjs';
import { ringCrossed, legClearance } from './kbends.mjs';

export const MATCH = Object.freeze({
  tau: 0.75,                 // sensor reading at which a route counts as hallway
  minStations: ROUTE.minStations,   // the recorded 20 stations: only the rule sets without stationsUnits 'r1' read it
  // rule-set option stationsUnits 'r1' (SearchW, the pointer): the same floor as a map-scaled length. Stations are 1 px apart, so
  // a station count is a visible ribbon length in px (map-scaled): 20 px on golden (R1 44.5 px, where match2.py was recorded) is
  // 0.449 R1, rounded down so golden's floor stays 20 stations (routeSpace.mjs ROUTE.minStationsR1)
  minStationsR1: ROUTE.minStationsR1,
  noReadingLum: -99.0,       // a cell with no contrast reading (polyscore.py's value)
  priorDrop: 0.02,           // firstBend 'badgePrior': the sensor may read this much lower at B* (bends.mjs's refit tolerance)
  refineIters: 2,            // match18.py refine_vertices(iters=2)
  // E18: the refine polishes the contrast route's bend, +- one 6 px grid step of best_route per iteration (2 iterations), it does
  // not relocate it: along the axis the contrast is flat to +-2 lum over tens of px where the bend lies inside the
  // basket's C1 disc (golden 4: a 0.24 deg change of u moved the global +-60 px refine's pick 14.7 px, sensor 1.00 both)
  refineAxisSpanR1: ROUTE.contrastBendStepR1,
  // match6.py second_bend in rC1px (its px and W multiples over golden's R1 44.5 px and W 41.6 px). The prototype refined
  // the top 8 on a dense 2 px grid (~35k contrast reads); here a coordinate search halving its step from 0.25 R1 to 0.045 R1.
  secondBend: Object.freeze({ gain: 0.15, axisSpanR1: 1.8, axisStepR1: 0.18, gridStepR1: 0.47, bboxR1: 1.87, minLegR1: 0.935, top: 8, refineStartR1: 0.25, refineEndR1: 0.045 })
});

/** Rectangular min-cost assignment (Hungarian; Infinity = forbidden). -> [[row, col], ...] */
export function assignMinCost(cost) {
  const n = cost.length, m = n ? cost[0].length : 0;
  if (!n || !m) return [];
  const T = n > m, C = T ? cost[0].map((_, j) => cost.map((row) => row[j])) : cost;
  const N = C.length, M = C[0].length, BIG = 1e9;
  const u = new Array(N + 1).fill(0), v = new Array(M + 1).fill(0), p = new Array(M + 1).fill(0), way = new Array(M + 1).fill(0);
  for (let i = 1; i <= N; i++) {
    p[0] = i; let j0 = 0;
    const minv = new Array(M + 1).fill(Infinity), used = new Array(M + 1).fill(false);
    do {
      used[j0] = true; const i0 = p[j0]; let delta = Infinity, j1 = 0;
      for (let j = 1; j <= M; j++) if (!used[j]) {
        const cur = (Number.isFinite(C[i0 - 1][j - 1]) ? C[i0 - 1][j - 1] : BIG) - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= M; j++) if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const pairs = [];
  for (let j = 1; j <= M; j++) if (p[j]) { const [i, jj] = T ? [j - 1, p[j] - 1] : [p[j] - 1, j - 1]; if (Number.isFinite(cost[i][jj])) pairs.push([i, jj]); }
  return pairs.sort((a, b) => a[0] - b[0]);
}

/**
 * assignMinCost with the dual potentials: { pairs, price(i, k) } where price is in MAX form for score = -cost: a cell with a score
 * at or below its price cannot enter an optimal assignment (u_i + v_k <= cost_ik for every cell, equality on the pairs).
 */
export function assignWithDuals(cost) {
  const n = cost.length, m = n ? cost[0].length : 0;
  if (!n || !m) return { pairs: [], price: () => Infinity };
  const T = n > m, C = T ? cost[0].map((_, j) => cost.map((row) => row[j])) : cost;
  const N = C.length, M = C[0].length, BIG = 1e9;
  const u = new Array(N + 1).fill(0), v = new Array(M + 1).fill(0), p = new Array(M + 1).fill(0), way = new Array(M + 1).fill(0);
  for (let i = 1; i <= N; i++) {
    p[0] = i; let j0 = 0;
    const minv = new Array(M + 1).fill(Infinity), used = new Array(M + 1).fill(false);
    do {
      used[j0] = true; const i0 = p[j0]; let delta = Infinity, j1 = 0;
      for (let j = 1; j <= M; j++) if (!used[j]) {
        const cur = (Number.isFinite(C[i0 - 1][j - 1]) ? C[i0 - 1][j - 1] : BIG) - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= M; j++) if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const pairs = [];
  for (let j = 1; j <= M; j++) if (p[j]) { const [i, jj] = T ? [j - 1, p[j] - 1] : [p[j] - 1, j - 1]; if (Number.isFinite(cost[i][jj])) pairs.push([i, jj]); }
  return { pairs: pairs.sort((a, b) => a[0] - b[0]), price: (i, k) => (T ? -(u[k + 1] + v[i + 1]) : -(u[i + 1] + v[k + 1])) };
}

const BENDS_GATE_GAIN = 0.05;   // bends.mjs BENDS.gate.gain: a changed bend count must gain this much sensor per bend
const contrast = (S, V, W) => { const [c] = ribbonContrastAt(S, V, W); return c === null ? MATCH.noReadingLum : c; };
/** polyScore's answer from ribbonContrastAt (the same px in the same order: bit-identical, -99 for no reading). */
const polyScoreFast = (S, V, W) => { const [c, n] = ribbonContrastAt(S, V, W); return c === null ? [MATCH.noReadingLum, 0] : [c, n]; };
/** The visible-station floor of a route reading under the rule set: MATCH.minStations stations, or (stationsUnits 'r1') minStationsR1 x R1. */
export const minStationsOf = (S, rules = MATCH_RULES) => (rules.stationsUnits === 'r1' ? MATCH.minStationsR1 * S.R1 : MATCH.minStations);
const stLabel = (m) => (Number.isInteger(m) ? String(m) : m.toFixed(1));

/** match6.py second_bend's geometry: the B1 axis, the B2 search box, the leg check (shared by the scan and the refine). */
function secondBendFrame(S, start, E, rules) {
  const R = MATCH.secondBend, u = start.u, St = start.S, r1 = S.R1, coarse = rules.secondBendGrid === 'coarse' ? 2 : 1;
  const minLeg = R.minLegR1 * r1;
  return {
    R, St, r1, coarse,
    B1at: (t) => [St[0] + u[0] * t, St[1] + u[1] * t],
    inside: (p) => p[0] >= 0 && p[0] < S.W && p[1] >= 0 && p[1] < S.H,
    legsOk: (B1, B2) => !(Math.hypot(B2[0] - B1[0], B2[1] - B1[1]) < minLeg || Math.hypot(B2[0] - E[0], B2[1] - E[1]) < minLeg)
  };
}

/**
 * match6.py second_bend, step 1, the scan: B1 on the tee axis (+-1.8 R1 around the 1-bend vertex), B2 on a 0.47 R1 grid over
 * the route's box (both at twice the spacing for secondBendGrid 'coarse'). -> the best R.top candidates [contrast, t, B2].
 */
export function secondBendScan(S, start, V1, E, W, rules = MATCH_RULES) {
  const { R, St, r1, coarse, B1at, inside, legsOk } = secondBendFrame(S, start, E, rules), u = start.u;
  const t1 = (V1[1][0] - St[0]) * u[0] + (V1[1][1] - St[1]) * u[1], box = R.bboxR1 * r1;
  const lo = [Math.min(St[0], E[0]) - box, Math.min(St[1], E[1]) - box], hi = [Math.max(St[0], E[0]) + box, Math.max(St[1], E[1]) + box];
  const grid = R.gridStepR1 * r1 * coarse;   // coarse: half the B2 grid each way, the search starts there
  const gx = arange(Math.max(lo[0], 0), Math.min(hi[0], S.W), grid), gy = arange(Math.max(lo[1], 0), Math.min(hi[1], S.H), grid);
  const cands = [];
  // secondBendB1 'badge': the first bend stays at the badge midpoint B* (the scan and the refine move B2 only)
  const axis = rules.secondBendB1 === 'badge' ? [badgeMidAlongPx(start)] : arange(t1 - R.axisSpanR1 * r1, t1 + R.axisSpanR1 * r1 + 0.01 * r1, R.axisStepR1 * r1 * coarse);
  for (const t of axis) {
    const B1 = B1at(t);
    if (!inside(B1)) continue;
    for (const x of gx) for (const y of gy) {
      if (!legsOk(B1, [x, y])) continue;
      cands.push([contrast(S, [St, B1, [x, y], E], W), t, [x, y]]);
    }
  }
  cands.sort((a, b) => b[0] - a[0]);
  return { top: cands.slice(0, R.top), read: cands.length };
}

/** Step 2, one candidate's refine: dense (match6.py) or a coordinate search on (t, B2x, B2y). -> { contrast, verts } (verts null: none). */
export function secondBendRefine(S, start, E, W, cand, rules = MATCH_RULES) {
  const { R, St, r1, coarse, B1at, inside, legsOk } = secondBendFrame(S, start, E, rules);
  let best = [MATCH.noReadingLum, null];
  if (rules.secondBendRefine === 'dense') {
    // match6.py's dense refine, its px over golden's R1 (+-8 px every 2 px on the axis, +-W/2 every 2 px for B2)
    const ax = 0.18 * r1, st = 0.045 * r1, half = W / 2, [, t, B2] = cand;
    for (const dt of rules.secondBendB1 === 'badge' ? [0] : arange(-ax, ax + 0.01 * r1, st)) {
      const B1 = B1at(t + dt);
      for (const dx of arange(-half, half + 0.1, st)) for (const dy of arange(-half, half + 0.1, st)) {
        const Vt = [St, B1, [B2[0] + dx, B2[1] + dy], E], s2 = contrast(S, Vt, W);
        if (s2 > best[0]) best = [s2, Vt];
      }
    }
  } else {
    // coordinate search on (t, B2x, B2y): try +- step on each, move on the best strict gain, else halve the step
    let [s, t, B2] = cand, step = (rules.secondBendRefine === 'coordWide' ? R.gridStepR1 * coarse : R.refineStartR1) * r1;   // coordWide: start at the coarse grid spacing
    while (step >= R.refineEndR1 * r1) {
      let move = null;
      for (const [dt, dx, dy] of rules.secondBendB1 === 'badge' ? [[0, step, 0], [0, -step, 0], [0, 0, step], [0, 0, -step]] : [[step, 0, 0], [-step, 0, 0], [0, step, 0], [0, -step, 0], [0, 0, step], [0, 0, -step]]) {
        const tt = t + dt, B1 = B1at(tt), P = [B2[0] + dx, B2[1] + dy];
        if (!inside(B1) || !inside(P) || !legsOk(B1, P)) continue;
        const v = contrast(S, [St, B1, P, E], W);
        if (v > s && (!move || v > move[0])) move = [v, tt, P];
      }
      if (move) [s, t, B2] = move; else step /= 2;
    }
    if (s > best[0]) best = [s, [St, B1at(t), B2, E]];
  }
  return { contrast: best[0], verts: best[1] };
}

/**
 * match6.py second_bend: the scan, the top candidates refined (the first best kept), sensor-gated. Every step is a call of
 * `steps` (the S7 store passes fn.q.match.*, so the scan and each refine are profiled store calls).
 */
export function secondBend(S, start, V1, E, W, f1, rules = MATCH_RULES, steps = MATCH_STEPS) {
  const R = MATCH.secondBend, { top } = steps.secondBendScan(S, start, V1, E, W, rules);
  let best = [MATCH.noReadingLum, null];
  for (const cand of top) { const r = steps.secondBendRefine(S, start, E, W, cand, rules); if (r.contrast > best[0]) best = [r.contrast, r.verts]; }
  if (!best[1]) return { accepted: false, note: 'no 2-bend candidate' };
  const r2 = steps.sensor(S, best[1], W), c1 = steps.contrast(S, V1, W);
  const note = `2-bend candidate contrast ${best[0].toFixed(1)} (1-bend ${c1.toFixed(1)}) lum, sensor ${r2.passFrac.toFixed(2)} on ${r2.stations} st vs 1-bend ${f1.toFixed(2)}`;
  const ok = r2.passFrac >= MATCH.tau && r2.passFrac - f1 >= R.gain && r2.stations >= minStationsOf(S, rules);
  return { accepted: ok, verts: best[1], note, sensor: r2 };
}

/**
 * The matching rule: table (tk.s7.routeTable), S (tk.s7.sceneS4), starts (tk.s7.routeStart). -> { holes: { [hole]: { end, verts, how, ... } },
 * assignment: rows, widthPx }. secondBend: false skips step 3's second bend (cheap variant).
 */
/**
 * The per-hole steps of the matching rule. Default: direct calls. The S7 store passes its own (fn.q.match.*, ports/s7trace/
 * traceSpace.mjs) so every step is a profiled store call: same functions, same arguments, so the same answers.
 */
export const MATCH_STEPS = Object.freeze({
  refine: (S, V, W, u, rules = MATCH_RULES) => (rules.refineUnits === 'px'
    ? refineVertices(S, V, W, u, MATCH.refineIters, { axisSpanPx: 6, score: polyScoreFast })[0]   // E18 as recorded: +-6 px, the prototype's px steps
    : refineVertices(S, V, W, u, MATCH.refineIters, { axisSpanPx: MATCH.refineAxisSpanR1 * S.R1, unitPx: S.R1, score: polyScoreFast })[0]),
  sensor: (S, V, W) => routeSensorAt(S, V, W),
  secondBendScan: (S, start, V, E, W, rules = MATCH_RULES) => secondBendScan(S, start, V, E, W, rules),
  secondBendRefine: (S, start, E, W, cand, rules = MATCH_RULES) => secondBendRefine(S, start, E, W, cand, rules),
  placeBends: (S, V, W, straight, opts = {}) => refineBendsOf(S, V, W, { straight, ...opts }),
  contrast: (S, V, W) => contrast(S, V, W),
  // rule set option kBends 'bottleneck' (kbends.mjs): every leg of a route read alone (the K-bend search's one measure)
  kLegs: (S, V, W) => legContrastsOf(S, V, W),
  // the same reads batched: every route of one grid, refine step or sweep in one store call
  kLegsMany: (S, Vs, W) => Vs.map((V) => legContrastsOf(S, V, W)),
  // rule set option seqFollow: the hallway follower's steps (ports/s7trace/hallway.mjs trace: s7main's ride-the-ribbon), each a
  // profiled store call: the edge run along a leg, the close on a BasketPoint, the best bend at one vertex position on the leg
  followRunEnd: (S, O, phi, W, t0) => followRunEnd(S, O, phi, W, t0),
  followCloseOnBp: (S, O, phi, W, tEnd, used) => followCloseOnBp(S, O, phi, W, tEnd, used),
  followBendAt: (S, O, phi, W, tv, selfC, tees) => followBendAt(S, O, phi, W, tv, selfC, tees),
  // seqFollow 'w': the same steps with every resolution a fraction of W (hallway.mjs FOLLOW_W; res: the rule set's overrides)
  followRunEndW: (S, O, phi, W, t0, res) => followRunEndWOf(S, O, phi, W, t0, res),
  followCloseOnBpW: (S, O, phi, W, tEnd, used, res) => followCloseOnBpWOf(S, O, phi, W, tEnd, used, res),
  followBendAtW: (S, O, phi, W, tv, selfC, tees, psis, res) => followBendAtWOf(S, O, phi, W, tv, selfC, tees, psis, res)
});

/**
 * Rule sets (Sam, 2026-10-20: "have a bunch of possible rule sets so you can optimize over a wide batch"). Each is a
 * routeMatch variant in impl/fn.Hole.trace/ and the S7 pointer vote picks among them on the judged courses.
 *   straightFromS6: a hole S6 reads straight is drawn straight (tee cap -> BasketPoint), no bend search
 *   secondBendRefine: 'coord' (halving coordinate search from 0.25 R1) | 'coordWide' (from the coarse grid spacing, 0.47 R1)
 *                     | 'dense' (match6.py's dense grid, in rC1px)
 *   refineUnits: 'r1' (the 1-bend refine in rC1px) | 'px' (E18 as recorded)
 *   tableUnits: 'r1' (the route table's bend search in rC1px) | 'px' (match18.py's recorded 800 px reach, 6 px step)
 *   tableSearch: 'full' (every bend on the axis) | 'fast' (coarse sweep at 4x the step, the best 2 refined)
 *                | 'lean' (every basket at 8x the step; only the row's best 3 baskets refined as 'fast')
 *   secondBendGrid: 'fine' | 'coarse' (the second bend's B1 axis and B2 grid at twice the spacing; the coordinate search starts there)
 *   tableSearch 'badgeMid': each cell reads 2 routes, S -> basket and S -> B* -> basket (B* = tee + 2 x the badge's distance
 *     along the tee axis: the first leg's end when the badge is its midpoint, as on every annotated hole measured 2026-10-20)
 *   secondBendB1: 'axis' (default: B1 searched on the tee axis) | 'badge' (B1 stays at B*; only B2 is searched)
 *   firstBend: 'free' (default: refined and placed) | 'badge' (a 1-bend route through B* keeps it there) | 'badgePrior' (after
 *     the bend placement, the first bend moves to B* when the sensor reads no worse there, within MATCH.priorDrop)
 *   stationsUnits: absent (MATCH.minStations = 20 visible stations, an absolute px length) | 'r1' (minStationsR1 x R1: the
 *                  station floor of the straight read, the second bend and the bend placement's gate as a map-scaled length)
 *   straightSecondBend: true = a contrast route with NO bend that the sensor rejects (< tau) also gets the second-bend search,
 *                  B1 seeded on the tee axis 0.5 W past the badge (Sam: the tee -> badge segment is straight hallway; the
 *                  recorded rule searches a second bend only from a 1-bend route)
 *   placeAxis:     true = the bend placement fits the first bend on the tee axis (by its distance along it) instead of freely
 *   kBends:        'bottleneck' = the fair cost of kbends.mjs (a route is as good as its weakest leg): the assignment scores each
 *                  cell by its best K <= 1 route under it (B1 on the tee axis at or past the badge-at-0.57 point) plus the on-axis
 *                  prior; an assigned route the sensor rejects (< tau) is replaced by the K-bend chain S -> B* -> ... -> E when the
 *                  chain's weakest leg reads higher; then the unconfirmed holes re-solved together (kBendsPass) | 'seq' = sequencing
 *                  (seq.mjs): straight holes claim their basket first, each other hole scores only its neighbourhood under the
 *                  weakest-leg cost (K <= 1, the K-bend chain when the sensor rejects that). Absent: the recorded rule.
 *   seqNeighbours: (kBends 'seq') the neighbourhood ranks scored first (default SEQ.neighbours, all of them)
 *   seqWiden:      (kBends 'seq') true = a hole whose assigned route reads below tau on the sensor (or got no basket) re-solves
 *                  with its remaining ranks from the unclaimed pool
 *   seqGate:       (kBends 'seq') 'region' = the sequencing's sensor gates read the region passFrac (regionSpace.mjs) |
 *                  'regionWiden' = only the widening gate reads it
 *   seqScore:      (kBends 'seq') 'region' = each neighbourhood cell is assigned by the region support of its (edge-placed) route
 *   seqPolish:     (kBends 'seq') true = every chain candidate polished on its weakest leg before it competes (kbends.mjs polishEach)
 *   seqOwn:        (kBends 'seq') true = confirmed routes own their corridors (straight claims, then routes passing the gate); the
 *                  other holes' chains may not run a leg along one (kbends.mjs legRunsAlong), crossing allowed
 *   seqTurnKappa:  (kBends 'seq') lum: the price of turning, kappa x sum (1 - cos theta)^2 over a route's bends (kbends.mjs turnCostOf)
 *   seqFollow:     (kBends 'seq') true = a hole whose assigned route still fails the gate rides the ribbon with the hallway follower
 *                  (hallway.mjs trace) from its tee cap; the route it finds, polished on its weakest leg, competes for that cell |
 *                  'w' = the same follower with every resolution a fraction of W (hallway.mjs FOLLOW_W: vertex positions W/8, a 3.4 W
 *                  heading run sampled every W/8, headings every (W/16) / 3.4 W rad, the winner polished to W/32) and where the hole
 *                  ends in R1 (a BasketPoint on the leg within 0.11 R1, up to 1.5 R1 past the run's end; closeOnBp within 7.5 R1)
 *   followRes:     (seqFollow 'w') overrides of FOLLOW_W, e.g. { vertexStepW: 1/16 }
 *   kUnits:        (kBends 'seq') 'w' = the K-bend search's hallway steps (kbends.mjs KBENDS: the split grid, minimum leg, axis
 *                  step, refine end) in W instead of R1 (unit W / KBENDS.goldenWPerR1); the foreign rings and the axis reach stay R1
 *   sensor:        absent (edges) | 'region' = the assignment reads the hallway REGION (ports/s7route/regionSpace.mjs: each cell's
 *                  best route by region support, -1..1, the on-axis prior in support units); the routes and the per-hole steps (refine,
 *                  sensor gates, second bend, placement) read edges | 'regionAll' = every measure reads the region
 */
export const MATCH_RULES = Object.freeze({ straightFromS6: true, secondBendRefine: 'coordWide', refineUnits: 'r1', tableUnits: 'r1' });   // batch 2 (2026-10-20): S6CoordWide

/** The rule sets the S7 pointer vote chooses among: variant name (impl/fn.Hole.trace/) -> its overrides of MATCH_RULES. */
export const RULE_SETS = Object.freeze({
  routeMatch: {},
  routeMatchS6straight: { straightFromS6: true },
  routeMatchS6CoordWide: { straightFromS6: true, secondBendRefine: 'coordWide' },
  routeMatchS6Dense: { straightFromS6: true, secondBendRefine: 'dense' },
  routeMatchS6PxDense: { straightFromS6: true, tableUnits: 'px', refineUnits: 'px', secondBendRefine: 'dense' },
  routeMatchDenseSecondBend: { secondBendRefine: 'dense' },
  routeMatchPxRefine: { refineUnits: 'px' },
  routeMatchPxTable: { tableUnits: 'px', refineUnits: 'px' },
  routeMatchFast: { straightFromS6: true, secondBendRefine: 'coordWide', tableSearch: 'fast' },
  routeMatchFastPxRefine: { straightFromS6: true, secondBendRefine: 'coordWide', tableSearch: 'fast', refineUnits: 'px' },
  routeMatchLean: { straightFromS6: true, secondBendRefine: 'coordWide', tableSearch: 'lean' },
  routeMatchLeanPxRefine: { straightFromS6: true, secondBendRefine: 'coordWide', tableSearch: 'lean', refineUnits: 'px' },
  routeMatchLeanCoarse2: { straightFromS6: true, secondBendRefine: 'coordWide', tableSearch: 'lean', secondBendGrid: 'coarse' },
  routeMatchLeanPxRefineCoarse2: { straightFromS6: true, secondBendRefine: 'coordWide', tableSearch: 'lean', refineUnits: 'px', secondBendGrid: 'coarse' },
  // the badge-midpoint rule (2026-10-20): the first bend at B* = tee + 2 x (badge along the tee axis), one route read per cell
  routeMatchBadgeMid: { straightFromS6: true, secondBendRefine: 'coordWide', tableSearch: 'badgeMid', refineUnits: 'px', secondBendGrid: 'coarse' },
  routeMatchBadgeMidPinned: { straightFromS6: true, secondBendRefine: 'coordWide', tableSearch: 'badgeMid', refineUnits: 'px', secondBendGrid: 'coarse', secondBendB1: 'badge', firstBend: 'badge' },
  routeMatchLeanBadgeMid2: { straightFromS6: true, secondBendRefine: 'coordWide', tableSearch: 'lean', refineUnits: 'px', secondBendGrid: 'coarse', secondBendB1: 'badge' },
  routeMatchLeanBadgePrior: { straightFromS6: true, secondBendRefine: 'coordWide', tableSearch: 'lean', refineUnits: 'px', secondBendGrid: 'coarse', firstBend: 'badgePrior' },
  routeMatchBadgeMidPrior: { straightFromS6: true, secondBendRefine: 'coordWide', tableSearch: 'badgeMid', refineUnits: 'px', secondBendGrid: 'coarse', firstBend: 'badgePrior' },
  // heritage S7 bends (2026-10-20, lane heritage7): the pointer plus one fix each, then all three together
  routeMatchLeanPxRefineCoarse2R1St: { straightFromS6: true, secondBendRefine: 'coordWide', tableSearch: 'lean', refineUnits: 'px', secondBendGrid: 'coarse', stationsUnits: 'r1' },
  routeMatchLeanPxRefineCoarse2StraightB2: { straightFromS6: true, secondBendRefine: 'coordWide', tableSearch: 'lean', refineUnits: 'px', secondBendGrid: 'coarse', straightSecondBend: true },
  routeMatchLeanPxRefineCoarse2AxisB1: { straightFromS6: true, secondBendRefine: 'coordWide', tableSearch: 'lean', refineUnits: 'px', secondBendGrid: 'coarse', placeAxis: true },
  routeMatchLeanPxRefineCoarse2TeeAxis: { straightFromS6: true, secondBendRefine: 'coordWide', tableSearch: 'lean', refineUnits: 'px', secondBendGrid: 'coarse', stationsUnits: 'r1', straightSecondBend: true, placeAxis: true },
  // the heritage fixes with the badge-midpoint prior (heritage7 prototype: 18/18 agree, bends 18/1/1), on the lean and the B* tables
  routeMatchTeeAxisBadgePrior: { straightFromS6: true, secondBendRefine: 'coordWide', tableSearch: 'lean', refineUnits: 'px', secondBendGrid: 'coarse', stationsUnits: 'r1', straightSecondBend: true, placeAxis: true, firstBend: 'badgePrior' },
  routeMatchBadgeMidTeeAxisPrior: { straightFromS6: true, secondBendRefine: 'coordWide', tableSearch: 'badgeMid', refineUnits: 'px', secondBendGrid: 'coarse', stationsUnits: 'r1', straightSecondBend: true, placeAxis: true, firstBend: 'badgePrior' },
  // K bends under one fair cost (lane s7bends, 2026-10-21): the accepted rule set with the weakest-leg assignment and K-bend chains
  routeMatchKBends: { straightFromS6: true, secondBendRefine: 'coordWide', tableSearch: 'lean', refineUnits: 'px', secondBendGrid: 'coarse', stationsUnits: 'r1', straightSecondBend: true, placeAxis: true, firstBend: 'badgePrior', kBends: 'bottleneck' },
  // sequencing (Sam, 2026-10-21: "18x18 is craycray"): straight claims first, then each bent hole's neighbourhood (seq.mjs); the
  // table is only the B* / start Parts (tableSearch 'badgeMid': 2 reads per cell), the K-bend search only in the neighbourhoods
  routeMatchKBendsSeq: { straightFromS6: true, secondBendRefine: 'coordWide', tableSearch: 'badgeMid', refineUnits: 'px', secondBendGrid: 'coarse', stationsUnits: 'r1', straightSecondBend: true, placeAxis: true, firstBend: 'badgePrior', kBends: 'seq' },
  // Sam (2026-10-21): "cut at least 80% of the 18x18 cells": the neighbourhood's top 3 ranks first (117/120 true baskets on 6
  // courses), widened to ranks 3-4 for a hole whose assigned route then fails the sensor gate
  routeMatchKBendsSeq3: { straightFromS6: true, secondBendRefine: 'coordWide', tableSearch: 'badgeMid', refineUnits: 'px', secondBendGrid: 'coarse', stationsUnits: 'r1', straightSecondBend: true, placeAxis: true, firstBend: 'badgePrior', kBends: 'seq', seqNeighbours: 3, seqWiden: true },
  // Seq3 x region (lane s7region's sensor): the sequencing's gates by the region, the cell scores by the region, both
  // the search fixed (lane s7bends, 2026-10-21 diagnosis: the edge gate passes Coleto 18's and SeaTac 19's true routes; the chain
  // never proposed them): polish before compare, owned corridors, a price on turning
  routeMatchKBendsSeq3Search: { straightFromS6: true, secondBendRefine: 'coordWide', tableSearch: 'badgeMid', refineUnits: 'px', secondBendGrid: 'coarse', stationsUnits: 'r1', straightSecondBend: true, placeAxis: true, firstBend: 'badgePrior', kBends: 'seq', seqNeighbours: 3, seqWiden: true, seqOwn: true, seqTurnKappa: 10, seqFollow: true },
  // Seq3Search with the follower's resolutions in W (Sam 2026-10-21: "do your search resolution as a multiplier of the hallway width")
  routeMatchKBendsSeq3SearchW: { straightFromS6: true, secondBendRefine: 'coordWide', tableSearch: 'badgeMid', refineUnits: 'px', secondBendGrid: 'coarse', stationsUnits: 'r1', straightSecondBend: true, placeAxis: true, firstBend: 'badgePrior', kBends: 'seq', seqNeighbours: 3, seqWiden: true, seqOwn: true, seqTurnKappa: 10, seqFollow: 'w' },
  // the same, vertex positions every W/16
  routeMatchKBendsSeq3SearchW16: { straightFromS6: true, secondBendRefine: 'coordWide', tableSearch: 'badgeMid', refineUnits: 'px', secondBendGrid: 'coarse', stationsUnits: 'r1', straightSecondBend: true, placeAxis: true, firstBend: 'badgePrior', kBends: 'seq', seqNeighbours: 3, seqWiden: true, seqOwn: true, seqTurnKappa: 10, seqFollow: 'w', followRes: { vertexStepW: 1 / 16 } },
  // SearchW with the K-bend search's hallway steps in W as well
  routeMatchKBendsSeq3SearchWK: { straightFromS6: true, secondBendRefine: 'coordWide', tableSearch: 'badgeMid', refineUnits: 'px', secondBendGrid: 'coarse', stationsUnits: 'r1', straightSecondBend: true, placeAxis: true, firstBend: 'badgePrior', kBends: 'seq', seqNeighbours: 3, seqWiden: true, seqOwn: true, seqTurnKappa: 10, seqFollow: 'w', kUnits: 'w' },
  routeMatchKBendsSeq3RegionGate: { straightFromS6: true, secondBendRefine: 'coordWide', tableSearch: 'badgeMid', refineUnits: 'px', secondBendGrid: 'coarse', stationsUnits: 'r1', straightSecondBend: true, placeAxis: true, firstBend: 'badgePrior', kBends: 'seq', seqNeighbours: 3, seqWiden: true, seqGate: 'region' },
  routeMatchKBendsSeq3RegionScore: { straightFromS6: true, secondBendRefine: 'coordWide', tableSearch: 'badgeMid', refineUnits: 'px', secondBendGrid: 'coarse', stationsUnits: 'r1', straightSecondBend: true, placeAxis: true, firstBend: 'badgePrior', kBends: 'seq', seqNeighbours: 3, seqWiden: true, seqScore: 'region' },
  routeMatchKBendsSeq3RegionWiden: { straightFromS6: true, secondBendRefine: 'coordWide', tableSearch: 'badgeMid', refineUnits: 'px', secondBendGrid: 'coarse', stationsUnits: 'r1', straightSecondBend: true, placeAxis: true, firstBend: 'badgePrior', kBends: 'seq', seqNeighbours: 3, seqWiden: true, seqGate: 'regionWiden' },
  routeMatchKBendsSeq3Region: { straightFromS6: true, secondBendRefine: 'coordWide', tableSearch: 'badgeMid', refineUnits: 'px', secondBendGrid: 'coarse', stationsUnits: 'r1', straightSecondBend: true, placeAxis: true, firstBend: 'badgePrior', kBends: 'seq', seqNeighbours: 3, seqWiden: true, seqGate: 'region', seqScore: 'region' },
  // the pointer read as a REGION (lane s7region, 2026-10-21: shade and sidewalks beside the hallway)
  routeMatchTeeAxisBadgePriorRegion: { straightFromS6: true, secondBendRefine: 'coordWide', tableSearch: 'lean', refineUnits: 'px', secondBendGrid: 'coarse', stationsUnits: 'r1', straightSecondBend: true, placeAxis: true, firstBend: 'badgePrior', sensor: 'region' },
  routeMatchTeeAxisBadgePriorRegionAll: { straightFromS6: true, secondBendRefine: 'coordWide', tableSearch: 'lean', refineUnits: 'px', secondBendGrid: 'coarse', stationsUnits: 'r1', straightSecondBend: true, placeAxis: true, firstBend: 'badgePrior', sensor: 'regionAll' }
});

/**
 * Profiles: named lists of rule sets (Sam, 2026-10-20: "include multiple possibilities, make wide testing easy, then make it
 * easy to select a narrow version"). wide: every rule set (testing); quick: the rule sets on the cheap route tables (the
 * export's default alternatives); any comma list of RULE_SETS names also works.
 */
export const PROFILES = Object.freeze({
  wide: Object.keys(RULE_SETS),
  // moved to wide (2026-10-20), each the same on every dev course as a cheaper rule set kept here: the fast table's two (heritage
  // Fast 12/7/4, FastPxRefine 13/6/4 bends; their table 15 s of golden's 27 s) and the lean table's fine second-bend grid
  // (Lean = LeanCoarse2, LeanPxRefine = LeanPxRefineCoarse2 on all six; the fine scan 8x the routes, 11 s of golden's 20 s)
  quick: ['routeMatchLeanCoarse2', 'routeMatchLeanPxRefineCoarse2', 'routeMatchTeeAxisBadgePrior', 'routeMatchBadgeMidTeeAxisPrior', 'routeMatchKBendsSeq3SearchW']
});
/**
 * The S7 default (Sam, 2026-10-21: "yes make it default and rerun validation"): the pointer vote's first tie-break. It ties
 * the faster rule sets on every judged dev course (agreement and bends) and gets Sam's six validation holes right (Beaver
 * 4/19, Coleto 10/11/18, SeaTac 19), which they do not; a variant that beats it on a judged course still wins.
 */
export const S7_DEFAULT = 'routeMatchKBendsSeq3SearchW';
/**
 * The S7 variants `pxc state --retest` runs: the quick rule sets plus the pinned prototype (1 ms). The old tracers (badgeOnly,
 * endpoints, s3first*: 2-8 min each per course, beaten on every judged course) and the slow rule sets (px table, dense second
 * bend) stay one command away: node ports/s7trace/sweep.mjs --profile wide.
 */
export const RETEST_S7_VARIANTS = Object.freeze(['pinned', ...PROFILES.quick]);
export const profileOf = (name) => (PROFILES[name] ?? String(name ?? '').split(',').map((s) => s.trim()).filter((s) => s in RULE_SETS));

export function routeMatchOf(table, S, starts, { secondBends = true, straight: verdicts = undefined, steps = MATCH_STEPS, rules = MATCH_RULES, regionSteps = null } = {}) {
  const W = table.widthPx, holes = table.holes;
  if (!(W > 0) || !holes.length) return { holes: {}, assignment: [], widthPx: W ?? null, condition: 'no hallway width or no holes in the route table' };
  const kb = rules.kBends === 'bottleneck', seq = rules.kBends === 'seq', violated = [];
  // kBends: every cell's K <= 1 routes under the weakest-leg cost (one profiled call per cell), else the table's contrast
  const startOf = (hole) => starts.holes.find((h) => String(h.hole) === String(hole));
  const legsOf = (Sc, V, Wd) => steps.kLegs(Sc, V, Wd), legsMany = (Sc, Vs, Wd) => steps.kLegsMany(Sc, Vs, Wd);
  const kCells = kb ? holes.map((hole, i) => table.baskets.map((b, k) => { const kc = kCellAt(S, startOf(hole), b.point ?? table.rows[i].cells[k].contrast.verts.at(-1), W, { legsOf, legsMany }); if (kc.violation) violated.push({ ...kc.violation, hole, basket: k }); return kc; })) : null;
  const sq = seq ? seqAssign({ table, holes, S, W, startOf, verdicts, steps, legsOf, legsMany, rules, regionSteps }) : null;
  const score = sq ? sq.score : kb ? kCells.map((row, i) => row.map((x, k) => (x.best.bottleneck === null ? MATCH.noReadingLum : x.best.bottleneck) + (table.onAxisPrior[i]?.[k] ?? 0)))
    : table.contrastMatrix.map((row, i) => row.map((c, k) => (c === null ? MATCH.noReadingLum : c) + (table.onAxisPrior[i]?.[k] ?? 0)));
  const pairs = sq ? sq.pairs : assignMinCost(score.map((row) => row.map((v) => -v)));
  const out = {}, assignment = [];
  for (const [i, k] of pairs) {
    const hole = holes[i], cell = table.rows[i].cells[k], start = starts.holes.find((h) => String(h.hole) === String(hole));
    const sorted = [...score[i]].sort((a, b) => b - a);
    const E = table.baskets[k].point ?? cell.contrast.verts.at(-1);
    let V = (sq ? sq.route[hole] : kb ? kCells[i][k].best.verts : cell.contrast.verts).map((v) => v.slice());
    const s6Straight = rules.straightFromS6 && verdicts && verdicts[hole] === 'straight';
    // firstBend 'badge': a route through B* keeps it (no refine slide; the bend placement below leaves it where it is)
    const pinB = rules.firstBend === 'badge' && V.length === 3 ? badgeMidOf(start) : null;
    if (V.length === 3 && !s6Straight && !pinB && !kb && !sq) V = steps.refine(S, V, W, start.u, rules);
    const straight = steps.sensor(S, [start.S, E], W);
    let rec;
    if (s6Straight) {
      rec = { verts: [start.S, E], how: `straight: S6 reads the hole straight (rule straightFromS6); sensor ${straight.passFrac.toFixed(2)} on ${straight.stations} st`, sensor: straight };
    } else if (straight.stations >= minStationsOf(S, rules) && straight.passFrac >= MATCH.tau) {
      rec = { verts: [start.S, E], how: `straight: sensor ${straight.passFrac.toFixed(2)} on ${straight.stations} st`, sensor: straight };
    } else {
      const r1 = steps.sensor(S, V, W);
      rec = { verts: V, how: `contrast route (${V.length - 2} bends): sensor ${r1.passFrac.toFixed(2)}; straight read ${straight.passFrac.toFixed(2)}`, sensor: r1 };
      // straightSecondBend: a straight contrast route the sensor rejects seeds B1 on the tee axis 0.5 W past the badge
      const seed = V.length === 2 && rules.straightSecondBend ? (() => { const t = start.badgeAlongPx + ROUTE.bendFromBadgeW * W; return [start.S, [start.S[0] + start.u[0] * t, start.S[1] + start.u[1] * t], E]; })() : V;
      if (secondBends && seed.length === 3 && r1.passFrac < MATCH.tau) {
        const b2 = secondBend(S, start, seed, E, W, r1.passFrac, rules, steps);
        rec = b2.accepted ? { verts: b2.verts, how: `2-bend accepted: ${b2.note}`, sensor: b2.sensor, secondBend: true } : { ...rec, how: `${rec.how}; 2-bend rejected: ${b2.note}` };
      }
    }
    const before = rec.verts;
    if (verdicts !== undefined && !s6Straight) {
      if (verdicts === null) rec = { ...rec, bendsRefined: { taken: false, why: 'no S6 straight verdict on record: bend placement not run' } };
      else {
        // rule-set options of the placement, passed only when set (the recorded rule's calls keep their arguments)
        const placeOpts = { ...(rules.stationsUnits === 'r1' ? { minStations: minStationsOf(S, rules) } : {}), ...(rules.placeAxis ? { axis: start.u } : {}) };
        let r = Object.keys(placeOpts).length ? steps.placeBends(S, rec.verts, W, verdicts[hole] === 'straight', placeOpts) : steps.placeBends(S, rec.verts, W, verdicts[hole] === 'straight');
        if (r.assumptions) violated.push(...r.assumptions.map((v) => ({ ...v, hole, step: 'bend placement' })));
        if (pinB && r.taken && rec.verts.length >= 3 && r.verts.length === rec.verts.length) r = { ...r, verts: [r.verts[0], rec.verts[1], ...r.verts.slice(2)], why: `${r.why}; the first bend kept at B* (rule firstBend badge)` };
        rec = { ...rec, verts: r.verts, how: `${rec.how} | bends ${r.taken ? 'placed' : 'kept'}: ${r.why}`, sensor: r.taken ? steps.sensor(S, r.verts, W) : rec.sensor,
          bendsRefined: { taken: r.taken, why: r.why, bendsBefore: r.K0, bendsAfter: r.taken ? r.K1 : r.K0, samples: r.samples ?? null, before: before.slice(1, -1) } };
      }
    }
    if (rules.firstBend === 'badgePrior' && rec.verts.length >= 3) {
      // the badge-midpoint prior: the first bend moves to B* when the sensor reads no worse there (within MATCH.priorDrop, on
      // >= the rule set's station floor, minStationsOf); the route's other vertices stay
      const Vb = [rec.verts[0], badgeMidOf(start), ...rec.verts.slice(2)], rb = steps.sensor(S, Vb, W);
      if (rb.stations >= minStationsOf(S, rules) && rb.passFrac >= rec.sensor.passFrac - MATCH.priorDrop)
        rec = { ...rec, verts: Vb, sensor: rb, how: `${rec.how} | first bend at B* (badge-midpoint prior): sensor ${rec.sensor.passFrac.toFixed(2)} -> ${rb.passFrac.toFixed(2)} on ${rb.stations} st` };
    }
    if (sq) {
      // the ring rule holds for the final route too: a placement or prior move that enters another basket's ring is undone
      const foreign = foreignRingsOf(start, table.baskets.map((b, q) => b.point ?? table.rows[i].cells[q].contrast.verts.at(-1)), k, S.R1);
      const crossing = (Vx) => { for (let q = 0; q + 1 < Vx.length; q++) { const c = ringCrossed(Vx[q], Vx[q + 1], foreign); if (c >= 0) return foreign.idx[c]; } return -1; };
      const c = crossing(rec.verts);
      if (c >= 0 && crossing(V) < 0) rec = { ...rec, verts: V, sensor: steps.sensor(S, V, W), how: `${rec.how} | undone: the placed route enters ${table.baskets[c].name}'s ring (no passing through baskets)` };
    }
    out[hole] = { end: k, verts: rec.verts, how: rec.how, polyScore: steps.contrast(S, rec.verts, W), bendsRefined: rec.bendsRefined ?? null, legs: [{ passFrac: rec.sensor.passFrac }],
      pair: { basket: k, scoreLum: score[i][k], marginLum: sorted[0] === score[i][k] ? sorted[0] - (sorted[1] ?? sorted[0]) : score[i][k] - sorted[0], onAxisPrior: table.onAxisPrior[i]?.[k] ?? 0 } };
    assignment.push({ hole, basket: k, scoreLum: score[i][k], bends: rec.verts.length - 2, sensor: rec.sensor.passFrac, stations: rec.sensor.stations });
  }
  if (kb && secondBends) kBendsPass({ out, assignment, holes, table, score, kCells, S, W, startOf, steps, rules, legsOf });
  if (sq) for (const h of Object.keys(out)) out[h] = { ...out[h], how: `${sq.why[h]} | ${out[h].how}`, seq: sq.record[h] ?? null };
  if (sq?.violations?.length) violated.push(...sq.violations);
  // the stated assumptions (fg/assumptions.mjs) a search of this solve hit, each with what its widening found
  return { holes: out, assignment, widthPx: W, ...(sq ? { sequencing: sq.summary } : {}), ...(violated.length ? { assumptions: violated } : {}) };
}

/**
 * kBends 'seq' (seq.mjs): straight holes claim their basket first; each other hole scores only its neighbourhood (SEQ.neighbours
 * unclaimed forward BasketPoints by joint rank) under the weakest-leg cost: its K <= 1 route (kbends.mjs kCellAt), and the K-bend
 * chain when the sensor rejects that route; one-to-one over those cells. A hole left without a basket is assigned among the
 * baskets still free by its K <= 1 routes. -> { pairs, score, route: { [hole]: verts }, why, record, summary }
 */
function seqAssign({ table, holes, S, W, startOf, verdicts, steps, legsOf, legsMany, rules = MATCH_RULES, regionSteps = null }) {
  const violations = [];   // the stated assumptions (fg/assumptions.mjs) this sequencing's searches hit
  // seqGate 'region': the sequencing's sensor gates (chain trigger, chain vs K <= 1, the per-bend gain, the widening) read the
  // hallway REGION passFrac (regionSpace.mjs); seqScore 'region': each cell is assigned by the region support of its route.
  // Bends are always found and placed on edges (the region support is flat along a bend axis)
  const rg = (rules.seqGate === 'region' || rules.seqGate === 'regionWiden' || rules.seqScore === 'region') && regionSteps ? regionSteps : null;
  // seqGate 'regionWiden': only the widening gate reads the region (the chain gates stay on edges)
  const widenGateOf = (V) => (rules.seqGate === 'regionWiden' && rg ? rg.sensor(S, V, W).passFrac : gateOf(V));
  const gateOf = (V) => (rules.seqGate === 'region' && rg ? rg.sensor(S, V, W) : steps.sensor(S, V, W)).passFrac;
  const regionScore = rules.seqScore === 'region' && rg;
  const kappa = rules.seqTurnKappa ?? 0;
  const unitPx = rules.kUnits === 'w' ? W / KBENDS.goldenWPerR1 : null;   // kUnits 'w': the K-bend search's hallway steps in W
  const valueOf = (best) => (!best ? -Infinity : regionScore ? rg.contrast(S, best.verts, W) : best.bottleneck - turnCostOf(best.verts, kappa));
  const bp = table.baskets.map((b, k) => b.point ?? table.rows[0].cells[k].contrast.verts.at(-1)), starts = holes.map((h) => startOf(h));
  const claims = straightClaimsOf(starts, bp, S.R1, verdicts ?? null, []);
  const nb = neighbourhoodsOf(starts.filter((s) => claims.claims[s.hole] === undefined), bp, claims.claimed);
  // seqNeighbours: the ranks scored first (default all SEQ.neighbours); seqWiden: a hole whose assigned route fails the sensor
  // gate re-solves with the rest of its ranks from the unclaimed pool (S1-S3 a fast first pass, S4 recovers)
  const first = Math.min(rules.seqNeighbours ?? SEQ.neighbours, SEQ.neighbours);
  const score = holes.map(() => bp.map(() => -Infinity)), route = {}, why = {}, record = {}, cells = {}, pend = [], cap = holes.map(() => -Infinity), rejectedOf = {};
  const addCell = (h, i, c) => {
    const k = c.basket, foreign = foreignRingsOf(starts[i], bp, k, S.R1), kc = kCellAt(S, starts[i], bp[k], W, { legsMany, foreign, unitPx });
    if (kc.violation) violations.push({ ...kc.violation, hole: holes[i], basket: k });
    if (kc.firstCap > cap[i]) cap[i] = kc.firstCap;
    const s1 = kc.best.bottleneck === null ? null : gateOf(kc.best.verts);
    const cell = { i, k, h, foreign, kc, s1, best: kc.best.bottleneck === null ? null : kc.best, pending: s1 === null || s1 < MATCH.tau, owned: ownedFor(h) };
    pend.push(cell); score[i][k] = valueOf(cell.best);
    record[h].evaluated.push(k);
  };
  // ownCorridors: confirmed routes own their corridors (state passed forward, the pads-owned pattern): the straight claims from the
  // start, then (after the first solve) every hole whose assigned route passes the sensor gate
  const owned = new Map();
  if (rules.seqOwn) holes.forEach((h, i) => { if (claims.claims[h] !== undefined) owned.set(h, [starts[i].S, bp[claims.claims[h]]]); });
  const ownedFor = (h) => (rules.seqOwn ? [...owned].filter(([o]) => o !== h).map(([, V]) => V) : null);
  holes.forEach((h, i) => {
    if (claims.claims[h] !== undefined) { const k = claims.claims[h]; score[i][k] = 0; route[`${h}@${k}`] = [starts[i].S, bp[k]]; why[h] = claims.rows.find((r) => r.hole === h).why; record[h] = { claimed: k }; return; }
    const cands = nb[h] ?? [];
    record[h] = { candidates: cands.map((c) => ({ basket: c.basket, rank: c.rank, fwdRank: c.fwdRank, nextRank: c.nextRank })), evaluated: [] };
    for (const c of cands.slice(0, first)) addCell(h, i, c);
    // the hole's cap: no route of it reads above its best first leg (tee cap -> B1 on the axis, never split), B* included
    const Bs = badgeMidOf(starts[i]);
    if (Bs[0] >= 0 && Bs[1] >= 0 && Bs[0] < S.W && Bs[1] < S.H) { const c0 = legsMany(S, [[starts[i].S, Bs]], W)[0][0]; if (c0 !== null && c0 > cap[i]) cap[i] = c0; }
    record[h].rejected = rejectedOf[h] = [];
  });
  // lazy chains, priced by the assignment's duals: a cell's K-bend chain is searched when the cell is assigned (its route needs it)
  // or when its hole's cap beats the cell's dual price (only then can a chain move the assignment); repeated until none is left.
  // Exact when the cap bounds every chain of the hole (it is the best first leg the axis search read)
  // the chain replaces the K <= 1 route when its weakest leg AND its sensor reading are higher (a bend hidden under a sprite has
  // unread legs: the weakest leg alone cannot place it). endR1: the coarse pass ranks cells; the assigned ones are re-run fine
  const chainOf = (cell, endR1, gridR1) => {
    const ch = kChainAt(S, starts[cell.i], bp[cell.k], W, { legsMany, one: cell.kc.one, foreign: cell.foreign, sensorOf: gateOf, endR1, gridR1, unitPx,
      ...(rules.seqPolish ? { polishEach: true, firstCap: cap[cell.i] } : {}), ...(cell.owned?.length ? { owned: cell.owned } : {}), ...(kappa ? { turnKappa: kappa } : {}) });
    const k1 = cell.kc.best.bottleneck === null ? null : cell.kc.best;
    const v = (r) => r.bottleneck - turnCostOf(r.verts, kappa);
    const takeChain = ch && ch.bottleneck !== null && (!k1 || (v(ch) > v(k1) && gateOf(ch.verts) > cell.s1));
    // turning decided: the price of turning chose a different route than the weakest leg alone would have
    cell.turnNote = kappa ? (ch?.turnDecided ? `turning price chose ${ch.verts.length - 2} bends (turns ${ch.turnsDeg.join('/')} deg) over ${ch.turnDecided.rawBends} bends (turns ${ch.turnDecided.rawTurnsDeg.join('/')} deg, weakest leg ${ch.turnDecided.rawBottleneck.toFixed(1)} lum)`
      : ch && k1 && ch.bottleneck > k1.bottleneck && !takeChain && gateOf(ch.verts) > cell.s1 ? `turning price kept the K <= 1 route over a ${ch.verts.length - 2}-bend chain (turns ${ch.turnsDeg.join('/')} deg)` : null) : null;
    return takeChain ? ch : k1;
  };
  const settle = (cell) => {
    if (cell.pending) { cell.best = chainOf(cell, KBENDS.coarseEndR1, KBENDS.coarseGridR1); cell.pending = false; cell.coarse = true; chainsRun++; }
    score[cell.i][cell.k] = valueOf(cell.best);
  };
  let chainsRun = 0, rounds = 0, fineRuns = 0;
  const assignNow = () => assignWithDuals(score.map((row) => row.map((v) => (Number.isFinite(v) ? -v : Infinity))));
  const solve = () => {
    for (;;) {
      rounds++;
      const A = assignNow(), assigned = new Set(A.pairs.map(([i, k]) => `${i}@${k}`));
      // (seqScore 'region': the first-leg cap bounds edge readings, not region support: no cell is priced out)
      const todo = pend.filter((c) => c.pending && (assigned.has(`${c.i}@${c.k}`) || regionScore || cap[c.i] > A.price(c.i, c.k) + 1e-9));
      if (!todo.length) break;
      for (const c of todo) settle(c);
    }
    // the assigned cells' routes at full resolution (the same search to refineEndR1): the coarse pass only ranked them
    const A = assignNow(), on = new Set(A.pairs.map(([i, k]) => `${i}@${k}`));
    for (const cell of pend) if (cell.coarse && on.has(`${cell.i}@${cell.k}`)) { cell.best = chainOf(cell, KBENDS.refineEndR1, KBENDS.gridR1); cell.coarse = false; fineRuns++; score[cell.i][cell.k] = valueOf(cell.best); }
    return A;
  };
  const A0 = solve(), widened = [];
  if (rules.seqWiden && first < SEQ.neighbours) {
    const byHole = new Map(A0.pairs.map(([i, k]) => [i, k]));
    holes.forEach((h, i) => {
      if (claims.claims[h] !== undefined) return;
      const k = byHole.get(i), cell = k === undefined ? null : pend.find((c) => c.i === i && c.k === k);
      const reading = cell?.best ? widenGateOf(cell.best.verts) : null;
      if (reading !== null && reading >= MATCH.tau) return;
      const more = (nb[h] ?? []).slice(first);
      if (!more.length) return;
      for (const c of more) addCell(h, i, c);
      widened.push(h); record[h].widened = { reading, ranks: more.map((c) => c.rank) };
    });
    if (widened.length) solve();
  }
  let reowned = [];
  if (rules.seqOwn) {
    // the confirmed holes (assigned route passes the gate) own their corridors; the others re-search their chains around them
    const A = assignNow(), byHole = new Map(A.pairs.map(([i, k]) => [i, k])), unconfirmed = [];
    holes.forEach((h, i) => {
      if (claims.claims[h] !== undefined) return;
      const k = byHole.get(i), cell = k === undefined ? null : pend.find((c) => c.i === i && c.k === k);
      if (cell?.best && gateOf(cell.best.verts) >= MATCH.tau) owned.set(h, cell.best.verts); else unconfirmed.push(i);
    });
    for (const c of pend) if (unconfirmed.includes(c.i) && (c.s1 === null || c.s1 < MATCH.tau)) {
      c.owned = ownedFor(c.h); c.best = c.kc.best.bottleneck === null ? null : c.kc.best; c.pending = true; c.coarse = false; score[c.i][c.k] = valueOf(c.best);
    }
    reowned = unconfirmed.map((i) => holes[i]);
    if (reowned.length) solve();
  }
  const followed = [];
  if (rules.seqFollow) {
    // ride the ribbon (the S7 doctrine: "find the path signal and ride it"): every bent hole whose assigned route still fails
    // the gate runs the hallway follower from its tee cap along the tee axis; a route that reaches a BasketPoint competes for
    // that cell under the same rules as a chain (no foreign C1 disc, no owned corridor, value and per-bend sensor gain)
    const A = assignNow(), byHole = new Map(A.pairs.map(([i, k]) => [i, k]));
    // the follower's steps, each a profiled store call: the prototype's px resolutions, or (seqFollow 'w') fractions of W
    const res0 = { ...FOLLOW_W, ...(rules.followRes ?? {}) };
    const followStepsOf = (res) => (rules.seqFollow === 'w' ? {
      runEnd: (Sc, O, phi, Wd, t0) => steps.followRunEndW(Sc, O, phi, Wd, t0, res), closeOnBp: (Sc, O, phi, Wd, tEnd, used) => steps.followCloseOnBpW(Sc, O, phi, Wd, tEnd, used, res),
      onLeg: (Sc, O, phi, Wd, tEnd, used) => bpOnLegW(Sc, O, phi, Wd, tEnd, used, res),
      findBend: (Sc, O, phi, Wd, tEnd, selfC, tees) => findBendW(Sc, O, phi, Wd, tEnd, selfC, tees, (Sx, Ox, px, Wx, tv, sC, tz, psis) => steps.followBendAtW(Sx, Ox, px, Wx, tv, sC, tz, psis, res), res) } : {
      runEnd: (Sc, O, phi, Wd, t0) => steps.followRunEnd(Sc, O, phi, Wd, t0), closeOnBp: (Sc, O, phi, Wd, tEnd, used) => steps.followCloseOnBp(Sc, O, phi, Wd, tEnd, used),
      findBendAt: (Sc, O, phi, Wd, tv, selfC, tees) => steps.followBendAt(Sc, O, phi, Wd, tv, selfC, tees) });
    holes.forEach((h, i) => {
      if (claims.claims[h] !== undefined) return;
      const k0 = byHole.get(i), cur = k0 === undefined ? null : pend.find((c) => c.i === i && c.k === k0);
      if (cur?.best && gateOf(cur.best.verts) >= MATCH.tau) return;
      const st = starts[i], follow = (res) => followHallway(S, st.S, Math.atan2(st.u[1], st.u[0]), W, { maxLegs: SEQ.followLegs, steps: followStepsOf(res) });
      // the follower in W closes on BasketPoints within the CLOSE_ON_BP_REACH assumption: a trace that ends without one is a
      // violation, and it re-traces with the reach widened (x2, up to the image diagonal); the px follower keeps its recorded 8 W
      let fr;
      if (rules.seqFollow === 'w') {
        const u = underAssumption(CLOSE_ON_BP_REACH, { unitPx: S.R1, limitPx: Math.hypot(S.W, S.H), detail: { hole: h, step: 'hallway follower' },
          run: (b) => { const t = follow({ ...res0, closeReachR1: b / S.R1 }); return { result: t, found: t.end !== null && t.end !== undefined, atEdge: false, at: t.end ?? null }; } });
        fr = u.result; if (u.violation) violations.push(u.violation);
      } else fr = follow(res0);
      if (fr.end === null || fr.end === undefined) { record[h].follow = { reached: null, why: 'the follower lost the ribbon' }; return; }
      const k = fr.end, V = fr.verts, foreign = foreignRingsOf(st, bp, k, S.R1), ow = ownedFor(h);
      const crosses = V.slice(1).some((b, q) => ringCrossed(V[q], b, foreign) >= 0), along = ow && V.slice(1).some((b, q) => legRunsAlong(V[q], b, ow, W));
      if (claims.claimed.includes(k) || crosses || along) { record[h].follow = { reached: k, why: claims.claimed.includes(k) ? 'its basket is claimed straight' : crosses ? 'it enters a foreign C1 disc' : 'it runs along an owned corridor' }; return; }
      let cell = pend.find((c) => c.i === i && c.k === k);
      if (!cell) { addCell(h, i, { basket: k }); cell = pend.at(-1); }   // the follower widens the neighbourhood to the basket it reached
      // polished on its weakest leg before it competes: the follower's bends sit where its edge runs ended, and an unpolished last
      // leg into the rings reads low (SeaTac 19: 7.6 lum unpolished, 43.9 polished). Chains are not polished per candidate: that
      // moved dev routes (golden 18 gained a bend, heritage 9 left Sam's corridor; lane s7bends ablation)
      const legs0 = legsMany(S, [V], W)[0], fb0 = { verts: V, legs: legs0, bottleneck: bottleneckOf(legs0) };
      const fb = fb0.bottleneck !== null ? polishAt(S, fb0, W, { legsMany, start: st, foreign, owned: ow, unitPx }) : fb0;
      const sf = gateOf(fb.verts), k1 = cell.kc.best.bottleneck === null ? null : cell.kc.best;
      const vf = fb.bottleneck === null ? -Infinity : fb.bottleneck - turnCostOf(fb.verts, kappa), vc = cell.best ? cell.best.bottleneck - turnCostOf(cell.best.verts, kappa) : -Infinity;
      const gainOk = !k1 || sf > (cell.s1 ?? 0) + BENDS_GATE_GAIN * (fb.verts.length - k1.verts.length);
      const win = fb.bottleneck !== null && vf > vc && gainOk;
      record[h].follow = { reached: k, bends: V.length - 2, weakestLegLum: fb.bottleneck === null ? null : +fb.bottleneck.toFixed(1), sensor: +sf.toFixed(2), taken: win };
      if (win) { cell.best = fb; cell.pending = false; cell.coarse = false; score[i][k] = valueOf(fb); followed.push(h); }
    });
    if (followed.length) solve();
  }
  for (const cell of pend) {
    const { i, k, h, foreign, kc } = cell;
    if (!cell.best && cell.pending) { (record[h].pricedOut ??= []).push({ basket: k, capLum: +cap[i].toFixed(1) }); score[i][k] = -Infinity; continue; }
    if (!cell.best) { const q = kc.rejected ? kc.rejected.crosses : null; rejectedOf[h].push({ basket: k, crosses: q !== null ? foreign.idx[q] : null, clearanceR1: q !== null ? +(legClearance(starts[i].S, bp[k], foreign.pts[q]) / S.R1).toFixed(2) : null }); score[i][k] = -Infinity; continue; }
    route[`${h}@${k}`] = cell.best.verts; cells[`${h}@${k}`] = cell.best;
    if (foreign.exempt.length) (record[h].exempt ??= {})[k] = foreign.exempt;
  }
  holes.forEach((h) => {
    if (claims.claims[h] !== undefined) return;
    const cands = (nb[h] ?? []).filter((c) => record[h].evaluated.includes(c.basket)), rejected = rejectedOf[h], nm = (k) => table.baskets[k]?.name ?? `BP${k}`;
    const po = record[h].pricedOut ?? [], wd = record[h].widened;
    why[h] = `neighbourhood (joint rank of distance from the tee and from tee ${Number(h) + 1}): ${cands.map((c) => `${nm(c.basket)} r${c.rank}`).join(', ')}${wd ? ` (widened to ranks ${wd.ranks.join(', ')}: the first ${first} ranks' assigned route read ${wd.reading === null ? 'no route' : wd.reading.toFixed(2)} on the ${(rules.seqGate === 'region' || rules.seqGate === 'regionWiden') && rg ? 'region' : 'edge'} sensor, below ${MATCH.tau})` : ''}${rules.seqOwn && reowned.includes(h) ? `; chains re-searched around the corridors of the ${owned.size} confirmed holes (${[...owned.keys()].join(', ')})` : ''}${pend.filter((c) => c.h === h && c.turnNote).map((c) => `; ${nm(c.k)}: ${c.turnNote}`).join('')}${record[h].follow ? `; hallway follower: ${record[h].follow.reached === null ? record[h].follow.why : `${nm(record[h].follow.reached)}${record[h].follow.why ? ` rejected (${record[h].follow.why})` : `, ${record[h].follow.bends} bends, weakest leg ${record[h].follow.weakestLegLum} lum, sensor ${record[h].follow.sensor}${record[h].follow.taken ? ': taken' : ': kept out'}`}`}` : ''}${po.length ? `; chain not searched (priced out: no route of this hole reads above its best first leg, ${po[0].capLum} lum, which is below the cell's price): ${po.map((x) => nm(x.basket)).join(', ')}` : ''}${rejected.length ? `; rejected (every route enters another basket's C1 disc, < 1 R1): ${rejected.map((x) => `${nm(x.basket)}${x.crosses !== null ? ` (the straight route passes ${nm(x.crosses)} at ${x.clearanceR1} R1)` : ''}`).join(', ')}` : ''}`;
  });
  let pairs = assignMinCost(score.map((row) => row.map((v) => (Number.isFinite(v) ? -v : Infinity))));
  // a hole the neighbourhoods leave without a basket: assigned among the free baskets by its K <= 1 routes
  const usedH = new Set(pairs.map(([i]) => i)), usedK = new Set(pairs.map(([, k]) => k)), leftH = holes.map((_, i) => i).filter((i) => !usedH.has(i)), leftK = bp.map((_, k) => k).filter((k) => !usedK.has(k));
  if (leftH.length && leftK.length) {
    const sub = leftH.map((i) => leftK.map((k) => { const kc = kCellAt(S, starts[i], bp[k], W, { legsMany, foreign: foreignRingsOf(starts[i], bp, k, S.R1), unitPx }); if (kc.violation) violations.push({ ...kc.violation, hole: holes[i], basket: k }); route[`${holes[i]}@${k}`] = kc.best.verts; return kc.best.bottleneck ?? -Infinity; }));
    for (const [a, b] of assignMinCost(sub.map((r) => r.map((v) => (Number.isFinite(v) ? -v : Infinity))))) { const i = leftH[a], k = leftK[b]; score[i][k] = sub[a][b]; pairs.push([i, k]); why[holes[i]] = `${why[holes[i]]}; none left in the neighbourhood: assigned among the free baskets by K <= 1 routes`; }
    pairs = pairs.sort((x, y) => x[0] - y[0]);
  }
  const routeOf = Object.fromEntries(pairs.map(([i, k]) => [holes[i], route[`${holes[i]}@${k}`]]));
  return { pairs, score: score.map((r) => r.map((v) => (Number.isFinite(v) ? v : MATCH.noReadingLum))), route: routeOf, why, record, violations,
    summary: { straightClaims: Object.keys(claims.claims).length, bentHoles: Object.keys(nb).length, cellsEvaluated: pend.length, cellsFullTable: holes.length * bp.length, neighbours: first, widened, ...(rules.seqOwn ? { ownedHoles: [...owned.keys()], reownedHoles: reowned } : {}), ...(rules.seqFollow ? { followed } : {}), cellsScored: Object.keys(cells).length, chainsSearched: chainsRun, fineReruns: fineRuns, pricingRounds: rounds, chains: Object.values(cells).filter((c) => c.verts.length >= 4).length } };
}

/**
 * kBends, the iterated assignment: the holes whose route the sensor still rejects (< tau, or fewer stations than the floor) and
 * the baskets they hold are re-solved together. Each (hole, basket) of that sub-problem is scored by its best route under the
 * weakest-leg cost, K <= 1 (with the on-axis prior, as in the first assignment) or the K-bend chain (kbends.mjs kChainAt); the
 * sub-problem is assigned one to one; a hole takes the chain when the chain's weakest leg AND its sensor reading beat the
 * route it has (a hole the sensor confirms is never reopened: the course's hallway network cannot pull it onto another
 * hole's corridor). Mutates out / assignment in place (the caller's records).
 */
function kBendsPass({ out, assignment, holes, table, score, kCells, S, W, startOf, steps, rules, legsOf }) {
  const floor = minStationsOf(S, rules), U = assignment.filter((a) => a.sensor < MATCH.tau || a.stations < floor);
  if (!U.length) return;
  const iOf = (hole) => holes.findIndex((h) => String(h) === String(hole)), cols = U.map((a) => a.basket);
  const cell = U.map((a) => cols.map((k) => {
    const i = iOf(a.hole), start = startOf(a.hole), E = table.baskets[k].point, ch = kChainAt(S, start, E, W, { legsOf, one: kCells[i][k].one });
    const k1 = score[i][k], kc = ch && ch.bottleneck !== null ? ch.bottleneck : -Infinity;
    return { chain: ch, value: Math.max(k1, kc) };
  }));
  const pairs = assignMinCost(cell.map((row) => row.map((c) => -c.value)));
  for (const [u, c] of pairs) {
    const a = U[u], k = cols[c], i = iOf(a.hole), ch = cell[u][c].chain, rec = out[a.hole];
    if (!ch || ch.bottleneck === null) continue;
    const moved = k !== a.basket, cur = moved ? null : steps.kLegs(S, rec.verts, W), curB = cur ? cur.reduce((m, x) => (x !== null && (m === null || x < m) ? x : m), null) : null;
    const rc = steps.sensor(S, ch.verts, W), curSensor = moved ? -Infinity : rec.legs[0].passFrac;
    const better = (moved ? ch.bottleneck >= score[i][k] - (table.onAxisPrior[i]?.[k] ?? 0) : curB === null || ch.bottleneck > curB) && rc.passFrac > curSensor;
    if (!moved && !better) { out[a.hole] = { ...rec, how: `${rec.how} | K-bend pass: chain kept out (weakest leg ${ch.bottleneck.toFixed(1)} vs ${curB === null ? 'none' : curB.toFixed(1)} lum, sensor ${rc.passFrac.toFixed(2)} vs ${curSensor.toFixed(2)})` }; continue; }
    const kv = kCells[i][k].best, use = better ? ch.verts : kv.verts, us = better ? rc : steps.sensor(S, kv.verts, W);
    const sorted = [...score[i]].sort((x, y) => y - x);
    out[a.hole] = { end: k, verts: use, how: `K-bend pass (${U.length} unconfirmed holes re-solved together): ${moved ? `basket ${a.basket} -> ${k}; ` : ''}${better ? `K-bend chain, ${ch.verts.length - 2} bends: weakest leg ${ch.bottleneck.toFixed(1)} lum, sensor ${rc.passFrac.toFixed(2)} on ${rc.stations} st` : `K <= 1 route: weakest leg ${kv.bottleneck?.toFixed(1)} lum`}`,
      polyScore: steps.contrast(S, use, W), bendsRefined: null, legs: [{ passFrac: us.passFrac }],
      pair: { basket: k, scoreLum: score[i][k], marginLum: score[i][k] - sorted[0], onAxisPrior: table.onAxisPrior[i]?.[k] ?? 0 } };
    Object.assign(a, { basket: k, scoreLum: score[i][k], bends: use.length - 2, sensor: us.passFrac, stations: us.stations });
  }
}
