/**
 * S7 SCORING (Sam, 2026-10-19): "scoring and matching are separate phases"; S7 = score every hole x every basket, assign
 * one to one, then refine bends with the hallway sensor. This module is the scoring half (the matching rules are another
 * packet's): the route table as Calculations, and the two measures it carries. Browser-safe. Graduated from the Python
 * prototypes after-s4/match18.py (best_route by render-and-score edge contrast) and after-s4/match2.py (the hallway
 * sensor, one_bend), proved number for number (ports/s7route/prove.mjs, ports/s7route/s7route.dev.test.mjs).
 *
 * Two measures, both raw, no threshold, no verdict (the matching rules read them):
 *   edge contrast   polyscore.py poly_score (render-and-score, ports/s7trace/hallway.mjs polyScore): the ribbon of width
 *                   W rendered along the polyline (round joins), mean lum of the visible px 0.5-3 px inside its predicted
 *                   edges minus 0.5-3 px outside, end caps excluded: a contrast in lum (a difference of mean lum), null when
 *                   either band has < 30 visible px. ASSIGNMENT rides this one (coordinator, 2026-10-19: match18.py 18/18 baskets on
 *                   golden, townelake, heritage; the sensor alone lets a short route with few stations read 1.00).
 *   hallway sensor  match2.py sensor: the recorded per-station edge test (contrast.py station_contrast, written once as
 *                   fn.q.path.stationContrast in ports/s6straight/pathSpace.mjs). Along every leg, stations 1 px apart
 *                   from 0.75 W (first leg; 0.5 W after a joint) to |leg| - 0.5 W; VISIBLE when both edge bands are
 *                   unmasked (> 50 % of samples each side), PASSES when both edges step by > 8 lum. Reading = passing /
 *                   visible stations (0 when none). BEND REFINEMENT rides this one.
 *
 * Parts (each its own Calculation; ROUTE_CALCULATIONS + routeTableOn):
 *   tk.s7.routeStart    per hole with a tee (tk.s7.holes: S3 association or S4 recovered): the tee cap start S = T + u FRONT L
 *                       (px), the tee axis u (unit, toward the badge), the badge centre's distance along u from S (px);
 *                       holes without a tee are recorded conditions
 *   tk.s7.routeHallway  the hallway width W (px, LOCAL): teebadge.py on every hole's TEE -> BADGE segment (S3 + S4 tees,
 *                       the S4 scene's mask), median width of the usable segments centred within 3 px
 *   tk.s7.routeRow@<h>  one hole's row, to every basket (S2 + S4 recovered BasketPoints, tk.s7.sceneS4 bp):
 *                         contrast     the best route by edge contrast (match18 best_route): S -> BasketPoint, or
 *                                      S -> B1 -> BasketPoint with B1 on the tee axis from 0.5 W past the badge every 6 px
 *                                      up to 800 px past it (inside the image), strict improvement; its contrast, its
 *                                      counted px and the sensor reading of that same route
 *                         sensorBest   the route the sensor reads best (match2): the 0-bend route and the best 1-bend
 *                                      route (B1 every 8 px), each counting only with >= 20 visible stations; first on ties
 *                       Produced by fn.tk.s7.routeRow called with args { hole, start, widthPx } on a branch whose alias
 *                       names tk.s7.routeRow@<hole>: its cache key is the scene, the hole, ITS start and W, so a change to
 *                       one hole's tee recomputes that row alone (state is an argument)
 *   tk.s7.routeTable    the join: contrastMatrix (lum), sensorMatrix (match2 reading), contrastRouteSensor (the sensor on
 *                       each contrast route), onAxisPrior (packet E03: 15 or 0, with each cell's alongPx / lateralPx off
 *                       the tee ray), every cell, Sam's basket per hole when testimony exists (judging only, 12 px)
 * Queries:
 *   fn.q.route.sensor   { scene | raster + mask, verts, widthPx } -> { passFrac, stations, passCount, legs }
 *   fn.q.route.contrast { scene | raster + mask, verts, widthPx } -> { contrastLum, edgePx }
 *
 * Data conditions are recorded (no tee, no hallway width, too few px or stations), never thrown.
 */
import { stationContrastAt, lumOf } from '../s6straight/pathSpace.mjs';
import { arange, FRONT, teeBadgeLearn } from '../s7trace/hallway.mjs';
import { sha256Hex } from '../../fg/canon.mjs';
import { ROUTE_TABLE_SCHEMA } from '../../fg/s7route/routeRender.mjs';

export const ROUTE_START_PART = 'tk.s7.routeStart';
export const ROUTE_HALLWAY_PART = 'tk.s7.routeHallway';
export const ROUTE_ROW_PART = 'tk.s7.routeRow';
export const ROUTE_TABLE_PART = 'tk.s7.routeTable';
export const ROUTE_SENSOR_ROW_PART = 'tk.s7.routeSensorRow';
export const ROUTE_SENSOR_TABLE_PART = 'tk.s7.routeSensorTable';
export { ROUTE_TABLE_SCHEMA };
export const rowAddress = (hole) => `${ROUTE_ROW_PART}@${hole}`;
export const sensorRowAddress = (hole) => `${ROUTE_SENSOR_ROW_PART}@${hole}`;

/** The recorded constants of match2.py (Sam, 2026-10-19). */
export const ROUTE = Object.freeze({
  stepLum: 8.0,              // lum: both edges must step by more than this (contrast.py, s7edge)
  minStations: 20,           // visible stations a route needs to count (match2.py MIN_ST)
  firstLegSkipW: 0.75,       // first leg starts 0.75 W along (the tee cap)
  jointSkipW: 0.5,           // later legs start 0.5 W past the joint; every leg ends 0.5 W before its end
  stationStepPx: 1.0,
  bendFromBadgeW: 0.5,       // B1 from 0.5 W past the badge ...
  // map-scaled search distances are in rC1px, the basket C1 radius measured per image (S.R1; DOCTRINE: UDisc renders
  // differently at different zooms). The values are the prototypes' px on golden (R1 44.5 px) rounded: 800 px, 8 px, 6 px.
  bendReachR1: 18,           // ... up to 18 R1 past it
  bendStepR1: 0.18,          // every 0.18 R1 (match2.py one_bend step, 8 px on golden)
  contrastBendStepR1: 0.135, // every 0.135 R1 (match18.py best_route step, 6 px on golden)
  contrastBandPx: Object.freeze([0.5, 3.0]),   // polyscore.py band inside / outside the predicted edge
  contrastMinPx: 30,         // polyscore.py: fewer visible px in either band = no reading (-99 in the prototype)
  samMatchPx: 12,            // judging only: the one basket match rule (AGENTS.md)
  onAxisPriorLum: 15.0,      // packet E03 (verified by the lead on 4 courses): the on-axis basket's prior, in the contrast's units
  onAxisLateralW: 0.5        // on the tee ray: lateral offset <= 0.5 W
});
export const ROUTE_UNITS = Object.freeze({
  contrastLum: 'lum (mean lum of the visible px 0.5-3 px inside the rendered ribbon edges minus 0.5-3 px outside; end caps excluded)',
  edgePx: 'px (visible px counted in the smaller of the two bands)',
  passFrac: 'fraction of the visible stations whose two edges both step by > 8 lum at the hallway width',
  stations: 'visible stations (1 px apart; both edge bands unmasked)',
  verts: 'px (canonical frame): tee cap start, bends, BasketPoint',
  start: 'px (canonical frame) for S; unit vector for u; px along u for badgeAlongPx',
  widthPx: 'px (hallway width W, LOCAL)',
  onAxisPrior: 'lum (added to the contrast by the matching rule, never here): 15 for the nearest BasketPoint past the badge along the tee ray within 0.5 W of it, else 0',
  alongPx: 'px (BasketPoint along the tee axis u from the tee cap start S)',
  lateralPx: 'px (BasketPoint off the tee ray, signed: + to the left of u in image coordinates, n = (-u_y, u_x))'
});

// ------------------------------------------------------------------ the sensor (match2.py sensor)

/**
 * The sensor of the polyline verts at hallway width W on the context c ({ lum, mask, W, H }: a hallway scene, or a raster
 * with a path mask). memo (optional): a Map shared by the calls of one row; a leg with the same origin, heading and first
 * station reuses the station verdicts already read (the stations are the same floats, so the answer is identical).
 */
export function routeSensorAt(c, verts, W, { memo = null } = {}) {
  let P = 0, N = 0;
  const legs = [];
  for (let i = 0; i + 1 < verts.length; i++) {
    const a = verts[i], b = verts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1];
    const L = Math.hypot(dx, dy), t0 = i === 0 ? W * ROUTE.firstLegSkipW : W * ROUTE.jointSkipW, t1 = L - W * ROUTE.jointSkipW;
    if (t1 <= t0) { legs.push({ lengthPx: L, stations: 0, visible: 0, pass: 0 }); continue; }
    const n = Math.max(0, Math.ceil((t1 - t0) / ROUTE.stationStepPx)), phi = Math.atan2(dy, dx);
    const v = verdicts(c, a, phi, t0, n, W, memo);
    let p = 0, k = 0;
    for (let q = 0; q < n; q++) { if (v[q]) { k++; if (v[q] === 2) p++; } }
    P += p; N += k; legs.push({ lengthPx: L, stations: n, visible: k, pass: p });
  }
  return { passFrac: N ? P / N : 0, stations: N, passCount: P, legs };
}
/** Per station 0 = not visible, 1 = visible and fails, 2 = visible and passes; stations t0 + q (q < n). */
function verdicts(c, a, phi, t0, n, W, memo) {
  const key = memo ? `${a[0]} ${a[1]} ${phi} ${t0} ${W}` : null;
  let have = key ? memo.get(key) : null;
  if (have && have.length >= n) return have;
  const from = have ? have.length : 0, ts = arange(t0, t0 + n * ROUTE.stationStepPx, ROUTE.stationStepPx).subarray(from, n);
  const r = stationContrastAt(c, a, phi, ts, W), out = new Uint8Array(n);
  if (have) out.set(have);
  for (let q = 0; q < ts.length; q++) {
    const ok = r.okl[q] && r.okr[q];
    out[from + q] = ok ? (Math.min(r.cl[q], r.cr[q]) > ROUTE.stepLum ? 2 : 1) : 0;
  }
  if (key) memo.set(key, out);
  return out;
}

// ------------------------------------------------------------------ the edge contrast (polyscore.py poly_score)

/**
 * polyscore.py poly_score, the same px in the same (row-major) order as ports/s7trace/hallway.mjs polyScore, so the
 * sums are bit-identical: only the rows' x intervals that can lie within h + 3 px of a leg are visited (a px farther from
 * every leg is in neither band), minus the intervals deeper than h - 3 px inside a leg (in neither band either). -> [contrast lum, counted px] or [null, 0] when a band has < 30 visible px.
 */
export function ribbonContrastAt(c, V, W, { band = ROUTE.contrastBandPx } = {}) {
  const { lum, mask, W: IW, H: IH } = c, h = W / 2, reach = h + band[1] + 1;
  let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
  for (const [x, y] of V) { mnx = Math.min(mnx, x); mny = Math.min(mny, y); mxx = Math.max(mxx, x); mxy = Math.max(mxy, y); }
  const x0 = Math.max(Math.floor(mnx - h - band[1] - 2), 0), y0 = Math.max(Math.floor(mny - h - band[1] - 2), 0);
  const x1 = Math.min(Math.ceil(mxx + h + band[1] + 3), IW), y1 = Math.min(Math.ceil(mxy + h + band[1] + 3), IH);
  const segs = []; for (let i = 1; i < V.length; i++) { const a = V[i - 1], b = V[i], dx = b[0] - a[0], dy = b[1] - a[1]; segs.push([a[0], a[1], dx, dy, Math.max(dx * dx + dy * dy, 1e-9)]); }
  const e0 = V[0], e1 = V[V.length - 1], capR = h + band[1] + 2, capIn2 = (capR + 1) ** 2;
  const nSeg = segs.length, flat = Float64Array.from(segs.flat());
  const outer2 = (h + band[1] + 1) ** 2, inner2 = Math.max(0, h - band[1] - 1) ** 2;
  let si = 0, ni = 0, so = 0, no = 0;
  const rIn = h - band[1] - 0.01, iv = [], skip = [];
  const merge = (list) => { list.sort((p, q) => p[0] - q[0]); const out = []; for (const x of list) { const l = out.at(-1); if (l && x[0] <= l[1] + 1) l[1] = Math.max(l[1], x[1]); else out.push([x[0], x[1]]); } return out; };
  for (let y = y0; y < y1; y++) {
    iv.length = 0; skip.length = 0;
    for (const [ax, ay, dx, dy, L2] of segs) {
      // the x interval of this row within `reach` of the leg (conservative: a superset)
      let ta, tb;
      if (Math.abs(dy) < 1e-12) { if (Math.abs(ay - y) > reach) continue; ta = 0; tb = 1; }
      else { ta = (y - reach - ay) / dy; tb = (y + reach - ay) / dy; if (ta > tb) [ta, tb] = [tb, ta]; ta = Math.max(ta, 0); tb = Math.min(tb, 1); if (ta > tb) continue; }
      const xa = ax + ta * dx, xb = ax + tb * dx;
      iv.push([Math.max(x0, Math.ceil(Math.min(xa, xb) - reach)), Math.min(x1 - 1, Math.floor(Math.max(xa, xb) + reach))]);
      // the x interval whose px lie deeper than h - 3 px inside the ribbon of this leg (a subset): in no band, skipped
      if (rIn > 0 && L2 > 1e-9) {
        const L = Math.sqrt(L2); let lo = -Infinity, hi = Infinity;
        const slab = (alpha, beta, a0, a1) => {   // a0 < alpha x + beta < a1
          if (Math.abs(alpha) < 1e-12) { if (!(beta > a0 && beta < a1)) { lo = Infinity; hi = -Infinity; } return; }
          let u = (a0 - beta) / alpha, v = (a1 - beta) / alpha; if (u > v) [u, v] = [v, u]; lo = Math.max(lo, u); hi = Math.min(hi, v);
        };
        slab(-dy / L, (dy * ax + dx * (y - ay)) / L, -rIn, rIn);                 // perpendicular distance < rIn
        slab(dx / L2, (-dx * ax + dy * (y - ay)) / L2, 1e-9, 1 - 1e-9);            // projection strictly inside the leg
        const a = Math.ceil(lo + 1e-6), b = Math.floor(hi - 1e-6);
        if (a <= b) skip.push([a, b]);
      }
    }
    if (!iv.length) continue;
    const outer = merge(iv), inner = skip.length ? merge(skip) : [];
    let s = 0;
    for (const [lo, hi] of outer) for (let x = lo; x <= hi; x++) {
      while (s < inner.length && inner[s][1] < x) s++;
      if (s < inner.length && inner[s][0] <= x) { x = Math.min(hi, inner[s][1]); continue; }
      const i = y * IW + x;
      if (!(mask[i] < 0.01)) continue;
      // the same tests as polyScore, the same Math.hypot values: squared distances only pick the nearest leg and skip
      // px that are certainly outside the bands (margins of 1 px), so the counted px and their sums are unchanged
      const c0x = x - e0[0], c0y = y - e0[1], c1x = x - e1[0], c1y = y - e1[1];
      if (c0x * c0x + c0y * c0y <= capIn2 && !(Math.hypot(c0x, c0y) > capR)) continue;
      if (c1x * c1x + c1y * c1y <= capIn2 && !(Math.hypot(c1x, c1y) > capR)) continue;
      let best2 = Infinity, bx = 0, by = 0;
      for (let q = 0; q < nSeg; q++) {
        const o = 5 * q, ax = flat[o], ay = flat[o + 1], dx = flat[o + 2], dy = flat[o + 3];
        let t = ((x - ax) * dx + (y - ay) * dy) / flat[o + 4]; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = x - (ax + t * dx), ey = y - (ay + t * dy), d2 = ex * ex + ey * ey;
        if (d2 < best2) { best2 = d2; bx = ex; by = ey; }
      }
      if (best2 > outer2 || best2 < inner2) continue;
      let D = Infinity;   // polyScore's min of hypot over the legs (ties between legs give the same value)
      for (let q = 0; q < nSeg; q++) {
        const o = 5 * q, ax = flat[o], ay = flat[o + 1], dx = flat[o + 2], dy = flat[o + 3];
        let t = ((x - ax) * dx + (y - ay) * dy) / flat[o + 4]; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = x - (ax + t * dx), ey = y - (ay + t * dy);
        if (ex * ex + ey * ey <= best2 * (1 + 1e-9) + 1e-12) { const d = Math.hypot(ex, ey); if (d < D) D = d; }
      }
      if (D >= h - band[1] && D <= h - band[0]) { si += lum[i]; ni++; } else if (D >= h + band[0] && D <= h + band[1]) { so += lum[i]; no++; }
    }
  }
  if (ni < ROUTE.contrastMinPx || no < ROUTE.contrastMinPx) return [null, 0];
  return [si / ni - so / no, Math.min(ni, no)];
}

// ------------------------------------------------------------------ the starts and the hallway (match2.py start, teebadge.py)

/** tk.s7.routeStart: per hole with a tee, the cap start, the axis and the badge distance along it. */
export function routeStartOf(S, holesPart) {
  const holes = [], conditions = [];
  for (const h of holesPart.holes) {
    if (!h.tee) { conditions.push({ hole: h.hole, condition: h.condition ?? 'no tee' }); continue; }
    const T = h.tee.teeCenter, u = h.tee.u, B = S.badges[Number(h.hole)];
    if (!B) { conditions.push({ hole: h.hole, condition: `Badge ${h.hole} has no S1 badge centre` }); continue; }
    const St = [T[0] + u[0] * FRONT * S.L, T[1] + u[1] * FRONT * S.L];
    holes.push({ hole: h.hole, S: St, u: [u[0], u[1]], teeCenter: [T[0], T[1]], badgeAlongPx: (B[0] - St[0]) * u[0] + (B[1] - St[1]) * u[1], teeSource: h.tee.source });
  }
  holes.sort((x, y) => Number(x.hole) - Number(y.hole));
  return { schema: 'nctk-s7-route-start@1', rule: `S = tee centre + u x ${FRONT.toFixed(4)} x pad length L (${S.L} px); u = the tee axis toward its badge; badgeAlongPx = (badge centre - S) . u`,
    units: ROUTE_UNITS.start, padLengthPx: S.L, holes, conditions, emits: { holesCount: holes.length, noTeeCount: conditions.length } };
}

/** tk.s7.routeHallway: W from every hole's TEE -> BADGE segment (teebadge.py learn over S3 + S4 tees, median). */
export function routeHallwayOf(S, start) {
  const base = Object.fromEntries(start.holes.map((h) => [h.hole, { teeCenter: h.teeCenter, u: h.u }]));
  const tb = teeBadgeLearn(S, base);
  return { schema: 'nctk-s7-route-hallway@1', widthPx: tb.widthPx, unit: ROUTE_UNITS.widthPx, segments: tb.segments, of: tb.of, rows: tb.rows,
    rule: 'teebadge.py: per tee (S3 + S4) the TEE -> BADGE segment, free width search 18 px .. max(60 px, 1.2 rC1), usable when centred within 3 px; W = median',
    condition: tb.widthPx ? null : 'no usable TEE -> BADGE segment: no hallway width', emits: { widthPx: tb.widthPx ?? 0, segmentsCount: tb.segments } };
}

// ------------------------------------------------------------------ one row (match18.py best_route, match2.py one_bend)

/** The bend points on the tee axis: from 0.5 W past the badge, every `step` px, up to 800 px past it, while inside the image. */
function bendsOnAxis(c, start, W, step, units = 'r1') {
  const { S, u, badgeAlongPx: dB } = start, out = [], reach = units === 'px' ? 800 : ROUTE.bendReachR1 * c.R1;   // px: match2.py as recorded
  for (const t of arange(dB + W * ROUTE.bendFromBadgeW, dB + reach, step)) {
    const B1 = [S[0] + u[0] * t, S[1] + u[1] * t];
    if (!(B1[0] >= 0 && B1[0] < c.W && B1[1] >= 0 && B1[1] < c.H)) break;
    out.push([t, B1]);
  }
  return out;
}

/**
 * The fast search (rule set tableSearch 'fast'): the same bend axis swept at FAST.coarse x the step, then the best FAST.keep
 * coarse bends refined at the full step within +- one coarse step. Same scoring, same strict-improvement rule over the 0-bend.
 */
export const FAST = Object.freeze({ coarse: 4, keep: 2 });
/** The lean search (rule set tableSearch 'lean'): every basket swept at LEAN.coarse x the step; only the row's best LEAN.baskets
 *  (by that coarse contrast) refined as 'fast' does. Cells not refined keep their coarse best (a lower bound of the full search). */
export const LEAN = Object.freeze({ coarse: 8, baskets: 3 });
function coarseContrastAt(c, start, E, W, units, mult) {
  const S = start.S, z = ribbonContrastAt(c, [S, E], W), step = (units === 'px' ? 6 : ROUTE.contrastBendStepR1 * c.R1) * mult;
  let best = { contrastLum: z[0], edgePx: z[1], verts: [S, E], bendAlongPx: null }, tried = 1;
  for (const [t, B1] of bendsOnAxis(c, start, W, step, units)) {
    const r = ribbonContrastAt(c, [S, B1, E], W); tried++;
    if (r[0] !== null && (best.contrastLum === null || r[0] > best.contrastLum)) best = { contrastLum: r[0], edgePx: r[1], verts: [S, B1, E], bendAlongPx: t };
  }
  return { best, tried };
}
export function contrastRouteFastAt(c, start, E, W, units = 'r1') {
  const S = start.S, z = ribbonContrastAt(c, [S, E], W), step = units === 'px' ? 6 : ROUTE.contrastBendStepR1 * c.R1;
  let best = { contrastLum: z[0], edgePx: z[1], verts: [S, E], bendAlongPx: null }, tried = 1;
  const coarse = [];
  for (const [t, B1] of bendsOnAxis(c, start, W, step * FAST.coarse, units)) { const r = ribbonContrastAt(c, [S, B1, E], W); tried++; if (r[0] !== null) coarse.push([r[0], t, r[1], B1]); }
  coarse.sort((a, b) => b[0] - a[0]);
  const consider = (t, B1, r) => { if (r[0] !== null && (best.contrastLum === null || r[0] > best.contrastLum)) best = { contrastLum: r[0], edgePx: r[1], verts: [S, B1, E], bendAlongPx: t }; };
  for (const [v, t0, px, B10] of coarse.slice(0, FAST.keep)) {
    consider(t0, B10, [v, px]);
    for (let k = -FAST.coarse + 1; k < FAST.coarse; k++) {
      if (k === 0) continue;
      const t = t0 + k * step, B1 = [S[0] + start.u[0] * t, S[1] + start.u[1] * t];
      if (!(B1[0] >= 0 && B1[0] < c.W && B1[1] >= 0 && B1[1] < c.H)) continue;
      consider(t, B1, ribbonContrastAt(c, [S, B1, E], W)); tried++;
    }
  }
  return { best, tried };
}

/** match18.py best_route: the 0-bend route, replaced by a 1-bend route only on strict improvement of the edge contrast. */
export function contrastRouteAt(c, start, E, W, units = 'r1') {
  const S = start.S, z = ribbonContrastAt(c, [S, E], W);
  let best = { contrastLum: z[0], edgePx: z[1], verts: [S, E], bendAlongPx: null }, tried = 1;
  for (const [t, B1] of bendsOnAxis(c, start, W, units === 'px' ? 6 : ROUTE.contrastBendStepR1 * c.R1, units)) {
    const r = ribbonContrastAt(c, [S, B1, E], W); tried++;
    if (r[0] !== null && (best.contrastLum === null || r[0] > best.contrastLum)) best = { contrastLum: r[0], edgePx: r[1], verts: [S, B1, E], bendAlongPx: t };
  }
  return { best, tried };
}

/** match2.py one_bend: the best 1-bend route by the sensor (>= 20 visible stations; first best on ties), or null. */
export function oneBendAt(c, start, E, W, { memo = null } = {}) {
  const S = start.S;
  let best = null, tried = 0;
  for (const [t, B1] of bendsOnAxis(c, start, W, ROUTE.bendStepR1 * c.R1)) {
    const r = routeSensorAt(c, [S, B1, E], W, { memo }); tried++;
    if (r.stations >= ROUTE.minStations && (best === null || r.passFrac > best.passFrac)) best = { passFrac: r.passFrac, stations: r.stations, verts: [S, B1, E], bendAlongPx: t };
  }
  return { best, tried };
}

/** tk.s7.routeRow@<hole>: per BasketPoint, the best route by edge contrast, with the sensor's reading on that route. */
export function routeRowOf(c, start, bp, W, units = 'r1', search = 'full') {
  if (!(W > 0)) return { schema: 'nctk-s7-route-row@1', hole: start.hole, condition: 'no hallway width', cells: [], emits: { cellsCount: 0 } };
  const memo = new Map(), cells = [];
  let contrastRoutes = 0;
  let lean = null;
  if (search === 'lean') {
    const coarse = bp.map((E) => coarseContrastAt(c, start, E, W, units, LEAN.coarse));
    coarse.forEach((x) => { contrastRoutes += x.tried; });
    const order = coarse.map((x, k) => [x.best.contrastLum ?? -Infinity, k]).sort((a, b) => b[0] - a[0]).slice(0, LEAN.baskets).map(([, k]) => k);
    lean = { coarse, refine: new Set(order) };
  }
  for (let k = 0; k < bp.length; k++) {
    const cr = lean ? (lean.refine.has(k) ? contrastRouteFastAt(c, start, bp[k], W, units) : { ...lean.coarse[k], tried: 0 })
      : (search === 'fast' ? contrastRouteFastAt : contrastRouteAt)(c, start, bp[k], W, units); contrastRoutes += cr.tried;
    const crs = routeSensorAt(c, cr.best.verts, W, { memo });
    const contrast = { contrastLum: cr.best.contrastLum, edgePx: cr.best.edgePx, bends: cr.best.verts.length - 2, verts: cr.best.verts, bendAlongPx: cr.best.bendAlongPx,
      sensor: { passFrac: crs.passFrac, stations: crs.stations }, condition: cr.best.contrastLum === null ? `fewer than ${ROUTE.contrastMinPx} visible px in an edge band on every route` : null };
    cells.push({ basket: k, contrast });
  }
  return { schema: 'nctk-s7-route-row@1', hole: start.hole, start, widthPx: W, cells, condition: null,
    emits: { cellsCount: cells.length, contrastRoutesCount: contrastRoutes, contrastReadCellsCount: cells.filter((x) => x.contrast.contrastLum !== null).length } };
}

/**
 * tk.s7.routeSensorRow@<hole>: per BasketPoint, the sensor's own best 0- or 1-bend route (match2.py). The matching rule never
 * reads it (it reads the contrast route and the sensor ON that route, both in tk.s7.routeRow); it is the scoring view, the
 * route-table render's sensor panel and the match2.py parity proof, so it is produced only when one of them asks.
 */
export function routeSensorRowOf(c, start, bp, W) {
  if (!(W > 0)) return { schema: 'nctk-s7-route-sensor-row@1', hole: start.hole, condition: 'no hallway width', cells: [], emits: { cellsCount: 0 } };
  const memo = new Map(), cells = [];
  let sensorRoutes = 0;
  for (let k = 0; k < bp.length; k++) {
    const z = routeSensorAt(c, [start.S, bp[k]], W, { memo });
    const zero = { passFrac: z.passFrac, stations: z.stations, verts: [start.S, bp[k]], counts: z.stations >= ROUTE.minStations };
    const o = oneBendAt(c, start, bp[k], W, { memo }); sensorRoutes += o.tried + 2;
    const one = o.best ? { ...o.best, counts: true } : null;
    let best = zero.counts ? 'zero' : null;
    if (one && (best === null || one.passFrac > zero.passFrac)) best = 'one';
    const sensorBest = { passFrac: best === 'zero' ? zero.passFrac : best === 'one' ? one.passFrac : 0, best, bends: best === 'zero' ? 0 : best === 'one' ? 1 : null, zero, one,
      condition: best ? null : `no route with >= ${ROUTE.minStations} visible stations` };
    cells.push({ basket: k, sensorBest });
  }
  return { schema: 'nctk-s7-route-sensor-row@1', hole: start.hole, start, widthPx: W, cells, condition: null,
    emits: { cellsCount: cells.length, sensorRoutesCount: sensorRoutes } };
}

// ------------------------------------------------------------------ the table

/** Sam's basket per hole: the BasketPoint within 12 px of his basket mark (judging only; testimony is impeachable). */
export function samBasketsOf(holePaths, bp) {
  if (!holePaths?.path) return { source: null, rule: holePaths?.rule ?? 'no testimony', byHole: {} };
  const byHole = {};
  for (const h of holePaths.holes) {
    if (!h.basket) continue;
    let k = null, d = Infinity; bp.forEach((p, j) => { const dd = Math.hypot(p[0] - h.basket[0], p[1] - h.basket[1]); if (dd < d) { d = dd; k = j; } });
    byHole[h.hole] = d <= ROUTE.samMatchPx ? { basket: k, distancePx: d } : { basket: null, distancePx: d, condition: `no BasketPoint within ${ROUTE.samMatchPx} px of Sam's basket` };
  }
  return { source: holePaths.path, rule: `Sam's basket = the BasketPoint within ${ROUTE.samMatchPx} px of his mark (one match rule)`, byHole };
}

/**
 * The on-axis prior (packet E03, after-s4/verify_axis_prior.py): per hole, every BasketPoint's along / lateral position
 * relative to the tee ray from S; the nearest one past the badge (along > badge distance) within 0.5 W laterally gets 15.
 */
export function onAxisOf(start, bp, W) {
  const { S, u, badgeAlongPx: dB } = start, n = [-u[1], u[0]];
  const pos = bp.map((p) => { const d = [p[0] - S[0], p[1] - S[1]]; return { alongPx: d[0] * u[0] + d[1] * u[1], lateralPx: d[0] * n[0] + d[1] * n[1] }; });
  let k = -1; pos.forEach((q, j) => { if (q.alongPx > dB && Math.abs(q.lateralPx) <= W * ROUTE.onAxisLateralW && (k < 0 || q.alongPx < pos[k].alongPx)) k = j; });
  return pos.map((q, j) => ({ ...q, onAxisPrior: j === k ? ROUTE.onAxisPriorLum : 0 }));
}

const argmax = (row) => { let j = -1; row.forEach((v, i) => { if (v !== null && (j < 0 || v > row[j])) j = i; }); return j < 0 ? null : j; };

/** tk.s7.routeTable: the holes x baskets matrices (edge contrast, sensor) with every cell's routes. No threshold, no verdict. */
export function routeTableOf(start, hallway, rows, holesPart, sam, bp, sensorRows = null) {
  if (sensorRows) rows = rows.map((r, i) => ({ ...r, cells: r.cells.map((c, k) => ({ ...c, sensorBest: sensorRows[i].cells[k]?.sensorBest ?? null })) }));
  const axis = start.holes.map((h) => (hallway.widthPx > 0 ? onAxisOf(h, bp, hallway.widthPx) : bp.map(() => ({ alongPx: null, lateralPx: null, onAxisPrior: 0 }))));
  const baskets = holesPart.baskets.map((k) => ({ index: k.index, name: k.name, point: k.point, source: k.source }));
  const holes = start.holes.map((h) => h.hole);
  const contrastMatrix = rows.map((r) => r.cells.map((x) => x.contrast.contrastLum));
  const contrastRouteSensor = rows.map((r) => r.cells.map((x) => x.contrast.sensor.passFrac));
  const sensorMatrix = sensorRows ? rows.map((r) => r.cells.map((x) => x.sensorBest?.passFrac ?? 0)) : null;
  return {
    schema: ROUTE_TABLE_SCHEMA,
    rule: 'every hole (tee cap) x every basket (S2 + S4 recovered BasketPoint). contrastMatrix: the best 0- or 1-bend route by render-and-score edge contrast (match18.py best_route; bend on the tee axis past the badge, step 6 px); contrastRouteSensor: the hallway sensor on that route; sensorMatrix: the best reading of the sensor over the 0-bend and the best 1-bend route (match2.py; step 8 px; >= 20 visible stations, else 0)',
    units: { contrastMatrix: ROUTE_UNITS.contrastLum, contrastRouteSensor: ROUTE_UNITS.passFrac, sensorMatrix: ROUTE_UNITS.passFrac, ...ROUTE_UNITS },
    widthPx: hallway.widthPx, holes, baskets, contrastMatrix, contrastRouteSensor, sensorMatrix,
    onAxisPrior: axis.map((r) => r.map((x) => x.onAxisPrior)),
    onAxisRule: `packet E03 (after-s4/verify_axis_prior.py): ${ROUTE.onAxisPriorLum} for the nearest BasketPoint past the badge along the tee ray with |lateral| <= ${ROUTE.onAxisLateralW} W, else 0; a column for the matching rule, not added to the contrast here`,
    rows: rows.map((r, i) => ({ hole: r.hole, condition: r.condition, cells: r.cells.map((c, k) => ({ ...c, axis: axis[i][k] })) })),
    rowBest: holes.map((h, i) => ({ hole: h, contrastBasket: argmax(contrastMatrix[i]), sensorBasket: sensorMatrix ? argmax(sensorMatrix[i]) : null })),
    sensorView: sensorRows ? 'produced (tk.s7.routeSensorRow per hole)' : 'not produced: the matching rule reads only the contrast route and the sensor on it (tk.s7.routeSensorTable carries it)',
    sam: { source: sam.source, rule: sam.rule, byHole: sam.byHole },
    conditions: [...start.conditions, ...(hallway.condition ? [{ hole: null, condition: hallway.condition }] : [])],
    emits: { holesCount: holes.length, basketsCount: baskets.length, cellsCount: holes.length * baskets.length, contrastReadCellsCount: contrastMatrix.flat().filter((v) => v !== null).length }
  };
}

// ------------------------------------------------------------------ the store

const digestOf = (...fns) => sha256Hex(fns.map(String).join('\n'));
const CODE = Object.freeze({
  start: digestOf(routeStartOf),
  hallway: digestOf(routeHallwayOf, teeBadgeLearn),
  row: digestOf(routeRowOf, bendsOnAxis, contrastRouteAt, contrastRouteFastAt, coarseContrastAt, ribbonContrastAt, routeSensorAt, verdicts, stationContrastAt),
  sensorRow: digestOf(routeSensorRowOf, bendsOnAxis, oneBendAt, routeSensorAt, verdicts, stationContrastAt),
  table: digestOf(routeTableOf, samBasketsOf, argmax, onAxisOf)
});
const SCENE = 'tk.s7.sceneS4', HOLES = 'tk.s7.holes';

/** The course-wide Calculations: starts and hallway (lazy: produced on first need). */
export const ROUTE_CALCULATIONS = Object.freeze([
  ['fn.tk.s7.routeStart', { inParts: [SCENE, HOLES], outParts: [ROUTE_START_PART], code: CODE.start, note: 'per hole: tee cap start, tee axis, badge distance along it (match2.py / match18.py start)',
    calculate: (io) => ({ [ROUTE_START_PART]: routeStartOf(io.in(SCENE), io.in(HOLES)) }) }],
  ['fn.tk.s7.routeHallway', { inParts: [SCENE, ROUTE_START_PART], outParts: [ROUTE_HALLWAY_PART], code: CODE.hallway, note: 'hallway width from every TEE -> BADGE segment, S3 + S4 tees (teebadge.py)',
    calculate: (io) => ({ [ROUTE_HALLWAY_PART]: routeHallwayOf(io.in(SCENE), io.in(ROUTE_START_PART)) }) }]
]);
/** One row: registered on a per-hole branch (alias tk.s7.routeRow -> tk.s7.routeRow@<hole>), called with { hole, start, widthPx }. */
export const ROUTE_ROW_CALCULATION = Object.freeze(['fn.tk.s7.routeRow', { inParts: [SCENE], outParts: [ROUTE_ROW_PART], code: CODE.row,
  note: 'one hole x every basket: the best route by edge contrast, with the sensor reading on it',
  calculate: (io) => { const S = io.in(SCENE); return { [ROUTE_ROW_PART]: routeRowOf(S, io.args.start, S.bp, io.args.widthPx) }; } }]);
/** The rule set's row in recorded px (tk.s7.routeRowPx@<hole>). */
export const ROUTE_ROW_PX_CALCULATION = Object.freeze(['fn.tk.s7.routeRowPx', { inParts: [SCENE], outParts: [`${ROUTE_ROW_PART}Px`], code: CODE.row,
  note: 'one hole x every basket, the bend search in match18.py\'s recorded px (rule set tablePx)',
  calculate: (io) => { const S = io.in(SCENE); return { [`${ROUTE_ROW_PART}Px`]: routeRowOf(S, io.args.start, S.bp, io.args.widthPx, 'px') }; } }]);
/** One sensor row (the scoring view; never read by the matching rule): alias tk.s7.routeSensorRow -> tk.s7.routeSensorRow@<hole>. */
export const ROUTE_SENSOR_ROW_CALCULATION = Object.freeze(['fn.tk.s7.routeSensorRow', { inParts: [SCENE], outParts: [ROUTE_SENSOR_ROW_PART], code: CODE.sensorRow,
  note: 'one hole x every basket: the sensor\'s own best 0- or 1-bend route (match2.py)',
  calculate: (io) => { const S = io.in(SCENE); return { [ROUTE_SENSOR_ROW_PART]: routeSensorRowOf(S, io.args.start, S.bp, io.args.widthPx) }; } }]);
export const routeTableCalculation = (rowAddresses) => ['fn.tk.s7.routeTable', { inParts: [ROUTE_START_PART, ROUTE_HALLWAY_PART, HOLES, SCENE, 'testimony.source.holePaths', ...rowAddresses], outParts: [ROUTE_TABLE_PART], code: CODE.table,
  note: 'holes x baskets: edge contrast and hallway sensor matrices, every cell\'s routes',
  calculate: (io) => ({ [ROUTE_TABLE_PART]: routeTableOf(io.in(ROUTE_START_PART), io.in(ROUTE_HALLWAY_PART), rowAddresses.map((a) => io.in(a)), io.in(HOLES), samBasketsOf(io.in('testimony.source.holePaths'), io.in(SCENE).bp), io.in(SCENE).bp) }) }];
export const routeSensorTableCalculation = (rowAddresses, sensorAddresses) => ['fn.tk.s7.routeSensorTable', { inParts: [ROUTE_START_PART, ROUTE_HALLWAY_PART, HOLES, SCENE, 'testimony.source.holePaths', ...rowAddresses, ...sensorAddresses], outParts: [ROUTE_SENSOR_TABLE_PART], code: CODE.table,
  note: 'the route table with the sensor\'s own best routes joined in (scoring view, render sensor panel, match2.py parity)',
  calculate: (io) => ({ [ROUTE_SENSOR_TABLE_PART]: routeTableOf(io.in(ROUTE_START_PART), io.in(ROUTE_HALLWAY_PART), rowAddresses.map((a) => io.in(a)), io.in(HOLES), samBasketsOf(io.in('testimony.source.holePaths'), io.in(SCENE).bp), io.in(SCENE).bp, sensorAddresses.map((a) => io.in(a))) }) }];

/**
 * Produce tk.s7.routeTable on a store that has tk.s7.sceneS4, tk.s7.holes and testimony.source.holePaths: the starts,
 * the width, one row per hole (each its own cached call), then the join. board: the branch's provider board (the runner's).
 */
export function routeTableOn(store, { board = null, sensor = false, units = 'r1', search = 'full' } = {}) {
  for (const [fn, spec] of ROUTE_CALCULATIONS) if (!store.registered(fn)) store.register(fn, spec);
  const start = store.get(ROUTE_START_PART), W = store.get(ROUTE_HALLWAY_PART).widthPx ?? null, rows = [];
  const suffix = `${units === 'px' ? 'Px' : ''}${search === 'fast' ? 'Fast' : search === 'lean' ? 'Lean' : ''}`;
  if (suffix) {   // a rule set's table (px: match18.py's recorded px; Fast: coarse-to-fine bends): its own rows and table Parts
    const rowPart = `${ROUTE_ROW_PART}${suffix}`, tablePart = `${ROUTE_TABLE_PART}${suffix}`, rowFn = `fn.tk.s7.routeRow${suffix}`, tableFn = `fn.tk.s7.routeTable${suffix}`;
    for (const h of start.holes) {
      const address = `${rowPart}@${h.hole}`;
      if (!store.has(address)) {
        const b = store.branch(board, { name: `s7route/hole ${h.hole} (${suffix})`, alias: { [rowPart]: address }, sharedParts: true });
        b.register(rowFn, { inParts: [SCENE], outParts: [rowPart], code: CODE.row, note: `one hole x every basket, rule set table ${suffix}`,
          calculate: (io) => { const S = io.in(SCENE); return { [rowPart]: routeRowOf(S, io.args.start, S.bp, io.args.widthPx, units, search) }; } });
        b.call(rowFn, { hole: h.hole, start: h, widthPx: W });
      }
      rows.push(address);
    }
    if (!store.registered(tableFn)) store.register(tableFn, { ...routeTableCalculation(rows)[1], outParts: [tablePart],
      calculate: (io) => ({ [tablePart]: routeTableCalculation(rows)[1].calculate(io)[ROUTE_TABLE_PART] }) });
    return store.get(tablePart);
  }
  for (const h of start.holes) {
    const address = rowAddress(h.hole);
    if (!store.has(address)) {
      const b = store.branch(board, { name: `s7route/hole ${h.hole}`, alias: { [ROUTE_ROW_PART]: address }, sharedParts: true });
      b.register(...ROUTE_ROW_CALCULATION);
      b.call('fn.tk.s7.routeRow', { hole: h.hole, start: h, widthPx: W });
    }
    rows.push(address);
  }
  if (!store.registered('fn.tk.s7.routeTable')) store.register(...routeTableCalculation(rows));
  if (!sensor) return store.get(ROUTE_TABLE_PART);
  const sensorRows = [];
  for (const h of start.holes) {
    const address = sensorRowAddress(h.hole);
    if (!store.has(address)) {
      const b = store.branch(board, { name: `s7route/sensor hole ${h.hole}`, alias: { [ROUTE_SENSOR_ROW_PART]: address }, sharedParts: true });
      b.register(...ROUTE_SENSOR_ROW_CALCULATION);
      b.call('fn.tk.s7.routeSensorRow', { hole: h.hole, start: h, widthPx: W });
    }
    sensorRows.push(address);
  }
  if (!store.registered('fn.tk.s7.routeSensorTable')) store.register(...routeSensorTableCalculation(rows, sensorRows));
  return store.get(ROUTE_SENSOR_TABLE_PART);
}

// ------------------------------------------------------------------ the queries

const rasterOf = (r) => (r && r.rgba && Number.isInteger(r.widthPx) ? r : null);
const ctxOf = (scene, raster, mask) => (scene?.lum ? scene : rasterOf(raster) ? { lum: lumOf(raster), W: raster.widthPx, H: raster.heightPx, mask: mask?.mask ?? new Uint8Array(raster.widthPx * raster.heightPx) } : null);
const checked = (fn, c, verts, widthPx) => (!c ? `${fn}: no scene or raster (pass scene: 'tk.s7.sceneS4', or raster: 'px.image.cropped' with mask)`
  : !(widthPx > 0) ? `${fn}: no hallway width` : !Array.isArray(verts) || verts.length < 2 ? `${fn}: a route needs at least 2 vertices` : null);
/** fn.q.route.*: on any polyline; scene 'tk.s7.sceneS4', or raster 'px.image.cropped' + mask ({ mask } plane, e.g. 'tk.s6.pathMask'). */
export const ROUTE_QUERIES = Object.freeze({
  'fn.q.route.sensor': ({ raster = null, mask = null, scene = null, verts, widthPx }) => {
    const c = ctxOf(scene, raster, mask), why = checked('fn.q.route.sensor', c, verts, widthPx);
    if (why) return { value: { condition: why }, unit: 'condition' };
    const r = routeSensorAt(c, verts, widthPx);
    return { value: { passFrac: r.passFrac, stations: r.stations, passCount: r.passCount, legs: r.legs, rule: `ends and joints skipped (first leg from ${ROUTE.firstLegSkipW} W, then ${ROUTE.jointSkipW} W; each leg ends ${ROUTE.jointSkipW} W early); pass: both edges > ${ROUTE.stepLum} lum` },
      unit: `passFrac: ${ROUTE_UNITS.passFrac}; stations: ${ROUTE_UNITS.stations}` };
  },
  'fn.q.route.contrast': ({ raster = null, mask = null, scene = null, verts, widthPx }) => {
    const c = ctxOf(scene, raster, mask), why = checked('fn.q.route.contrast', c, verts, widthPx);
    if (why) return { value: { condition: why }, unit: 'condition' };
    const [contrastLum, edgePx] = ribbonContrastAt(c, verts, widthPx);
    return { value: { contrastLum, edgePx, condition: contrastLum === null ? `fewer than ${ROUTE.contrastMinPx} visible px in an edge band` : null }, unit: `contrastLum: ${ROUTE_UNITS.contrastLum}; edgePx: ${ROUTE_UNITS.edgePx}` };
  }
});
