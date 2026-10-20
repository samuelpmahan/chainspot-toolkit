/**
 * The hallway (path ribbon) math, graduated from docs/evidence/s7main (s3first.py and the modules it imports: course.py,
 * track.py, contrast.py, follow.py, polyscore.py, badgeseed.py, teebadge.py). Browser-safe, written once, invoked from
 * outside only as store queries (ports/s7trace/traceSpace.mjs: fn.q.path.*, fn.q.trace.*).
 *
 * The model (s7edge/README.md, s7main/README.md): the hole path is a ribbon of course-local width W (LOCAL, learned on
 * the TEE -> BADGE segments, which are always straight because the badge precedes the first bend). A ribbon edge is a
 * step in luminance; a station along a fixed centreline passes when the inside band is brighter than the outside band
 * by more than TAU on both sides. A leg runs until its edge-contrast run ends; there it either ends on a BasketPoint on
 * the leg, closes on a BasketPoint by one last leg, or bends where the next leg's run is best. Opaque sprites (S1
 * badges, S2 baskets, S3 tees, with a 2 px fringe) and the C1/C2 ring strokes are masked: a masked station is neutral.
 *
 * The port is line by line: the same sampling (bilinear, edges replicated: scipy map_coordinates order 1, mode
 * 'nearest'), the same grids (numpy arange), the same tie rules (strict improvement keeps the first), so the output is
 * the recorded s3first-<course>.json within 1 px (ports/s7trace/README.md, the identity table).
 *
 * Coordinates: canonical (S0-cropped) px, pixel centres at integer coordinates; angles in radians unless named Deg.
 */

import { samp as sampS6, profileAt, edgePairOf, edgeGradientOf, edgePairFrom, stationContrastAt, reachFor } from '../s6straight/pathSpace.mjs';
import { widthSearchRange } from '../s6straight/pathLoss.mjs';

export const TAU = 8.0;                       // lum: edge contrast a ribbon station must exceed on both sides (follow.py)
export const FRONT = 10.6 / 25.02;            // pad lengths: the ribbon cap centre ahead of the pad centre (badgeseed.py)
export const OFFS = arange(-30, 30.01, 0.25); // px: lateral offsets of an along-path profile (track.py)

// ------------------------------------------------------------------------------------------------ numpy-equivalents

/** numpy.arange for floats: start + i * step, i < ceil((stop - start) / step). */
export function arange(start, stop, step) {
  const n = Math.max(0, Math.ceil((stop - start) / step)), out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = start + i * step;
  return out;
}
const pyMod = (a, n) => a - n * Math.floor(a / n);   // Python's % (floored)
const deg = (r) => r * 180 / Math.PI, rad = (d) => d * Math.PI / 180;
export const unit = (phi) => [Math.cos(phi), Math.sin(phi)];
const median = (xs) => { const s = Float64Array.from(xs).sort(); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
const mean = (xs) => { let s = 0; for (const v of xs) s += v; return xs.length ? s / xs.length : NaN; };
const hyp = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** Python round(x, n) for display fields (ties are measure-zero for continuous values). */
export const round = (x, n = 2) => (x == null || !Number.isFinite(x) ? x : Math.round(x * 10 ** n) / 10 ** n);

// ------------------------------------------------------------------------------------------------ the S6 primitives (fn.q.path.*)
// profile, edge pair and station contrast are written once, in ports/s6straight/pathSpace.mjs (track.py, contrast.py,
// proved number for number there); the follower calls them on its scene ({ lum, mask, W, H } is their context).

/** Bilinear sample with edges replicated (scipy map_coordinates order=1, mode='nearest'). */
export const samp = sampS6;
/** track.py profile -> { prof, ok, nT } or null when there is no station. */
export function profile(S, O, phi, t0, t1, lat0 = 0, step = 1.0, reach = 30) { const P = profileAt(S, O, phi, t0, t1, { lat0, step, reach }); return P.prof ? P : null; }
/** The hallway width search in rC1 only: S6's rule (ports/s6straight/pathLoss.mjs widthSearchRange), one rule for both stages. */
export const widthSearchOf = (S) => widthSearchRange(S?.R1);
/** track.py edge_pair -> { l, r, c, w, score, gl, gr } or null. */
export function edgePair(P, Wexp, tolW = 3.0, latLim = 12.0) {
  const e = P ? edgePairOf(P, Wexp, { tolW, latLim }) : null;
  return e && { l: e.lPx, r: e.rPx, c: e.cPx, w: e.wPx, score: e.score, gl: e.gl, gr: e.gr };
}
/** edgePair on a gradient computed once (edgeGradientOf): a width search pairs one profile at every width. */
const edgePairG = (G, Wexp, tolW, latLim) => { const e = edgePairFrom(G, Wexp, { tolW, latLim }); return e && { l: e.lPx, r: e.rPx, c: e.cPx, w: e.wPx, score: e.score, gl: e.gl, gr: e.gr }; };
/** contrast.py station_contrast -> { cl, cr, okl, okr } per station. */
export const stationContrast = (S, O, phi, ts, W) => stationContrastAt(S, O, phi, ts, W);

// ------------------------------------------------------------------------------------------------ the scene (course.py)

/** Binary 4-connected dilation, iterations times (scipy binary_dilation default structure, border 0). */
export function dilate4(m, W, H, iterations = 1) {
  let cur = m;
  for (let it = 0; it < iterations; it++) {
    const out = Uint8Array.from(cur);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (cur[i]) continue;
      if ((x > 0 && cur[i - 1]) || (x < W - 1 && cur[i + 1]) || (y > 0 && cur[i - W]) || (y < H - 1 && cur[i + W])) out[i] = 1;
    }
    cur = out;
  }
  return cur;
}
/** binary_fill_holes (4-connected background reachable from the border stays background). */
export function fillHoles(m, W, H) {
  const out = new Uint8Array(W * H).fill(1), stack = [];
  const seed = (i) => { if (!m[i] && out[i]) { out[i] = 0; stack.push(i); } };
  for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { seed(y * W); seed(y * W + W - 1); }
  while (stack.length) {
    const i = stack.pop(), x = i % W, y = (i - x) / W;
    if (x > 0) seed(i - 1); if (x < W - 1) seed(i + 1); if (y > 0) seed(i - W); if (y < H - 1) seed(i + W);
  }
  return out;
}

/** Luminance plane: the mean of R, G, B (float64), per canonical pixel. */
export function lumPlane({ rgba, widthPx: W, heightPx: H }) {
  const lum = new Float64Array(W * H);
  for (let i = 0; i < W * H; i++) lum[i] = (rgba[i * 4] + rgba[i * 4 + 1] + rgba[i * 4 + 2]) / 3;
  return lum;
}

/** Opaque sprites: owned px of every S1 badge, S2 basket and S3 tee; filled; dilated by 2 (sprite) and 1 (occluder). */
export function spriteMasks(W, H, ownedLists) {
  const spr = new Uint8Array(W * H);
  for (const px of ownedLists) for (const i of px) spr[i] = 1;
  const filled = fillHoles(spr, W, H);
  return { filled, sprite: dilate4(filled, W, H, 2), occluder: dilate4(filled, W, H, 1) };
}

/** 1-D uniform filter, size n (odd), mode 'reflect' (d c b a | a b c d | d c b a). */
function uniformFilter1d(a, n) {
  const h = (n - 1) / 2, N = a.length, out = new Float64Array(N);
  const at = (i) => { while (i < 0 || i >= N) i = i < 0 ? -i - 1 : 2 * N - i - 1; return a[i]; };
  for (let i = 0; i < N; i++) { let s = 0; for (let k = -h; k <= h; k++) s += at(i + k); out[i] = s / n; }
  return out;
}

/**
 * R1 (C1 radius, px, LOCAL): the mean radial luminance profile around every BasketPoint (sprites masked); C1 is the
 * stronger ring and C2 = 2 x C1, so R1 maximises the high-passed profile at r and 2r (course.py _r1).
 */
export function ringRadius(lum, sprite, W, H, bp) {
  const th = arange(0, 360, 1.0).map(rad), rs = arange(10, 260, 0.5), cos = th.map(Math.cos), sin = th.map(Math.sin);
  const prof = new Float64Array(rs.length);
  for (let ri = 0; ri < rs.length; ri++) {
    const r = rs[ri], v = [];
    for (const [bx, by] of bp) {
      let s = 0, n = 0;
      for (let k = 0; k < th.length; k++) {
        const X = bx + r * cos[k], Y = by + r * sin[k];
        if (samp(sprite, W, H, X, Y) < 0.01 && X > 1 && X < W - 2 && Y > 1 && Y < H - 2) { s += samp(lum, W, H, X, Y); n++; }
      }
      if (n > 20) v.push(s / n);
    }
    prof[ri] = v.length ? mean(v) : NaN;
  }
  const lo = uniformFilter1d(prof, 15), hp = prof.map((p, i) => p - lo[i]);
  let best = null;
  for (let i = 0; i < rs.length; i++) {
    const r = rs[i];
    let j = 0, dj = Infinity; for (let q = 0; q < rs.length; q++) { const d = Math.abs(rs[q] - 2 * r); if (d < dj) { dj = d; j = q; } }
    if (2 * r > rs[rs.length - 1]) break;
    const sc = hp[i] + hp[j];
    if (best === null || sc > best[0]) best = [sc, r];
  }
  return best[1];
}

/** The C1 / C2 ring strokes around every BasketPoint: |d - R1| <= 3.5 px or |d - 2 R1| <= 4.5 px. */
export function ringMask(W, H, bp, R1) {
  const ring = new Uint8Array(W * H);
  for (const [bx, by] of bp) {
    const x0 = Math.trunc(Math.max(bx - 2 * R1 - 8, 0)), x1 = Math.trunc(Math.min(bx + 2 * R1 + 9, W));
    const y0 = Math.trunc(Math.max(by - 2 * R1 - 8, 0)), y1 = Math.trunc(Math.min(by + 2 * R1 + 9, H));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const d = Math.hypot(x - bx, y - by);
      if (Math.abs(d - R1) <= 3.5 || Math.abs(d - 2 * R1) <= 4.5) ring[y * W + x] = 1;
    }
  }
  return ring;
}

// ------------------------------------------------------------------------------------------------ profiles (track.py)

/** The best edge pair over headings phi0 +- span deg (track.py fit_free). */
export function fitFree(S, O, phi0, t0, t1, Wexp, { span = 3.0, dstep = 0.25, tolW = 3.0, latLim = 12.0 } = {}) {
  let best = null;
  for (const d of arange(-span, span + 1e-9, dstep)) {
    const phi = phi0 + rad(d), e = edgePair(profile(S, O, phi, t0, t1), Wexp, tolW, latLim);
    if (e && (best === null || e.score > best.score)) best = { ...e, phi };
  }
  return best;
}

// ------------------------------------------------------------------------------------------------ station contrast (contrast.py)

// ------------------------------------------------------------------------------------------------ the leg follower (follow.py)

/** How far the fixed-centreline edge-contrast run goes from t0 (gaps up to G failing stations; masked stations neutral). */
export function runEnd(S, O, phi, W, t0, tmax = 1500, G = null) {
  const ts = arange(t0, tmax, 1.0), { cl, cr, okl, okr } = stationContrast(S, O, phi, ts, W);
  G = G == null ? Math.trunc(1.0 * W) : G;
  let last = t0, fails = 0;
  for (let k = 0; k < ts.length; k++) {
    const t = ts[k], x = O[0] + t * Math.cos(phi), y = O[1] + t * Math.sin(phi);
    if (!(x > 2 && x < S.W - 3 && y > 2 && y < S.H - 3)) break;
    if (!(okl[k] && okr[k])) continue;
    if (Math.min(cl[k], cr[k]) > TAU) { last = t; fails = 0; } else { fails++; if (fails > G) break; }
  }
  let n = 0, p = 0;
  for (let k = 0; k < ts.length; k++) if (ts[k] >= t0 && ts[k] <= last && okl[k] && okr[k]) { n++; if (Math.min(cl[k], cr[k]) > TAU) p++; }
  return [last, n ? p / n : 0.0];
}

/** The nearest BasketPoint on the leg ahead: along in [tLo, tHi], within lat px of the centreline -> [along, k, lat] or null. */
export function bpOnLeg(S, O, phi, tLo, tHi, lat = 5.0, exclude = []) {
  const u = unit(phi), n = [-u[1], u[0]]; let best = null;
  S.bp.forEach((b, k) => {
    if (exclude.includes(k)) return;
    const d = [b[0] - O[0], b[1] - O[1]], a = d[0] * u[0] + d[1] * u[1], l = d[0] * n[0] + d[1] * n[1];
    if (tLo <= a && a <= tHi && Math.abs(l) <= lat && (best === null || a < best[0] || (a === best[0] && k < best[1]))) best = [a, k, l];
  });
  return best;
}

/** A bend never continues onto another visible tee's own ribbon (tees: [[centre, axis unit]]). */
export function otherTeeRibbon(V, psi, W, selfC, tees) {
  const u = unit(psi), n = [-u[1], u[0]];
  for (const [c, a] of tees) {
    if (hyp(c, selfC) < 1) continue;
    const d = [c[0] - V[0], c[1] - V[1]], along = d[0] * u[0] + d[1] * u[1], lat = d[0] * n[0] + d[1] * n[1];
    if (-W <= along && along <= 2.5 * W && Math.abs(lat) <= 4 && Math.abs(Math.abs(a[0] * u[0] + a[1] * u[1]) - 1) < 1 - Math.cos(rad(4))) return true;
  }
  return false;
}

const passStats = (S, V, psi, ts, W) => {
  const { cl, cr, okl, okr } = stationContrast(S, V, psi, ts, W), m = [];
  for (let k = 0; k < ts.length; k++) if (okl[k] && okr[k]) m.push(Math.min(cl[k], cr[k]));
  return m;
};

/** The bend near the run end: vertex V on the leg and new heading psi whose next 70 px run best (follow.py find_bend). */
export function findBend(S, O, phi, W, tEnd, selfC, tees) {
  let best = null; const u = unit(phi), ts = arange(W * 0.75, W * 0.75 + 70, 1.0);
  for (const tv of arange(Math.max(W * 0.5, tEnd - 1.2 * W), tEnd + W * 0.9, 1.0)) {
    const V = [O[0] + u[0] * tv, O[1] + u[1] * tv];
    for (const side of [1, -1]) for (const d of arange(4, 151, 2.0)) {
      const psi = phi + side * rad(d);
      if (selfC != null && otherTeeRibbon(V, psi, W, selfC, tees)) continue;
      const m = passStats(S, V, psi, ts, W);
      if (m.length < 25) continue;
      const pf = m.filter((x) => x > TAU).length / m.length, sc = pf + 0.01 * median(m);
      if (best === null || sc > best[0]) best = [sc, tv, psi, pf];
    }
  }
  return best;
}

/** Work back from a BasketPoint: a last leg V -> BP with V on the current leg near the run end (follow.py close_on_bp). */
export function closeOnBp(S, O, phi, W, tEnd, used = []) {
  const u = unit(phi); let best = null;
  const P = [O[0] + u[0] * tEnd, O[1] + u[1] * tEnd];
  S.bp.forEach((b, k) => {
    if (used.includes(k)) return;
    if (hyp(b, P) > 8 * W) return;
    for (const tv of arange(Math.max(W * 0.5, tEnd - 1.5 * W), tEnd + 0.6 * W, 1.0)) {
      const V = [O[0] + u[0] * tv, O[1] + u[1] * tv], d = [b[0] - V[0], b[1] - V[1]], Lg = Math.hypot(d[0], d[1]);
      if (Lg < 1.2 * W) continue;
      const psi = Math.atan2(d[1], d[0]), turn = Math.abs(pyMod(deg(psi - phi) + 180, 360) - 180);
      if (turn < 4 || turn > 150) continue;
      const m = passStats(S, V, psi, arange(W * 0.75, Lg - W * 0.5, 1.0), W);
      if (m.length < 12) continue;
      const pf = m.filter((x) => x > TAU).length / m.length;
      if (best === null || pf > best[0]) best = [pf, k, tv, psi];
    }
  });
  return best;
}

/** Follow a hole from start along phi: legs until a BasketPoint (on the leg, or closed on), lost, or 4 legs (follow.py trace). */
export function trace(S, start, phi, W, { maxLegs = 4, excludeBp = [], selfC = null, tees = [] } = {}) {
  let O = [start[0], start[1]]; const verts = [O.slice()], legs = [];
  for (let leg = 0; leg < maxLegs; leg++) {
    const [tEnd, frac] = runEnd(S, O, phi, W, leg === 0 ? W * 0.6 : W * 0.75);
    const hit = bpOnLeg(S, O, phi, W * 0.5, tEnd + 1.6 * W, 5.0, excludeBp);
    legs.push({ O: O.slice(), phiDeg: deg(phi), tEnd, passFrac: round(frac, 2) });
    if (hit) {
      const [a, k, l] = hit; verts.push(S.bp[k].slice()); Object.assign(legs.at(-1), { endBP: k, endLatPx: round(l, 2), endAlongMinusRun: round(a - tEnd, 1) });
      return { verts, end: k, legs };
    }
    const cb = closeOnBp(S, O, phi, W, tEnd, excludeBp);
    if (cb && cb[0] >= 0.75) {
      const [pf, k, tv, psi] = cb, u = unit(phi), V = [O[0] + u[0] * tv, O[1] + u[1] * tv];
      verts.push(V); legs.at(-1).bendDeg = round(pyMod(deg(psi - phi) + 180, 360) - 180, 1);
      legs.push({ O: V.slice(), phiDeg: deg(psi), tEnd: hyp(S.bp[k], V), passFrac: round(pf, 2), endBP: k, endLatPx: 0.0, closedOnBP: true });
      verts.push(S.bp[k].slice()); return { verts, end: k, legs };
    }
    const b = findBend(S, O, phi, W, tEnd, selfC, tees);
    if (!b || b[3] < 0.6) { legs.at(-1).stop = 'lost'; const u = unit(phi); verts.push([O[0] + u[0] * tEnd, O[1] + u[1] * tEnd]); return { verts, end: null, legs }; }
    const [, tv, psi] = b, u = unit(phi), V = [O[0] + u[0] * tv, O[1] + u[1] * tv];
    verts.push(V); legs.at(-1).bendDeg = round(pyMod(deg(psi - phi) + 180, 360) - 180, 1);
    O = V; phi = psi;
  }
  return { verts, end: null, legs };
}

// ------------------------------------------------------------------------------------------------ render-and-score (polyscore.py)

/** Edge contrast of a ribbon polyline (round joins): visible px within 0.5-3 px inside vs outside the predicted edge. */
export function polyScore(S, V, W, band = [0.5, 3.0]) {
  const { lum, mask, W: IW, H: IH } = S, h = W / 2;
  let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
  for (const [x, y] of V) { mnx = Math.min(mnx, x); mny = Math.min(mny, y); mxx = Math.max(mxx, x); mxy = Math.max(mxy, y); }
  const x0 = Math.max(Math.trunc(Math.floor(mnx - h - band[1] - 2)), 0), y0 = Math.max(Math.trunc(Math.floor(mny - h - band[1] - 2)), 0);
  const x1 = Math.min(Math.trunc(Math.ceil(mxx + h + band[1] + 3)), IW), y1 = Math.min(Math.trunc(Math.ceil(mxy + h + band[1] + 3)), IH);
  const segs = []; for (let i = 1; i < V.length; i++) { const a = V[i - 1], b = V[i], dx = b[0] - a[0], dy = b[1] - a[1]; segs.push([a[0], a[1], dx, dy, Math.max(dx * dx + dy * dy, 1e-9)]); }
  const e0 = V[0], e1 = V[V.length - 1], capR = h + band[1] + 2;
  let si = 0, ni = 0, so = 0, no = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = y * IW + x;
    if (!(mask[i] < 0.01)) continue;
    if (!(Math.hypot(x - e0[0], y - e0[1]) > capR) || !(Math.hypot(x - e1[0], y - e1[1]) > capR)) continue;
    let D = Infinity;
    for (const [ax, ay, dx, dy, L2] of segs) { let t = ((x - ax) * dx + (y - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t; const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy)); if (d < D) D = d; }
    if (D >= h - band[1] && D <= h - band[0]) { si += lum[i]; ni++; } else if (D >= h + band[0] && D <= h + band[1]) { so += lum[i]; no++; }
  }
  if (ni < 30 || no < 30) return [-99.0, 0];
  return [si / ni - so / no, Math.min(ni, no)];
}

/**
 * Coordinate search on the inner vertices (vertex 1 slides along the pad axis, +-axisSpanPx, default the prototype's 60 px),
 * ends fixed (polyscore.py refine_vertices).
 */
export function refineVertices(S, V0, W, padAxis = null, iters = 3, { axisSpanPx = 60, unitPx = null, score = polyScore } = {}) {
  // score: polyScore, or a scorer bit-identical to it (routeMatch passes ribbonContrastAt, which visits only the px near the legs)
  // unitPx: the search steps and ranges in units of a map-scaled length (routeMatch passes rC1px; the values are the
  // prototype's px over golden's R1 44.5); null keeps the prototype's px for the other tracers
  const k = unitPx == null ? 1 : unitPx / 44.5;
  let V = V0.map((v) => v.slice()), best = score(S, V, W)[0];
  for (let it = 0; it < iters; it++) for (let i = 1; i < V.length - 1; i++) {
    let cands;
    if (i === 1 && padAxis) cands = [...arange(-axisSpanPx, axisSpanPx + 0.1 * k, (it === 0 ? 1.0 : 0.25) * k)].map((s) => [V[1][0] + padAxis[0] * s, V[1][1] + padAxis[1] * s]);
    else { const st = (it === 0 ? 2.0 : 0.5) * k, rng = it === 0 ? arange(-20 * k, 20 * k + 0.1 * k, st) : arange(-4 * k, 4 * k + 0.01 * k, st); cands = []; for (const dx of rng) for (const dy of rng) cands.push([V[i][0] + dx, V[i][1] + dy]); }
    for (const c of cands) { const Vt = V.map((v) => v.slice()); Vt[i] = c; const s = score(S, Vt, W)[0]; if (s > best) { best = s; V = Vt; } }
  }
  return [V, best];
}

/** Contrast of a round ribbon cap at S0 (the ribbon runs from S0 against ub, toward the badge), near the cap only. */
export function capScore(S, S0, ub, W, band = [0.5, 3.0], reach = null) {
  const { lum, mask, W: IW, H: IH } = S, h = W / 2; reach = reach ?? 1.6 * W;
  const A = S0, Bp = [S0[0] - ub[0] * reach, S0[1] - ub[1] * reach];
  const x0 = Math.max(Math.floor(Math.min(A[0], Bp[0]) - h - 6), 0), y0 = Math.max(Math.floor(Math.min(A[1], Bp[1]) - h - 6), 0);
  const x1 = Math.min(Math.ceil(Math.max(A[0], Bp[0]) + h + 7), IW), y1 = Math.min(Math.ceil(Math.max(A[1], Bp[1]) + h + 7), IH);
  const dx = Bp[0] - A[0], dy = Bp[1] - A[1], L2 = Math.max(dx * dx + dy * dy, 1e-9);
  let si = 0, ni = 0, so = 0, no = 0, sci = 0, nci = 0, sco = 0, nco = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = y * IW + x, along = (x - S0[0]) * ub[0] + (y - S0[1]) * ub[1];
    if (!(mask[i] < 0.01 && along > -0.6 * W)) continue;
    let t = ((x - A[0]) * dx + (y - A[1]) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const D = Math.hypot(x - (A[0] + t * dx), y - (A[1] + t * dy));
    if (D >= h - band[1] && D <= h - band[0]) { si += lum[i]; ni++; if (along > 0) { sci += lum[i]; nci++; } }
    else if (D >= h + band[0] && D <= h + band[1]) { so += lum[i]; no++; if (along > 0) { sco += lum[i]; nco++; } }
  }
  if (nci < 12 || nco < 12 || ni < 30) return -99.0;
  return (si / ni - so / no) + (sci / nci - sco / nco);
}

// ------------------------------------------------------------------------------------------------ s3first.py steps

/** Edge pair of the segment A -> B (trimmed at both ends) -> [edge or null, visible offsets]. */
export function segFit(S, A, B, W, tolW, latLim, trim0, trim1) {
  const d = [B[0] - A[0], B[1] - A[1]], Lg = Math.hypot(d[0], d[1]), phi = Math.atan2(d[1], d[0]);
  const P = profile(S, A, phi, trim0, Lg - trim1);
  const e = P ? edgePair(P, W, tolW, latLim) : null;
  let nvis = 0; if (P) for (const v of P.ok) if (v > 0) nvis++;
  return [e, nvis];
}

const capStart = (T, u, L) => [T[0] + u[0] * FRONT * L, T[1] + u[1] * FRONT * L];

/** Width from the 3-point STRAIGHT holes: free width search on each, the best per hole, median (s3first.py _width). */
export function widthFromStraight(S, base) {
  const ws = [];
  for (const [h, b] of Object.entries(base)) {
    const s3 = b.straight3; if (!s3 || s3.verdict !== 'STRAIGHT') continue;
    // segFit's profile does not depend on the width: profiled once per hole, paired at every width (the same numbers)
    const A = b.teeCenter, B = s3.basketPoint, d = [B[0] - A[0], B[1] - A[1]], P = profile(S, A, Math.atan2(d[1], d[0]), S.L * 0.6, Math.hypot(d[0], d[1]) - 2);
    const G = P ? edgeGradientOf(P) : null;
    for (const Wg of arange(...((r) => [r[0], r[1], 2 * r[2]])(widthSearchOf(S)))) { const e = G ? edgePairG(G, Wg, 1.0, 3.0) : null; if (e) ws.push([e.score, e.w, h]); }
  }
  const by = new Map(); for (const [sc, w, h] of ws) { if (!by.has(h)) by.set(h, []); by.get(h).push([sc, w]); }
  const per = [...by.values()].map((v) => v.reduce((m, x) => (x[0] > m[0] || (x[0] === m[0] && x[1] > m[1]) ? x : m))[1]);
  return { widthPx: per.length ? median(per) : 0.933 * S.R1, holes: per.length };
}

/** The course hallway learned from every TEE -> BADGE segment (teebadge.py learn): widths, centre offsets, contrast. */
export function teeBadgeLearn(S, base) {
  const rows = [];
  for (const [h, b] of Object.entries(base)) {
    const T = b.teeCenter, u = b.u, St = capStart(T, u, S.L), B = S.badges[Number(h)];
    const stop = (B[0] - St[0]) * u[0] + (B[1] - St[1]) * u[1] - S.badgeHalf[Number(h)] - 2;
    if (stop < 25) { rows.push({ hole: Number(h), usable: false, why: `only ${Math.round(stop)} px between tee cap and badge` }); continue; }
    const [wMin, wMax, wStep] = widthSearchOf(S), phi = Math.atan2(u[1], u[0]), P = profile(S, St, phi, 2, stop, 0, 1.0, reachFor(wMax)); let best = null;
    const G = P ? edgeGradientOf(P) : null;
    for (const Wg of arange(wMin, wMax, wStep)) { const e = G ? edgePairG(G, Wg, 0.75, 3.0) : null; if (e && (best === null || e.score > best.score)) best = e; }
    if (!best) { rows.push({ hole: Number(h), usable: false, why: 'no edge pair', lenPx: round(stop, 1) }); continue; }
    const m = passStats(S, St, phi, arange(2, stop, 1.0), best.w);
    const pct = (xs, q) => { const s = Float64Array.from(xs).sort(); const k = (s.length - 1) * q / 100, f = Math.floor(k), c = Math.min(f + 1, s.length - 1); return s[f] + (s[c] - s[f]) * (k - f); };
    rows.push({ hole: Number(h), usable: true, lenPx: round(stop, 1), widthPx: round(best.w, 2), centreOffPx: round(best.c, 2), edgeStep: round(best.score, 1), stationsVisible: m.length,
      contrastMedian: m.length ? round(median(m), 1) : null, contrastP10: m.length ? round(pct(m, 10), 1) : null });
  }
  const use = rows.filter((r) => r.usable && Math.abs(r.centreOffPx) <= 3);
  return { rows, widthPx: use.length ? median(use.map((r) => r.widthPx)) : null, segments: use.length, of: rows.length };
}

/** Is the 3-point STRAIGHT hole's segment tee cap -> BasketPoint a ribbon? (s3first.py step 2) */
export function verifyStraight(S, b, W) {
  const T = b.teeCenter, u = b.u, K = b.straight3.basketPoint, St = capStart(T, u, S.L);
  const [e, nvis] = segFit(S, St, K, W, 1.5, 1.5, W * 0.6, 2);
  let k = 0, dk = Infinity; S.bp.forEach((p, j) => { const d = hyp(p, K); if (d < dk) { dk = d; k = j; } });
  return { e, nvis, k, start: St };
}

// ------------------------------------------------------------------------------------------------ badge-only seeding (badgeseed.py)

/** Centreline directions through a badge whose both sides carry the ribbon edges (lateral +-3 px), best first. */
export function ribbonThroughBadge(S, c, half, W) {
  const best = [];
  for (const psi of arange(0, 180, 1.0)) for (const lat of [-3, -1.5, 0, 1.5, 3]) {
    const u = unit(rad(psi)), n = [-u[1], u[0]], O = [c[0] + n[0] * lat, c[1] + n[1] * lat]; let pf = [], med = [];
    for (const sgn of [1, -1]) {
      const m = passStats(S, O, rad(psi) + (sgn > 0 ? 0 : Math.PI), arange(half + 2, half + 2 + 60, 1.0), W);
      if (m.length < 8) continue;
      pf.push(m.filter((x) => x > TAU).length / m.length); med.push(median(m));
    }
    if (!pf.length) continue;
    if (pf.length === 1) { pf = [pf[0], pf[0]]; med = [med[0], med[0]]; }
    best.push([Math.min(...pf) + 0.005 * Math.min(...med), psi, lat, pf]);
  }
  return best.sort(tupleDesc);
}
/** Python's descending sort of tuples (score, psi, lat, [pf...]). */
function tupleDesc(a, b) {
  const cmp = (x, y) => { if (Array.isArray(x)) { for (let i = 0; i < Math.min(x.length, y.length); i++) { const c = cmp(x[i], y[i]); if (c) return c; } return x.length - y.length; } return x < y ? -1 : x > y ? 1 : 0; };
  return -cmp(a, b);
}

/** Badge-only seed: the ribbon through badge n, the tee end found (visible cap or hidden under a sprite), traced to a BasketPoint. */
export function seedOne(S, n, W, pads, { excludeDirs = [], tees = [] } = {}) {
  const c = S.badges[n], half = S.badgeHalf[n];
  let cands = ribbonThroughBadge(S, c, half, W);
  const padc = [];
  for (const p of pads) {
    const a = rad(p.thDeg), u_ = [Math.cos(a), Math.sin(a)], d = [c[0] - p.cx, c[1] - p.cy];
    if (Math.abs(d[0] * u_[0] + d[1] * u_[1]) < 450 && Math.abs(d[0] * -u_[1] + d[1] * u_[0]) <= 3.5) padc.push([9.0, pyMod(p.thDeg, 180), 0.0, [1, 1]]);
  }
  cands = [...padc, ...cands];
  const near = (psi0, q) => Math.abs(pyMod(psi0 - q + 90, 180) - 90) < 4;
  const seen = [], good = [];
  for (const [sc, psi0, lat0, pf] of cands.slice(0, 80)) {
    if (seen.some((q) => near(psi0, q))) continue;
    if (excludeDirs.some((q) => near(psi0, q))) continue;
    seen.push(psi0);
    let u = unit(rad(psi0)), nn = [-u[1], u[0]];
    const O = [c[0] + nn[0] * lat0 - u[0] * (half + 70), c[1] + nn[1] * lat0 - u[1] * (half + 70)];
    const f = fitFree(S, O, rad(psi0), 0, 2 * (half + 70), W, { span: 2.0, dstep: 0.1, tolW: 1.5, latLim: 6.0 });
    if (f) {
      u = unit(f.phi); nn = [-u[1], u[0]];
      const P = [O[0] + nn[0] * f.c, O[1] + nn[1] * f.c], off = (c[0] - P[0]) * nn[0] + (c[1] - P[1]) * nn[1];
      if (Math.abs(off) <= 2.5) {
        let padhit = false;
        for (const p of pads) {
          const d = [p.cx - P[0], p.cy - P[1]], al = Math.abs(d[0] * u[0] + d[1] * u[1]), la = Math.abs(d[0] * nn[0] + d[1] * nn[1]);
          const ax = Math.abs(pyMod(p.thDeg - deg(f.phi) + 90, 180) - 90);
          if (al < 450 && la <= 3.5 && ax <= 3) padhit = true;
        }
        good.push([padhit, sc, deg(f.phi), P, u, nn, off, f.w, pf]);
      }
    }
    if (seen.length >= 8) break;
  }
  if (!good.length) return { hole: n, badge: c.map((v) => round(v, 2)), fail: 'no ribbon through the badge (centre within 2.5 px, width within 1.5 px)', candidatesTried: seen.length };
  const order = good.map((g, i) => [g, i]).sort((A, B) => (Number(B[0][0]) - Number(A[0][0])) || (B[0][1] - A[0][1]) || (A[1] - B[1]));   // reverse sort, stable
  const [, sc, psi, P, u, , off, Wm, pf] = order[0][0];
  const cp = (c[0] - P[0]) * u[0] + (c[1] - P[1]) * u[1], B = [P[0] + u[0] * cp, P[1] + u[1] * cp];
  const sides = [];
  for (const sgn of [1, -1]) {
    const phi = rad(psi) + (sgn > 0 ? 0 : Math.PI), uu = unit(phi), n2 = [-uu[1], uu[0]]; let pad = null;
    for (const p of pads) {
      const d = [p.cx - B[0], p.cy - B[1]], al = d[0] * uu[0] + d[1] * uu[1], la = d[0] * n2[0] + d[1] * n2[1], ax = Math.abs(pyMod(p.thDeg - deg(phi) + 90, 180) - 90);
      if (al > 0 && al < 450 && Math.abs(la) <= 3.5 && ax <= 3 && (pad === null || al < pad[1])) pad = [p, al, la];
    }
    const r = trace(S, B, phi, W, { selfC: pad ? [pad[0].cx, pad[0].cy] : null, tees });
    const [tEnd, frac] = runEnd(S, B, phi, W, half + 2);
    sides.push({ phi, pad, tEnd, frac, tr: r });
  }
  const ends = sides.map((s) => s.tr.end !== null), pads_ = sides.map((s) => s.pad !== null);
  let back, how;
  if (pads_[0] !== pads_[1]) { back = pads_[0] ? 0 : 1; how = 'visible pad on the line'; }
  else if (ends[0] !== ends[1]) { back = ends[0] ? 1 : 0; how = 'trace ends at a BasketPoint'; }
  else { back = sides[0].tEnd < sides[1].tEnd ? 0 : 1; how = 'shorter run'; }
  const bk = sides[back], fw = sides[1 - back], ub = unit(bk.phi), nb = [-ub[1], ub[0]];
  const [ta] = runEnd(S, B, bk.phi, W, half + 2, 1500, 6);
  const st = stationContrast(S, B, bk.phi, arange(ta + 1, ta + 1 + W, 1.0), W);
  let vis = 0; for (let k = 0; k < st.okl.length; k++) if (st.okl[k] && st.okr[k]) vis++;
  const masked = 1 - vis / st.okl.length, hidden = masked > 0.5 && bk.pad === null;
  let tcap, scCap = null, feas = null;
  if (!hidden) {
    let bestCap = null;
    for (const t of arange(Math.max(half + 4, ta - W), ta + W, 0.25)) { const s = capScore(S, [B[0] + ub[0] * t, B[1] + ub[1] * t], ub, W); if (bestCap === null || s > bestCap[0] || (s === bestCap[0] && t > bestCap[1])) bestCap = [s, t]; }
    [scCap, tcap] = bestCap;
  } else {
    const tt = arange(ta + 1, ta + 400, 1.0), s2 = stationContrast(S, B, bk.phi, tt, W);
    let tb = ta + 400; for (let k = 0; k < tt.length; k++) if (s2.okl[k] && s2.okr[k]) { tb = tt[k]; break; }
    feas = [];
    for (const t of arange(ta, Math.max(ta, tb - W / 2) + 0.01, 0.25)) for (const lat of [-0.6, 0, 0.6]) {
      const pc = [B[0] + ub[0] * (t + FRONT * S.L) + nb[0] * lat, B[1] + ub[1] * (t + FRONT * S.L) + nb[1] * lat], th = Math.atan2(ub[1], ub[0]), cth = Math.cos(th), sth = Math.sin(th);
      const r_ = Math.ceil(Math.hypot(S.L, S.Wd) / 2 + 2); let ok = true;
      for (let Y = Math.trunc(pc[1]) - r_; Y < Math.trunc(pc[1]) + r_ + 2 && ok; Y++) for (let X = Math.trunc(pc[0]) - r_; X < Math.trunc(pc[0]) + r_ + 2; X++) {
        const Uq = (X - pc[0]) * cth + (Y - pc[1]) * sth, Vq = -(X - pc[0]) * sth + (Y - pc[1]) * cth;
        if (!(Math.abs(Uq) <= S.L / 2 + 0.5 && Math.abs(Vq) <= S.Wd / 2 + 0.5)) continue;
        if (Y < 0 || Y >= S.H || X < 0 || X >= S.W) { ok = false; break; }
        if (!S.occluder[Y * S.W + X]) { ok = false; break; }
      }
      if (ok) feas.push([t, pc[0], pc[1]]);
    }
    if (!feas.length) feas = null;
    tcap = feas ? mean(feas.map((f) => f[0])) : ta;
  }
  const S0 = [B[0] + ub[0] * tcap, B[1] + ub[1] * tcap], teeC = [S0[0] + ub[0] * FRONT * S.L, S0[1] + ub[1] * FRONT * S.L];
  const fx = (k, f) => (feas ? round(f(...feas.map((r) => r[k])), 2) : null);
  const rec = { padOnLine: Boolean(order[0][0][0]), lineDeg: round(pyMod(psi, 180), 2), hole: n, badge: c.map((v) => round(v, 2)), badgeOffLinePx: round(off, 2), dirToBasketDeg: round(deg(fw.phi), 2), widthPx: Wm == null ? null : round(Wm, 2),
    sideRule: how, capScore: scCap === null ? null : round(scCap, 2), capMaskedFrac: round(masked, 2), hiddenCapInterval: feas ? [fx(0, Math.min), fx(0, Math.max)] : null,
    hiddenTeeBox: feas ? [fx(1, Math.min), fx(1, Math.max), fx(2, Math.min), fx(2, Math.max)] : null, teePred: teeC.map((v) => round(v, 2)), capCentre: S0.map((v) => round(v, 2)), scanPass: pf.map((x) => round(x, 2)) };
  let start, selfC;
  if (bk.pad) {
    const p = bk.pad[0], pc = [p.cx, p.cy], e = [teeC[0] - pc[0], teeC[1] - pc[1]];
    Object.assign(rec, { teeVisible: true, padCentre: [round(p.cx, 2), round(p.cy, 2)], padLabelS3: String(p.label ?? p.tee), teeErrPx: round(Math.hypot(...e), 2), teeErrAlongPx: round(e[0] * ub[0] + e[1] * ub[1], 2), teeErrLatPx: round(e[0] * nb[0] + e[1] * nb[1], 2) });
    start = [pc[0] - ub[0] * FRONT * S.L, pc[1] - ub[1] * FRONT * S.L]; selfC = pc;
  } else { Object.assign(rec, { teeVisible: false, teeHiddenUnderSprite: hidden, teeFeasible: hidden ? feas !== null : null }); start = S0; selfC = null; }
  const r = trace(S, start, fw.phi, W, { selfC, tees });
  Object.assign(rec, { end: r.end, legs: r.legs, verts: r.verts.map((v) => v.map((x) => round(x, 2))) });
  if (r.end === null) rec.lostAt = r.verts.at(-1).map((x) => round(x, 2));
  if (r.end !== null && r.verts.length > 2) { const [Vr, s1] = refineVertices(S, r.verts, W, unit(fw.phi)); Object.assign(rec, { verts: Vr.map((v) => v.map((x) => round(x, 2))), polyScore: round(s1, 2) }); }
  else if (r.end !== null) rec.polyScore = round(polyScore(S, r.verts, W)[0], 2);
  rec.bends = r.end !== null ? rec.verts.length - 2 : null;
  return rec;
}

// ------------------------------------------------------------------------------------------------ the judge (s3first.py judge)

const segD = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = Math.max(dx * dx + dy * dy, 1e-9); let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
const linspace = (n) => Array.from({ length: n }, (_, i) => (n === 1 ? 0 : i / (n - 1)));

/**
 * Sam's S7 pass condition (s3first.py judge): the trace ends at the hole's basket (within the basket match rule) and
 * its centreline never leaves the hallway, i.e. max distance from Sam's corridor tee -> bends -> basket <= W / 2. Bend
 * offsets are reported, never gated. sam: { tee, basket, bends } canonical px; endPoint: the BasketPoint reached.
 */
export function judgeTrace({ verts, endPoint }, sam, W, basketMatchPx = 12) {
  if (!verts?.length || !endPoint) return null;
  const corridor = [sam.tee, ...(sam.bends ?? []), sam.basket], endErr = hyp(endPoint, sam.basket);
  let dev = 0;
  for (let i = 1; i < verts.length; i++) {
    const a = verts[i - 1], b = verts[i];
    for (const t of linspace(Math.max(2, Math.trunc(hyp(a, b))))) {
      const p = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      let m = Infinity; for (let k = 1; k < corridor.length; k++) m = Math.min(m, segD(p, corridor[k - 1], corridor[k]));
      dev = Math.max(dev, m);
    }
  }
  const bends = sam.bends ?? [], ours = verts.slice(1, -1);
  return { endErrPx: round(endErr, 1), maxDevPx: round(dev, 1), halfWidthPx: round(W / 2, 1), bendsSam: bends.length, bendsOurs: ours.length,
    bendOffPx: bends.map((q) => (ours.length ? round(Math.min(...ours.map((v) => hyp(v, q))), 1) : null)), ok: endErr < basketMatchPx && dev <= W / 2 };
}
