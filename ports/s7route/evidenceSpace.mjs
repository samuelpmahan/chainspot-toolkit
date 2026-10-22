/**
 * S7 EVIDENCE: the earlier S7 algorithms as PERSPECTIVES on the S7 default's candidate cells (browser-safe). Sam (2026-10-22):
 * "What happened to basket backwards? It seems like that could help with issues where 3/4lane freaks out on reaching the basket.
 * And could BE A GREAT WAY TO TAKE OUT EARLIER ALGORITHM AND USE THAT AS JUST ANOTHER PIECE OF RANKING EVIDENCE!!!!!"
 *
 * The S7 default (routeMatchKBendsSeq3SearchW) stays the backbone: its sequencing (match.mjs seqCellsOf, served once by the store
 * as fn.q.trace.seqCells) names the candidate cells (hole, basket) and their routes: the straight claims, the neighbourhoods (top 3
 * ranks, widened on reject), the K-bend search with the follower, owned corridors, priced turns, no foreign C1 disc. Every
 * perspective reads only those cells (never the full holes x baskets table), each reading on one scale, support in -1 .. 1
 * (null = UNKNOWN, with the reason; missing evidence is never zero):
 *
 *   backbone    the default's own cell value (weakest-leg edge contrast minus the turning price, lum) as tanh(value / 16 lum)
 *               (16 lum = 2 x TAU, the edge step a ribbon station must exceed on both sides, hallway.mjs)
 *   edge        the hallway (edge) sensor on the cell's route: 2 x passFrac - 1 (routeSensorAt, fn.q.match.sensor); UNKNOWN
 *               below the station floor (minStationsR1 x R1 of visible ribbon)
 *   region      the region sensor's support on the route (regionSpace.mjs fn.q.route.region: mean of 2 P(hallway) - 1)
 *   badgeMid    Sam's badge-midpoint B* (the badge sits at the middle of the first leg): the edge sensor on the route with its
 *               first bend moved to B* (a straight route gets B* as its bend), 2 x passFrac - 1
 *   laneFwd     the four- and three-lane trackers forward from the tee cap (laneSpace.mjs tk.s7.laneTracksFour / Three): +1 when a
 *               track enters this basket's C1, -1 another basket's; the mean of the two; UNKNOWN when neither reached a basket
 *   followFwd   the hallway follower forward from the tee cap (hallway.mjs trace, resolutions in W: s3first's ride-the-ribbon, the
 *               default's seqFollow): +1 this basket, -1 another, UNKNOWN when it lost the ribbon
 *   laneBack    BASKET BACKWARDS with the lane tracker: from the BasketPoint, out of the C1 ring along each hallway that leaves it
 *               (exit headings by the sustained four-lane score just outside C1), tracked toward a badge; a track ends at hole j
 *               when it runs onto j's tee -> badge segment (within 0.5 W) heading back toward j's tee (antiparallel to j's axis
 *               within 30 deg: the first leg walked backwards); +1 when an exit reaches this hole, -1 when exits reach only
 *               others, UNKNOWN when none reaches a hole
 *   followBack  BASKET BACKWARDS with the hallway follower (endpoints.mjs traceBack, resolutions in W): from the BasketPoint along its
 *               best exit headings with every badge as a target, the arrival antiparallel to that hole's axis; +1 this hole, -1
 *               another, UNKNOWN when no exit reaches a badge
 *   meet        agreement: a forward track of the hole (four-lane walk, follower route) and a backward track of the basket (lane
 *               exits, follower exits) MEET: a point of the forward track within 0.5 W of the backward track, the two headings
 *               antiparallel within 30 deg; +1 met (the meeting point recorded: the forward track's farthest such point), -1 when
 *               both sides have tracks and none meets, UNKNOWN otherwise
 *
 * Parts and queries (registerEvidence):
 *   tk.s7.cellEvidence        per candidate cell every perspective's reading and reason, the meeting point, the combined
 *                             evidence (EVIDENCE_WEIGHTS) and the picks of the default and of the evidence ranking; renders as one
 *                             crop per hole (fg/s7route/evidenceRender.mjs)
 *   fn.q.evidence.laneExits   { scene, basket, widthPx } -> the exit headings out of the basket's C1 ring by the four-lane score
 *   fn.q.evidence.laneBack    { scene, basket, exit, widthPx, legs, boxes } -> one backward lane track (a fn.q.route.laneStep per step)
 *   fn.q.evidence.followExits { scene, basket, widthPx } -> the follower's exit headings (endpoints.mjs traceBack's scan, in W)
 *   fn.q.evidence.followBack  { scene, basket, widthPx, legs } -> the backward follower over the exits (fn.q.match.follow*W steps)
 *   fn.q.evidence.followForward { scene, start, widthPx } -> the follower from the tee cap (the default's seqFollow, every bent hole)
 *   fn.q.evidence.closeOnBadge { scene, targets, a } -> closeOnBpW with the badges as the endpoints
 *   fn.q.evidence.meet        { forward, back, widthPx } -> where a forward and a backward track meet
 * The rule set routeMatchKBendsSeq3SearchWEvidence (match.mjs seqScore 'evidence') ranks the same cells by the combined evidence
 * (evidenceRankOf): log P(cell) of a logistic over these readings, trained leave-one-course-out on dev testimony
 * (ports/s7route/evidenceEval.mjs). The default's output is unchanged; the sibling keeps every guard (its cells are the default's).
 * Data conditions (no width, no scene, nothing reached) are recorded readings, never throws.
 */
import { underAssumption, violationEmits } from '../../fg/assumptions.mjs';
import { registerQueries } from '../../fg/store.mjs';
import { sha256Hex } from '../../fg/canon.mjs';
import { CELL_EVIDENCE_SCHEMA } from '../../fg/s7route/evidenceRender.mjs';
import { LANE, LANE_REACH, LANE_UNKNOWN_RUN, LANE_TRACKS_PART, discEntered, inBox, samplePoly, fourLaneAt, registerLanes } from './laneSpace.mjs';
import { ROUTE_START_PART, ROUTE_HALLWAY_PART, badgeMidOf } from './routeSpace.mjs';
import { registerRegion, REGION_SCENE_PART } from './regionSpace.mjs';
import { RULE_SETS, S7_DEFAULT, cellRulesOf, seqFinalOf, minStationsOf, stepResOf } from './match.mjs';
import { SEQ } from './seq.mjs';
import { trace as followTrace, closeOnBpW, bpOnLegW, findBendW, stationContrast, arange, FOLLOW_W, CLOSE_ON_BP_REACH, TAU } from '../s7trace/hallway.mjs';

export { CELL_EVIDENCE_SCHEMA };
export const CELL_EVIDENCE_PART = 'tk.s7.cellEvidence';
const SCENE = 'tk.s7.sceneS4';

export const EVIDENCE = Object.freeze({
  backboneLum: 2 * TAU,        // lum: the backbone value reads tanh(value / 16 lum)
  meetLateralW: 0.5,           // W: a forward and a backward track meet within W / 2 (the S7 judge's corridor rule)
  antiparallelDeg: 30,         // deg: "roughly antiparallel": the two headings within 30 deg of opposite
  legReachW: 0.5,              // W: a backward track reaches a hole on its tee -> badge segment within W / 2
  exitStartR1: 1.25,           // R1: an exit is read from 1.25 R1 out (outside the C1 ring stroke at 1 R1, C1 = 10 m by definition)
  exitStepDeg: 6,              // deg: the exit headings, the lane tracker's own heading step
  exitSeparationDeg: 30,       // deg: two exits are two hallways when at least 30 deg apart
  exitMax: 3,                  // exits per basket (a count: the hallway in, the next tee's hallway out, one more)
  followHeadingStepDeg: 2,     // deg: endpoints.mjs traceBack's heading scan
  followHeadSeparationDeg: 10, // deg: endpoints.mjs ENDPOINT_RULES.headingSeparationDeg
  followHeads: 3               // the backward follower's exits tried, best first, until one reaches a badge (endpoints: 4)
});
export const FEATURES = Object.freeze(['backbone', 'edge', 'region', 'badgeMid', 'laneFwd', 'followFwd', 'laneBack', 'followBack', 'meet']);
export const EVIDENCE_UNITS = Object.freeze({
  readings: 'support -1 .. 1 per perspective (null = UNKNOWN, with its reason)',
  combined: 'P(cell is the hole\'s basket): logistic over the readings (EVIDENCE_WEIGHTS; an UNKNOWN reading adds nothing)',
  rank: 'log P (the evidence ranking: the assignment maximises the sum over holes)',
  paths: 'px (canonical frame)', meetAt: 'px (canonical frame)', walked: 'R1'
});

/**
 * The combination (a perceptron with a sigmoid, one weight per perspective plus the agreement feature), fitted on the dev testimony
 * (golden, heritage, townelake, lenard, alex: 89 candidate cells, 30 of them Sam's basket; ports/s7route/evidenceEval.mjs train,
 * docs/evidence/s7evidence/). The feature set and the L2 penalty were chosen on dev alone, by leave-one-course-out held-out log loss
 * over five stated sets x L2 0.3 / 1 / 3 (evidenceEval.mjs SELECTION): the tracks (backbone, forward lanes, basket backwards by the
 * follower, the meeting) at L2 0.3 read 0.059, every perspective at L2 0.3 0.066, the backbone alone 0.177. The other perspectives
 * are recorded and rendered with weight 0. The dev cells are separable (the backbone alone ranks Sam's basket first on all 30 bent
 * holes), so the weights are the penalty's choice among separating ones; leave-one-course-out picks equal the default's on all 75
 * judged dev holes.
 */
export const EVIDENCE_WEIGHTS = Object.freeze({ bias: -1.507, backbone: 1.996, edge: 0, region: 0, badgeMid: 0, laneFwd: 2.396, followFwd: 0, laneBack: 0, followBack: 1.218, meet: 1.553 });

const r2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : v ?? null);
const r3 = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : v ?? null);
const rad = (d) => (d * Math.PI) / 180, deg = (r) => (r * 180) / Math.PI;
const cosAnti = () => Math.cos(rad(EVIDENCE.antiparallelDeg));
const hyp = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const median = (xs) => { const s = Float64Array.from(xs).sort(); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
const segPoint = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-9, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)); return { d: Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy), t }; };
export const sigmoid = (z) => 1 / (1 + Math.exp(-z));
export const logSigmoid = (z) => (z >= 0 ? -Math.log1p(Math.exp(-z)) : z - Math.log1p(Math.exp(z)));
/** z of one cell under the weights: bias + the sum over the known readings (UNKNOWN adds nothing). */
export const zOf = (readings, w = EVIDENCE_WEIGHTS) => FEATURES.reduce((s, f) => s + (readings[f] == null ? 0 : (w[f] ?? 0) * readings[f]), w.bias ?? 0);

// ------------------------------------------------------------------ basket backwards: the lane tracker

/** The exits of basket k's C1 ring: headings whose four-lane score, sustained over 3 steps from exitStartR1, is a local best. */
export function laneExitsOf(c, k, W) {
  const B = c.bp[k], r0 = EVIDENCE.exitStartR1 * c.R1, step = LANE.stepW * W, scan = [];
  for (let d = 0; d < 360; d += EVIDENCE.exitStepDeg) {
    const th = rad(d), tx = Math.cos(th), ty = Math.sin(th), vis = [];
    for (let j = 0; j < LANE.lookaheadSteps; j++) { const o = fourLaneAt(c, B[0] + tx * (r0 + j * step), B[1] + ty * (r0 + j * step), th, W); if (o.score !== null) vis.push(o.score); }
    if (vis.length) scan.push({ deg: d, score: Math.min(...vis) });
  }
  scan.sort((a, b) => b.score - a.score || a.deg - b.deg);
  const exits = [];
  for (const s of scan) {
    if (s.score < LANE.minVisibleScore) break;
    if (exits.every((e) => Math.abs(((s.deg - e.deg + 540) % 360) - 180) >= EVIDENCE.exitSeparationDeg)) exits.push(s);
    if (exits.length >= EVIDENCE.exitMax) break;
  }
  return { exits: exits.map((e) => ({ headingDeg: e.deg, score: r3(e.score) })), scanned: scan.length };
}

/** The first hole whose tee -> badge segment the point lies on (within legReachW x W), heading back toward its tee. */
function legReached(p, heading, legs, W, skip) {
  const hx = Math.cos(heading), hy = Math.sin(heading);
  for (const g of legs) {
    if (skip.has(g.hole) || !g.badge) continue;
    if (hx * g.u[0] + hy * g.u[1] > -cosAnti()) continue;
    if (segPoint(p, g.S, g.badge).d <= EVIDENCE.legReachW * W) return g.hole;
  }
  return null;
}

/**
 * One backward lane track from basket k along exit heading (deg) with the bounds reachPx and unknownPx; step(x, y, heading) ->
 * laneStepAt's answer (a store call). Stops: 'hole' (reached a hole's tee -> badge segment, walking it back toward the tee), 'basket'
 * (entered another basket's C1 disc or sprite), 'evidence-lost', 'occluded-too-long', 'reach', 'image-border'.
 */
export function trackBackWith(c, k, exitDeg, W, { reachPx, unknownPx, step, legs, boxes = null }) {
  const B = c.bp[k], th0 = rad(exitDeg), r0 = EVIDENCE.exitStartR1 * c.R1, stepPx = LANE.stepW * W;
  const P0 = [B[0] + Math.cos(th0) * r0, B[1] + Math.sin(th0) * r0];
  const exempt = new Set([k]); c.bp.forEach((p, q) => { if (hyp(p, P0) < LANE.ringR1 * c.R1 || inBox(P0, boxes?.[q])) exempt.add(q); });
  // a hole whose first leg already passes the exit point cannot be reached from it (the next tee beside the basket)
  const skip = new Set(legs.filter((g) => g.badge && segPoint(P0, g.S, g.badge).d <= EVIDENCE.legReachW * W).map((g) => g.hole));
  const path = [[B[0], B[1]], P0], recent = [];
  let x = P0[0], y = P0[1], heading = th0, walked = r0, unknownRun = 0, maxUnknownPx = 0, visible = 0;
  const done = (stop, extra = {}) => ({ stop, hole: null, basket: null, path, walkedPx: walked, maxUnknownPx, visible, ...extra });
  while (walked < reachPx) {
    const s = step(x, y, heading), from = [x, y];
    x = s.x; y = s.y; heading = s.heading; walked += stepPx; path.push([x, y]);
    if (!(x >= 0 && x < c.W && y >= 0 && y < c.H)) return done('image-border');
    const j = legReached([x, y], heading, legs, W, skip);
    if (j !== null) return done('hole', { hole: j });
    const hit = discEntered(from, [x, y], c.bp, c.R1, exempt, boxes);
    if (hit) { path[path.length - 1] = [from[0] + (x - from[0]) * hit.t, from[1] + (y - from[1]) * hit.t]; return done('basket', { basket: hit.k, kind: hit.kind }); }
    if (s.score === null) { unknownRun += stepPx; maxUnknownPx = Math.max(maxUnknownPx, unknownRun); if (unknownRun > unknownPx) return done('occluded-too-long'); }
    else {
      unknownRun = 0; visible++; recent.push(s.score); if (recent.length > LANE.failureSteps) recent.shift();
      if (recent.length === LANE.failureSteps && recent.every((v) => v < LANE.minVisibleScore)) return done('evidence-lost');
    }
  }
  return done('reach');
}

/** trackBackWith under the lane tracker's stated assumptions (reach outside, the unknown run inside), as laneSpace.mjs laneTrackOf. */
export function laneBackOf(c, k, exitDeg, W, step, legs, boxes = null) {
  const diag = Math.hypot(c.W, c.H), violations = [];
  const outer = underAssumption(LANE_REACH, { unitPx: c.R1, limitPx: diag, detail: { basket: k, step: 'backward lane track' },
    run: (reachPx) => {
      const inner = underAssumption(LANE_UNKNOWN_RUN, { unitPx: 1, limitPx: reachPx, detail: { basket: k, step: 'backward lane track' },
        run: (unknownPx) => { const t = trackBackWith(c, k, exitDeg, W, { reachPx, unknownPx, step, legs, boxes }); return { result: t, found: t.stop !== 'occluded-too-long', atEdge: false, at: t.maxUnknownPx }; } });
      if (inner.violation) violations.push(inner.violation);
      return { result: inner.result, found: inner.result.stop !== 'reach', atEdge: false, at: inner.result.walkedPx };
    } });
  if (outer.violation) violations.push(outer.violation);
  return { ...outer.result, violations };
}

// ------------------------------------------------------------------ basket backwards: the hallway follower

/** The first point of a backward route (sampled every W / 8) on a hole's tee -> badge segment, heading back to its tee: -> { hole, verts (cut there) } or null. */
export function legWalked(V, legs, W, skip = new Set()) {
  for (let i = 0; i + 1 < V.length; i++) {
    const a = V[i], b = V[i + 1], L = hyp(a, b), n = Math.max(1, Math.ceil(L / (W / 8))), hd = Math.atan2(b[1] - a[1], b[0] - a[0]);
    if (!(L > 0)) continue;
    for (let q = 1; q <= n; q++) { const p = [a[0] + (b[0] - a[0]) * q / n, a[1] + (b[1] - a[1]) * q / n], j = legReached(p, hd, legs, W, skip); if (j !== null) return { hole: j, verts: [...V.slice(0, i + 1), p] }; }
  }
  return null;
}

/** endpoints.mjs traceBack's exit scan in W: headings every 2 deg, stations over one heading run (runW x W) every sampleStepW x W. */
export function followExitsOf(c, k, W, res = FOLLOW_W) {
  const B = c.bp[k], ts = arange(W * 0.75, W * 0.75 + res.runW * W, res.sampleStepW * W), minN = res.bendVisibleW / res.sampleStepW, scan = [];
  for (const d of arange(0, 360, EVIDENCE.followHeadingStepDeg)) {
    const { cl, cr, okl, okr } = stationContrast(c, B, rad(d), ts, W), m = [];
    for (let q = 0; q < ts.length; q++) if (okl[q] && okr[q]) m.push(Math.min(cl[q], cr[q]));
    if (m.length < minN) continue;
    scan.push([m.filter((v) => v > TAU).length / m.length + 0.01 * median(m), d]);
  }
  scan.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const heads = [];
  for (const [sc, d] of scan) { if (heads.every((q) => Math.abs(((d - q[1] + 540) % 360) - 180) >= EVIDENCE.followHeadSeparationDeg)) heads.push([sc, d]); if (heads.length >= EVIDENCE.followHeads) break; }
  return heads.map(([score, d]) => ({ headingDeg: d, score: r3(score) }));
}

/** The follower's steps as store calls (fn.q.match.follow*W, the default's own), the endpoints given (closeOnBp, onLeg). */
const followStepsOf = (call, res, closeOnBp, onLeg) => ({
  runEnd: (Sc, O, phi, Wd, t0) => call('fn.q.match.followRunEndW', { scene: SCENE, a: [O, phi, Wd, t0, stepResOf(res)] }),
  closeOnBp, onLeg,
  findBend: (Sc, O, phi, Wd, tEnd, selfC, tees) => findBendW(Sc, O, phi, Wd, tEnd, selfC, tees, (Sx, Ox, px, Wx, tv, sC, tz, psis) => call('fn.q.match.followBendAtW', { scene: SCENE, a: [Ox, px, Wx, tv, sC, tz, psis, stepResOf(res)] }), res)
});

/**
 * The follower under CLOSE_ON_BP_REACH (widened x2 up to the image diagonal when it ends without an endpoint), as seqFollow; found(t)
 * (optional) also counts a trace as found (the backward follower: it walked onto a hole's first leg).
 */
function followUnder(c, run, detail, found = null) {
  const u = underAssumption(CLOSE_ON_BP_REACH, { unitPx: c.R1, limitPx: Math.hypot(c.W, c.H), detail,
    run: (b) => { const t = run({ ...FOLLOW_W, closeReachR1: b / c.R1 }); return { result: t, found: (t.end !== null && t.end !== undefined) || Boolean(found?.(t)), atEdge: false, at: t.end ?? null }; } });
  return { ...u.result, violations: u.violation ? [u.violation] : [] };
}

// ------------------------------------------------------------------ meeting

/** Where a forward track meets a backward one: the forward point farthest along with a backward point within W / 2, antiparallel. */
export function meetOf(forward, back, W) {
  if (!(forward?.length >= 2) || !(back?.length >= 2)) return { meets: null, why: 'a track with fewer than 2 points' };
  const pts = samplePoly(forward, W / 8);
  let best = null, along = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i) along += hyp(pts[i], pts[i - 1]);
    const p = pts[i], q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(0, i - 1)], hx = q[0] - o[0], hy = q[1] - o[1], hl = Math.hypot(hx, hy);
    if (!(hl > 0)) continue;
    for (let s = 0; s + 1 < back.length; s++) {
      const a = back[s], b = back[s + 1], bl = hyp(a, b);
      if (!(bl > 0)) continue;
      const cos = (hx * (b[0] - a[0]) + hy * (b[1] - a[1])) / (hl * bl);
      if (cos > -cosAnti()) continue;
      if (segPoint(p, a, b).d <= EVIDENCE.meetLateralW * W) { if (!best || along > best.alongPx) best = { at: [r2(p[0]), r2(p[1])], alongPx: along }; break; }
    }
  }
  return best ? { meets: true, at: best.at, alongFwdPx: r2(best.alongPx) } : { meets: false };
}

// ------------------------------------------------------------------ the queries

const noScene = (fn) => ({ value: { condition: `${fn}: no hallway scene (pass scene: '${SCENE}')` }, unit: 'condition' });
const ctx = (scene) => (scene?.lum && scene?.mask ? scene : null);
const laneBackQuery = ({ scene, basket, exit, widthPx, legs, boxes = null }, _a, call) => {
  const c = ctx(scene); if (!c) return noScene('fn.q.evidence.laneBack');
  const step = (x, y, heading) => call('fn.q.route.laneStep', { scene: SCENE, lanes: 4, x, y, heading, widthPx, straight: false });
  const t = laneBackOf(c, basket, exit.headingDeg, widthPx, step, legs, boxes);
  return { value: { basket, exitDeg: exit.headingDeg, stop: t.stop, hole: t.hole, enteredBasket: t.basket, walkedR1: r2(t.walkedPx / c.R1), visibleSteps: t.visible, path: t.path.map((p) => [r2(p[0]), r2(p[1])]), violations: t.violations },
    unit: `path: ${EVIDENCE_UNITS.paths}; walkedR1: R1`, emits: { reachedHole: t.stop === 'hole' ? 1 : 0, steps: t.path.length - 2, ...violationEmits(t.violations) } };
};
laneBackQuery.calls = ['fn.q.route.laneStep'];
const followBackQuery = ({ scene, basket, widthPx, legs }, _a, call) => {
  const c = ctx(scene); if (!c) return noScene('fn.q.evidence.followBack');
  const exits = call('fn.q.evidence.followExits', { scene: SCENE, basket, widthPx }).exits ?? [];
  const targets = legs.filter((g) => g.badge), pts = targets.map((g) => g.badge), T = { ...c, bp: pts }, tried = [];
  const B = c.bp[basket], skip = new Set(legs.filter((g) => g.badge && segPoint(B, g.S, g.badge).d <= EVIDENCE.legReachW * widthPx).map((g) => g.hole));
  // a leg that walks onto a hole's tee -> badge segment back toward its tee ends the trace there (on the leg, as a BasketPoint would)
  const onFirstLeg = (O, phi, Wd, tEnd) => { const hit = legWalked([O, [O[0] + Math.cos(phi) * tEnd, O[1] + Math.sin(phi) * tEnd]], legs, Wd, skip); return hit ? [hyp(hit.verts.at(-1), O), targets.findIndex((g) => g.hole === hit.hole), 0] : null; };
  let reached = null, violations = [];
  for (const e of exits) {
    const t = followUnder(c, (res) => followTrace(T, c.bp[basket], rad(e.headingDeg), widthPx, { maxLegs: SEQ.followLegs,
      steps: followStepsOf(call, res, (Sc, O, phi, Wd, tEnd, used) => call('fn.q.evidence.closeOnBadge', { scene: SCENE, targets: pts, a: [O, phi, Wd, tEnd, used, res] }), (Sc, O, phi, Wd, tEnd, used) => onFirstLeg(O, phi, Wd, tEnd) ?? bpOnLegW(T, O, phi, Wd, tEnd, used, res)) }), { basket, step: 'backward follower' }, (tr) => legWalked(tr.verts, legs, widthPx, skip) !== null);
    violations = violations.concat(t.violations);
    // the trace ends where it first walks onto a hole's tee -> badge segment heading back toward that tee (the lane rule): a trace
    // that walks a hole backwards past its badge (the badge off the follower's centreline) would otherwise ride on to another badge
    const on = legWalked(t.verts, legs, widthPx, skip);
    const g = on ? targets.find((x) => x.hole === on.hole) : t.end != null ? targets[t.end] : null, V = on ? on.verts : t.verts;
    let arrival = null;
    if (g) { const a = V.at(-2), b = V.at(-1), L = hyp(a, b) || 1; arrival = ((b[0] - a[0]) * g.u[0] + (b[1] - a[1]) * g.u[1]) / L; }
    const ok = Boolean(on) || (g && arrival <= -cosAnti());
    tried.push({ exitDeg: e.headingDeg, exitScore: e.score, reachedHole: g ? g.hole : null, how: on ? 'walked onto its tee -> badge segment' : g ? 'closed on its badge' : 'lost', arrivalCos: r3(arrival), antiparallel: Boolean(ok), legs: t.legs.length, verts: V.map((p) => [r2(p[0]), r2(p[1])]) });
    if (ok) { reached = g.hole; break; }
  }
  return { value: { basket, exits: exits.length, hole: reached, tried, violations }, unit: `verts: ${EVIDENCE_UNITS.paths}; arrivalCos: cosine of the last leg with the hole's tee axis`, emits: { reachedHole: reached !== null ? 1 : 0, exitsTried: tried.length, ...violationEmits(violations) } };
};
followBackQuery.calls = ['fn.q.evidence.followExits', 'fn.q.evidence.closeOnBadge', 'fn.q.match.followRunEndW', 'fn.q.match.followBendAtW'];
const followForwardQuery = ({ scene, start, widthPx }, _a, call) => {
  const c = ctx(scene); if (!c) return noScene('fn.q.evidence.followForward');
  const t = followUnder(c, (res) => followTrace(c, start.S, Math.atan2(start.u[1], start.u[0]), widthPx, { maxLegs: SEQ.followLegs,
    steps: followStepsOf(call, res, (Sc, O, phi, Wd, tEnd, used) => call('fn.q.match.followCloseOnBpW', { scene: SCENE, a: [O, phi, Wd, tEnd, used, res] }), (Sc, O, phi, Wd, tEnd, used) => bpOnLegW(c, O, phi, Wd, tEnd, used, res)) }), { hole: start.hole, step: 'forward follower' });
  return { value: { hole: start.hole, basket: t.end ?? null, verts: t.verts.map((p) => [r2(p[0]), r2(p[1])]), legs: t.legs.length, violations: t.violations }, unit: `verts: ${EVIDENCE_UNITS.paths}`, emits: { reached: t.end != null ? 1 : 0, ...violationEmits(t.violations) } };
};
followForwardQuery.calls = ['fn.q.match.followCloseOnBpW', 'fn.q.match.followRunEndW', 'fn.q.match.followBendAtW'];

export const EVIDENCE_QUERIES = Object.freeze({
  'fn.q.evidence.laneExits': ({ scene, basket, widthPx }) => { const c = ctx(scene); if (!c) return noScene('fn.q.evidence.laneExits'); const r = laneExitsOf(c, basket, widthPx); return { value: r, unit: 'headingDeg: deg; score: four-lane score (fraction)' }; },
  'fn.q.evidence.laneBack': laneBackQuery,
  'fn.q.evidence.followExits': ({ scene, basket, widthPx }) => { const c = ctx(scene); if (!c) return noScene('fn.q.evidence.followExits'); return { value: { exits: followExitsOf(c, basket, widthPx) }, unit: 'headingDeg: deg; score: passFrac + 0.01 x median edge contrast (lum)' }; },
  'fn.q.evidence.closeOnBadge': ({ scene, targets, a }) => { const c = ctx(scene); if (!c) return noScene('fn.q.evidence.closeOnBadge'); return { value: closeOnBpW({ ...c, bp: targets }, ...a), unit: '[passFrac, badge index, vertex px along the leg, heading rad] or null' }; },
  'fn.q.evidence.followBack': followBackQuery,
  'fn.q.evidence.followForward': followForwardQuery,
  'fn.q.evidence.meet': ({ forward, back, widthPx }) => ({ value: meetOf(forward, back, widthPx), unit: `at: ${EVIDENCE_UNITS.meetAt}; alongFwdPx: px along the forward track` })
});

// ------------------------------------------------------------------ the evidence table

const vote = (reached, k) => (reached === null || reached === undefined ? null : reached === k ? 1 : -1);
const mean = (xs) => { const v = xs.filter((x) => x !== null && x !== undefined); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

/**
 * The evidence on the default's candidate cells. cells: fn.q.trace.seqCells (the default's cell rules); call(fn, args) -> value.
 * -> { schema, rows: per hole { hole, claimed | cells: [{ k, basket, route, value, readings, reasons, meetAt, z, P }], tracks } }.
 */
export function cellEvidenceOf({ cells, c, W, lanes4, lanes3, holesPart, call, rules, weights = EVIDENCE_WEIGHTS }) {
  const names = holesPart.baskets.map((b) => b.name), floor = minStationsOf(c, rules), boxes = holesPart.baskets.map((b) => b.bbox);
  const legs = cells.starts.map((s) => ({ hole: s.hole, S: s.S, u: s.u, badge: c.badges[Number(s.hole)] ?? null }));
  const regionOk = !call('fn.tk.s7.regionCondition', {});
  const candidates = [];
  cells.starts.forEach((s, i) => { if (cells.claims[s.hole] === undefined) cells.score[i].forEach((v, k) => { if (Number.isFinite(v)) candidates.push({ i, k, hole: s.hole, start: s, value: v, route: cells.route[`${s.hole}@${k}`] }); }); });
  const baskets = [...new Set(candidates.map((x) => x.k))].sort((a, b) => a - b), holes = [...new Set(candidates.map((x) => x.hole))];
  // per basket: the backward tracks (lane exits, the follower's exits); per hole: the forward follower
  const back = Object.fromEntries(baskets.map((k) => {
    const exits = call('fn.q.evidence.laneExits', { scene: SCENE, basket: k, widthPx: W }).exits ?? [];
    const lane = exits.map((e) => call('fn.q.evidence.laneBack', { scene: SCENE, basket: k, exit: e, widthPx: W, legs, boxes }));
    return [k, { lane, follow: call('fn.q.evidence.followBack', { scene: SCENE, basket: k, widthPx: W, legs }) }];
  }));
  const fwd = Object.fromEntries(holes.map((h) => [h, call('fn.q.evidence.followForward', { scene: SCENE, start: cells.starts.find((s) => s.hole === h), widthPx: W })]));
  const trackOf = (T, h) => T.holes.find((x) => String(x.hole) === String(h)) ?? null;
  const meets = { met: 0, cells: 0 };
  const rows = cells.starts.map((s, i) => {
    if (cells.claims[s.hole] !== undefined) return { hole: s.hole, i, claimed: cells.claims[s.hole], claimedName: names[cells.claims[s.hole]] ?? null, why: 'S6 straight: the first forward BasketPoint on the tee ray (the default\'s straight claim)' };
    const l4 = trackOf(lanes4, s.hole), l3 = trackOf(lanes3, s.hole), ff = fwd[s.hole];
    const forwardTracks = [l4?.path?.length ? { kind: 'four-lane', path: l4.path } : null, ff?.verts?.length >= 2 ? { kind: 'follower', path: ff.verts } : null].filter(Boolean);
    const Bs = badgeMidOf(s), bsIn = Bs[0] >= 0 && Bs[1] >= 0 && Bs[0] < c.W && Bs[1] < c.H;
    const list = candidates.filter((x) => x.i === i).map((x) => {
      const V = x.route, k = x.k, readings = {}, reasons = {};
      readings.backbone = Math.tanh(x.value / EVIDENCE.backboneLum);
      const se = call('fn.q.match.sensor', { scene: SCENE, a: [V, W] });
      if (se.stations >= floor) readings.edge = 2 * se.passFrac - 1; else { readings.edge = null; reasons.edge = `${r2(se.stations)} visible stations, below the floor ${r2(floor)}`; }
      if (regionOk) { const rg = call('fn.q.route.region', { verts: V, widthPx: W }); readings.region = rg.condition ? null : rg.supportMean; if (rg.condition) reasons.region = rg.condition; }
      else { readings.region = null; reasons.region = 'no region model on this image (tk.s7.sceneRegion condition)'; }
      if (bsIn) { const Vb = V.length >= 3 ? [V[0], Bs, ...V.slice(2)] : [V[0], Bs, V[1]], sb = call('fn.q.match.sensor', { scene: SCENE, a: [Vb, W] }); if (sb.stations >= floor) readings.badgeMid = 2 * sb.passFrac - 1; else { readings.badgeMid = null; reasons.badgeMid = `the route through B* has ${r2(sb.stations)} visible stations, below the floor`; } }
      else { readings.badgeMid = null; reasons.badgeMid = 'B* lies outside the image'; }
      readings.laneFwd = mean([l4?.stop === 'basket' ? vote(l4.basket, k) : null, l3?.stop === 'basket' ? vote(l3.basket, k) : null]);
      if (readings.laneFwd === null) reasons.laneFwd = `no lane track reached a basket (four-lane: ${l4?.stop ?? 'none'}, three-lane: ${l3?.stop ?? 'none'})`;
      readings.followFwd = vote(ff?.basket, k);
      if (readings.followFwd === null) reasons.followFwd = 'the forward follower lost the ribbon';
      const bk = back[k], laneReached = bk.lane.filter((t) => t.stop === 'hole').map((t) => t.hole);
      readings.laneBack = laneReached.length ? (laneReached.some((h) => String(h) === String(s.hole)) ? 1 : -1) : null;
      if (readings.laneBack === null) reasons.laneBack = bk.lane.length ? `no exit reached a hole (${bk.lane.map((t) => `${t.exitDeg} deg: ${t.stop}`).join(', ')})` : 'no exit out of the C1 ring reads as a hallway';
      readings.followBack = bk.follow.hole == null ? null : String(bk.follow.hole) === String(s.hole) ? 1 : -1;
      if (readings.followBack === null) reasons.followBack = bk.follow.tried?.length ? `no exit reached a badge antiparallel (${bk.follow.tried.length} tried)` : 'no exit with visible stations';
      const backTracks = [...bk.lane.map((t) => ({ kind: `lane exit ${t.exitDeg} deg`, path: t.path })), ...(bk.follow.tried ?? []).map((t) => ({ kind: `follower exit ${t.exitDeg} deg`, path: t.verts }))].filter((t) => t.path?.length >= 2);
      let meetAt = null;
      if (forwardTracks.length && backTracks.length) {
        meets.cells++;
        for (const f of forwardTracks) { for (const b of backTracks) { const m = call('fn.q.evidence.meet', { forward: f.path, back: b.path, widthPx: W }); if (m.meets) { meetAt = { at: m.at, forward: f.kind, back: b.kind, alongFwdR1: r2(m.alongFwdPx / c.R1) }; break; } } if (meetAt) break; }
        readings.meet = meetAt ? 1 : -1; if (meetAt) meets.met++;
      } else { readings.meet = null; reasons.meet = forwardTracks.length ? 'no backward track left the basket' : 'no forward track'; }
      for (const f of FEATURES) if (readings[f] !== null && readings[f] !== undefined) readings[f] = r3(readings[f]);
      const z = zOf(readings, weights);
      return { k, basket: names[k] ?? `BP${k}`, value: r2(x.value), route: V.map((p) => [r2(p[0]), r2(p[1])]), readings, reasons, meetAt, z: r3(z), P: r3(sigmoid(z)) };
    });
    return { hole: s.hole, i, cells: list, bStar: bsIn ? [r2(Bs[0]), r2(Bs[1])] : null,
      tracks: { fourLane: l4 ? { stop: l4.stop, basket: l4.basket, path: l4.path } : null, threeLane: l3 ? { stop: l3.stop, basket: l3.basket, path: l3.path } : null, follower: ff ? { basket: ff.basket, verts: ff.verts } : null } };
  });
  const backTracks = Object.fromEntries(baskets.map((k) => [k, { name: names[k] ?? `BP${k}`, lane: back[k].lane.map((t) => ({ exitDeg: t.exitDeg, stop: t.stop, hole: t.hole, walkedR1: t.walkedR1, path: t.path })), follow: { hole: back[k].follow.hole, tried: back[k].follow.tried } }]));
  const violations = [...Object.values(back).flatMap((b) => [...b.lane.flatMap((t) => t.violations ?? []), ...(b.follow.violations ?? [])]), ...Object.values(fwd).flatMap((f) => f.violations ?? [])];
  return { rows, backTracks, meets, violations };
}

/**
 * The evidence ranking (rule set seqScore 'evidence'): log P(cell) for the default's candidate cells, 0 (certain) for a straight claim,
 * null elsewhere. part: tk.s7.cellEvidence; null when the Part was made for other cells (another cell rule set) or holds a condition.
 */
export function evidenceRankOf(part, cells, rules, cellRules) {
  if (!part || part.condition || JSON.stringify(part.cellRules) !== JSON.stringify(cellRules)) return null;
  const w = rules?.evidenceWeights ?? EVIDENCE_WEIGHTS, M = cells.score.map((r) => r.map(() => null));
  for (const row of part.rows) {
    if (row.claimed !== undefined) { M[row.i][row.claimed] = 0; continue; }
    for (const x of row.cells) M[row.i][x.k] = logSigmoid(zOf(x.readings, w));
  }
  return M;
}

const CODE = sha256Hex([laneExitsOf, legReached, legWalked, trackBackWith, laneBackOf, followExitsOf, followStepsOf, followUnder, meetOf, laneBackQuery, followBackQuery, followForwardQuery, cellEvidenceOf, evidenceRankOf, zOf].map(String).join('\n') + JSON.stringify(EVIDENCE) + JSON.stringify(EVIDENCE_WEIGHTS));

/** Register the evidence queries and tk.s7.cellEvidence (and what they need: the lanes, the region) on the S7 store. */
export function registerEvidence(store) {
  if (store.registered('fn.tk.s7.cellEvidence')) return;
  registerLanes(store, registerQueries);
  registerRegion(store);
  registerQueries(store, EVIDENCE_QUERIES, { note: 'S7 evidence: basket backwards, the forward follower, meetings (ports/s7route/evidenceSpace.mjs)' });
  // whether the image has a region model (the region perspective reads UNKNOWN without one): a query, so the Part stays lazy
  store.register('fn.tk.s7.regionCondition', { inParts: [REGION_SCENE_PART], note: 'the region scene\'s condition (null: the region sensor reads)', calculate: (io) => ({ value: io.in(REGION_SCENE_PART).regionCondition ?? null, unit: 'condition' }) });
  const cellRules = cellRulesOf(RULE_SETS[S7_DEFAULT]);
  store.register('fn.tk.s7.cellEvidence', { inParts: [SCENE, ROUTE_START_PART, ROUTE_HALLWAY_PART, 'tk.s7.holes', LANE_TRACKS_PART[4], LANE_TRACKS_PART[3]], outParts: [CELL_EVIDENCE_PART], code: CODE,
    calls: ['fn.q.trace.seqCells', 'fn.tk.s7.regionCondition', 'fn.q.route.region', 'fn.q.match.sensor', 'fn.q.match.kLegsMany', ...Object.keys(EVIDENCE_QUERIES)],
    note: `every perspective's reading on the S7 default's candidate cells (${S7_DEFAULT}): basket backwards, the lanes, the follower, the sensors, B*, meetings`,
    calculate: (io) => {
      const call = (fn, args) => io.call(fn, args).value, W = io.in(ROUTE_HALLWAY_PART).widthPx, c = io.in(SCENE), holesPart = io.in('tk.s7.holes');
      if (!(W > 0)) return { [CELL_EVIDENCE_PART]: { schema: CELL_EVIDENCE_SCHEMA, condition: 'no hallway width: no evidence', cellRules, rows: [], emits: { cells: 0 } } };
      const cells = call('fn.q.trace.seqCells', { rules: cellRules }), rules = { ...RULE_SETS[S7_DEFAULT] };
      const ev = cellEvidenceOf({ cells, c, W, lanes4: io.in(LANE_TRACKS_PART[4]), lanes3: io.in(LANE_TRACKS_PART[3]), holesPart, call, rules });
      // the picks: the default's final assignment and the evidence ranking's (EVIDENCE_WEIGHTS), over the same cells
      const holes = cells.starts.map((s) => s.hole), legsMany = (Sc, Vs, Wd) => call('fn.q.match.kLegsMany', { scene: SCENE, a: [Vs, Wd] });
      const part0 = { cellRules, rows: ev.rows };
      const pick = (rescore) => Object.fromEntries(seqFinalOf(cells, { holes, S: c, W, legsMany, rules: { ...rules }, rescore }).pairs.map(([i, k]) => [holes[i], k]));
      const byDefault = pick(null), byEvidence = pick((cl) => evidenceRankOf(part0, cl, {}, cellRules));
      const rows = ev.rows.map((r) => ({ ...r, defaultBasket: byDefault[r.hole] ?? null, evidenceBasket: byEvidence[r.hole] ?? null }));
      const nCells = rows.reduce((s, r) => s + (r.cells?.length ?? 0), 0), changed = rows.filter((r) => r.defaultBasket !== r.evidenceBasket).map((r) => r.hole);
      return { [CELL_EVIDENCE_PART]: { schema: CELL_EVIDENCE_SCHEMA, reference: S7_DEFAULT, cellRules, widthPx: W, R1Px: c.R1, features: FEATURES, weights: EVIDENCE_WEIGHTS, evidence: EVIDENCE, units: EVIDENCE_UNITS,
        baskets: holesPart.baskets.map((b) => ({ name: b.name, point: b.point })), rows, backTracks: ev.backTracks, changed, violations: ev.violations,
        rule: `per candidate cell of the S7 default (${S7_DEFAULT}: straight claims, top-3 neighbourhoods widened on reject, K-bend search, follower, owned corridors, no foreign C1): every perspective's reading in -1 .. 1 or UNKNOWN; combined P = logistic(EVIDENCE_WEIGHTS)`,
        emits: { cells: nCells, holes: rows.filter((r) => r.cells).length, basketsTraced: Object.keys(ev.backTracks).length, meets: ev.meets.met, meetCells: ev.meets.cells, changedPicks: changed.length, ...violationEmits(ev.violations) } } };
    } });
}
