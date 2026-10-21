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
import { assignMinCost as assignByColumn } from '../lib/assign.mjs';
import { refineVertices, arange } from '../s7trace/hallway.mjs';
import { refineBendsOf } from './bends.mjs';

export const MATCH = Object.freeze({
  tau: 0.75,                 // sensor reading at which a route counts as hallway
  minStations: ROUTE.minStations,
  // rule-set option stationsUnits 'r1': the same floor as a map-scaled length. Stations are 1 px apart, so a station count is
  // a visible ribbon length in px (map-scaled): 20 px on golden (R1 44.5 px, where match2.py was recorded) is 0.449 R1, rounded
  // down so golden's floor stays 20 stations
  minStationsR1: 0.449,
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

/** Rectangular min-cost assignment (Hungarian; Infinity = forbidden). -> [[row, col], ...] in row order (the algorithm is ports/lib/assign.mjs) */
export const assignMinCost = (cost) => assignByColumn(cost).sort((a, b) => a[0] - b[0]);

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
  contrast: (S, V, W) => contrast(S, V, W)
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
  routeMatchBadgeMidTeeAxisPrior: { straightFromS6: true, secondBendRefine: 'coordWide', tableSearch: 'badgeMid', refineUnits: 'px', secondBendGrid: 'coarse', stationsUnits: 'r1', straightSecondBend: true, placeAxis: true, firstBend: 'badgePrior' }
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
  quick: ['routeMatchLeanCoarse2', 'routeMatchLeanPxRefineCoarse2', 'routeMatchTeeAxisBadgePrior', 'routeMatchBadgeMidTeeAxisPrior']
});
/**
 * The S7 variants `pxc state --retest` runs: the quick rule sets plus the pinned prototype (1 ms). The old tracers (badgeOnly,
 * endpoints, s3first*: 2-8 min each per course, beaten on every judged course) and the slow rule sets (px table, dense second
 * bend) stay one command away: node ports/s7trace/sweep.mjs --profile wide.
 */
export const RETEST_S7_VARIANTS = Object.freeze(['pinned', ...PROFILES.quick]);
export const profileOf = (name) => (PROFILES[name] ?? String(name ?? '').split(',').map((s) => s.trim()).filter((s) => s in RULE_SETS));

export function routeMatchOf(table, S, starts, { secondBends = true, straight: verdicts = undefined, steps = MATCH_STEPS, rules = MATCH_RULES } = {}) {
  const W = table.widthPx, holes = table.holes;
  if (!(W > 0) || !holes.length) return { holes: {}, assignment: [], widthPx: W ?? null, condition: 'no hallway width or no holes in the route table' };
  const score = table.contrastMatrix.map((row, i) => row.map((c, k) => (c === null ? MATCH.noReadingLum : c) + (table.onAxisPrior[i]?.[k] ?? 0)));
  const pairs = assignMinCost(score.map((row) => row.map((v) => -v)));
  const out = {}, assignment = [];
  for (const [i, k] of pairs) {
    const hole = holes[i], cell = table.rows[i].cells[k], start = starts.holes.find((h) => String(h.hole) === String(hole));
    const sorted = [...score[i]].sort((a, b) => b - a);
    const E = table.baskets[k].point ?? cell.contrast.verts.at(-1);
    let V = cell.contrast.verts.map((v) => v.slice());
    const s6Straight = rules.straightFromS6 && verdicts && verdicts[hole] === 'straight';
    // firstBend 'badge': a route through B* keeps it (no refine slide; the bend placement below leaves it where it is)
    const pinB = rules.firstBend === 'badge' && V.length === 3 ? badgeMidOf(start) : null;
    if (V.length === 3 && !s6Straight && !pinB) V = steps.refine(S, V, W, start.u, rules);
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
    out[hole] = { end: k, verts: rec.verts, how: rec.how, polyScore: steps.contrast(S, rec.verts, W), bendsRefined: rec.bendsRefined ?? null, legs: [{ passFrac: rec.sensor.passFrac }],
      pair: { basket: k, scoreLum: score[i][k], marginLum: sorted[0] === score[i][k] ? sorted[0] - (sorted[1] ?? sorted[0]) : score[i][k] - sorted[0], onAxisPrior: table.onAxisPrior[i]?.[k] ?? 0 } };
    assignment.push({ hole, basket: k, scoreLum: score[i][k], bends: rec.verts.length - 2, sensor: rec.sensor.passFrac, stations: rec.sensor.stations });
  }
  return { holes: out, assignment, widthPx: W };
}
