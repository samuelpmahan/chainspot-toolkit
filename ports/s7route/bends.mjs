/**
 * S7 BEND PLACEMENT (Sam, 2026-10-19: "perfection = bend points on the centreline"; "refine bends using the hallway sensor").
 * Graduates docs/evidence/s7after/e09 (after-s4-e09/e09.py, the e09b configuration: rules 1 + 2, rule 3 dropped).
 *
 * The matching rule (match.mjs) decides WHICH basket and how MANY bends; this step puts each bend where the ribbon's heading
 * changes:
 *   1. centre samples: along the current route, a window of length windowW x W every stepW x W on the leg; track.profile +
 *      edge_pair at the hallway width (tolerance edgeTolW x W, centre within edgeLatW x W) give the ribbon centre's lateral
 *      offset -> a 2D centre point. A sample inside any BasketPoint's C2 disc (2 R1: the ring fills step too) or within
 *      (badge half-diagonal + badgeExclusionW x W) of a badge centre (the badge's mute breaks the edges) is dropped.
 *   2. fit: a piecewise-linear route with the tee cap start and the BasketPoint fixed; K = 0..maxBends bends, each from a DP
 *      segmentation of the ordered samples and from the current bends, refined by bounded least squares on the clipped
 *      point-to-route distance (clip clipW x W, bends within boundW x W of where they started, a weak pull back to it). K is
 *      chosen BIC-style on independent windows: cost = sum(min(d, clip)^2) / sigma^2 x step/window + 2 |K - K0| ln(n_eff);
 *      a change of the bend count must earn its evidence. Two passes (resample along the new route).
 *   3. gates: RULE 1, a hole S6 reads STRAIGHT keeps the route the matching rule chose (S6's accepted fn.Hole.straight verdict,
 *      not the S3 3-point test, which is wrong on heritage 1 and 9). RULE 2, a changed bend count is taken only if the hallway
 *      sensor gains > gain and reads >= tau on >= minStations visible stations; an unchanged count only if the sensor reads
 *      no worse than the matching rule's route (dropMax) on >= minStations stations.
 *
 * Pure functions on the S7 scene ({ lum, mask, W, H, bp, badges, badgeHalf, R1 }); no thresholds hide anywhere else. Every
 * length that is map-scaled is a fraction of W (LOCAL) or of R1 (LOCAL).
 */
import { routeSensorAt, ROUTE } from './routeSpace.mjs';
import { profile, edgePair, arange } from '../s7trace/hallway.mjs';

export const BENDS = Object.freeze({
  windowW: 1.0,              // W: length of the window one centre sample is read over
  stepW: 0.125,              // W: spacing of the samples along a leg
  minWindowW: 0.5,           // W: a window shorter than this at a leg's end gives no sample
  edgeTolW: 0.15,            // W: the edge pair's width may differ from W by this much
  edgeLatW: 0.45,            // W: the edge pair's centre may lie this far off the route
  c2R1: 2.0,                 // R1: samples inside a BasketPoint's C2 disc are dropped
  badgeExclusionW: 0.5,      // W: plus the badge half-diagonal: samples this near a badge centre are dropped
  maxBends: 3,               // K = 0 .. maxBends are tried
  minRunSamples: 3,          // samples: a fitted straight run needs at least this many
  minSamples: 4,             // samples: fewer than this and the route is left alone
  passes: 2,                 // refit passes (resample along the new route)
  sigmaW: 1 / 16,            // W: one sample's noise (BIC)
  clipW: 0.25,               // W: the point-to-route distance is clipped here (robust loss)
  boundW: 1.5,               // W: a bend stays within this of where it started
  gate: Object.freeze({ gain: 0.05, tau: 0.75, dropMax: 0.02, minStations: ROUTE.minStations })
});

// ------------------------------------------------------------------ geometry

const segDist = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = Math.max(dx * dx + dy * dy, 1e-9);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
};
const polyDist = (p, V) => { let d = Infinity; for (let i = 0; i + 1 < V.length; i++) d = Math.min(d, segDist(p, V[i], V[i + 1])); return d; };
const costOf = (P, V, clip) => { let s = 0; for (const p of P) { const d = Math.min(polyDist(p, V), clip); s += d * d; } return s; };
/** Total least squares line through the points: [centroid, unit direction]. */
function lineFit(Q) {
  let mx = 0, my = 0; for (const q of Q) { mx += q[0]; my += q[1]; } mx /= Q.length; my /= Q.length;
  let sxx = 0, sxy = 0, syy = 0; for (const q of Q) { const x = q[0] - mx, y = q[1] - my; sxx += x * x; sxy += x * y; syy += y * y; }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return [[mx, my], [Math.cos(th), Math.sin(th)]];
}

// ------------------------------------------------------------------ 1. the centre samples

/**
 * The ribbon-centre points along the route V (verts), and (with legs = []) each one's { leg, t0, t1 }.
 * track.profile + edge_pair in windows of windowW x W every stepW x W on each leg.
 */
export function centreSamples(S, V, W, legs = null) {
  const R = BENDS, pts = [];
  for (let li = 0; li + 1 < V.length; li++) {
    const a = V[li], b = V[li + 1], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    if (!(L > 0)) continue;
    const u = [dx / L, dy / L], n = [-u[1], u[0]], phi = Math.atan2(dy, dx);
    for (const t of arange(R.stepW * W / 2, L, R.stepW * W)) {
      const t0 = Math.max(t - R.windowW * W / 2, 0), t1 = Math.min(t + R.windowW * W / 2, L);
      if (t1 - t0 < R.minWindowW * W) continue;
      const e = edgePair(profile(S, a, phi, t0, t1), W, R.edgeTolW * W, R.edgeLatW * W);
      if (!e) continue;
      const q = [a[0] + u[0] * (t0 + t1) / 2 + n[0] * e.c, a[1] + u[1] * (t0 + t1) / 2 + n[1] * e.c];
      let nearBadge = false;
      for (const k of Object.keys(S.badges)) if (Math.hypot(q[0] - S.badges[k][0], q[1] - S.badges[k][1]) <= S.badgeHalf[k] + R.badgeExclusionW * W) { nearBadge = true; break; }
      if (nearBadge) continue;
      let nearC2 = false;
      for (const p of S.bp) if (Math.hypot(q[0] - p[0], q[1] - p[1]) <= R.c2R1 * S.R1) { nearC2 = true; break; }
      if (nearC2) continue;
      pts.push(q); if (legs) legs.push({ leg: li, t0, t1 });
    }
  }
  return pts;
}

// ------------------------------------------------------------------ 2. the fit

/** DP segmentation of the ordered samples into K + 1 straight runs (clipped TLS line SSE); the bends are the runs' line intersections. */
export function initBends(P, K, W) {
  const R = BENDS, n = P.length, INF = 1e18, clip = R.clipW * W;
  const sse = Array.from({ length: n }, () => new Float64Array(n).fill(INF));
  for (let i = 0; i < n; i++) for (let j = i + R.minRunSamples; j <= n; j++) {
    const Q = P.slice(i, j), [m, v] = lineFit(Q); let s = 0;
    for (const q of Q) { const r = Math.min(Math.abs((q[0] - m[0]) * -v[1] + (q[1] - m[1]) * v[0]), clip); s += r * r; }
    sse[i][j - 1] = s;
  }
  const best = Array.from({ length: K + 2 }, () => new Float64Array(n + 1).fill(INF)), arg = Array.from({ length: K + 2 }, () => new Int32Array(n + 1));
  best[0][0] = 0;
  for (let k = 1; k <= K + 1; k++) for (let j = 2; j <= n; j++) for (let i = 0; i < j - 1; i++) {
    if (best[k - 1][i] < INF && best[k - 1][i] + sse[i][j - 1] < best[k][j]) { best[k][j] = best[k - 1][i] + sse[i][j - 1]; arg[k][j] = i; }
  }
  if (!(best[K + 1][n] < INF)) return null;
  const cuts = []; let j = n;
  for (let k = K + 1; k >= 1; k--) { const i = arg[k][j]; cuts.push([i, j]); j = i; }
  cuts.reverse();
  const lines = cuts.map(([i, jj]) => lineFit(P.slice(i, jj))), B = [];
  for (let c = 0; c + 1 < lines.length; c++) {
    const [p, r] = lines[c], [q, s] = lines[c + 1], cut = cuts[c + 1][0];
    const mid = [(P[cut - 1][0] + P[cut][0]) / 2, (P[cut - 1][1] + P[cut][1]) / 2], den = r[0] * s[1] - r[1] * s[0];
    let x = mid;
    if (Math.abs(den) > 1e-6) { const tt = ((q[0] - p[0]) * s[1] - (q[1] - p[1]) * s[0]) / den; x = [p[0] + r[0] * tt, p[1] + r[1] * tt]; }
    B.push(Math.hypot(x[0] - mid[0], x[1] - mid[1]) <= W ? x : mid);   // near-parallel runs: the run boundary, not a far intersection
  }
  return B;
}

/** Bounded Levenberg-Marquardt (finite-difference Jacobian, steps clamped to the box): scipy least_squares(loss linear, x_scale W) in the small. */
export function boundedLeastSquares(f, x0, lo, hi, { iters = 80, h = 0.05 } = {}) {
  const m = x0.length, clamp = (x) => x.map((v, i) => Math.min(hi[i], Math.max(lo[i], v)));
  let x = clamp(x0), r = f(x), c = r.reduce((s, v) => s + v * v, 0), lam = 1e-2;
  for (let it = 0; it < iters; it++) {
    const J = Array.from({ length: r.length }, () => new Float64Array(m));
    for (let j = 0; j < m; j++) { const xp = x.slice(); xp[j] = Math.min(hi[j], x[j] + h); const step = xp[j] - x[j] || -h, rp = f(step === -h ? Object.assign(x.slice(), { [j]: x[j] - h }) : xp); for (let i = 0; i < r.length; i++) J[i][j] = (rp[i] - r[i]) / step; }
    const A = Array.from({ length: m }, () => new Float64Array(m)), g = new Float64Array(m);
    for (let i = 0; i < r.length; i++) for (let a = 0; a < m; a++) { g[a] += J[i][a] * r[i]; for (let b = 0; b < m; b++) A[a][b] += J[i][a] * J[i][b]; }
    let improved = false;
    for (let tries = 0; tries < 8 && !improved; tries++) {
      const M = A.map((row, a) => Float64Array.from(row, (v, b) => v + (a === b ? lam * (A[a][a] + 1e-9) : 0))), d = solve(M, Array.from(g, (v) => -v));
      if (!d) { lam *= 4; continue; }
      const xn = clamp(x.map((v, i) => v + d[i])), rn = f(xn), cn = rn.reduce((s, v) => s + v * v, 0);
      if (cn < c) { const move = Math.max(...xn.map((v, i) => Math.abs(v - x[i]))); x = xn; r = rn; c = cn; lam = Math.max(lam / 3, 1e-9); improved = true; if (move < 1e-3) return x; }
      else lam *= 4;
    }
    if (!improved) break;
  }
  return x;
}
function solve(M, b) {   // Gaussian elimination with partial pivoting; null when singular
  const n = b.length, A = M.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-14) return null;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = c + 1; r < n; r++) { const k = A[r][c] / A[c][c]; for (let q = c; q <= n; q++) A[r][q] -= k * A[c][q]; }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = A[r][n]; for (let q = r + 1; q < n; q++) s -= A[r][q] * x[q]; x[r] = s / A[r][r]; }
  return x;
}

/** The fit over K = 0..maxBends from samples P; V0 = the current route (its bends seed K = its count), K0 = the matching rule's count. */
export function fitBends(P, S0, E, V0, K0, W) {
  const R = BENDS, clip = R.clipW * W, sigma = R.sigmaW * W, cands = [], neff = Math.max(P.length * R.stepW / R.windowW, 2);
  for (let K = 0; K <= R.maxBends; K++) {
    const inits = [];
    if (K === V0.length - 2) inits.push(V0.slice(1, -1).map((v) => v.slice()));
    if (K && P.length >= R.minRunSamples * (K + 1)) { const b = initBends(P, K, W); if (b) inits.push(b); }
    if (K === 0) inits.push([]);
    for (const B0 of inits) {
      let V;
      if (K === 0) V = [S0, E];
      else {
        const x0 = B0.flat(), lo = x0.map((v) => v - R.boundW * W), hi = x0.map((v) => v + R.boundW * W);
        const f = (x) => {
          const Vt = [S0]; for (let k = 0; k < K; k++) Vt.push([x[2 * k], x[2 * k + 1]]); Vt.push(E);
          const out = P.map((p) => Math.min(polyDist(p, Vt), clip));
          for (let i = 0; i < x.length; i++) out.push((x[i] - x0[i]) * R.sigmaW);   // 1 W of travel = one sigma-sample
          return out;
        };
        const x = boundedLeastSquares(f, x0, lo, hi, {}); V = [S0]; for (let k = 0; k < K; k++) V.push([x[2 * k], x[2 * k + 1]]); V.push(E);
      }
      cands.push([costOf(P, V, clip) / (sigma * sigma) * R.stepW / R.windowW + 2 * Math.abs(K - K0) * Math.log(neff), K, V]);
    }
  }
  return cands.reduce((a, b) => (b[0] < a[0] || (b[0] === a[0] && b[1] < a[1]) ? b : a));
}

// ------------------------------------------------------------------ 3. the step

/**
 * Refine the bends of one hole's route V (verts: tee cap start, bends, BasketPoint).
 * straight: true when S6 reads the hole STRAIGHT (rule 1: the route is kept). -> { verts, taken, why, ... }
 */
export function refineBendsOf(S, V, W, { straight = false } = {}) {
  const R = BENDS, K0 = V.length - 2, S0 = V[0], E = V.at(-1);
  if (straight) return { verts: V, taken: false, why: 'S6 reads the hole straight: the matching rule\'s route is kept', K0, K1: K0 };
  let Vc = V, P = [];
  for (let pass = 0; pass < R.passes; pass++) {
    P = centreSamples(S, Vc, W);
    if (P.length < R.minSamples) break;
    Vc = fitBends(P, S0, E, Vc, K0, W)[2];
  }
  const K1 = Vc.length - 2, a = routeSensorAt(S, V, W), b = routeSensorAt(S, Vc, W), G = R.gate;
  let taken, why;
  if (Vc === V) { taken = false; why = `fewer than ${R.minSamples} centre samples (${P.length})`; }
  else if (K1 !== K0) {
    taken = b.passFrac - a.passFrac > G.gain && b.passFrac >= G.tau && b.stations >= G.minStations;
    why = `bend count ${K0} -> ${K1}: sensor ${a.passFrac.toFixed(2)} -> ${b.passFrac.toFixed(2)} on ${b.stations} st (needs gain > ${G.gain}, reading >= ${G.tau}, >= ${G.minStations} st)`;
  } else {
    taken = b.stations >= G.minStations && b.passFrac >= a.passFrac - G.dropMax;
    why = `${K1} bends refitted: sensor ${a.passFrac.toFixed(2)} -> ${b.passFrac.toFixed(2)} on ${b.stations} st (needs no worse than ${G.dropMax}, >= ${G.minStations} st)`;
  }
  return { verts: taken ? Vc : V, taken, why, K0, K1, samples: P.length, sensorOld: a.passFrac, sensorNew: b.passFrac, stationsNew: b.stations, refit: taken ? null : Vc };
}
