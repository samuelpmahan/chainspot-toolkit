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
  seedFailedTestsAllowed: Object.freeze(['fitted-size', 'border-complete', 'band-coverage'])
});

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
      if (xx >= 0 && yy >= 0 && xx < W && yy < H) occ[yy * W + xx] = OCC.basketFringe;
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
  let tpl;
  try { tpl = fitPadTemplate(raster, inputs.anchors, inputs.interiorTone); }
  catch (e) {
    return { W: raster.widthPx, H: raster.heightPx, raster, tpl: null, unavailable: e.message, badges: inputs.badges, tees: inputs.tees,
      assignment: assignTeesToBadges(inputs.tees, inputs.badges), seeds: inputs.seeds ?? [], searchRadiusPx: null, searchRule: null };
  }
  const cls = classifyRaster(raster, tpl);
  const occ = buildOccluders(raster, inputs, tpl);
  const assignment = assignTeesToBadges(inputs.tees, inputs.badges);
  const maxAssignedPx = assignment.length ? Math.max(...assignment.map((a) => a.distancePx)) : 8 * tpl.lengthPx;
  return {
    W: raster.widthPx, H: raster.heightPx, raster, tpl, cls, occ, owned: new Uint8Array(raster.widthPx * raster.heightPx),
    badges: inputs.badges, tees: inputs.tees, assignment, seeds: inputs.seeds ?? [],
    searchRadiusPx: r3(RULES.searchRadiusFactor * maxAssignedPx),
    searchRule: `centers within ${RULES.searchRadiusFactor} x the largest S3 tee-badge distance (${r3(maxAssignedPx)} px) of the badge plate center, whose frame core holds >= 1 unoccluded frame-white px`
  };
}

const emptyOccluded = () => Object.fromEntries([...OCC_NAMES.slice(1), 'tint', 'offRaster'].map((k) => [k, 0]));

export function evaluatePose(ctx, cx, cy, angleRad, { collect = false } = {}) {
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
export function searchBadge(ctx, badge, { badgeRay = true } = {}) {
  const { mask, x0, y0, bw, bh } = candidateMask(ctx, badge);
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
export function greedyRecover(ctx, { badgeRay = true } = {}) {
  const N = ctx.badges.length;
  if (!ctx.tpl) {
    const assigned = new Set(ctx.assignment.map((a) => a.badge));
    return { recovered: [], log: [], rounds: 0, evaluatedPoses: 0, need: Math.max(0, N - ctx.tees.length),
      missed: ctx.badges.map((b, i) => i).filter((i) => !assigned.has(i)).map((i) => ({ badgeIndex: i, hole: ctx.badges[i].label, reason: `no pad template: ${ctx.unavailable}` })) };
  }
  const assignedBadges = new Set(ctx.assignment.map((a) => a.badge));
  const pending = new Set(ctx.badges.map((_, i) => i).filter((i) => !assignedBadges.has(i)));
  const need = Math.max(0, N - ctx.tees.length);
  const recovered = [], log = [];
  let rounds = 0, evaluatedPoses = 0;
  while (pending.size && recovered.length < need) {
    rounds++;
    let pick = null;
    for (const bi of [...pending].sort((a, b) => a - b)) {
      const r = searchBadge(ctx, ctx.badges[bi], { badgeRay });
      evaluatedPoses += r.evaluatedPoses;
      log.push({ round: rounds, badge: bi, label: ctx.badges[bi].label, candidateCenters: r.candidateCenters, seedsInDisk: r.seedsInDisk, best: r.best ? { center: r.best.center, angleDeg: r3(r.best.angleRad * DEG), score: r.best.score, accepted: r.best.accepted, fromSeed: r.best.seed ?? null } : null });
      if (r.best?.accepted && (!pick || r.best.score > pick.best.score)) pick = { bi, best: r.best };
    }
    if (!pick) break;
    const full = evaluatePose(ctx, pick.best.center[0], pick.best.center[1], pick.best.angleRad, { collect: true });
    for (const i of full.px.pad) ctx.owned[i] = OCC.recoveredTee;
    recovered.push(recoveredTee(ctx, pick.bi, full, { round: rounds, fromSeed: pick.best.seed ?? null, rule: badgeRay ? 'greedy occluded template, badge-ray constrained' : 'greedy occluded template, free angle (ablation)' }));
    pending.delete(pick.bi);
  }
  const missed = [...pending].sort((a, b) => a - b).map((bi) => {
    const last = [...log].reverse().find((l) => l.badge === bi);
    return { badgeIndex: bi, hole: ctx.badges[bi].label, lastBest: last?.best ?? null, reason: recovered.length >= need ? `stopped at cardinality N = ${N} badges` : 'no accepted pose' };
  });
  return { recovered, missed, need, rounds, evaluatedPoses, log };
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
  const badges = get('px.badges');
  const baskets = get('px.baskets');
  const recoveredBasketBoxes = get('tk.s4.basketRecovery').recoveredBoxes;
  const tees = get('px.tees.refined');
  const fam = get('px.tees.familyRefined');
  return {
    raster, badges, baskets, recoveredBasketBoxes, tees,
    anchors: fam.anchors, interiorTone: fam.model.interiorTone, seeds: padFragmentSeeds(fam)
  };
}

export const SLOT_READS = Object.freeze(['px.image.cropped', 'px.badges', 'px.baskets', 'tk.s4.basketRecovery', 'px.tees.refined', 'px.tees.familyRefined']);
