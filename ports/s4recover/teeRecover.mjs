/**
 * fn.Tee.recover: S4 tee recovery as a ComparableForkJoin slot
 * (browser-safe core; no node:* imports).
 *
 * Sam's S4 doctrine (2026-10-17): recovery finds tees until the tee count
 * matches the badge cardinality N. Occlusion-aware by default: a sprite
 * searched for in recovery is ASSUMED occluded to some degree by other
 * rendered pixels (badges, baskets, C1/C2 dashes and translucent fills, the
 * path). S1-S3 give the anchors. A tee pad is a RIGID template per course
 * (size scales with the map, the white frame stroke is a few screen px, the
 * interior is a course-constant grey). A tee's axis points at its badge
 * (hole n's tee -> badge n). "One model could greedily search for occluded
 * sprites." Every number recorded here carries its unit in its name
 * (...Px, ...Deg, ...Frac) or in an explicit `unit` field.
 *
 * Coordinates: canonical (S0-cropped) raster frame, pixel CENTERS at integer
 * coordinates (the convention of fn.Tee.detectRings ring centers and of
 * Sam's annotated ring-hole centroids). Angles: a pad's long axis, radians,
 * compared modulo pi (an axis, contracts/tee.pose@1).
 *
 * Exports
 *   TEE_RECOVER_SLOT            slot id, slot Part, FG ids, judge radius
 *   fitPadTemplate(raster, anchors, interiorTone)
 *                               the course's rigid pad template measured
 *                               from S3 anchors: mean luminance profiles
 *                               across the anchors along / across the axis,
 *                               50% crossings -> outer and inner half
 *                               lengths/widths (px), stroke px, plus the
 *                               frame-white threshold from the anchors'
 *                               frame-core pixels
 *   classifyRaster(raster, cls) per-pixel class: WHITE (frame-white),
 *                               INTERIOR (course interior grey), TINT
 *                               (translucent bluish-grey overlay: path,
 *                               C1/C2 dashes and fills), OTHER
 *   buildOccluders(...)         per-pixel known-occluder code (S1 badge px,
 *                               S1 mute px, S2 basket px, S4 recovered
 *                               basket boxes, S3 admitted tees)
 *   assignTeesToBadges(...)     S3 tees -> badges by the badge-ray rule
 *                               (axis line through the plate), nearest
 *                               plate, min-distance one-to-one
 *   createRecoveryContext(parts-like inputs)
 *   evaluatePose(ctx, pose)     visible / negative / occluded evidence of
 *                               the template at one pose
 *   searchBadge(ctx, badge, opts)  best pose for one badge
 *   greedyRecover(ctx, opts)    greedy over badges with no tee, owning each
 *                               accepted pose's pixels, stopping at N
 */

export const TEE_RECOVER_SLOT = Object.freeze({
  slot: 'fn.Tee.recover',
  part: 'px.tees.recovered',
  materialize: 'fg.s4.teeRecover.materialize',
  testimony: 'fg.s4.teeRecover.testimony',
  hitRadiusPx: 3,
  cropPx: 64,
  cropScale: 5
});

export const ACCEPTANCE = "UNKNOWN: acceptance is Sam's; agreement with his annotation testimony is evidence only";

export const CLASS = Object.freeze({ OTHER: 0, WHITE: 1, INTERIOR: 2, TINT: 3 });
export const OCC = Object.freeze({ none: 0, badge: 1, mute: 2, basket: 3, recoveredBasket: 4, tee: 5, recoveredTee: 6, basketFringe: 7 });
export const OCC_NAMES = Object.freeze(['none', 'badge', 'mute', 'basket', 'recoveredBasket', 'tee', 'recoveredTee', 'basketFringe']);

/** Fixed rule constants (a priori, never fitted to testimony); units in names. */
export const RULES = Object.freeze({
  zoneMarginPx: 0.75,          // template zone edges are not scored within this distance (antialias)
  outsideRingPx: 2,            // width of the scored ring just outside the pad
  outsideWhiteWeight: 0.5,     // penalty per unoccluded frame-white px just outside the pad
  whiteChromaMax: 16,          // max-min channel spread of frame-white px
  interiorNeutralMax: 6,       // max-min channel spread of interior-grey px
  tintBlueMin: 6,              // b - r of the translucent bluish overlay (path / C1 / C2)
  tintMinChannel: 120,         // darkest channel of an overlay px
  tintChromaMax: 40,
  badgeRayTolDeg: 3,           // tee axis vs direction to its badge
  badgeRayStepDeg: 1,
  freeAngleStepDeg: 4,         // ablation without the badge-ray rule (coarse)
  searchRadiusFactor: 1.25,    // x max S3 tee-badge distance (px)
  minVisibleFramePx: 6,
  minVisibleFrameFrac: 0.1,    // of the template frame-core px
  maxContradictionFrac: 0.35,  // negative / (positive + negative) evidence px
  refineTop: 8,
  basketFringePx: 2,           // S2/S4 basket px dilated by this (Euclidean px): the black-outline AA seam S2 does not own
  seedFailedTestsAllowed: Object.freeze(['fitted-size', 'border-complete', 'band-coverage']),
  // occluder search (Sam: S4 is occlusion-aware by default; assume the sought sprite is occluded, entail it)
  hiddenDistMargin: 0.1,       // tee->badge distance range = this course's S3 range widened by this fraction each way
  hiddenMinFrac: 0.5,          // the occluding sprites must hide at least this fraction of the pad's template px
  hiddenMaxNegativeFrac: 0.02, // visible px contradicting the pad (wrong class, white just outside) / template px
  hallwayMinStepLum: 12,       // tee->badge edge step; dev: real segments median 27-44 lum, other-badge impostors max 9.7
  hallwaySubsamplePx: 3,       // feasible hidden centres are hallway-tested on this grid
  peekMinFramePx: 3,           // frame-white px of a hidden pad visible outside its occluder: direct evidence, pins the pose
  boundaryDirs: 16,            // occluder search: rays from the seed along which the feasible region's edge is bisected
  boundaryTolPx: 0.5,          // bisection stops within this (px)
  visibleSeeds: 'components',  // visible search: centres near unowned bright components ('disk': near any white px)
  seedStepPx: 2                // grid of component-seeded centres (px); refinement goes sub-pixel
});

import { nameCandidates } from '../../fg/names.mjs';
import { greedyLoop, localQueries } from './poseSpace.mjs';
import { pxList, componentStats, ownerPlane } from '../../fg/pxset.mjs';
import { basketPoint } from '../../fg/s2/fg.s2.basketInvariants.observe.fg.mjs';

const DEG = 180 / Math.PI;
const r3 = (v) => Math.round(v * 1000) / 1000;
export const axisDiffDeg = (a, b) => { let d = Math.abs(a - b) % Math.PI; if (d > Math.PI / 2) d = Math.PI - d; return d * DEG; };
const quantile = (xs, q) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))] : NaN; };

// ---------------------------------------------------------------- template

function lumBilinear({ rgba, widthPx: W, heightPx: H }, x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const g = (X, Y) => {
    if (X < 0 || Y < 0 || X >= W || Y >= H) return NaN;
    const i = (Y * W + X) * 4; return Math.min(rgba[i], rgba[i + 1], rgba[i + 2]);
  };
  return g(x0, y0) * (1 - fx) * (1 - fy) + g(x0 + 1, y0) * fx * (1 - fy) + g(x0, y0 + 1) * (1 - fx) * fy + g(x0 + 1, y0 + 1) * fx * fy;
}

/** Half-extent crossings of a symmetric frame profile (one side, t >= 0). */
function crossings(ts, vals) {
  const interior = vals[0];
  let peak = 0;
  for (let k = 1; k < vals.length; k++) if (vals[k] > vals[peak]) peak = k;
  const innerThr = (interior + vals[peak]) / 2;
  let inner = NaN;
  for (let k = 1; k <= peak; k++) if (vals[k] >= innerThr) { inner = ts[k - 1] + (ts[k] - ts[k - 1]) * (innerThr - vals[k - 1]) / (vals[k] - vals[k - 1]); break; }
  const step = ts[1] - ts[0];
  const bgK = Math.min(vals.length - 1, peak + Math.round(4 / step));
  const outerThr = (vals[peak] + vals[bgK]) / 2;
  let outer = NaN;
  for (let k = peak + 1; k <= bgK; k++) if (vals[k] <= outerThr) { outer = ts[k - 1] + (ts[k] - ts[k - 1]) * (vals[k - 1] - outerThr) / (vals[k - 1] - vals[k]); break; }
  return { inner, outer, peakLum: vals[peak] };
}

export function fitPadTemplate(raster, anchors, interiorTone) {
  if (!anchors.length) throw new Error('fitPadTemplate: no S3 anchors; the rigid pad template is measured from them');
  const maxHalf = 4 + Math.max(...anchors.map((a) => a.frameMajorPx ?? 40)) / 2 + 4;
  const step = 0.25;
  const ts = []; for (let t = 0; t <= maxHalf; t += step) ts.push(t);
  const profile = (axis, sign) => ts.map((t) => {
    let acc = 0, n = 0;
    for (const a of anchors) {
      const c = Math.cos(a.angleRad), s = Math.sin(a.angleRad);
      for (let w = -1.5; w <= 1.5; w += 0.5) {
        const [u, v] = axis === 'u' ? [sign * t, w] : [w, sign * t];
        const val = lumBilinear(raster, a.center[0] + c * u - s * v, a.center[1] + s * u + c * v);
        if (Number.isFinite(val)) { acc += val; n++; }
      }
    }
    return n ? acc / n : NaN;
  });
  const side = (axis) => [1, -1].map((sg) => crossings(ts, profile(axis, sg)));
  const [u1, u2] = side('u'), [v1, v2] = side('v');
  const halfLengthOutPx = (u1.outer + u2.outer) / 2, halfLengthInPx = (u1.inner + u2.inner) / 2;
  const halfWidthOutPx = (v1.outer + v2.outer) / 2, halfWidthInPx = (v1.inner + v2.inner) / 2;
  const tpl = {
    unit: 'px',
    anchorCount: anchors.length,
    halfLengthOutPx: r3(halfLengthOutPx), halfLengthInPx: r3(halfLengthInPx),
    halfWidthOutPx: r3(halfWidthOutPx), halfWidthInPx: r3(halfWidthInPx),
    lengthPx: r3(2 * halfLengthOutPx), widthPx: r3(2 * halfWidthOutPx),
    strokeEndPx: r3(halfLengthOutPx - halfLengthInPx), strokeSidePx: r3(halfWidthOutPx - halfWidthInPx),
    interiorTone: interiorTone.median, interiorToneTolerance: interiorTone.tolerance,
    rule: 'mean min-channel luminance profiles across all anchors (bilinear, 0.25 px steps, 3 px wide band), 50% crossings interior->white (inner) and white->background 4 px out (outer), both sides averaged'
  };
  if (![tpl.halfLengthOutPx, tpl.halfLengthInPx, tpl.halfWidthOutPx, tpl.halfWidthInPx].every((v) => Number.isFinite(v) && v > 0) || tpl.halfLengthInPx >= tpl.halfLengthOutPx || tpl.halfWidthInPx >= tpl.halfWidthOutPx)
    throw new Error(`fitPadTemplate: anchor profiles gave no frame crossings ${JSON.stringify(tpl)}`);
  // Frame-white threshold: the anchors' own frame-core px, 5th percentile less 5 levels.
  const core = [];
  for (const a of anchors) forTemplatePx(tpl, a.center[0], a.center[1], a.angleRad, raster.widthPx, raster.heightPx, (i, zone) => {
    if (zone === ZONE.FRAME) { const k = i * 4; core.push(Math.min(raster.rgba[k], raster.rgba[k + 1], raster.rgba[k + 2])); }
  });
  tpl.whiteMinLevel = Math.max(180, Math.round(quantile(core, 0.05) - 5));
  tpl.whiteRule = `frame-white: min channel >= ${tpl.whiteMinLevel} (anchors' frame-core 5th percentile ${quantile(core, 0.05)} less 5 levels, floor 180) and channel spread <= ${RULES.whiteChromaMax}`;
  return tpl;
}

export const ZONE = Object.freeze({ NONE: 0, FRAME: 1, INTERIOR: 2, OUTSIDE: 3 });

/** Visit every raster px the template scores at a pose: cb(index, zone, x, y). */
export function forTemplatePx(tpl, cx, cy, angleRad, W, H, cb) {
  const m = RULES.zoneMarginPx, ring = RULES.outsideRingPx;
  const Lo = tpl.halfLengthOutPx, Li = tpl.halfLengthInPx, So = tpl.halfWidthOutPx, Si = tpl.halfWidthInPx;
  const c = Math.cos(angleRad), s = Math.sin(angleRad);
  const R = Math.hypot(Lo + m + ring, So + m + ring);
  const x0 = Math.floor(cx - R), x1 = Math.ceil(cx + R), y0 = Math.floor(cy - R), y1 = Math.ceil(cy + R);
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const a = Math.abs(dx * c + dy * s), b = Math.abs(-dx * s + dy * c);
      let zone = ZONE.NONE;
      if (a <= Lo - m && b <= So - m) {
        if (a <= Li - m && b <= Si - m) zone = ZONE.INTERIOR;
        else if (a >= Li + m || b >= Si + m) zone = ZONE.FRAME;
      } else if ((a >= Lo + m || b >= So + m) && a <= Lo + m + ring && b <= So + m + ring) zone = ZONE.OUTSIDE;
      if (zone === ZONE.NONE) continue;
      cb(x < 0 || y < 0 || x >= W || y >= H ? -1 : y * W + x, zone, x, y);
    }
  }
}

/** The pad's outline (outer rectangle corners, px) at a pose. */
export function padCorners(tpl, [cx, cy], angleRad) {
  const c = Math.cos(angleRad), s = Math.sin(angleRad), L = tpl.halfLengthOutPx, S = tpl.halfWidthOutPx;
  return [[L, S], [-L, S], [-L, -S], [L, -S]].map(([u, v]) => [r3(cx + c * u - s * v), r3(cy + s * u + c * v)]);
}

// ---------------------------------------------------------------- rasters

export function classifyRaster({ rgba, widthPx: W, heightPx: H }, tpl) {
  const out = new Uint8Array(W * H);
  const [T0, T1, T2] = tpl.interiorTone, tol = tpl.interiorToneTolerance, wMin = tpl.whiteMinLevel;
  for (let i = 0, k = 0; i < out.length; i++, k += 4) {
    const r = rgba[k], g = rgba[k + 1], b = rgba[k + 2];
    const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
    if (mn >= wMin && mx - mn <= RULES.whiteChromaMax) out[i] = CLASS.WHITE;
    else if (mx - mn <= RULES.interiorNeutralMax && Math.max(Math.abs(r - T0), Math.abs(g - T1), Math.abs(b - T2)) <= tol) out[i] = CLASS.INTERIOR;
    else if (b - r >= RULES.tintBlueMin && mn >= RULES.tintMinChannel && mx - mn <= RULES.tintChromaMax) out[i] = CLASS.TINT;
    else out[i] = CLASS.OTHER;
  }
  return out;
}

export function buildOccluders({ widthPx: W, heightPx: H }, { badges = [], baskets = [], recoveredBasketBoxes = [], tees = [], basketFringePx = RULES.basketFringePx }, tpl) {
  const occ = new Uint8Array(W * H);
  // The fringe is the black outline's anti-alias seam: black blended into the background, never brighter than it. A
  // frame-white px there is not the basket's: it is a sprite underneath peeking out (Sam, 2026-10-18: Tee 5 in Basket
  // 4's notch), so the fringe never claims it.
  const rgba = arguments[0].rgba;
  const frameWhite = (i) => { if (!rgba || !tpl?.whiteMinLevel) return false; const k = i * 4, a = rgba[k], b = rgba[k + 1], c = rgba[k + 2];
    return Math.min(a, b, c) >= tpl.whiteMinLevel && Math.max(a, b, c) - Math.min(a, b, c) <= RULES.whiteChromaMax; };
  const box = ([x, y, w, h], code) => {
    for (let yy = Math.max(0, Math.floor(y)); yy < Math.min(H, Math.ceil(y + h)); yy++)
      for (let xx = Math.max(0, Math.floor(x)); xx < Math.min(W, Math.ceil(x + w)); xx++) occ[yy * W + xx] = code;
  };
  // increasing priority: later writes win
  // basket outline anti-alias fringe: S2 basket px and S4 recovered basket boxes dilated by basketFringePx
  const f = basketFringePx, f2 = f * f;
  const fringeAt = (x, y) => {
    for (let dy = -f; dy <= f; dy++) for (let dx = -f; dx <= f; dx++) {
      if (dx * dx + dy * dy > f2) continue;
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < W && yy < H && !frameWhite(yy * W + xx)) occ[yy * W + xx] = OCC.basketFringe;
    }
  };
  for (const b of baskets) for (const i of b.px) fringeAt(i % W, Math.floor(i / W));
  for (const [x, y, w, h] of recoveredBasketBoxes) for (let yy = Math.floor(y); yy < Math.ceil(y + h); yy++) for (const xx of [Math.floor(x), Math.ceil(x + w) - 1]) fringeAt(xx, yy);
  for (const [x, y, w, h] of recoveredBasketBoxes) for (let xx = Math.floor(x); xx < Math.ceil(x + w); xx++) for (const yy of [Math.floor(y), Math.ceil(y + h) - 1]) fringeAt(xx, yy);
  for (const b of recoveredBasketBoxes) box(b, OCC.recoveredBasket);
  for (const t of tees) {
    forTemplatePx(tpl, t.center[0], t.center[1], t.angleRad, W, H, (i, zone) => { if (i >= 0 && zone !== ZONE.OUTSIDE) occ[i] = OCC.tee; });
    for (const i of t.px ?? []) occ[i] = OCC.tee;
  }
  for (const b of baskets) for (const i of b.px) occ[i] = OCC.basket;
  for (const b of badges) for (const i of b.mutePx ?? []) occ[i] = OCC.mute;
  for (const b of badges) for (const i of b.px) occ[i] = OCC.badge;
  return occ;
}

// ---------------------------------------------------------------- badges

/** Min-cost assignment (Hungarian, rows <= cols after transpose). cost[i][j]; Infinity = forbidden. */
function hungarian(cost) {
  const n = cost.length, m = n ? cost[0].length : 0;
  if (!n || !m) return [];
  const T = n > m;
  const C = T ? cost[0].map((_, j) => cost.map((row) => row[j])) : cost;
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
  for (let j = 1; j <= M; j++) if (p[j]) {
    const [i, jj] = T ? [j - 1, p[j] - 1] : [p[j] - 1, j - 1];
    if (Number.isFinite(cost[i][jj])) pairs.push([i, jj]);
  }
  return pairs;
}

export const badgeRayDeg = (center, angleRad, plateCenter) =>
  axisDiffDeg(angleRad, Math.atan2(plateCenter[1] - center[1], plateCenter[0] - center[0]));

/**
 * S3 tees -> badges by the badge-ray rule: the tee's axis LINE passes
 * through the badge plate (lateral miss of the plate center, distance x
 * sin(residual), <= half the plate's smaller side, px), and among the
 * plates it passes through a tee belongs to the nearest: one-to-one,
 * minimum total tee-plate distance (px).
 */
export function assignTeesToBadges(tees, badges) {
  const cost = tees.map((t) => badges.map((b) => {
    const res = badgeRayDeg(t.center, t.angleRad, b.plateCenter);
    const d = Math.hypot(b.plateCenter[0] - t.center[0], b.plateCenter[1] - t.center[1]);
    if (d * Math.sin(res / DEG) > b.plateHalfMinPx) return Infinity;
    return d;
  }));
  const pairs = hungarian(cost);
  return pairs.map(([ti, bi]) => ({
    tee: ti, badge: bi, label: badges[bi].label,
    residualDeg: r3(badgeRayDeg(tees[ti].center, tees[ti].angleRad, badges[bi].plateCenter)),
    distancePx: r3(Math.hypot(badges[bi].plateCenter[0] - tees[ti].center[0], badges[bi].plateCenter[1] - tees[ti].center[1])),
    lateralMissPx: r3(Math.hypot(badges[bi].plateCenter[0] - tees[ti].center[0], badges[bi].plateCenter[1] - tees[ti].center[1]) * Math.sin(badgeRayDeg(tees[ti].center, tees[ti].angleRad, badges[bi].plateCenter) / DEG))
  })).sort((a, b) => a.badge - b.badge);
}

// ---------------------------------------------------------------- context

/**
 * inputs: { raster: {rgba, widthPx, heightPx}, badges: [{index,label,bbox,px,mutePx,plateCenter}],
 *   baskets: [{px}], recoveredBasketBoxes: [[x,y,w,h]], tees: [{center, angleRad, px}],
 *   anchors: [{center, angleRad, frameMajorPx}], interiorTone: {median, tolerance} }
 */
export function createRecoveryContext(inputs) {
  const { raster } = inputs;
  // No usable template (no S3 anchors, or their profiles gave no frame crossings) is data, not a stop: the context
  // carries why, recovery returns nothing recovered with that reason, and everything downstream still runs.
  // Shared Parts (tk.s4.padTemplate, tk.s4.evidence, tk.s4.hallway) are used when given: computed once per run,
  // read by every branch; a branch only copies the evidence plane it writes recovered pads into.
  const T = inputs.template ?? padTemplatePart(raster, inputs.anchors, inputs.interiorTone);
  const tpl = T.tpl;
  if (!tpl) {
    return { W: raster.widthPx, H: raster.heightPx, raster, tpl: null, unavailable: T.unavailable, badges: inputs.badges, tees: inputs.tees,
      assignment: assignTeesToBadges(inputs.tees, inputs.badges), seeds: inputs.seeds ?? [], searchRadiusPx: null, searchRule: null };
  }
  const E = inputs.evidence ?? evidencePart(raster, inputs, tpl);
  const cls = E.cls, occ = E.occ;
  const assignment = assignTeesToBadges(inputs.tees, inputs.badges);
  const maxAssignedPx = assignment.length ? Math.max(...assignment.map((a) => a.distancePx)) : 8 * tpl.lengthPx;
  // Opaque sprites by name: where a fully hidden pad can be (occluder search).
  // Baskets carry candidate names (fg/names.mjs, raster order of the BasketPoint, as the judge names them) until a hole
  // proves them; badges carry the label S1 read.
  const s2b = (inputs.baskets ?? []).filter((b) => b.bbox), s4b = inputs.recoveredBasketBoxes ?? [];
  const n2 = nameCandidates('Basket', s2b, (b) => basketPoint(b.bbox)), n4 = nameCandidates('Basket', s4b, (bb) => basketPoint(bb)).map((n) => `S4 ${n}`);
  const sprites = [
    ...s2b.map((b, i) => ({ kind: 'basket', name: n2[i], part: `basket ${b.index ?? i}`, bbox: b.bbox })),
    ...s4b.map((bb, i) => ({ kind: 'basket', name: n4[i], bbox: bb })),
    ...inputs.badges.map((b) => ({ kind: 'badge', name: `Badge ${b.label}`, part: `Badge ${b.label}`, label: b.label, bbox: b.bbox }))
  ];
  return {
    W: raster.widthPx, H: raster.heightPx, raster, tpl, cls, occ, owned: new Uint8Array(raster.widthPx * raster.heightPx), sprites,
    adjacent: inputs.adjacent ?? null, unowned: inputs.unowned ?? null,
    ev: Uint8Array.from(E.ev), hallway: inputs.hallway ?? undefined,
    badges: inputs.badges, tees: inputs.tees, assignment, seeds: inputs.seeds ?? [],
    searchRadiusPx: r3(RULES.searchRadiusFactor * maxAssignedPx),
    searchRule: `centers within ${RULES.searchRadiusFactor} x the largest S3 tee-badge distance (${r3(maxAssignedPx)} px) of the badge plate center, whose frame core holds >= 1 unoccluded frame-white px`
  };
}

/** tk.s4.padTemplate: the rigid pad template from the S3 anchors, or why there is none. */
export function padTemplatePart(raster, anchors, interiorTone) {
  try { const tpl = fitPadTemplate(raster, anchors, interiorTone); return { tpl, unavailable: null, emits: { anchors: anchors.length, lengthPx: tpl.lengthPx, widthPx: tpl.widthPx } }; }
  catch (e) { return { tpl: null, unavailable: e.message, emits: { anchors: anchors.length } }; }
}
/** tk.s4.evidence: px classes, occluder kinds and the evidence plane over them (immutable; branches copy ev). */
export function evidencePart(raster, inputs, tpl) {
  const n = raster.widthPx * raster.heightPx, cls = classifyRaster(raster, tpl), occ = buildOccluders(raster, inputs, tpl), ev = evidencePlane(cls, occ, n);
  let white = 0, covered = 0; for (let i = 0; i < n; i++) { if (cls[i] === CLASS.WHITE && !occ[i]) white++; if (occ[i]) covered++; }
  return { cls, occ, ev, emits: { rasterPx: n, uncoveredFrameWhitePx: white, coveredPx: covered } };
}

const emptyOccluded = () => Object.fromEntries([...OCC_NAMES.slice(1), 'tint', 'offRaster'].map((k) => [k, 0]));

/**
 * One preallocated byte per raster px (Sam: Parts as selectors over preallocated byte arrays): the evidence code a pose
 * reads there. 0-3 = the px class (nothing covers it); 8 + k = covered by occluder kind k (OCC; a recovered pad owns its
 * px as OCC.recoveredTee, written in place by ownPx). A pose is then a histogram of (zone, code) over one array.
 */
export function evidencePlane(cls, occ, n) {
  const ev = new Uint8Array(n);
  for (let i = 0; i < n; i++) ev[i] = occ[i] ? 8 + occ[i] : cls[i];
  return ev;
}
export function ownPx(ctx, i) { ctx.owned[i] = OCC.recoveredTee; ctx.ev[i] = 8 + OCC.recoveredTee; }

const HIST = new Int32Array(4 * 16);   // reused: (zone, evidence code) counts of one pose
export const STAMP_DEG = 0.25;          // deg: zone stamps are cached per quantized angle (corner shift <= 0.03 px at 15 px)
/**
 * The zone of every px around an INTEGER centre depends only on the angle: compute it once per quantized angle and keep
 * it (offsets per zone, raster-row independent: dx, dy). Every pose at that angle reads the same stamp: the pixel cache
 * answers "which zone is this px in" once, not once per pose.
 */
function stampFor(ctx, angleRad) {
  ctx.stamps ??= new Map();
  const q = Math.round((angleRad * 180 / Math.PI) / STAMP_DEG), key = q;
  let st = ctx.stamps.get(key);
  if (st) return st;
  const zones = [[], [], [], []];
  forTemplatePx(ctx.tpl, 0, 0, q * STAMP_DEG * Math.PI / 180, Infinity, Infinity, (i, zone, x, y) => zones[zone].push(x, y));
  const r = Math.max(...zones.flatMap((z) => z.map(Math.abs)));
  st = { zones: zones.map((z) => Int32Array.from(z)), reach: r };
  ctx.stamps.set(key, st);
  return st;
}
function evaluateStamp(ctx, cx, cy, angleRad) {
  const { ev, W, H } = ctx, h = HIST; h.fill(0);
  const st = stampFor(ctx, angleRad), inside = cx - st.reach >= 0 && cy - st.reach >= 0 && cx + st.reach < W && cy + st.reach < H;
  let offRaster = 0, offFrame = 0, offInterior = 0;
  for (let zone = 1; zone <= 3; zone++) {
    const z = st.zones[zone], base = zone * 16;
    for (let k = 0; k < z.length; k += 2) {
      const x = cx + z[k], y = cy + z[k + 1];
      if (!inside && (x < 0 || y < 0 || x >= W || y >= H)) { if (zone === 1) offFrame++; else if (zone === 2) offInterior++; continue; }
      h[base + ev[y * W + x]]++;
    }
  }
  offRaster = offFrame + offInterior;
  return { h, offRaster, off: { frame: offFrame, interior: offInterior } };
}
function evaluatePoseFast(ctx, cx, cy, angleRad) {
  const { ev, W, H, tpl } = ctx, h = HIST; h.fill(0);
  const m = RULES.zoneMarginPx, ring = RULES.outsideRingPx;
  const Lo = tpl.halfLengthOutPx, Li = tpl.halfLengthInPx, So = tpl.halfWidthOutPx, Si = tpl.halfWidthInPx;
  const c = Math.cos(angleRad), s = Math.sin(angleRad);
  const R = Math.hypot(Lo + m + ring, So + m + ring);
  const x0 = Math.floor(cx - R), x1 = Math.ceil(cx + R), y0 = Math.floor(cy - R), y1 = Math.ceil(cy + R);
  const LoIn = Lo - m, SoIn = So - m, LiIn = Li - m, SiIn = Si - m, LiOut = Li + m, SiOut = Si + m, LoOut = Lo + m, SoOut = So + m, LoRing = Lo + m + ring, SoRing = So + m + ring;
  let offRaster = 0;
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy, inY = y >= 0 && y < H, row = y * W;
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx, a = Math.abs(dx * c + dy * s), b = Math.abs(-dx * s + dy * c);
      let zone;
      if (a <= LoIn && b <= SoIn) {
        if (a <= LiIn && b <= SiIn) zone = 2; else if (a >= LiOut || b >= SiOut) zone = 1; else continue;
      } else if ((a >= LoOut || b >= SoOut) && a <= LoRing && b <= SoRing) zone = 3; else continue;
      if (!inY || x < 0 || x >= W) { if (zone !== 3) offRaster++; continue; }
      h[zone * 16 + ev[row + x]]++;
    }
  }
  // the same counts evaluatePose derives px by px
  let frameTotal = offRaster ? 0 : 0, interiorTotal = 0;
  const occluded = emptyOccluded(); occluded.offRaster = offRaster;
  for (let k = 0; k < 16; k++) { frameTotal += h[16 + k]; interiorTotal += h[32 + k]; }
  return { h, offRaster, occluded, frameTotal, interiorTotal };
}

export function evaluatePose(ctx, cx, cy, angleRad, { collect = false } = {}) {
  if (!collect && ctx.ev) return scorePose(ctx, cx, cy, angleRad);
  const { cls, occ, owned, W, H, tpl } = ctx;
  let frameTotal = 0, interiorTotal = 0, visFrame = 0, visInterior = 0, negFrame = 0, negInterior = 0, outWhite = 0;
  const occluded = emptyOccluded();
  const px = collect ? { visibleFrame: [], visibleInterior: [], tintInterior: [], negative: [], occluded: [], pad: [] } : null;
  forTemplatePx(tpl, cx, cy, angleRad, W, H, (i, zone) => {
    if (zone === ZONE.OUTSIDE) {
      if (i >= 0 && !owned[i] && !occ[i] && cls[i] === CLASS.WHITE) { outWhite++; if (px) px.negative.push(i); }
      return;
    }
    if (zone === ZONE.FRAME) frameTotal++; else interiorTotal++;
    if (px && i >= 0) px.pad.push(i);
    if (i < 0) { occluded.offRaster++; return; }
    const o = owned[i] || occ[i];
    if (o) { occluded[OCC_NAMES[o]]++; if (px) px.occluded.push(i); return; }
    const k = cls[i];
    if (k === CLASS.TINT) { occluded.tint++; if (px) { px.occluded.push(i); if (zone !== ZONE.FRAME) px.tintInterior.push(i); } return; }
    if (zone === ZONE.FRAME) {
      if (k === CLASS.WHITE) { visFrame++; if (px) px.visibleFrame.push(i); } else { negFrame++; if (px) px.negative.push(i); }
    } else if (k === CLASS.INTERIOR) { visInterior++; if (px) px.visibleInterior.push(i); } else { negInterior++; if (px) px.negative.push(i); }
  });
  const positive = visFrame + visInterior, negative = negFrame + negInterior;
  const score = positive - negative - RULES.outsideWhiteWeight * outWhite;
  const contradictionFrac = positive + negative ? (negative + outWhite * RULES.outsideWhiteWeight) / (positive + negative + outWhite * RULES.outsideWhiteWeight) : 1;
  const visibleFrameFrac = frameTotal ? visFrame / frameTotal : 0;
  const accepted = score > 0 && visFrame >= RULES.minVisibleFramePx && visibleFrameFrac >= RULES.minVisibleFrameFrac && contradictionFrac <= RULES.maxContradictionFrac;
  return {
    center: [r3(cx), r3(cy)], angleRad: r3(angleRad),
    score: r3(score), accepted,
    evidence: {
      unit: 'px', templateFramePx: frameTotal, templateInteriorPx: interiorTotal,
      visibleFramePx: visFrame, visibleInteriorPx: visInterior, negativeFramePx: negFrame, negativeInteriorPx: negInterior,
      outsideWhitePx: outWhite, occludedBy: occluded,
      visibleFrameFrac: r3(visibleFrameFrac), contradictionFrac: r3(contradictionFrac)
    },
    confidence: r3(Math.max(0, visibleFrameFrac * (1 - contradictionFrac))),
    ...(px ? { px } : {})
  };
}

function scorePose(ctx, cx, cy, angleRad) {
  const stamped = Number.isInteger(cx) && Number.isInteger(cy);
  const r = stamped ? evaluateStamp(ctx, cx, cy, angleRad) : evaluatePoseFast(ctx, cx, cy, angleRad);
  const { h, offRaster } = r, occluded = emptyOccluded(); occluded.offRaster = offRaster;
  const at = (zone, code) => h[zone * 16 + code];
  let frameTotal = offRaster, interiorTotal = 0;   // offRaster px are frame or interior; split them as the slow path does below
  // the slow path counts off-raster template px into frameTotal / interiorTotal by zone; recount them exactly
  frameTotal = 0; interiorTotal = 0;
  for (let k = 0; k < 16; k++) { frameTotal += at(1, k); interiorTotal += at(2, k); }
  const off = r.off ?? offRasterByZone(ctx, cx, cy, angleRad, offRaster);
  frameTotal += off.frame; interiorTotal += off.interior;
  for (let k = 1; k < OCC_NAMES.length; k++) occluded[OCC_NAMES[k]] = at(1, 8 + k) + at(2, 8 + k);
  occluded.tint = at(1, CLASS.TINT) + at(2, CLASS.TINT);
  const visFrame = at(1, CLASS.WHITE), negFrame = at(1, CLASS.OTHER) + at(1, CLASS.INTERIOR);
  const visInterior = at(2, CLASS.INTERIOR), negInterior = at(2, CLASS.OTHER) + at(2, CLASS.WHITE);
  const outWhite = at(3, CLASS.WHITE);
  const positive = visFrame + visInterior, negative = negFrame + negInterior;
  const score = positive - negative - RULES.outsideWhiteWeight * outWhite;
  const contradictionFrac = positive + negative ? (negative + outWhite * RULES.outsideWhiteWeight) / (positive + negative + outWhite * RULES.outsideWhiteWeight) : 1;
  const visibleFrameFrac = frameTotal ? visFrame / frameTotal : 0;
  const accepted = score > 0 && visFrame >= RULES.minVisibleFramePx && visibleFrameFrac >= RULES.minVisibleFrameFrac && contradictionFrac <= RULES.maxContradictionFrac;
  return {
    center: [r3(cx), r3(cy)], angleRad: r3(angleRad), score: r3(score), accepted,
    evidence: { unit: 'px', templateFramePx: frameTotal, templateInteriorPx: interiorTotal, visibleFramePx: visFrame, visibleInteriorPx: visInterior,
      negativeFramePx: negFrame, negativeInteriorPx: negInterior, outsideWhitePx: outWhite, occludedBy: occluded,
      visibleFrameFrac: r3(visibleFrameFrac), contradictionFrac: r3(contradictionFrac) },
    confidence: r3(Math.max(0, visibleFrameFrac * (1 - contradictionFrac)))
  };
}
// Off-raster template px (rare: poses at the image border) split by zone, only when there are any.
function offRasterByZone(ctx, cx, cy, angleRad, n) {
  if (!n) return { frame: 0, interior: 0 };
  let frame = 0, interior = 0;
  forTemplatePx(ctx.tpl, cx, cy, angleRad, ctx.W, ctx.H, (i, zone) => { if (i < 0 && zone === ZONE.FRAME) frame++; else if (i < 0 && zone === ZONE.INTERIOR) interior++; });
  return { frame, interior };
}

// ---------------------------------------------------------------- search

function candidateMask(ctx, badge) {
  const { W, H, cls, occ, owned, tpl } = ctx;
  const R = ctx.searchRadiusPx, [bx, by] = badge.plateCenter;
  const reach = tpl.halfLengthOutPx; // a frame-core px lies within this of the center
  const x0 = Math.max(0, Math.floor(bx - R)), x1 = Math.min(W - 1, Math.ceil(bx + R));
  const y0 = Math.max(0, Math.floor(by - R)), y1 = Math.min(H - 1, Math.ceil(by + R));
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const mask = new Uint8Array(bw * bh);
  const rr = Math.ceil(reach), reach2 = reach * reach;
  for (let y = Math.max(0, y0 - rr); y <= Math.min(H - 1, y1 + rr); y++)
    for (let x = Math.max(0, x0 - rr); x <= Math.min(W - 1, x1 + rr); x++) {
      const i = y * W + x;
      if (cls[i] !== CLASS.WHITE || occ[i] || owned[i]) continue;
      for (let dy = -rr; dy <= rr; dy++) {
        const yy = y + dy - y0; if (yy < 0 || yy >= bh) continue;
        for (let dx = -rr; dx <= rr; dx++) {
          if (dx * dx + dy * dy > reach2) continue;
          const xx = x + dx - x0; if (xx < 0 || xx >= bw) continue;
          mask[yy * bw + xx] = 1;
        }
      }
    }
  return { mask, x0, y0, bw, bh };
}

const anglesFor = (badgeRay, cx, cy, plate) => {
  if (badgeRay) {
    const t0 = Math.atan2(plate[1] - cy, plate[0] - cx);
    const out = [];
    for (let d = -RULES.badgeRayTolDeg; d <= RULES.badgeRayTolDeg + 1e-9; d += RULES.badgeRayStepDeg) out.push(t0 + d / DEG);
    return out;
  }
  const out = [];
  for (let d = 0; d < 180; d += RULES.freeAngleStepDeg) out.push(d / DEG);
  return out;
};

/** Best template pose for one badge. badgeRay: theta within badgeRayTolDeg of the direction to the badge. */
/**
 * Candidate centres seeded from components (Sam): only near the frame-white px of S1 bright components that no Part
 * owns and that reach into the badge's search disk, on a SEED_STEP_PX grid; refinement then works at sub-pixel as
 * before. The old disk path (every centre near any unoccluded white px) stays as RULES.visibleSeeds = 'disk'.
 */
/** Each unowned component's frame-white px and their bbox (against the context's evidence at the time). */
export function seedWhiteOf(ctx) {
  const { W, cls, ev } = ctx;
  return ctx.unowned.map((c) => {
    const white = Int32Array.from(c.px.filter((i) => cls[i] === CLASS.WHITE && ev[i] < 8));
    let ax = Infinity, ay = Infinity, bx2 = -Infinity, by2 = -Infinity;
    for (const i of white) { const x = i % W, y = (i / W) | 0; if (x < ax) ax = x; if (x > bx2) bx2 = x; if (y < ay) ay = y; if (y > by2) by2 = y; }
    return { white, box: [ax, ay, bx2, by2] };
  }).filter((c) => c.white.length >= RULES.minVisibleFramePx);
}

function componentMask(ctx, badge) {
  const { W, H, cls, ev, tpl } = ctx;
  const R = ctx.searchRadiusPx, [bx, by] = badge.plateCenter, R2 = R * R, reach = tpl.halfLengthOutPx, step = RULES.seedStepPx;
  const x0 = Math.max(0, Math.floor(bx - R)), x1 = Math.min(W - 1, Math.ceil(bx + R));
  const y0 = Math.max(0, Math.floor(by - R)), y1 = Math.min(H - 1, Math.ceil(by + R));
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, mask = new Uint8Array(bw * bh);
  const rr = Math.ceil(reach), reach2 = reach * reach;
  let seeds = 0;
  ctx.seedWhite ??= seedWhiteOf(ctx);   // computed once per context, not once per search
  const near = (b) => { const dx = Math.max(b[0] - bx, 0, bx - b[2]), dy = Math.max(b[1] - by, 0, by - b[3]); return dx * dx + dy * dy <= (R + reach) ** 2; };
  for (const c of ctx.seedWhite) {
    if (!near(c.box)) continue;
    const white = c.white.filter((i) => ev[i] < 8);   // a pad recovered since is no longer evidence
    if (white.length < RULES.minVisibleFramePx) continue;
    seeds++;
    for (const i of white) {
      const x = i % W, y = (i / W) | 0;
      for (let dy = -rr; dy <= rr; dy++) {
        const yy = y + dy; if (yy < y0 || yy > y1 || (yy - y0) % step) continue;
        for (let dx = -rr; dx <= rr; dx++) {
          const xx = x + dx; if (xx < x0 || xx > x1 || (xx - x0) % step || dx * dx + dy * dy > reach2) continue;
          mask[(yy - y0) * bw + (xx - x0)] = 1;
        }
      }
    }
  }
  return { mask, x0, y0, bw, bh, seedComponents: seeds };
}

export function searchBadge(ctx, badge, { badgeRay = true } = {}) {
  const { mask, x0, y0, bw, bh } = RULES.visibleSeeds === 'components' && ctx.unowned ? componentMask(ctx, badge) : candidateMask(ctx, badge);
  const R2 = ctx.searchRadiusPx ** 2, plate = badge.plateCenter;
  const top = [];
  let evaluated = 0;
  for (let yy = 0; yy < bh; yy++) for (let xx = 0; xx < bw; xx++) {
    if (!mask[yy * bw + xx]) continue;
    const x = x0 + xx, y = y0 + yy;
    if ((x - plate[0]) ** 2 + (y - plate[1]) ** 2 > R2) continue;
    let best = null;
    for (const th of anglesFor(badgeRay, x, y, plate)) {
      const e = evaluatePose(ctx, x, y, th); evaluated++;
      if (!best || e.score > best.score) best = e;
    }
    top.push(best);
  }
  // S3 pad-material fragments (eliminated candidates with course interior tone that failed only size /
  // border / band tests) inside the search disk always enter refinement, whatever the coarse ranking.
  const seeded = [];
  for (const sd of ctx.seeds) {
    if ((sd.center[0] - plate[0]) ** 2 + (sd.center[1] - plate[1]) ** 2 > R2) continue;
    let best = null;
    for (const th of anglesFor(badgeRay, sd.center[0], sd.center[1], plate)) {
      const e = evaluatePose(ctx, sd.center[0], sd.center[1], th); evaluated++;
      if (!best || e.score > best.score) best = e;
    }
    seeded.push({ ...best, seed: sd.index });
  }
  top.sort((a, b) => b.score - a.score);
  const seeds = [...seeded];
  for (const t of top) {
    if (seeds.length >= RULES.refineTop + seeded.length) break;
    if (seeds.some((s) => Math.hypot(s.center[0] - t.center[0], s.center[1] - t.center[1]) < 2)) continue;
    seeds.push(t);
  }
  // local refinement: coordinate ascent in (x, y, theta), halving steps
  const rayOk = (x, y, th) => !badgeRay || badgeRayDeg([x, y], th, plate) <= RULES.badgeRayTolDeg + 1e-9;
  let best = null;
  for (const seed of seeds) {
    let cur = seed; const fromSeed = seed.seed ?? null;
    for (const [sp, sa] of [[0.5, 1], [0.25, 0.5]]) {
      let improved = true;
      while (improved) {
        improved = false;
        for (const [dx, dy, da] of [[sp, 0, 0], [-sp, 0, 0], [0, sp, 0], [0, -sp, 0], [0, 0, sa], [0, 0, -sa]]) {
          const x = cur.center[0] + dx, y = cur.center[1] + dy, th = cur.angleRad + da / DEG;
          if (!rayOk(x, y, th)) continue;
          const e = evaluatePose(ctx, x, y, th); evaluated++;
          if (e.score > cur.score + 1e-9) { cur = e; improved = true; }
        }
      }
    }
    if (!best || cur.score > best.score) best = fromSeed === null ? cur : { ...cur, seed: fromSeed };
  }
  return { best, evaluatedPoses: evaluated, candidateCenters: top.length, seedsInDisk: seeded.map((s) => s.seed) };
}

/**
 * Greedy over the badges that have no S3 tee: search every pending badge,
 * take the best ACCEPTED pose over all of them, own its pad px, re-search
 * the rest against the new ownership, and stop when the tee count reaches
 * the badge cardinality N or no pending badge has an accepted pose.
 */
const OPAQUE = new Set(['badge', 'mute', 'basket', 'basketFringe', 'recoveredBasket']);
const lumAt = (raster, x, y) => lumBilinear(raster, x, y);
/**
 * The tee->badge segment is straight hallway (Sam: the badge precedes the first bend). The hallway is a translucent band
 * brighter than the terrain under it, with an edge on each side at half the image's hallway width W (LOCAL: learned
 * from this image's own S3 tee->badge segments, learnHallwayWidth). Evidence for a segment: at stations every 2 px from
 * the pad's front edge to the badge plate's edge, the step (mean luminance just inside an edge) - (just outside it), on
 * each side; the segment's edge step is the median over stations of the weaker side. Stations touching an opaque
 * sprite are skipped (hidden: no evidence either way).
 */
export function hallwayStep(ctx, center, plate, W) {
  const { raster, occ, tpl } = ctx, Wd = raster.widthPx, Hd = raster.heightPx;
  const dx = plate[0] - center[0], dy = plate[1] - center[1], D = Math.hypot(dx, dy), ux = dx / D, uy = dy / D, nx = -uy, ny = ux;
  const hidden = (x, y) => { const X = Math.round(x), Y = Math.round(y); if (X < 0 || Y < 0 || X >= Wd || Y >= Hd) return true; const o = occ[Y * Wd + X]; return !!o && OPAQUE.has(OCC_NAMES[o]); };
  const steps = [];
  for (let t = tpl.halfLengthOutPx + 3; t <= D - 26; t += 2) {
    const cx = center[0] + ux * t, cy = center[1] + uy * t, side = [];
    for (const sg of [1, -1]) {
      const inn = [], out = [];
      for (let l = W / 2 - 5; l <= W / 2 - 1.5; l += 0.5) { const x = cx + sg * nx * l, y = cy + sg * ny * l; if (!hidden(x, y)) inn.push(lumAt(raster, x, y)); }
      for (let l = W / 2 + 1.5; l <= W / 2 + 5; l += 0.5) { const x = cx + sg * nx * l, y = cy + sg * ny * l; if (!hidden(x, y)) out.push(lumAt(raster, x, y)); }
      if (inn.length >= 4 && out.length >= 4) side.push(inn.reduce((a, b) => a + b, 0) / inn.length - out.reduce((a, b) => a + b, 0) / out.length);
    }
    if (side.length === 2) steps.push(Math.min(...side));
  }
  return { stepLum: steps.length ? r3(quantile(steps, 0.5)) : null, stations: steps.length };
}

/** Hallway width (px) of this image: per S3 tee->badge segment the W in [0.5, 4] x pad width maximising the edge step; median. */
export function learnHallwayWidth(ctx) {
  const per = [];
  for (const a of ctx.assignment) {
    const t = ctx.tees[a.tee], b = ctx.badges[a.badge]; let best = null;
    for (let W = Math.max(8, 0.5 * ctx.tpl.widthPx); W <= 4 * ctx.tpl.widthPx; W += 0.5) {
      const h = hallwayStep(ctx, t.center, b.plateCenter, W);
      if (h.stepLum != null && h.stations >= 4 && (!best || h.stepLum > best.stepLum)) best = { W, stepLum: h.stepLum };
    }
    if (best) per.push(best.W);
  }
  return per.length ? { widthPx: quantile(per, 0.5), fromSegments: per.length, spreadPx: [quantile(per, 0.25), quantile(per, 0.75)] } : null;
}

/**
 * What a peeking frame fragment pins (Sam: "that's an edge not a corner -- calculate it"). The fragment = the visible
 * frame-white px of the best peek pose, measured in that pad's own axes (u = long axis on the badge ray, n = across):
 *   side edge  one run parallel to u: fixes the angle and the across-position; the pad can slide along u
 *   end edge   one run parallel to n: fixes the along-position; the pad can slide along n
 *   corner     runs along both: fixes the position
 * The tied best poses measure the residual freedom directly: their spread along u and along n (px).
 */
export function fragmentGeometry(ctx, poses) {
  const best = poses[0], e = evaluatePose(ctx, best.cx, best.cy, best.th, { collect: true }), px = e.px.visibleFrame;
  const c = Math.cos(best.th), s = Math.sin(best.th);
  const uv = px.map((i) => { const dx = (i % ctx.W) - best.cx, dy = Math.floor(i / ctx.W) - best.cy; return [dx * c + dy * s, -dx * s + dy * c]; });
  const ext = (k) => (uv.length ? Math.max(...uv.map((p) => p[k])) - Math.min(...uv.map((p) => p[k])) + 1 : 0);
  const alongU = ext(0), alongN = ext(1), stroke = Math.max(ctx.tpl.strokeEndPx, ctx.tpl.strokeSidePx) + 1;
  const kind = alongU > stroke && alongN > stroke ? 'corner' : alongU > alongN ? 'side edge (parallel to the long axis)' : 'end edge (parallel to the short axis)';
  const spread = (k) => { const v = poses.map((p) => k === 0 ? (p.cx - best.cx) * c + (p.cy - best.cy) * s : -(p.cx - best.cx) * s + (p.cy - best.cy) * c); return r3(Math.max(...v) - Math.min(...v)); };
  return { fragment: { px: px.length, extentAlongLongAxisPx: alongU, extentAcrossPx: alongN, strokePx: r3(stroke - 1), kind },
    freedom: { slideAlongLongAxisPx: spread(0), slideAcrossPx: spread(1), rule: 'spread of the tied best poses, in the pad axes' } };
}

/**
 * Occluder search for a badge with no visible pad: under every opaque sprite whose distance to the badge lies in this
 * course's tee->badge range, every centre (1 px grid over the sprite bbox +- the pad half-width) with its axis on the
 * badge ray is feasible when opaque sprites hide >= hiddenMinFrac of the pad and the visible rest contradicts it in
 * <= hiddenMaxNegativeFrac of its px. The feasible centres are the possible range of the hidden pad.
 */
export function occluderSearch(ctx, bi, { hallwayTest = true, keepCenters = false } = {}) {
  // Boundary search (Sam: "pose is a boundary search, not exhaustive enumeration"). Per opaque sprite: the hidden pad's
  // feasible centres form a region; march from the sprite centre along BOUNDARY_DIRS directions and bisect where
  // feasibility flips, so the region is its outline, not every centre in it. Peek fragments come from the adjacency
  // query (tk.s4.adjacentBrightComponents): only sprites a fragment touches, only centres within a pad's reach of it.
  const badge = ctx.badges[bi], plate = badge.plateCenter, tpl = ctx.tpl;
  if (ctx.hallway === undefined) ctx.hallway = learnHallwayWidth(ctx);   // poseSpace sets it (tk.s4.hallway on a store)
  const Wh = hallwayTest ? ctx.hallway?.widthPx ?? null : null;
  const dists = ctx.assignment.map((a) => a.distancePx);
  const range = dists.length ? [Math.min(...dists) * (1 - RULES.hiddenDistMargin), Math.max(...dists) * (1 + RULES.hiddenDistMargin)] : [0, Infinity];
  const regions = [];
  let evaluated = 0;
  const feasible = (cx, cy) => {
    cx = Math.round(cx); cy = Math.round(cy);
    const d = Math.hypot(plate[0] - cx, plate[1] - cy);
    if (d < range[0] || d > range[1]) return null;
    const th = Math.atan2(plate[1] - cy, plate[0] - cx), e = evaluatePose(ctx, cx, cy, th); evaluated++;
    const ev = e.evidence, total = ev.templateFramePx + ev.templateInteriorPx;
    const hidden = Object.entries(ev.occludedBy).filter(([k]) => OPAQUE.has(k)).reduce((n, [, v]) => n + v, 0);
    const neg = ev.negativeFramePx + ev.negativeInteriorPx + RULES.outsideWhiteWeight * ev.outsideWhitePx;
    return total && hidden >= RULES.hiddenMinFrac * total && neg <= RULES.hiddenMaxNegativeFrac * total ? { cx, cy, th, ev } : null;
  };
  for (const sp of ctx.sprites) {
    if (sp.kind === 'badge' && String(sp.label) === String(badge.label)) continue;
    const [x, y, w, h] = sp.bbox, c0 = [x + w / 2, y + h / 2], reach = Math.hypot(w, h) / 2 + tpl.halfWidthOutPx;
    // seed: the sprite centre, else the first feasible point on a coarse ring around it
    let seed = feasible(...c0);
    for (let r = 4; !seed && r < reach; r += 4) for (let k = 0; k < 8 && !seed; k++) seed = feasible(c0[0] + r * Math.cos(k * Math.PI / 4), c0[1] + r * Math.sin(k * Math.PI / 4));
    // peek: fragments from the query that touch this sprite; centres within a pad's reach of a fragment px
    const frags = ctx.adjacent ? ctx.adjacent.filter((cm) => cm.touches.includes(sp.part)) : [];
    const fragPx = new Set(frags.flatMap((cm) => cm.px));
    let peek = null;
    if (fragPx.size) {
      const xs = [...fragPx].map((i) => i % ctx.W), ys = [...fragPx].map((i) => (i / ctx.W) | 0), R = Math.ceil(tpl.halfLengthOutPx);
      const peeks = [];
      for (let cy = Math.min(...ys) - R; cy <= Math.max(...ys) + R; cy++) for (let cx = Math.min(...xs) - R; cx <= Math.max(...xs) + R; cx++) {
        const f = feasible(cx, cy); if (!f || f.ev.visibleFramePx < RULES.peekMinFramePx) continue;
        const n = evaluatePose(ctx, f.cx, f.cy, f.th, { collect: true }).px.visibleFrame.filter((i) => fragPx.has(i)).length;
        if (n >= RULES.peekMinFramePx) peeks.push({ cx: f.cx, cy: f.cy, th: f.th, frame: n });
      }
      const peekMax = peeks.length ? Math.max(...peeks.map((p) => p.frame)) : 0, top = peeks.filter((p) => p.frame === peekMax);
      if (top.length) peek = { visibleFramePx: peekMax, poses: top.length, center: [r3(top.reduce((n, p) => n + p.cx, 0) / top.length), r3(top.reduce((n, p) => n + p.cy, 0) / top.length)],
        ...fragmentGeometry(ctx, top), components: frags.map((cm) => ({ label: cm.label, areaPx: cm.areaPx })) };
    }
    if (!seed && !peek) continue;
    // outline: bisect each ray from the seed to where feasibility flips
    const outline = [];
    if (seed) for (let k = 0; k < RULES.boundaryDirs; k++) {
      const ux = Math.cos(2 * Math.PI * k / RULES.boundaryDirs), uy = Math.sin(2 * Math.PI * k / RULES.boundaryDirs);
      let lo = 0, hi = reach;
      if (feasible(seed.cx + ux * hi, seed.cy + uy * hi)) lo = hi;
      while (hi - lo > RULES.boundaryTolPx) { const mid = (lo + hi) / 2; if (feasible(seed.cx + ux * mid, seed.cy + uy * mid)) lo = mid; else hi = mid; }
      outline.push([r3(seed.cx + ux * lo), r3(seed.cy + uy * lo)]);
    }
    const cx = outline.length ? outline.reduce((n, p) => n + p[0], 0) / outline.length : peek.center[0], cy = outline.length ? outline.reduce((n, p) => n + p[1], 0) / outline.length : peek.center[1];
    let area = 0; for (let k = 0; k < outline.length; k++) { const p = outline[k], q = outline[(k + 1) % outline.length]; area += p[0] * q[1] - q[0] * p[1]; }
    // hallway between pad and badge, tested at the centroid and along the outline
    const samples = outline.length ? [[cx, cy], ...outline] : [peek.center];
    const steps = Wh ? samples.map((p) => ({ p, step: hallwayStep(ctx, p, plate, Wh).stepLum })) : [];
    const pass = steps.filter((sm) => sm.step != null && sm.step >= RULES.hallwayMinStepLum);
    regions.push({ occluder: sp.name, feasibleCenters: Wh ? pass.length : outline.length, regionAreaPx: r3(Math.abs(area) / 2), centroid: [r3(cx), r3(cy)],
      extentPx: outline.length ? [Math.min(...outline.map((p) => p[0])), Math.min(...outline.map((p) => p[1])), Math.max(...outline.map((p) => p[0])), Math.max(...outline.map((p) => p[1]))] : null,
      distanceToBadgePx: r3(Math.hypot(plate[0] - cx, plate[1] - cy)), hallwayStepLum: steps.length ? r3(quantile(steps.map((sm) => sm.step ?? -99), 0.5)) : null,
      hallwayPassFrac: steps.length ? r3(pass.length / steps.length) : null, bbox: sp.bbox, peek,
      ...(keepCenters ? { centers: outline, hallwayCenters: pass.map((sm) => sm.p) } : {}) });
  }
  return { regions, distanceRangePx: range.map(r3), hallway: ctx.hallway, plateCenter: plate, evaluatedPoses: evaluated };
}

// The area a badge's search reads: its candidate disk plus a margin of 3 template radii (pose reach and refinement drift).
export function searchBox(ctx, badge) {
  const R = ctx.searchRadiusPx + 3 * Math.hypot(ctx.tpl.halfLengthOutPx + RULES.outsideRingPx + 1, ctx.tpl.halfWidthOutPx + RULES.outsideRingPx + 1), [x, y] = badge.plateCenter;
  return [x - R, y - R, x + R, y + R];
}
export const pxBox = (px, W) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const i of px) { const x = i % W, y = (i / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return [x0, y0, x1, y1]; };
export const boxesMeet = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

/** Direct use (tests, scripts): the one loop (poseSpace.mjs greedyLoop) over the same questions answered locally. */
export function greedyRecover(ctx, { badgeRay = true } = {}) {
  return greedyLoop(localQueries(ctx), { badgeRay });
}

export function recoveredTee(ctx, bi, e, extra = {}) {
  const badge = ctx.badges[bi];
  const { px, ...rest } = e;
  // Sam (2026-10-17): the tee is the FULL pad; its centre is `center`. His
  // annotation of an occluded pad marks the centroid of the VISIBLE hole, so
  // the visible-hole centroid rides along for judging against testimony. A
  // semi-transparent C1/C2 tint does not hide the hole (the pad reads through
  // it); only opaque sprites do, so tinted interior px count as visible.
  const vis = [...(px?.visibleInterior ?? []), ...(px?.tintInterior ?? [])];
  // Pixel-index convention (pixel i's centre is at i), as S3 ring centres and
  // Sam's tee points use (median offset 0.00 / -0.07 px on golden).
  const visibleCenter = vis.length ? [r3(vis.reduce((n, i) => n + (i % ctx.W), 0) / vis.length), r3(vis.reduce((n, i) => n + Math.floor(i / ctx.W), 0) / vis.length)] : null;
  return {
    hole: badge.label, badgeIndex: bi,
    center: rest.center, visibleCenter, visibleInteriorPx: vis.length, angleRad: rest.angleRad, angleDeg: r3(rest.angleRad * DEG),
    sizePx: [ctx.tpl.lengthPx, ctx.tpl.widthPx],
    corners: padCorners(ctx.tpl, rest.center, rest.angleRad),
    badgeRayResidualDeg: r3(badgeRayDeg(rest.center, rest.angleRad, badge.plateCenter)),
    distanceToBadgePx: r3(Math.hypot(badge.plateCenter[0] - rest.center[0], badge.plateCenter[1] - rest.center[1])),
    score: rest.score, accepted: rest.accepted, confidence: rest.confidence,
    evidence: { ...rest.evidence, visibleFramePxSet: px ? px.visibleFrame : undefined },
    ...extra
  };
}

/**
 * Seeds: S3 candidates fn.Tee.findFamily (structural) ELIMINATED whose
 * interior tone matches the course pad tone (toneDistance <= the model's
 * interiorTone tolerance, RGB levels) and whose failed tests are only
 * size / border / band: pad-material fragments, i.e. occluded pads.
 */
export function padFragmentSeeds(fam) {
  const tol = fam.model.interiorTone.tolerance;
  return (fam.candidates ?? []).filter((c) => c.verdict === 'ELIMINATED'
    && Number.isFinite(c.toneDistance) && c.toneDistance <= tol
    && c.failedTests.length && c.failedTests.every((t) => RULES.seedFailedTestsAllowed.includes(t)))
    .map((c) => ({ index: c.index, center: c.center, toneDistance: c.toneDistance, failedTests: c.failedTests, frameAreaPx: c.frameAreaPx }));
}

/** Plain inputs for createRecoveryContext from the slot's Parts (parts.get). */
export function recoveryInputs(get) {
  const raster = get('px.image.cropped');
  const badges = get('tk.s4.badgePlates');
  const baskets = get('tk.s4.basketBodies');
  const recoveredBasketBoxes = get('tk.s4.basketRecovery').recoveredBoxes;
  const tees = get('px.tees.refined');
  const fam = get('px.tees.familyRefined');
  return {
    raster, badges, baskets, recoveredBasketBoxes, tees,
    anchors: fam.anchors, interiorTone: fam.model.interiorTone, seeds: padFragmentSeeds(fam),
    adjacent: get('tk.s4.adjacentBrightComponents'),
    unowned: get('tk.s4.unownedBrightComponents'),
    template: get('tk.s4.padTemplate'), evidence: get('tk.s4.evidence')
  };
}

/**
 * S4's own Calculations over PxC Parts (read by address from the S3 PxC board; never re-read from files):
 *   fn.tk.s4.badgePlates      px.badges -> tk.s4.badgePlates (plate centre = the S1 dark plate part's bbox centre)
 *   fn.tk.s4.basketBodies     px.baskets -> tk.s4.basketBodies (bbox, px)
 *   fn.tk.s4.adjacentBrightComponents (Sam: "bright components adjacent to known Occluders")
 *       px.components + the opaque Parts -> every S1 bright component that touches an opaque Part (badge px + mute,
 *       basket px; within 2 px) and is mostly (>= 50%) owned by no Part: hidden sprites' visible fragments live here.
 */
export const S4_CALCULATIONS = Object.freeze([
  ['fn.tk.s4.badgePlates', { inParts: ['px.badges'], outParts: ['tk.s4.badgePlates'], calculate: (io) => ({
    'tk.s4.badgePlates': io.in('px.badges').map((b, index) => {
      const dark = (b.has?.findPx?.parts ?? []).find((p) => p.polarity === 'dark'), bb = dark?.bbox ?? b.bbox;
      return { index, label: b.label, bbox: b.bbox, px: b.px, mutePx: b.has?.mute?.px ?? [], plateCenter: [bb[0] + bb[2] / 2, bb[1] + bb[3] / 2], plateHalfMinPx: Math.min(bb[2], bb[3]) / 2, plateRule: dark ? 'center of the S1 dark plate part bbox' : 'center of the S1 badge bbox' };
    }) }) }],
  ['fn.tk.s4.basketBodies', { inParts: ['px.baskets'], outParts: ['tk.s4.basketBodies'], calculate: (io) => ({
    'tk.s4.basketBodies': io.in('px.baskets').map((b, index) => ({ index, label: index, bbox: b.bbox, px: b.px })) }) }],
  ['fn.tk.s4.padTemplate', { inParts: ['px.image.cropped', 'px.tees.familyRefined'], outParts: ['tk.s4.padTemplate'], calculate: (io) => {
    const fam = io.in('px.tees.familyRefined');
    return { 'tk.s4.padTemplate': padTemplatePart(io.in('px.image.cropped'), fam.anchors, fam.model.interiorTone) };
  } }],
  ['fn.tk.s4.evidence', { inParts: ['px.image.cropped', 'tk.s4.padTemplate', 'tk.s4.badgePlates', 'tk.s4.basketBodies', 'tk.s4.basketRecovery', 'px.tees.refined'], outParts: ['tk.s4.evidence'], calculate: (io) => {
    const tpl = io.in('tk.s4.padTemplate').tpl;
    return { 'tk.s4.evidence': tpl ? evidencePart(io.in('px.image.cropped'), { badges: io.in('tk.s4.badgePlates'), baskets: io.in('tk.s4.basketBodies'), recoveredBasketBoxes: io.in('tk.s4.basketRecovery').recoveredBoxes, tees: io.in('px.tees.refined') }, tpl) : null };
  } }],
  ['fn.tk.s4.hallway', { inParts: ['px.image.cropped', 'tk.s4.padTemplate', 'tk.s4.evidence', 'tk.s4.badgePlates', 'px.tees.refined'], outParts: ['tk.s4.hallway'], calculate: (io) => {
    const tpl = io.in('tk.s4.padTemplate').tpl, E = io.in('tk.s4.evidence');
    if (!tpl || !E) return { 'tk.s4.hallway': null };
    const raster = io.in('px.image.cropped'), badges = io.in('tk.s4.badgePlates'), tees = io.in('px.tees.refined');
    const h = learnHallwayWidth({ raster, tpl, occ: E.occ, badges, tees, assignment: assignTeesToBadges(tees, badges) });
    return { 'tk.s4.hallway': h ? { ...h, emits: { widthPx: h.widthPx, segments: h.fromSegments } } : null };
  } }],
  ['fn.tk.s4.unownedBrightComponents', { inParts: ['px.components', 'px.badges', 'px.baskets', 'px.tees.refined'], outParts: ['tk.s4.unownedBrightComponents'],
    calculate: (io) => ({ 'tk.s4.unownedBrightComponents': unownedBrightComponents(io.in('px.components').bright, io.in('px.badges'), io.in('px.baskets'), io.in('px.tees.refined')) }) }],
  ['fn.tk.s4.adjacentBrightComponents', { inParts: ['tk.s4.unownedBrightComponents'], outParts: ['tk.s4.adjacentBrightComponents'],
    calculate: (io) => ({ 'tk.s4.adjacentBrightComponents': io.in('tk.s4.unownedBrightComponents').filter(isAdjacentFragment) }) }]
]);

/**
 * The unowned remainder of every S1 bright component: its px owned by no Part, with the opaque Parts it touches (maybe
 * none) and whether it is mostly unowned. A component can merge into a Part's own white (a pad frame touching a badge
 * frame is one component); its unowned px are still evidence, so nothing is dropped here.
 */
export function unownedBrightComponents(bright, badges, baskets, tees, { touchPx = 2, minUnownedFrac = 0.5 } = {}) {
  // pixel-set math lives in fg/pxset.mjs; this only names the owners and composes the two operations
  const W = bright.mask.width, H = bright.mask.height, names = [], sets = [];
  const own = (name, px) => { names.push(name); sets.push(pxList(W, H, px)); };
  badges.forEach((b) => own(`Badge ${b.label}`, [...b.px, ...(b.has?.mute?.px ?? [])]));
  baskets.forEach((k, i) => own(`basket ${i}`, k.px));
  tees.forEach((t, i) => own(`tee ${i}`, t.px ?? []));
  const { plane: owner } = ownerPlane(W, H, sets, { overlap: 'last' });   // later Parts keep contested px (S1, S2, S3 order)
  const opaque = (k) => !names[k - 1].startsWith('tee ');
  return componentStats(W, H, bright.labels, owner, { touchPx, touches: opaque }).map((c) => ({
    label: c.label, areaPx: c.areaPx, unownedPx: c.unowned.px.length, mostlyUnowned: c.unowned.px.length / c.areaPx >= minUnownedFrac,
    touches: c.touches.map((k) => names[k - 1]).sort(), px: c.unowned.px }));
}
/** Sam's query: components touching an opaque Part and mostly owned by no Part. */
export const isAdjacentFragment = (c) => c.mostlyUnowned && c.touches.length > 0;
export function adjacentBrightComponents(bright, badges, baskets, tees, opts) {
  return unownedBrightComponents(bright, badges, baskets, tees, opts).filter(isAdjacentFragment);
}

export const SLOT_READS = Object.freeze(['px.image.cropped', 'tk.s4.badgePlates', 'tk.s4.basketBodies', 'tk.s4.basketRecovery', 'px.tees.refined', 'px.tees.familyRefined', 'tk.s4.adjacentBrightComponents', 'tk.s4.unownedBrightComponents', 'tk.s4.padTemplate', 'tk.s4.evidence']);
export { POSE_CALLS as SLOT_CALLS } from './poseSpace.mjs';
