/**
 * S7 LANES: the four-lane (and three-lane) hallway cross-section and the lane tracker, as a DIFFERING PERSPECTIVE on the S7
 * default's routes (browser-safe). Sam (2026-10-21): "I had success before by making it have 3 or 4 Lanes connected traversing
 * the hall. The outer 2 are meant to stay 50% in the hall 50% out, the inner 1-2 always in."
 *
 * Ported from the provider's sensor (source/provider/packages/alg/src/detectors/threeFactor/features/st.fourLaneSensor.ts:
 * observeFourLaneCrossSection, sampleFourLaneBand) and the tracker of the Dash's Track A/B (ChainSpot 32ea57c,
 * tests/unit/laneTrackerDashsProbe.test.ts: track, observeThreeLane). Golden IS Dash's Track, so every px knob of the probe
 * converts at golden's measured hallway width W = 41.58 px (tk.s7.routeHallway) and R1 = 44.5 px:
 *
 *   probe knob (px on Dash's Track)        here                       law the quantity follows
 *   corridorWidthPx (rails at +-W/2 ...)   W, measured per image      LOCAL (tk.s7.routeHallway)
 *   lane offsets +-W/2, +-W/6, +-2W/3      LANE.railW / innerW / guardW (in W)    ribbon
 *   inner sub-samples +-laneWidth/3        LANE.innerSubW = W/9       ribbon
 *   tangentHalfPx 4                        LANE.tangentHalfW 0.096 W  ribbon (a window of the measurement)
 *   tangentSamples 5                       5 (a count)
 *   edgeDeltaPx 2.5                        LANE.edgeDeltaPx 2.5 px    SCREEN px, GLOBAL: the rail straddles the ribbon's
 *                                                                     anti-aliased edge, whose blend is ~2-3 screen px wide at
 *                                                                     every zoom (the frame and ring strokes are screen px too)
 *   liftReference 45 (gray)                LANE.liftLum 45 lum        lum (mean RGB, the scene's lum plane: the same gray)
 *   stepPx 6                               LANE.stepW 0.144 W         ribbon (a step of the measurement)
 *   headingOffsetsDeg +-18 by 6            the same, deg              angle (scale-free)
 *   lookaheadSteps 3, failureSteps 6       the same, in steps         (steps are in W)
 *   minVisibleScore 0.07                   the same (fraction of liftLum: 3.15 lum)
 *   maxUnknownSteps 16 (96 px)             LANE_UNKNOWN_RUN 96 px     an ASSUMPTION (screen px: the occluders it waits out are
 *                                                                     screen-fixed sprites), stated below
 *   maxDistancePx 600                      LANE_REACH 24 R1           an ASSUMPTION (a map distance: the hole's length)
 *   tip hit: segment within W/2 of a tip   the step enters a BasketPoint's C1 disc (R1: C1 = 10 m by definition), read after
 *                                          the badge transit (a hole runs tee -> badge -> basket: no basket ends it earlier),
 *                                          or the step enters the basket's own sprite box (screen-fixed 46 x 72 px, it
 *                                          covers the hallway's end past C1 on a zoomed-out view)
 *   own badge: straight through its box    from the tee cap S straight along the tee axis u through the badge
 *                                          (Sam: "the tee->badge segment is straight hallway"), + one step
 *   occluders: badge + basket bboxes       the S4 scene's mask (tk.s7.sceneS4: owned px of badges, baskets, tee pads,
 *                                          dilated, plus the C1 / C2 ring strokes, plus the S4 recovered baskets): a
 *                                          masked sample is UNKNOWN, never evidence (the probe's rule, per px)
 *
 * Queries (fn.q.route.*, cached by their arguments, every call profiled):
 *   fn.q.route.fourLane   { scene, x, y, heading, widthPx } -> the four-lane observation (rails, inner lanes, guards, score)
 *   fn.q.route.threeLane  { scene, x, y, heading, widthPx } -> the three-lane reduction (rails + one centre lane)
 *   fn.q.route.laneStep   { scene, lanes, x, y, heading, widthPx, straight } -> one tracker step: the heading chosen by the
 *                         sustained score over the lookahead (or straight on), the next state, its observation
 *   fn.q.route.laneTrack  { scene, lanes, start, widthPx } -> one hole's track from its tee cap, a laneStep call per step
 * Parts (Calculations, LANE_CALCULATIONS):
 *   tk.s7.laneTracksFour / tk.s7.laneTracksThree   every hole's track (tk.s7.routeStart starts, W from tk.s7.routeHallway)
 *   tk.s7.laneCrosscheck   both variants against the S7 default's routes (fn.q.trace.routeMatch, rules RULE_SETS[S7_DEFAULT]):
 *                          per hole same basket?, the max lateral distance between the polylines (W), the verdict. Recorded,
 *                          never a gate: the S7 default's output is unchanged. Renders as the course picture
 *                          (fg/s7route/laneRender.mjs).
 * Data conditions (no tee, no width, track lost, occluded) are recorded results, never throws.
 */
import { stateAssumption, underAssumption, violationEmits } from '../../fg/assumptions.mjs';
import { sha256Hex } from '../../fg/canon.mjs';
import { LANE_CROSSCHECK_SCHEMA } from '../../fg/s7route/laneRender.mjs';
import { RULE_SETS, S7_DEFAULT } from './match.mjs';
import { ROUTE_START_PART, ROUTE_HALLWAY_PART, ROUTE_CALCULATIONS } from './routeSpace.mjs';

export { LANE_CROSSCHECK_SCHEMA };
export const LANE_TRACKS_PART = Object.freeze({ 4: 'tk.s7.laneTracksFour', 3: 'tk.s7.laneTracksThree' });
export const LANE_CROSSCHECK_PART = 'tk.s7.laneCrosscheck';
const SCENE = 'tk.s7.sceneS4';

export const LANE = Object.freeze({
  railW: 1 / 2, innerW: 1 / 6, guardW: 2 / 3, innerSubW: 1 / 9, threeCentreW: [-1 / 6, 0, 1 / 6],
  edgeDeltaPx: 2.5,          // SCREEN px (GLOBAL): the anti-aliased edge band the rail straddles
  liftLum: 45,               // lum: an inside-minus-outside lift that scores 1.0
  tangentHalfW: 0.096,       // W: half the along-tangent window of one band (4 px on golden, W 41.58 px)
  tangentSamples: 5,
  stepW: 0.144,              // W: one tracker step (6 px on golden)
  headingOffsetsDeg: Object.freeze([-18, -12, -6, 0, 6, 12, 18]),
  lookaheadSteps: 3,
  failureSteps: 6,           // steps: evidence lost when this many visible steps in a row all score below minVisibleScore
  minVisibleScore: 0.07,     // fraction of liftLum
  ringR1: 1,                 // the stop: a step entering a BasketPoint's C1 disc (1 R1)
  agreeLateralW: 0.5         // the cross-check's corridor rule: the routes within W / 2 of each other (the S7 judge's rule)
});
export const LANE_UNITS = Object.freeze({
  score: 'fraction (0..1): the weakest of the rail lift and the inner-lane lift, each (inside - outside) / 45 lum, clamped',
  offsets: 'W (the hallway width, LOCAL); edgeDeltaPx in screen px',
  path: 'px (canonical frame): the tracker walk from the tee cap S, one point per step',
  walked: 'px along the walk; walkedR1 in R1 (the image C1 radius)',
  lateral: 'W: the max distance from a point of one polyline to the other polyline'
});

/**
 * ASSUMPTION: how far the tracker walks from the tee cap (the hole's length: a VARIABLE map distance). Widened x2 when a track
 * stops at it without a basket, up to the image diagonal.
 */
export const LANE_REACH = stateAssumption({
  name: 'laneTrackReachR1', quantity: 'the lane tracker\'s walked length from the tee cap (a map distance: the hole\'s length)', value: 24, unit: 'R1',
  evidence: 'the probe\'s recorded 600 px maxDistance on Dash\'s Track (golden: 13.5 R1 at R1 44.5 px); Sam\'s holes are at most 15.0 R1 long (TowneLake 2): 1.6x margin; a 1,700 ft hole is ~52 R1',
  widening: { factor: 2, limit: 'the image diagonal' }
});
/**
 * ASSUMPTION: how long the tracker walks on with no visible evidence (every band masked or off the image). What it waits out is
 * an occluder across the hallway, mostly a screen-fixed sprite, so the bound is in screen px. Widened x2 when a track stops on it,
 * up to the reach.
 */
export const LANE_UNKNOWN_RUN = stateAssumption({
  name: 'laneUnknownRunPx', quantity: 'the lane tracker\'s walk with every lane UNKNOWN (an occluder across the hallway)', value: 96, unit: 'px',
  evidence: 'the probe\'s recorded 16 steps x 6 px on Dash\'s Track; the screen-fixed sprites a hallway passes under are badge plates (54-57 x 42-44 px at Lenard 1x and 2.33x: diagonal <= 72 px) and basket sprites (46 x 72 px): 1.3x margin over the largest',
  widening: { factor: 2, limit: 'the reach (laneTrackReachR1)' }
});

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const r2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : v);
const r3 = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : v);

// ------------------------------------------------------------------ the cross-section (st.fourLaneSensor.ts)

/**
 * sampleFourLaneBand on the scene c ({ lum, mask, W, H }): the mean lum of `samples` points along the tangent at normal offset
 * offPx (normal = left of the heading: (-sin, cos)); a masked point is UNKNOWN (blocked), an off-image point is not visible.
 * occluded when half or more are blocked, or none is visible.
 */
export function laneBand(c, x, y, tx, ty, offPx, halfPx, samples = LANE.tangentSamples) {
  const nx = -ty, ny = tx, n = Math.max(1, samples);
  let total = 0, visible = 0, blocked = 0;
  for (let i = 0; i < n; i++) {
    const along = n === 1 ? 0 : -halfPx + (2 * halfPx * i) / (n - 1);
    const xi = Math.round(x + nx * offPx + tx * along), yi = Math.round(y + ny * offPx + ty * along);
    if (xi < 0 || xi >= c.W || yi < 0 || yi >= c.H) continue;
    const k = yi * c.W + xi;
    if (c.mask[k]) { blocked++; continue; }
    total += c.lum[k]; visible++;
  }
  return { mean: visible ? total / visible : null, occluded: blocked * 2 >= n || visible === 0 };
}

const lift = (inside, outside) => clamp01((inside - outside) / LANE.liftLum);
/** The ground: the mean of the visible guards at +-2W/3. */
function groundOf(c, x, y, tx, ty, W, half) {
  const g = [-1, 1].map((s) => laneBand(c, x, y, tx, ty, s * LANE.guardW * W, half)).filter((b) => !b.occluded && b.mean !== null).map((b) => b.mean);
  return g.length ? g.reduce((a, b) => a + b, 0) / g.length : null;
}
/** A rail at offset off: inside minus outside at +-edgeDeltaPx (insideSign: +1 for the left rail, -1 for the right). */
function railOf(c, x, y, tx, ty, off, insideSign, half) {
  const i = laneBand(c, x, y, tx, ty, off + insideSign * LANE.edgeDeltaPx, half), o = laneBand(c, x, y, tx, ty, off - insideSign * LANE.edgeDeltaPx, half);
  if (i.occluded || o.occluded || i.mean === null || o.mean === null) return { score: null, occluded: true };
  return { score: lift(i.mean, o.mean), occluded: false };
}
const railsOf = (left, right) => {
  const vis = [left, right].filter((r) => !r.occluded && r.score !== null);
  return vis.length === 2 ? { railMode: 'paired', railScore: Math.min(vis[0].score, vis[1].score) } : vis.length === 1 ? { railMode: 'one-sided', railScore: vis[0].score } : { railMode: 'occluded', railScore: null };
};

/** observeFourLaneCrossSection at state (x, y, heading) and hallway width W (px). */
export function fourLaneAt(c, x, y, heading, W) {
  W = Math.max(1, W);
  const tx = Math.cos(heading), ty = Math.sin(heading), half = LANE.tangentHalfW * W, ground = groundOf(c, x, y, tx, ty, W, half);
  const inner = (off) => {
    const s = [-LANE.innerSubW * W, 0, LANE.innerSubW * W].map((d) => laneBand(c, x, y, tx, ty, off + d, half));
    const vis = s.filter((b) => !b.occluded && b.mean !== null).map((b) => b.mean);
    if (s.filter((b) => b.occluded).length >= 2 || !vis.length || ground === null) return { score: null, occluded: true };
    return { score: lift(vis.reduce((a, b) => a + b, 0) / vis.length, ground), occluded: false };
  };
  const leftRail = railOf(c, x, y, tx, ty, -LANE.railW * W, 1, half), innerLeft = inner(-LANE.innerW * W), innerRight = inner(LANE.innerW * W), rightRail = railOf(c, x, y, tx, ty, LANE.railW * W, -1, half);
  const { railMode, railScore } = railsOf(leftRail, rightRail);
  const vi = [innerLeft, innerRight].filter((l) => !l.occluded && l.score !== null).map((l) => l.score), innerScore = vi.length ? Math.min(...vi) : null;
  const obs = [railScore, innerScore].filter((v) => v !== null);
  return { lanes: 4, leftRail: leftRail.score, innerLeft: innerLeft.score, innerRight: innerRight.score, rightRail: rightRail.score, ground, railMode, railScore, innerScore, score: obs.length ? Math.min(...obs) : null };
}

/** observeThreeLane (the probe's reduction): the same rails, one centre lane read at -W/6, 0, +W/6 against the ground. */
export function threeLaneAt(c, x, y, heading, W) {
  W = Math.max(1, W);
  const tx = Math.cos(heading), ty = Math.sin(heading), half = LANE.tangentHalfW * W, ground = groundOf(c, x, y, tx, ty, W, half);
  const leftRail = railOf(c, x, y, tx, ty, -LANE.railW * W, 1, half), rightRail = railOf(c, x, y, tx, ty, LANE.railW * W, -1, half);
  const { railMode, railScore } = railsOf(leftRail, rightRail);
  const cs = LANE.threeCentreW.map((o) => laneBand(c, x, y, tx, ty, o * W, half)).filter((b) => !b.occluded && b.mean !== null).map((b) => b.mean);
  const centreScore = ground !== null && cs.length ? lift(cs.reduce((a, b) => a + b, 0) / cs.length, ground) : null;
  const obs = [railScore, centreScore].filter((v) => v !== null);
  return { lanes: 3, leftRail: leftRail.score, centre: centreScore, rightRail: rightRail.score, ground, railMode, railScore, innerScore: centreScore, score: obs.length ? Math.min(...obs) : null };
}
export const observeLanes = (lanes) => (lanes === 3 ? threeLaneAt : fourLaneAt);

// ------------------------------------------------------------------ the tracker (laneTrackerDashsProbe.test.ts track)

/**
 * One step from state (x, y, heading): straight on (the deterministic transit), or the heading offset whose sustained score
 * (the weakest visible score over the lookahead) is best; a candidate with no visible lookahead scores 0 straight on, -1 turned;
 * ties by the smaller turn. -> { x, y, heading, deltaDeg, score (the first lookahead step's), sustained }.
 */
export function laneStepAt(c, lanes, x, y, heading, W, straight = false) {
  const observe = observeLanes(lanes), step = LANE.stepW * W;
  if (straight) {
    const nx = x + Math.cos(heading) * step, ny = y + Math.sin(heading) * step, o = observe(c, nx, ny, heading, W);
    return { x: nx, y: ny, heading, deltaDeg: 0, score: o.score, sustained: null, railMode: o.railMode };
  }
  const cands = LANE.headingOffsetsDeg.map((d) => {
    const h = heading + (d * Math.PI) / 180, ch = Math.cos(h), sh = Math.sin(h);
    let first = null; const vis = [];
    for (let k = 1; k <= LANE.lookaheadSteps; k++) {
      const o = observe(c, x + ch * step * k, y + sh * step * k, h, W);
      if (k === 1) first = o;
      if (o.score !== null) vis.push(o.score);
    }
    return { d, h, first, sustained: vis.length ? Math.min(...vis) : null };
  });
  const q = (a) => a.sustained ?? (a.d === 0 ? 0 : -1);
  cands.sort((a, b) => q(b) - q(a) || Math.abs(a.d) - Math.abs(b.d));
  const best = cands[0];
  return { x: x + Math.cos(best.h) * step, y: y + Math.sin(best.h) * step, heading: best.h, deltaDeg: best.d, score: best.first.score, sustained: best.sustained, railMode: best.first.railMode };
}

/**
 * The first basket the segment a -> b reaches: it enters the basket's C1 disc (ringR1 x R1 around its BasketPoint), or its sprite
 * box (boxes[k], [x, y, w, h] px: the basket sprite is opaque and screen-fixed, 46 x 72 px, so on a zoomed-out view it reaches
 * past C1 over the hallway's last stretch, and a track that met it as UNKNOWN would steer around it). -> { k, t } (t along the
 * segment), or null. exempt: baskets that cannot end this hole (their C1 or box holds the tee cap).
 */
export function discEntered(a, b, bp, R1, exempt, boxes = null) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-9, r = LANE.ringR1 * R1;
  let best = null;
  const take = (k, t, kind) => { if (!best || t < best.t || (t === best.t && k < best.k)) best = { k, t, kind }; };
  bp.forEach((p, k) => {
    if (exempt.has(k)) return;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
    if (Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]) <= r) {
      // where the segment first comes within r (the entry, not the closest approach)
      const fx = a[0] - p[0], fy = a[1] - p[1], B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - r * r, disc = B * B - 4 * L2 * C;
      take(k, C <= 0 ? 0 : Math.max(0, (-B - Math.sqrt(Math.max(0, disc))) / (2 * L2)), 'C1');
    }
    const bx = boxes?.[k];
    if (bx) for (let i = 0; i <= 8; i++) { const x = a[0] + dx * i / 8, y = a[1] + dy * i / 8; if (x >= bx[0] && x <= bx[0] + bx[2] && y >= bx[1] && y <= bx[1] + bx[3]) { take(k, i / 8, 'sprite'); break; } }
  });
  return best;
}
export const inBox = (p, b) => Boolean(b) && p[0] >= b[0] && p[0] <= b[0] + b[2] && p[1] >= b[1] && p[1] <= b[1] + b[3];

/**
 * One hole's track with the bounds reachPx and unknownPx; step(x, y, heading, straight) -> laneStepAt's answer (a store call).
 * -> { stop: 'basket' | 'evidence-lost' | 'occluded-too-long' | 'reach' | 'image-border', basket, path, ... }.
 */
export function trackWith(c, start, W, { reachPx, unknownPx, step, boxes = null }) {
  const { S, u } = start, heading0 = Math.atan2(u[1], u[0]), stepPx = LANE.stepW * W, R1 = c.R1;
  const exempt = new Set(); c.bp.forEach((p, k) => { if (Math.hypot(p[0] - S[0], p[1] - S[1]) < LANE.ringR1 * R1 || inBox(S, boxes?.[k])) exempt.add(k); });
  // the deterministic transit: the tee -> badge segment is straight hallway, through the badge plate, plus one step
  const half = c.badgeHalf?.[Number(start.hole)] ?? 0, transitPx = Math.max(0, (start.badgeAlongPx ?? 0) + half) + stepPx;
  const path = [[S[0], S[1]]], scores = [], log = [], transitCrossed = [];
  let x = S[0], y = S[1], heading = heading0, walked = 0, unknownRun = 0, transit = transitPx, turns = 0, maxUnknownPx = 0;
  const recent = [];
  while (walked < reachPx) {
    const straight = transit > 1e-9, s = step(x, y, heading, straight);
    const from = [x, y];
    x = s.x; y = s.y; heading = s.heading; walked += stepPx; path.push([x, y]);
    if (straight) transit = Math.max(0, transit - stepPx);
    if (s.deltaDeg) turns++;
    scores.push(s.score); log.push([s.score === null ? null : r3(s.score), s.deltaDeg, s.railMode ?? null, straight ? 1 : 0]);
    if (!(x >= 0 && x < c.W && y >= 0 && y < c.H)) return { stop: 'image-border', basket: null, path, walkedPx: walked, steps: path.length - 1, turns, transitPx, maxUnknownPx, scores, log, transitCrossed };
    // no basket ends a hole before its badge (the skeleton: tee -> badge -> basket): a basket is a stop only after the transit
    const hit = discEntered(from, [x, y], c.bp, R1, exempt, boxes);
    if (straight) {   // recorded, never a stop: a basket the tee -> badge segment crosses contradicts the skeleton (tee, badge, basket)
      if (hit && !transitCrossed.some((q) => q.basket === hit.k)) transitCrossed.push({ basket: hit.k, kind: hit.kind, atPx: r2(walked - stepPx + stepPx * hit.t) });
      continue;
    }
    if (hit) {
      const e = [from[0] + (x - from[0]) * hit.t, from[1] + (y - from[1]) * hit.t];
      path[path.length - 1] = e;
      path.push([c.bp[hit.k][0], c.bp[hit.k][1]]);   // the track closes on the BasketPoint whose C1 it entered (the hole ends there)
      return { stop: 'basket', basket: hit.k, path, walkedPx: walked - stepPx + stepPx * hit.t, steps: path.length - 2, turns, transitPx, maxUnknownPx, scores, log, transitCrossed };
    }
    if (s.score === null) {
      unknownRun += stepPx; maxUnknownPx = Math.max(maxUnknownPx, unknownRun);
      if (unknownRun > unknownPx) return { stop: 'occluded-too-long', basket: null, path, walkedPx: walked, steps: path.length - 1, turns, transitPx, maxUnknownPx, scores, log, transitCrossed };
    } else {
      unknownRun = 0; recent.push(s.score); if (recent.length > LANE.failureSteps) recent.shift();
      if (recent.length === LANE.failureSteps && recent.every((v) => v < LANE.minVisibleScore)) return { stop: 'evidence-lost', basket: null, path, walkedPx: walked, steps: path.length - 1, turns, transitPx, maxUnknownPx, scores, log, transitCrossed };
    }
  }
  return { stop: 'reach', basket: null, path, walkedPx: walked, steps: path.length - 1, turns, transitPx, maxUnknownPx, scores, log, transitCrossed };
}

/** One hole's track under the two stated assumptions (reach outside, the unknown run inside): -> { ...track, violations }. */
export function laneTrackOf(c, start, W, step, boxes = null) {
  const diag = Math.hypot(c.W, c.H), violations = [];
  const outer = underAssumption(LANE_REACH, { unitPx: c.R1, limitPx: diag, detail: { hole: start.hole },
    run: (reachPx) => {
      const inner = underAssumption(LANE_UNKNOWN_RUN, { unitPx: 1, limitPx: reachPx, detail: { hole: start.hole },
        run: (unknownPx) => { const t = trackWith(c, start, W, { reachPx, unknownPx, step, boxes }); return { result: t, found: t.stop !== 'occluded-too-long', atEdge: false, at: t.maxUnknownPx }; } });
      if (inner.violation) violations.push(inner.violation);
      return { result: inner.result, found: inner.result.stop !== 'reach', atEdge: false, at: inner.result.walkedPx };
    } });
  if (outer.violation) violations.push(outer.violation);
  return { ...outer.result, violations };
}

// ------------------------------------------------------------------ the cross-check

const segDist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-9, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
const polyDist = (p, V) => { let m = Infinity; for (let i = 0; i + 1 < V.length; i++) m = Math.min(m, segDist(p, V[i], V[i + 1])); return V.length === 1 ? Math.hypot(p[0] - V[0][0], p[1] - V[0][1]) : m; };
/** Points along a polyline every `step` px (its vertices included). */
export function samplePoly(V, step) {
  const out = [];
  for (let i = 0; i + 1 < V.length; i++) { const a = V[i], b = V[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / step)); for (let k = 0; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); }
  if (V.length) out.push(V.at(-1));
  return out;
}
/** The max distance from the points of A (sampled every W/8) to the polyline B, in W. */
export const maxLateralW = (A, B, W) => (A.length && B.length ? samplePoly(A, W / 8).reduce((m, p) => Math.max(m, polyDist(p, B)), 0) / W : null);

/** Douglas-Peucker at eps px: the walk as a few vertices, for the render and the bend count. */
function simplifyWalk(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Set([0, pts.length - 1]);
  const rec = (i0, i1) => { let w = -1, at = -1; for (let i = i0 + 1; i < i1; i++) { const d = segDist(pts[i], pts[i0], pts[i1]); if (d > w) { w = d; at = i; } } if (w > eps) { keep.add(at); rec(i0, at); rec(at, i1); } };
  rec(0, pts.length - 1);
  return [...keep].sort((a, b) => a - b).map((i) => pts[i]);
}

/**
 * One variant's tracks against the default's solve. verdict: agree (same basket, every point of each route within
 * agreeLateralW x W of the other), route-differs (same basket, farther apart), basket-differs (the tracker entered another
 * basket's C1), no-basket (the tracker stopped short: its stop says why), no-default (the default has no route).
 */
export function crosscheckOf(tracks, solve, holesPart, W) {
  const names = holesPart.baskets.map((b) => b.name);
  const rows = tracks.holes.map((t) => {
    const d = solve.holes?.[t.hole] ?? solve.holes?.[Number(t.hole)] ?? null, dv = d?.verts ?? [];
    const defaultBasket = d?.end ?? null, trackBasket = t.basket;
    const trackToDefaultW = dv.length ? maxLateralW(t.path, dv, W) : null;
    const defaultToTrackW = dv.length && t.stop === 'basket' ? maxLateralW(dv, t.path, W) : null;
    const lateralW = trackToDefaultW === null ? null : Math.max(trackToDefaultW, defaultToTrackW ?? 0);
    const verdict = !dv.length || defaultBasket === null ? 'no-default' : t.stop !== 'basket' ? 'no-basket' : trackBasket !== defaultBasket ? 'basket-differs' : lateralW > LANE.agreeLateralW ? 'route-differs' : 'agree';
    return { hole: t.hole, verdict, sameBasket: t.stop === 'basket' && defaultBasket !== null ? trackBasket === defaultBasket : null,
      trackBasket: trackBasket === null ? null : names[trackBasket] ?? `BP${trackBasket}`, defaultBasket: defaultBasket === null ? null : names[defaultBasket] ?? `BP${defaultBasket}`,
      trackStop: t.stop, transitCrosses: (t.transitCrossed ?? []).map((q) => `${names[q.basket] ?? `BP${q.basket}`} (${q.kind})`), trackToDefaultW: r3(trackToDefaultW), defaultToTrackW: r3(defaultToTrackW), lateralW: r3(lateralW),
      trackWalkedR1: t.walkedR1, defaultLengthR1: dv.length ? r2(dv.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - dv[i][0], p[1] - dv[i][1]), 0) / (tracks.R1Px || 1)) : null,
      defaultBends: Math.max(0, dv.length - 2), trackPath: t.verts, defaultPath: dv };
  });
  const n = (v) => rows.filter((r) => r.verdict === v).length;
  return { rows, totals: { holes: rows.length, agree: n('agree'), routeDiffers: n('route-differs'), basketDiffers: n('basket-differs'), noBasket: n('no-basket'), noDefault: n('no-default'),
    flagged: rows.filter((r) => r.verdict !== 'agree' && r.verdict !== 'no-default').length, transitCrosses: rows.filter((r) => r.transitCrosses.length).length } };
}

// ------------------------------------------------------------------ the store boundary

const ctx = (scene) => (scene?.lum && scene?.mask ? scene : null);
const noScene = (fn) => ({ value: { condition: `${fn}: no hallway scene (pass scene: '${SCENE}')` }, unit: 'condition' });
const observeQuery = (lanes, fn) => ({ scene, x, y, heading, widthPx }) => {
  const c = ctx(scene);
  if (!c) return noScene(fn);
  if (!(widthPx > 0)) return { value: { condition: `${fn}: no hallway width` }, unit: 'condition' };
  return { value: observeLanes(lanes)(c, x, y, heading, widthPx), unit: `score: ${LANE_UNITS.score}; rails / lanes: the same fraction; ground: lum` };
};
const laneTrackQuery = ({ scene, lanes, start, widthPx, boxes = null }, _args, call) => {
  const c = ctx(scene);
  if (!c) return noScene('fn.q.route.laneTrack');
  if (!(widthPx > 0)) return { value: { hole: start?.hole ?? null, condition: 'no hallway width: not tracked' }, unit: 'condition' };
  const step = (x, y, heading, straight) => call('fn.q.route.laneStep', { scene: SCENE, lanes, x, y, heading, widthPx, straight });
  const t = laneTrackOf(c, start, widthPx, step, boxes);
  const visible = t.scores.filter((v) => v !== null);
  return { value: { hole: start.hole, lanes, stop: t.stop, basket: t.basket, walkedPx: r2(t.walkedPx), walkedR1: r2(t.walkedPx / c.R1), steps: t.steps, turns: t.turns, transitPx: r2(t.transitPx),
    maxUnknownPx: r2(t.maxUnknownPx), transitCrossed: t.transitCrossed, visibleSteps: visible.length, meanScore: visible.length ? r3(visible.reduce((a, b) => a + b, 0) / visible.length) : null,
    tail: t.log.slice(-(LANE.failureSteps + 4)).map(([score, deltaDeg, railMode, straight]) => ({ score, deltaDeg, railMode, straight })),
    path: t.path.map((p) => [r2(p[0]), r2(p[1])]), verts: simplifyWalk(t.path, widthPx / 4).map((p) => [r2(p[0]), r2(p[1])]), violations: t.violations },
  unit: `path / verts: ${LANE_UNITS.path}; ${LANE_UNITS.walked}`, emits: { steps: t.steps, reached: t.stop === 'basket' ? 1 : 0, ...violationEmits(t.violations) } };
};
laneTrackQuery.calls = ['fn.q.route.laneStep'];
export const LANE_QUERIES = Object.freeze({
  'fn.q.route.fourLane': observeQuery(4, 'fn.q.route.fourLane'),
  'fn.q.route.threeLane': observeQuery(3, 'fn.q.route.threeLane'),
  'fn.q.route.laneStep': ({ scene, lanes, x, y, heading, widthPx, straight = false }) => {
    const c = ctx(scene);
    if (!c) return noScene('fn.q.route.laneStep');
    return { value: laneStepAt(c, lanes, x, y, heading, widthPx, straight), unit: `x, y: px (canonical frame); heading: rad; deltaDeg: deg; score, sustained: ${LANE_UNITS.score}` };
  },
  'fn.q.route.laneTrack': laneTrackQuery
});

const CODE = sha256Hex([inBox, laneBand, groundOf, railOf, railsOf, fourLaneAt, threeLaneAt, laneStepAt, discEntered, trackWith, laneTrackOf, crosscheckOf, maxLateralW, samplePoly, simplifyWalk, laneTrackQuery].map(String).join('\n') + JSON.stringify(LANE));

/** The tracks of one variant: every hole of tk.s7.routeStart from its tee cap. */
export function laneTracksOf(call, start, hallway, scene, lanes, holesPart = null) {
  const boxes = holesPart ? holesPart.baskets.map((b) => b.bbox) : null;   // the basket sprites, in the scene's BasketPoint order
  const W = hallway.widthPx ?? null;
  const holes = start.holes.map((h) => call('fn.q.route.laneTrack', { scene: SCENE, lanes, start: h, widthPx: W, boxes }).value);
  const violations = holes.flatMap((h) => h.violations ?? []);
  const n = (s) => holes.filter((h) => h.stop === s).length;
  return { schema: 'nctk-s7-lane-tracks@1', lanes, widthPx: W, R1Px: scene.R1, holes, conditions: [...start.conditions.map((c) => ({ hole: c.hole, condition: c.condition })), ...(W ? [] : [{ condition: 'no hallway width: nothing tracked' }])],
    rule: `${lanes}-lane tracker from each tee cap S along its tee axis: straight through the badge, then steps of ${LANE.stepW} W choosing among heading offsets ${LANE.headingOffsetsDeg.join(', ')} deg by the weakest visible score over ${LANE.lookaheadSteps} steps; stops entering a BasketPoint's C1 disc, on ${LANE.failureSteps} visible steps below ${LANE.minVisibleScore}, or at a stated bound`,
    units: LANE_UNITS, emits: { holes: holes.length, reached: n('basket'), evidenceLost: n('evidence-lost'), occluded: n('occluded-too-long'), reach: n('reach'), steps: holes.reduce((s, h) => s + (h.steps ?? 0), 0), ...violationEmits(violations) } };
}

export const LANE_CALCULATIONS = Object.freeze([
  ...[4, 3].map((lanes) => [`fn.${LANE_TRACKS_PART[lanes]}`, { inParts: [SCENE, ROUTE_START_PART, ROUTE_HALLWAY_PART, 'tk.s7.holes'], outParts: [LANE_TRACKS_PART[lanes]], calls: ['fn.q.route.laneTrack'], code: CODE,
    note: `the ${lanes}-lane tracker on every hole (ports/s7route/laneSpace.mjs)`,
    calculate: (io) => ({ [LANE_TRACKS_PART[lanes]]: laneTracksOf(io.call, io.in(ROUTE_START_PART), io.in(ROUTE_HALLWAY_PART), io.in(SCENE), lanes, io.in('tk.s7.holes')) }) }]),
  ['fn.tk.s7.laneCrosscheck', { inParts: [LANE_TRACKS_PART[4], LANE_TRACKS_PART[3], 'tk.s7.holes', ROUTE_HALLWAY_PART, SCENE], outParts: [LANE_CROSSCHECK_PART], calls: ['fn.q.trace.routeMatch'], code: CODE,
    note: `the four- and three-lane tracks against the S7 default (${S7_DEFAULT}): same basket, max lateral distance (W), verdict; recorded, never a gate`,
    calculate: (io) => {
      const solve = io.call('fn.q.trace.routeMatch', { rules: RULE_SETS[S7_DEFAULT] }).value, holes = io.in('tk.s7.holes'), W = io.in(ROUTE_HALLWAY_PART).widthPx, S = io.in(SCENE);
      const variants = Object.fromEntries([4, 3].map((lanes) => { const t = io.in(LANE_TRACKS_PART[lanes]); return [lanes === 4 ? 'fourLane' : 'threeLane', { ...crosscheckOf(t, solve, holes, W), emitsOfTracks: t.emits }]; }));
      return { [LANE_CROSSCHECK_PART]: { schema: LANE_CROSSCHECK_SCHEMA, reference: S7_DEFAULT, widthPx: W, R1Px: S.R1, agreeLateralW: LANE.agreeLateralW, variants,
        baskets: holes.baskets.map((b) => ({ name: b.name, point: b.point })),
        rule: `per hole: the tracker's basket vs the default's; lateral = the max distance from a point of either route to the other (W; the default's route only up to where a stopped track ended is not compared); agree = same basket and lateral <= ${LANE.agreeLateralW} W (the S7 judge's corridor rule); a cross-check, recorded, never a gate`,
        units: { ...LANE_UNITS, widthPx: 'px (hallway width W, LOCAL)', R1Px: 'px (the C1 radius, LOCAL)' },
        emits: Object.fromEntries(Object.entries(variants).flatMap(([k, v]) => [[`${k}Agree`, v.totals.agree], [`${k}Flagged`, v.totals.flagged]])) } };
    } }]
]);

/** Register the lane queries and Calculations on a store that already has the S7 scene, starts and hallway (routeTableOn). */
export function registerLanes(store, registerQueries) {
  for (const [fn, spec] of ROUTE_CALCULATIONS) if (!store.registered(fn)) store.register(fn, spec);
  if (!store.registered('fn.q.route.laneStep')) registerQueries(store, LANE_QUERIES, { note: 'S7 lanes: the four- / three-lane cross-section and tracker (ports/s7route/laneSpace.mjs)' });
  for (const [fn, spec] of LANE_CALCULATIONS) if (!store.registered(fn)) store.register(fn, spec);
}
