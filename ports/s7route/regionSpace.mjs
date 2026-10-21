/**
 * The S7 REGION sensor (Sam, 2026-10-21: "the tree shade and sidewalk edges is showing our exact weaknesses so how do we adapt
 * to it?"; "we handled bright under alpha very well but dark under alpha (like the trees) was basically unguarded"). Browser-safe.
 * Graduated from the lane's prototypes (scratch station2.py, st2train.py, routeEval.py; numbers in the lane report).
 *
 * The edge sensors (routeSpace.mjs ribbonContrastAt, routeSensorAt) read a hallway by the lum STEP at its predicted edges.
 * Shade beside a hallway erases or fakes that step. This module reads the hallway as a REGION instead: the band of width W
 * along a route must look like the UDisc hallway layer drawn over what lies beside it.
 *
 *   overlay model  the hallway is a nearly opaque light layer, so a station's inside colour follows its surroundings:
 *                  inside ~= a * under + b per channel, under = the mean colour of the flanks (W/2 + W/8 .. W/2 + 5W/8 each
 *                  side). a, b are fitted per image (LOCAL) on the station means of the guaranteed hallway (least squares;
 *                  the predictive slope from the flank mean, not the physical 1 - alpha that fg/alpha's tk.s7.alphaProfile
 *                  estimates). Over dark ground (tree shade) the expected hallway is darker, so dark-under stations are
 *                  judged against their own expectation, not against one fixed hallway colour.
 *   station        a point of the route, stations W/4 apart; features: log1p(chi2 of inside vs the overlay prediction) and
 *                  log1p(chi2 of inside vs the null "no layer": inside = under), each channel over its residual spread
 *                  sigma (1.4826 MAD). A logistic (a perceptron with a sigmoid, fitted by Newton steps, class-balanced) gives
 *                  P(hallway) per station. Visible when the inside samples and at least one flank are >= 50 % unmasked.
 *   training       per image, from the guaranteed hallway only (no testimony): every hole's tee cap -> badge segment (Sam:
 *                  "the tee -> badge segment is straight hallway"; it ends 1.5 badge half-diagonals before the badge centre)
 *                  and every S6-STRAIGHT hole from its tee cap to its first forward BasketPoint within 0.5 R1 of the tee ray
 *                  (44 / 44 such holes end at that basket on 6 courses, lane s7bends), ending R1 before it (the hallway ends
 *                  at C1). Negatives: the same stations shifted sideways by 0.5, 1, 1.5, 2 and 3 W.
 *   route reading  stations W/4 apart along every leg (first leg from 0.75 W, later legs from 0.5 W past the joint, each leg
 *                  ending 0.5 W early: the edge sensor's skips) minus those within R1 of the route's end (inside C1):
 *                    supportMean  mean over ALL stations of (2 P - 1), an invisible station counting 0 (no evidence): -1..1
 *                    passFrac     visible stations with P >= 0.5 / visible stations
 *                    stations     the visible ribbon length in px (visible stations x W/4), so the station floors of the
 *                                 matching rules (a visible length in px) keep their meaning
 *
 * Measured (lane s7region, 2026-10-21; golden, lenard, townelake, heritage, alex, northpark, beaverranchCapture, seatacCapture,
 * coletocreekFull): the per-image fit predicts inside from under with a 0.14-0.58 (R^2 0.07-0.62); held-out stations (model of the
 * even holes on the odd holes) AUC 0.83-0.99; dark-under stations (the darkest quarter of under) pass 89-100 %, where a fixed colour
 * cluster misses 24 % (Beaver) and 43 % (Coleto) of them. Texture (lum std over W/2: 0.2-0.6 s per course) and structure-tensor
 * edges at W/2 (0.5-1.1 s) were measured as station features and moved neither the held-out AUC (+-0.03) nor the assignment: not
 * kept. No station feature tried rejects light, smooth ground away from the hallways (roads, sidewalks, dry grass; 16-46 % of
 * off-route grid cells read P >= 0.5 at their best heading): where the ground is near b / (1 - a) the layer leaves no trace, and
 * such cells read hallway 1.8-4.5x as often (6 of 8 courses; not on lenard and northpark, both low contrast). What rejects
 * them is the route: tee cap -> basket ring at width W, one to one.
 *
 * How the rule sets use it (match.mjs sensor): 'region' = the assignment by region support (each cell's best route by region
 * support, on-axis prior 0.2), the routes and every per-hole step by edges: the same solve as the edge pointer on every dev course,
 * and only Beaver 4 / 19 and Coleto 10 / 11 change on the validation courses, each to the basket Sam named. 'regionAll' (every
 * measure by region) places bends badly: the support is flat along a bend axis (a corner cut still lies mostly in the band);
 * golden 15 / 18 agree, bends 5 / 5 / 4.
 *
 * Parts (each its own Calculation, lazy, registered by registerRegion):
 *   tk.s7.regionMean   masked box means of R, G, B over a W/4 window and the unmasked cover there: Uint8 planes (O(1) reads)
 *   tk.s7.regionModel  the per-image overlay fit and station logistic, the training counts, the held-out and dark-under rows
 *   tk.s7.sceneRegion  tk.s7.sceneS4 with { region } attached: the scene whose route measures read the REGION
 *                      (routeSpace.mjs ribbonContrastAt / routeSensorAt dispatch on it), or sceneS4 itself with the condition
 *   tk.s7.regionHeat   the station P on a W/4 grid, best of 8 headings (Uint8): the model's render, produced only when asked
 * Query:
 *   fn.q.route.region  { scene: 'tk.s7.sceneRegion', verts, widthPx } -> { supportMean, passFrac, stations, ... }
 */
import { sha256Hex } from '../../fg/canon.mjs';
import { REGION_HEAT_SCHEMA, REGION_MEAN_SCHEMA } from '../../fg/s7route/regionRender.mjs';
import { ROUTE_CALCULATIONS } from './routeSpace.mjs';   // circular (routeSpace reads the region): used at call time only

export const REGION_MEAN_PART = 'tk.s7.regionMean';
export const REGION_MODEL_PART = 'tk.s7.regionModel';
export const REGION_SCENE_PART = 'tk.s7.sceneRegion';
export const REGION_HEAT_PART = 'tk.s7.regionHeat';
export const REGION_MODEL_SCHEMA = 'nctk-s7-region-model@1';
export { REGION_HEAT_SCHEMA, REGION_MEAN_SCHEMA };
const SCENE = 'tk.s7.sceneS4', START = 'tk.s7.routeStart', HALLWAY = 'tk.s7.routeHallway', STRAIGHT = 'tk.s7.straight';

export const REGION = Object.freeze({
  meanWindowW: 0.25,                       // the mean plane's box window (W units)
  insideLatsW: Object.freeze([-0.25, 0, 0.25]),   // inside samples (each a W/4 box: the band minus W/8 at each edge)
  flankLatsW: Object.freeze([0.75, 1.0]),  // flank samples each side (W/2 + W/8 .. W/2 + 5W/8)
  stationStepW: 0.25,
  minCover: 0.5,                           // a sample side is visible when >= 50 % of its window is unmasked
  firstLegSkipW: 0.75, jointSkipW: 0.5,    // the edge sensor's skips (routeSpace.mjs ROUTE)
  endSkipR1: 1.0,                          // stations within R1 of the route's end dropped: the hallway ends at the C1 ring
  badgeSkipHalf: 1.5,                      // a tee -> badge training segment ends 1.5 badge half-diagonals before the badge
  straightOnAxisR1: 0.5,                   // an S6-straight hole's basket: the first forward BasketPoint within 0.5 R1 of the tee ray
  negShiftsW: Object.freeze([0.5, 1, 1.5, 2, 3]),
  minTrainStations: 20,                    // visible positive stations a model needs (else a recorded condition)
  l2: 1e-3, newtonIters: 50,
  pass: 0.5,                               // a station passes when P(hallway) >= 0.5
  onAxisPrior: 0.2,                        // the on-axis basket's prior in support units (the edge table's 15 lum; calibrated on dev)
  heatHeadings: 8
});
export const REGION_UNITS = Object.freeze({
  supportMean: 'support (mean over the route\'s stations of 2 P(hallway) - 1; an invisible station counts 0): -1 .. 1',
  passFrac: 'fraction of the visible stations with P(hallway) >= 0.5',
  stations: 'px (visible ribbon length: visible stations x W/4)',
  P: 'probability (station logistic on the per-image overlay model)'
});
const FEATURES = Object.freeze(['log1p chi2 inside vs a * under + b', 'log1p chi2 inside vs under (no layer)']);

// ------------------------------------------------------------------ planes

/**
 * Masked box means (window k, odd; outside the image counts as masked) of R, G, B and the unmasked count, in one streaming pass:
 * per row the running horizontal sums of the 4 channels enter a ring of k + 1 rows, and running column sums add the row that
 * enters the window and subtract the row that leaves it (the integral-image / cv::boxFilter idea, O(1) per px). Sums are integers
 * held in Float64, so the means are exact.
 */
function maskedBoxMeans(rgba, mask, X, Y, k, rgb, cover) {
  const r = k >> 1, slots = k + 1, ring = new Float64Array(slots * X * 4), col = new Float64Array(X * 4), area = k * k;
  const hsum = (y) => {
    const o = (y % slots) * X * 4, row = y * X;
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
    const add = (x, sg) => { const i = row + x; if (mask[i]) return; s0 += sg * rgba[4 * i]; s1 += sg * rgba[4 * i + 1]; s2 += sg * rgba[4 * i + 2]; s3 += sg; };
    for (let x = 0; x < Math.min(r, X); x++) add(x, 1);
    for (let x = 0; x < X; x++) {
      if (x + r < X) add(x + r, 1);
      if (x - r - 1 >= 0) add(x - r - 1, -1);
      ring[o + 4 * x] = s0; ring[o + 4 * x + 1] = s1; ring[o + 4 * x + 2] = s2; ring[o + 4 * x + 3] = s3;
    }
  };
  const into = (y, sg) => { const o = (y % slots) * X * 4; for (let j = 0; j < 4 * X; j++) col[j] += sg * ring[o + j]; };
  for (let y = 0; y < Math.min(r, Y); y++) { hsum(y); into(y, 1); }
  for (let y = 0; y < Y; y++) {
    if (y + r < Y) { hsum(y + r); into(y + r, 1); }
    if (y - r - 1 >= 0) into(y - r - 1, -1);
    const row = y * X;
    for (let x = 0; x < X; x++) {
      const n = col[4 * x + 3], i = row + x;
      cover[i] = Math.floor((255 * n) / area + 0.5);
      if (n > 0) { rgb[3 * i] = Math.floor(col[4 * x] / n + 0.5); rgb[3 * i + 1] = Math.floor(col[4 * x + 1] / n + 0.5); rgb[3 * i + 2] = Math.floor(col[4 * x + 2] / n + 0.5); }
    }
  }
}
/** tk.s7.regionMean: masked box means of R, G, B (window W/4) and the unmasked cover (0..255 = 0..100 %). */
export function regionMeanOf(raster, mask, W) {
  const { rgba, widthPx: X, heightPx: Y } = raster, N = X * Y, k = Math.max(1, Math.round(REGION.meanWindowW * W)) | 1;
  const rgb = new Uint8Array(3 * N), cover = new Uint8Array(N);
  maskedBoxMeans(rgba, mask, X, Y, k, rgb, cover);
  let covered = 0;
  for (let i = 0; i < N; i++) if (cover[i] >= 128) covered++;
  return { schema: REGION_MEAN_SCHEMA, widthPx: X, heightPx: Y, windowPx: k, hallwayWidthPx: W, rgb, cover,
    units: { rgb: 'mean R, G, B of the unmasked px in the window (0..255)', cover: 'unmasked share of the window, 0..255 = 0..100 %', windowPx: 'px (odd, round(W/4))' },
    emits: { rasterPx: N, windowPx: k, coveredPct: Math.round((1000 * covered) / N) / 10 } };
}

// ------------------------------------------------------------------ stations

/** One station's samples at p = [x, y] heading d = [dx, dy] (unit): inside / flank colours and their visibility. */
function stationAt(mean, x, y, dx, dy, W, out) {
  const nx = -dy, ny = dx;
  sideAt(mean, x, y, nx, ny, REGION.insideLatsW, 1, W, out, 0); sideAt(mean, x, y, nx, ny, REGION.flankLatsW, 1, W, out, 4); sideAt(mean, x, y, nx, ny, REGION.flankLatsW, -1, W, out, 8);
  return out;
}
/** One side's cover-weighted mean colour at lateral offsets lats (W units, sign sg) into out[o..o+2], its visibility into out[o+3]. */
function sideAt({ rgb, cover, widthPx: X, heightPx: Y }, x, y, nx, ny, lats, sg, W, out, o) {
  let r = 0, g = 0, b = 0, v = 0;
  for (let k = 0; k < lats.length; k++) {
    const l = lats[k], xi = Math.round(x + nx * sg * l * W), yi = Math.round(y + ny * sg * l * W);
    if (xi < 0 || yi < 0 || xi >= X || yi >= Y) continue;
    const i = yi * X + xi, c = cover[i] / 255;
    r += rgb[3 * i] * c; g += rgb[3 * i + 1] * c; b += rgb[3 * i + 2] * c; v += c;
  }
  out[o] = v > 0 ? r / v : 0; out[o + 1] = v > 0 ? g / v : 0; out[o + 2] = v > 0 ? b / v : 0; out[o + 3] = v / lats.length >= REGION.minCover ? 1 : 0;
}
/** under (the flanks' mean colour) of station samples s; -> visible (inside and >= 1 flank) */
function underOf(s, u) {
  const l = s[7], r = s[11], n = l + r;
  if (!n) return false;
  for (let c = 0; c < 3; c++) u[c] = (s[4 + c] * l + s[8 + c] * r) / n;
  return s[3] === 1;
}
/** The station features [log1p chi2 vs the overlay prediction, log1p chi2 vs no layer] under the overlay fit m. */
function featuresOf(s, u, m, f) {
  let chi = 0, nul = 0;
  for (let c = 0; c < 3; c++) { const e = (s[c] - (m.a[c] * u[c] + m.b[c])) / m.sigma[c], z = (s[c] - u[c]) / m.sigma[c]; chi += e * e; nul += z * z; }
  f[0] = Math.log1p(chi); f[1] = Math.log1p(nul);
  return f;
}
const sigmoid = (z) => 1 / (1 + Math.exp(-z));
/** P(hallway) of one station, or -1 when not visible. */
export function stationP(region, x, y, dx, dy, W, buf = { s: new Float64Array(12), u: new Float64Array(3), f: new Float64Array(2) }) {
  const { mean, model } = region;
  stationAt(mean, x, y, dx, dy, W, buf.s);
  if (!underOf(buf.s, buf.u)) return -1;
  featuresOf(buf.s, buf.u, model, buf.f);
  return sigmoid(model.bias + model.weights[0] * buf.f[0] + model.weights[1] * buf.f[1]);
}
/** Station centres along polyline V: [x, y, dx, dy] per station (skips as the edge sensor; none within endSkipPx of the end). */
export function stationsAlong(V, W, { endSkipPx = 0, firstSkipW = REGION.firstLegSkipW } = {}) {
  const out = [], step = REGION.stationStepW * W, E = V[V.length - 1];
  for (let i = 0; i + 1 < V.length; i++) {
    const a = V[i], b = V[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    if (L < 1e-6) continue;
    const ux = dx / L, uy = dy / L, t1 = L - REGION.jointSkipW * W;
    for (let t = (i === 0 ? firstSkipW : REGION.jointSkipW) * W; t < t1; t += step) {
      const x = a[0] + ux * t, y = a[1] + uy * t;
      if (endSkipPx > 0 && Math.hypot(x - E[0], y - E[1]) <= endSkipPx) continue;
      out.push([x, y, ux, uy, i]);
    }
  }
  return out;
}

/** The region reading of route V at width W on a region scene c ({ region, R1 }). detail: also every station [x, y, P] (P -1: not visible). */
export function regionRouteAt(c, V, W, { detail = false } = {}) {
  // the stations of stationsAlong (the same t sequence), read as they are generated
  const legs = V.length - 1, perLeg = Array.from({ length: legs }, () => ({ stations: 0, visible: 0, pass: 0 }));
  const step = REGION.stationStepW * W, endSkipPx = REGION.endSkipR1 * c.R1, E = V[V.length - 1];
  let sum = 0, vis = 0, pass = 0, n = 0;
  const buf = { s: new Float64Array(12), u: new Float64Array(3), f: new Float64Array(2) }, each = detail ? [] : null;
  for (let i = 0; i < legs; i++) {
    const a = V[i], b = V[i + 1], ddx = b[0] - a[0], ddy = b[1] - a[1], L = Math.hypot(ddx, ddy);
    if (L < 1e-6) continue;
    const dx = ddx / L, dy = ddy / L, t1 = L - REGION.jointSkipW * W;
    for (let t = (i === 0 ? REGION.firstLegSkipW : REGION.jointSkipW) * W; t < t1; t += step) {
      const x = a[0] + dx * t, y = a[1] + dy * t;
      if (endSkipPx > 0 && Math.hypot(x - E[0], y - E[1]) <= endSkipPx) continue;
      const p = stationP(c.region, x, y, dx, dy, W, buf);
      if (each) each.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10, p < 0 ? -1 : Math.round(p * 1000) / 1000]);
      n++; perLeg[i].stations++;
      if (p < 0) continue;
      vis++; perLeg[i].visible++; sum += 2 * p - 1;
      if (p >= REGION.pass) { pass++; perLeg[i].pass++; }
    }
  }
  return { supportMean: n ? sum / n : null, passFrac: vis ? pass / vis : 0, stations: vis * step, visibleStations: vis, stationsTotal: n, passCount: pass,
    legs: perLeg.map((l) => ({ ...l, stations: l.visible * step })), ...(each ? { each } : {}) };
}
/** ribbonContrastAt's answer on a region scene: [supportMean, visible px] or [null, 0] when no station is visible. */
export function regionSupportRead(c, V, W) {
  const r = regionRouteAt(c, V, W);
  return r.visibleStations ? [r.supportMean, r.stations] : [null, 0];
}
/** routeSensorAt's answer on a region scene: { passFrac, stations (visible px), passCount, legs }. */
export function regionSensorRead(c, V, W) {
  const r = regionRouteAt(c, V, W);
  return { passFrac: r.passFrac, stations: r.stations, passCount: r.passCount, legs: r.legs.map((l) => ({ stations: l.stations, visible: l.visible, pass: l.pass })) };
}

// ------------------------------------------------------------------ the per-image model

/** The guaranteed hallway centrelines: every tee cap -> badge, every S6-straight hole tee cap -> its on-axis basket. */
export function trainingSegments(S, start, verdicts, W, { holes = null } = {}) {
  const segs = [];
  for (const h of start.holes) {
    if (holes && !holes.has(String(h.hole))) continue;
    const n = Number(h.hole), B = S.badges?.[n], half = S.badgeHalf?.[n];
    if (B && half) {
      const t = Math.hypot(B[0] - h.S[0], B[1] - h.S[1]) - REGION.badgeSkipHalf * half;
      if (t > REGION.firstLegSkipW * W + REGION.stationStepW * W) segs.push({ hole: h.hole, kind: 'teeBadge', V: [h.S, [h.S[0] + h.u[0] * t, h.S[1] + h.u[1] * t]], endSkipPx: 0 });
    }
    if (verdicts?.[h.hole] !== 'straight') continue;
    let best = null;
    for (const p of S.bp) {
      const d = [p[0] - h.S[0], p[1] - h.S[1]], al = d[0] * h.u[0] + d[1] * h.u[1], lat = Math.abs(-d[0] * h.u[1] + d[1] * h.u[0]);
      if (al > 0 && lat <= REGION.straightOnAxisR1 * S.R1 && (!best || al < best[0])) best = [al, p];
    }
    if (best) segs.push({ hole: h.hole, kind: 'straight', V: [h.S, best[1]], endSkipPx: S.R1 });
  }
  return segs;
}
/** Station samples of the segments, at lateral shift (W units). -> [{ s (12), u (3), visible }] */
function samplesOf(mean, segs, W, shiftW) {
  const out = [];
  for (const g of segs) for (const [x, y, dx, dy] of stationsAlong(g.V, W, { endSkipPx: g.endSkipPx })) {
    const s = new Float64Array(12), u = new Float64Array(3);
    stationAt(mean, x - dy * shiftW * W, y + dx * shiftW * W, dx, dy, W, s);
    const visible = underOf(s, u);
    out.push({ s, u, visible });
  }
  return out;
}
const median = (xs) => { const s = Float64Array.from(xs).sort(), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };
/** inside = a * under + b per channel (least squares), sigma = 1.4826 MAD of the residual, R^2. */
function fitOverlay(pos) {
  const a = [], b = [], sigma = [], r2 = [];
  for (let c = 0; c < 3; c++) {
    let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const p of pos) { const x = p.u[c], y = p.s[c]; n++; sx += x; sy += y; sxx += x * x; sxy += x * y; }
    const den = n * sxx - sx * sx, ac = Math.abs(den) > 1e-9 ? (n * sxy - sx * sy) / den : 0, bc = (sy - ac * sx) / n;
    const res = pos.map((p) => p.s[c] - (ac * p.u[c] + bc)), m = median(res), mad = median(res.map((r) => Math.abs(r - m)));
    const my = sy / n, vy = pos.reduce((t, p) => t + (p.s[c] - my) ** 2, 0) / n, vr = res.reduce((t, r) => t + r * r, 0) / n;
    a.push(ac); b.push(bc); sigma.push(1.4826 * mad + 1e-6); r2.push(vy > 0 ? 1 - vr / vy : 0);
  }
  return { a, b, sigma, r2 };
}
/** Logistic regression on 2 features (Newton steps, class-balanced, L2 on the standardized weights). -> { weights, bias } in raw units */
function fitLogistic(X, y) {
  const n = X.length, d = 2, mu = [0, 0], sd = [0, 0];
  for (const x of X) for (let j = 0; j < d; j++) mu[j] += x[j] / n;
  for (const x of X) for (let j = 0; j < d; j++) sd[j] += (x[j] - mu[j]) ** 2 / n;
  for (let j = 0; j < d; j++) sd[j] = Math.sqrt(sd[j]) || 1;
  const n1 = y.reduce((s, v) => s + v, 0), w1 = 0.5 / (n1 / n), w0 = 0.5 / (1 - n1 / n);
  let w = [0, 0, 0];   // [w0, w1, bias] on standardized features
  for (let it = 0; it < REGION.newtonIters; it++) {
    const g = [0, 0, 0], Hm = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < n; i++) {
      const z = [(X[i][0] - mu[0]) / sd[0], (X[i][1] - mu[1]) / sd[1], 1], p = sigmoid(w[0] * z[0] + w[1] * z[1] + w[2]), wt = y[i] ? w1 : w0, e = wt * (p - y[i]), h = wt * p * (1 - p);
      for (let j = 0; j < 3; j++) { g[j] += (e * z[j]) / n; for (let k = 0; k < 3; k++) Hm[j][k] += (h * z[j] * z[k]) / n; }
    }
    for (let j = 0; j < 2; j++) { g[j] += REGION.l2 * w[j]; Hm[j][j] += REGION.l2; }
    const step = solve3(Hm, g);
    w = w.map((v, j) => v - step[j]);
    if (Math.max(...step.map(Math.abs)) < 1e-8) break;
  }
  return { weights: [w[0] / sd[0], w[1] / sd[1]], bias: w[2] - (w[0] * mu[0]) / sd[0] - (w[1] * mu[1]) / sd[1] };
}
function solve3(A, b) {
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c; for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const piv = Math.abs(M[c][c]) > 1e-12 ? M[c][c] : 1e-12;
    for (let r = 0; r < 3; r++) if (r !== c) { const f = M[r][c] / piv; for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k]; }
  }
  return [M[0][3] / (M[0][0] || 1e-12), M[1][3] / (M[1][1] || 1e-12), M[2][3] / (M[2][2] || 1e-12)];
}
/** Area under the ROC curve (ties counted half). */
function aucOf(pos, neg) {
  if (!pos.length || !neg.length) return null;
  const all = [...pos.map((v) => [v, 1]), ...neg.map((v) => [v, 0])].sort((x, y) => x[0] - y[0]);
  let sum = 0;
  for (let i = 0; i < all.length;) { let j = i; while (j < all.length && all[j][0] === all[i][0]) j++; const r = (i + j + 1) / 2; for (let k = i; k < j; k++) if (all[k][1]) sum += r; i = j; }
  return (sum - (pos.length * (pos.length + 1)) / 2) / (pos.length * neg.length);
}
const r3 = (v) => (v == null ? null : Math.round(v * 1000) / 1000);
const lumOf3 = (u) => (u[0] + u[1] + u[2]) / 3;
/** Fit on the segments: overlay, then the station logistic. -> { overlay, logistic, pos, neg } or { condition } */
function trainOn(mean, segs, W) {
  const pos = samplesOf(mean, segs, W, 0).filter((p) => p.visible);
  if (pos.length < REGION.minTrainStations) return { condition: `${pos.length} visible training stations (< ${REGION.minTrainStations}): no region model` };
  const neg = REGION.negShiftsW.flatMap((k) => [...samplesOf(mean, segs, W, k), ...samplesOf(mean, segs, W, -k)]).filter((p) => p.visible);
  const overlay = fitOverlay(pos), f = new Float64Array(2);
  const X = [...pos, ...neg].map((p) => Array.from(featuresOf(p.s, p.u, overlay, f))), y = [...pos.map(() => 1), ...neg.map(() => 0)];
  return { overlay, logistic: fitLogistic(X, y), pos, neg };
}
const pOf = (m, p) => { const f = featuresOf(p.s, p.u, m, new Float64Array(2)); return sigmoid(m.bias + m.weights[0] * f[0] + m.weights[1] * f[1]); };
/** The pass rates of positives (all, dark-under = the darkest quarter of under lum, the rest) and negatives under model m. */
function ratesOf(m, pos, neg) {
  const pp = pos.map((p) => pOf(m, p)), pn = neg.map((p) => pOf(m, p)), ul = pos.map((p) => lumOf3(p.u)), q = [...ul].sort((a, b) => a - b)[Math.floor(ul.length / 4)] ?? 0;
  const dark = pp.filter((_, i) => ul[i] < q), rest = pp.filter((_, i) => ul[i] >= q), rate = (xs) => (xs.length ? r3(xs.filter((v) => v >= REGION.pass).length / xs.length) : null);
  return { auc: r3(aucOf(pp, pn)), positivePass: rate(pp), darkUnderPass: rate(dark), restPass: rate(rest), negativePass: rate(pn), positives: pp.length, darkUnder: dark.length, negatives: pn.length, darkUnderLumBelow: r3(q) };
}
/** tk.s7.regionModel: the per-image overlay fit and station logistic, trained on the guaranteed hallway; held-out on odd holes. */
export function regionModelOf(mean, S, start, verdicts, W) {
  const base = { schema: REGION_MODEL_SCHEMA, widthPx: W, features: FEATURES, units: REGION_UNITS };
  if (!(W > 0)) return { ...base, condition: 'no hallway width: no region model', emits: { trainStations: 0 } };
  const segs = trainingSegments(S, start, verdicts, W), t = trainOn(mean, segs, W);
  if (t.condition) return { ...base, condition: t.condition, segments: segs.length, emits: { trainStations: 0 } };
  const m = { a: t.overlay.a, b: t.overlay.b, sigma: t.overlay.sigma, weights: t.logistic.weights, bias: t.logistic.bias };
  // held out: the model of the even holes on the odd holes' stations (no hole in both)
  const even = new Set(start.holes.filter((h) => Number(h.hole) % 2 === 0).map((h) => String(h.hole))), odd = new Set(start.holes.filter((h) => Number(h.hole) % 2 === 1).map((h) => String(h.hole)));
  const tE = trainOn(mean, trainingSegments(S, start, verdicts, W, { holes: even }), W), tO = trainOn(mean, trainingSegments(S, start, verdicts, W, { holes: odd }), W);
  const heldOut = tE.condition || tO.condition ? { condition: tE.condition ?? tO.condition }
    : { rule: 'trained on the even holes\' segments, read on the odd holes\'', ...ratesOf({ ...tE.overlay, ...tE.logistic }, tO.pos, tO.neg) };
  const training = ratesOf(m, t.pos, t.neg), uStar = m.a.map((a, c) => r3(m.b[c] / (1 - a)));
  return { ...base, condition: null,
    overlay: { a: m.a.map(r3), b: m.b.map(r3), sigma: m.sigma.map(r3), r2: t.overlay.r2.map(r3), invisibleOnRgb: uStar,
      rule: 'per channel: station inside mean = a x under + b (least squares on the positive stations); under = mean of the visible flanks; sigma = 1.4826 MAD of the residual; invisibleOnRgb = b / (1 - a), the ground the layer leaves no trace on' },
    logistic: { weights: m.weights.map((v) => Math.round(v * 1e6) / 1e6), bias: Math.round(m.bias * 1e6) / 1e6, rule: 'P(hallway) = sigmoid(bias + w . features); class-balanced, L2 1e-3 on standardized weights, Newton steps' },
    a: m.a, b: m.b, sigma: m.sigma, weights: m.weights, bias: m.bias,
    training: { segments: segs.length, teeBadge: segs.filter((g) => g.kind === 'teeBadge').length, straight: segs.filter((g) => g.kind === 'straight').length, s6Verdicts: verdicts ? 'tk.s7.straight' : 'none on this store: tee -> badge segments only', ...training },
    heldOut,
    emits: { trainStations: t.pos.length, negativeStations: t.neg.length, segments: segs.length, trainAuc: training.auc ?? 0, heldOutAuc: heldOut.auc ?? 0, darkUnderPass: training.darkUnderPass ?? 0 } };
}

/** tk.s7.regionHeat: the station P on a W/4 grid, best of REGION.heatHeadings headings (Uint8 0..255; 0 also = not visible). */
export function regionHeatOf(scene, model, W) {
  if (!scene.region) return { schema: REGION_HEAT_SCHEMA, condition: scene.regionCondition ?? 'no region model', emits: { cells: 0 } };
  const cell = REGION.stationStepW * W, gw = Math.ceil(scene.W / cell), gh = Math.ceil(scene.H / cell), P = new Uint8Array(gw * gh);
  const heads = Array.from({ length: REGION.heatHeadings }, (_, k) => [Math.cos((k * Math.PI) / REGION.heatHeadings), Math.sin((k * Math.PI) / REGION.heatHeadings)]);
  const buf = { s: new Float64Array(12), u: new Float64Array(3), f: new Float64Array(2) };
  let hot = 0;
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    let best = 0;
    for (const [dx, dy] of heads) { const p = stationP(scene.region, (i + 0.5) * cell, (j + 0.5) * cell, dx, dy, W, buf); if (p > best) best = p; }
    P[j * gw + i] = Math.round(best * 255); if (best >= REGION.pass) hot++;
  }
  return { schema: REGION_HEAT_SCHEMA, condition: null, widthPx: scene.W, heightPx: scene.H, cellPx: cell, gridW: gw, gridH: gh, P,
    model: { overlay: model.overlay, training: model.training, heldOut: model.heldOut }, segments: model.segments ?? null,
    units: { P: 'P(hallway) x 255, best of 8 headings; 0 = not visible or not hallway', cellPx: 'px (W/4)' }, emits: { cells: gw * gh, hotCellsPct: Math.round((1000 * hot) / (gw * gh)) / 10 } };
}

// ------------------------------------------------------------------ the store

const CODE = Object.freeze({
  mean: sha256Hex([regionMeanOf, maskedBoxMeans].map(String).join('\n')),
  model: sha256Hex([regionModelOf, trainingSegments, samplesOf, stationsAlong, stationAt, sideAt, underOf, featuresOf, fitOverlay, fitLogistic, solve3, trainOn, ratesOf, aucOf].map(String).join('\n') + JSON.stringify(REGION)),
  heat: sha256Hex([regionHeatOf, stationP].map(String).join('\n'))
});
/** The code of a region route read (a region row's cache key carries it). */
export const REGION_READ_CODE = sha256Hex([regionRouteAt, regionSupportRead, regionSensorRead, stationP, stationAt, sideAt, underOf, featuresOf].map(String).join('\n') + JSON.stringify(REGION));
/**
 * The region Calculations and fn.q.route.region on a store with the S7 scene, the route starts and the hallway width. The
 * S6 straight verdicts (tk.s7.straight) are an inPart when the store has them; without them the model trains on the tee
 * -> badge segments alone (recorded in the model's training row).
 */
export function registerRegion(store) {
  if (store.registered('fn.tk.s7.regionMean')) return;
  for (const [fn, spec] of ROUTE_CALCULATIONS) if (!store.registered(fn) && !store.has(spec.outParts[0])) store.register(fn, spec);   // the starts and W
  const withStraight = store.has(STRAIGHT);
  store.register('fn.tk.s7.regionMean', { inParts: ['px.image.cropped', SCENE, HALLWAY], outParts: [REGION_MEAN_PART], code: CODE.mean,
    note: 'masked box means of R, G, B over W/4 and the unmasked cover: the region sensor\'s O(1) reads (Uint8 planes)',
    calculate: (io) => ({ [REGION_MEAN_PART]: regionMeanOf(io.in('px.image.cropped'), io.in(SCENE).mask, io.in(HALLWAY).widthPx) }) });
  store.register('fn.tk.s7.regionModel', { inParts: [REGION_MEAN_PART, SCENE, START, HALLWAY, ...(withStraight ? [STRAIGHT] : [])], outParts: [REGION_MODEL_PART], code: CODE.model,
    note: 'per image: the hallway overlay fit (inside = a x under + b) and the station logistic, trained on tee -> badge and S6-straight segments',
    calculate: (io) => ({ [REGION_MODEL_PART]: regionModelOf(io.in(REGION_MEAN_PART), io.in(SCENE), io.in(START), withStraight ? io.in(STRAIGHT).verdicts : null, io.in(HALLWAY).widthPx) }) });
  store.register('fn.tk.s7.sceneRegion', { inParts: [SCENE, REGION_MEAN_PART, REGION_MODEL_PART], outParts: [REGION_SCENE_PART],
    note: 'the S4 scene whose route measures read the hallway REGION (routeSpace.mjs dispatches on scene.region)',
    calculate: (io) => {
      const S = io.in(SCENE), m = io.in(REGION_MODEL_PART);
      return { [REGION_SCENE_PART]: m.condition ? { ...S, region: null, regionCondition: `${m.condition}: the route measures read edges`, emits: { ...S.emits, region: 0 } }
        : { ...S, region: { mean: io.in(REGION_MEAN_PART), model: { a: m.a, b: m.b, sigma: m.sigma, weights: m.weights, bias: m.bias } }, regionCondition: null, emits: { ...S.emits, region: 1 } } };
    } });
  store.register('fn.tk.s7.regionHeat', { inParts: [REGION_SCENE_PART, REGION_MODEL_PART, HALLWAY, START, ...(withStraight ? [STRAIGHT] : [])], outParts: [REGION_HEAT_PART], code: CODE.heat,
    note: 'the station P on a W/4 grid, best of 8 headings: the region model\'s render (produced only when asked)',
    calculate: (io) => {
      const m = io.in(REGION_MODEL_PART), W = io.in(HALLWAY).widthPx, S = io.in(REGION_SCENE_PART);
      const segs = S.region ? trainingSegments(S, io.in(START), withStraight ? io.in(STRAIGHT).verdicts : null, W).map((g) => ({ kind: g.kind, hole: g.hole, V: g.V })) : null;
      return { [REGION_HEAT_PART]: { ...regionHeatOf(S, m, W), segments: segs } };
    } });
  if (!store.registered('fn.q.route.region')) store.register('fn.q.route.region', { inParts: [REGION_SCENE_PART], note: 'the region reading of one route (ports/s7route/regionSpace.mjs)',
    calculate: (io) => {
      const S = io.in(REGION_SCENE_PART), { verts, widthPx } = io.args ?? {};
      if (!S.region) return { value: { condition: S.regionCondition }, unit: 'condition' };
      if (!(widthPx > 0) || !Array.isArray(verts) || verts.length < 2) return { value: { condition: 'fn.q.route.region: a route needs >= 2 vertices and a hallway width' }, unit: 'condition' };
      const r = regionRouteAt(S, verts, widthPx, { detail: Boolean(io.args.detail) });
      return { value: r, unit: `each: [x px, y px, P (-1 = not visible)] per station (detail: true); supportMean: ${REGION_UNITS.supportMean}; passFrac: ${REGION_UNITS.passFrac}; stations: ${REGION_UNITS.stations}`, emits: { stations: r.stationsTotal } };
    } });
}
