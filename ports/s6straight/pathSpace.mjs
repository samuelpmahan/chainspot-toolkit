/**
 * fn.q.path.*: the hole-path measurement along a centreline, written once behind the PxC boundary (docs/agents/boundary.md;
 * scaffolded by `node scripts/pxc.mjs scaffold query path`). Browser-safe.
 *
 * The scene (DOCTRINE): the hole path is a semi-transparent grey ribbon composited over the photo; along a straight hole it
 * runs from the tee to the basket without leaving the segment. The PROVEN measure is the graduated Python evidence
 * (docs/evidence/s7main, s7edge): the ribbon's two edges, read on unmasked stations only. The alpha overlay fraction
 * (contracts/alpha.profile@1) is a SECOND measure, taken on the same stations and compared against it.
 *
 * Ports, the same math (proved number for number against the Python: ports/s6straight/prove.mjs):
 *   fn.q.path.profile          track.py profile: the lateral luminance profile at offsets -30..30 px step 0.25, averaged
 *                              over stations t0..t1 (arange) along unit(phi) from O; masked samples dropped
 *   fn.q.path.edgePair         track.py edge_pair: the best rising + falling step pair of width near Wexp, sub-px
 *   fn.q.path.stationContrast  contrast.py station_contrast: per station, inside band minus outside band on each side
 *   fn.q.path.width            teebadge.py's free width search: the best edge pair over Wg = 18..59 px on one profile
 * New:
 *   fn.q.path.overlayFraction  per station, the fraction of path overlay the centre pixel carries:
 *                              overlayFraction(observed, background, profile.overlays.path), background = per-channel
 *                              median of the unmasked lateral samples outside the ribbon (w < |offset| <= 2w, w = W / 2).
 *                              Without a profile: the recorded condition `no alpha profile` and a PROXY (the same
 *                              least-squares alpha against a WHITE overlay: brightness, not alpha)
 *   fn.q.path.samples          the straightened corridor (lateral colours at integer offsets -2w..2w per station): render
 *   fn.q.path.loss             both measures side by side on the same stations: the edge test (min-side contrast > tau
 *                              = 8 lum, s7edge: golden 80% vs 1% of stations) and the overlay fraction below a threshold
 *
 * Arguments (state is an argument; nothing is read from globals): strings are Part references, resolved by the store:
 *   raster  'px.image.cropped' ({ rgba, widthPx, heightPx }); lum = mean of R, G, B (course.py)
 *   mask    'tk.s6.pathMask' ({ widthPx, heightPx, mask: Uint8Array 0/1 }); a sample is masked when the bilinear mask
 *           exceeds 0.01 or it lies outside 1 < x < W - 2, 1 < y < H - 2 (track.py); null = nothing masked
 *   originPx [x, y], phiRad, t0Px, t1Px, stepPx (stations = arange(t0, t1, step)), widthPx W, ...
 * Data conditions are recorded in the answer, never thrown. registerQueries caches each answer by its arguments.
 */
import { overlayFraction as contractOverlayFraction, hasOverlay, noProfile } from '../../contracts/alpha.profile@1.mjs';

const r3 = (v) => (v == null || Number.isNaN(v) ? null : Math.round(v * 1000) / 1000);
const median = (xs) => { const s = Float64Array.from(xs).sort(), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
/** numpy.percentile (linear). */
export const percentile = (xs, q) => { const s = Float64Array.from(xs).sort(), n = s.length; if (!n) return null; const p = (q / 100) * (n - 1), i = Math.floor(p), f = p - i; return i + 1 < n ? s[i] + (s[i + 1] - s[i]) * f : s[i]; };
/** numpy.arange(a, b, step) */
export const arange = (a, b, step = 1) => { const n = Math.max(0, Math.ceil((b - a) / step)), out = new Float64Array(n); for (let k = 0; k < n; k++) out[k] = a + k * step; return out; };

/** The recorded constants of the graduated evidence (docs/evidence/s7main, s7edge). */
export const EVIDENCE = Object.freeze({
  offsetsPx: Object.freeze({ from: -30, to: 30.01, step: 0.25 }),   // track.py OFFS
  maskOver: 0.01,                                                    // a sample is masked when bilinear MASK > 0.01
  edgeMinOk: Object.freeze({ count: 8, ofStations: 0.2 }),           // s7main edge_pair good = ok >= max(8, 0.2 nT) (s7edge: 3, 0.4)
  edgeGoodFrac: 0.6, smoothTaps: 5, endZero: 6,
  bandPx: Object.freeze([1, 3]), alongPx: 2,                         // contrast.py station_contrast
  tauLum: 8,                                                         // the edge test: min-side contrast > 8 lum (s7edge README)
  widthsPx: Object.freeze([18, 60, 1]), widthTolPx: 0.75, widthLatPx: 3   // teebadge.py width search
});
/** The overlay a proxy assumes when no alpha profile exists: white. Its "fraction" is brightness, not alpha. */
export const PROXY_OVERLAY = Object.freeze({ rgb: Object.freeze([255, 255, 255]), rule: 'PROXY: least-squares alpha against a WHITE overlay (no fitted path colour): brightness over the lateral background, not the path alpha' });
export const BACKGROUND_BAND = Object.freeze({ fromW: 1, toW: 2, rule: 'background = per-channel median of the unmasked lateral samples with w < |offset| <= 2w (w = W / 2)' });

export const PATH_UNITS = Object.freeze({
  profile: 'lum (mean of R, G, B) per lateral offset (px); ok: unmasked station count',
  edgePair: 'px (l, r, c, w: lateral offsets); score, gl, gr: lum/px',
  stationContrast: 'lum per station (inside band minus outside band), per side',
  width: 'px (the best edge pair over the width search)',
  overlayFraction: 'fraction (0..1) of path overlay per station (alpha, or the white-overlay proxy)',
  samples: 'RGB level per station and lateral offset (px)',
  loss: 'fractions of visible stations; longest gaps px; contrast lum; overlay fraction'
});

// ------------------------------------------------------------------ raster access (scipy map_coordinates order=1 mode='nearest')

const LUM = new WeakMap();
/** course.py lum = rgb.mean(-1), once per raster. */
export function lumOf(raster) {
  let L = LUM.get(raster);
  if (!L) {
    const { rgba, widthPx: W, heightPx: H } = raster; L = new Float64Array(W * H);
    for (let i = 0; i < W * H; i++) L[i] = (rgba[4 * i] + rgba[4 * i + 1] + rgba[4 * i + 2]) / 3;
    LUM.set(raster, L);
  }
  return L;
}
const clampI = (i, n) => (i < 0 ? 0 : i >= n ? n - 1 : i);
/** Bilinear sample of a W x H plane (scipy map_coordinates order=1, mode='nearest'). */
export function samp(plane, W, H, x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const xa = clampI(x0, W), xb = clampI(x0 + 1, W), ya = clampI(y0, H), yb = clampI(y0 + 1, H);
  return (1 - fy) * ((1 - fx) * plane[ya * W + xa] + fx * plane[ya * W + xb]) + fy * ((1 - fx) * plane[yb * W + xa] + fx * plane[yb * W + xb]);
}
const ctxOf = (raster, mask) => ({ lum: lumOf(raster), W: raster.widthPx, H: raster.heightPx, mask: mask?.mask ?? null, raster });
const maskedAt = (c, x, y) => !(x > 1 && x < c.W - 2 && y > 1 && y < c.H - 2) || Boolean(c.mask && samp(c.mask, c.W, c.H, x, y) > EVIDENCE.maskOver);
const unit = (phi) => [Math.cos(phi), Math.sin(phi)];
export const OFFS = arange(EVIDENCE.offsetsPx.from, EVIDENCE.offsetsPx.to, EVIDENCE.offsetsPx.step);

// ------------------------------------------------------------------ the ported math (track.py, contrast.py, teebadge.py)

/** track.py profile(C, O, phi, t0, t1, lat0, step). */
export function profileAt(c, O, phi, t0, t1, { lat0 = 0, step = 1 } = {}) {
  const u = unit(phi), n = [-u[1], u[0]], T = arange(t0, t1, step), M = OFFS.length;
  if (!T.length) return { prof: null, ok: null, nT: 0 };
  const sum = new Float64Array(M), ok = new Int32Array(M);
  for (const t of T) for (let j = 0; j < M; j++) {
    const o = OFFS[j] + lat0, x = O[0] + t * u[0] + o * n[0], y = O[1] + t * u[1] + o * n[1];
    if (maskedAt(c, x, y)) continue;
    sum[j] += samp(c.lum, c.W, c.H, x, y); ok[j]++;
  }
  const prof = new Float64Array(M); for (let j = 0; j < M; j++) prof[j] = ok[j] ? sum[j] / ok[j] : NaN;
  return { prof, ok, nT: T.length };
}

/** track.py edge_pair(prof, ok, nT, Wexp, tolW, lat_lim): null when there is no pair. */
export function edgePairOf({ prof, ok, nT }, Wexp, { tolW = 3, latLim = 12, minOk = EVIDENCE.edgeMinOk } = {}) {
  if (!prof) return null;
  const M = prof.length, good = new Uint8Array(M), need = Math.max(minOk.count, minOk.ofStations * nT);
  let nGood = 0; for (let j = 0; j < M; j++) if (ok[j] >= need) { good[j] = 1; nGood++; }
  if (nGood / M < EVIDENCE.edgeGoodFrac) return null;
  const p = Float64Array.from(prof), gi = []; for (let j = 0; j < M; j++) if (good[j]) gi.push(j);
  for (let j = 0; j < M; j++) {   // np.interp over the good offsets, ends held
    if (good[j]) continue;
    if (j <= gi[0]) { p[j] = prof[gi[0]]; continue; }
    if (j >= gi.at(-1)) { p[j] = prof[gi.at(-1)]; continue; }
    let k = 0; while (gi[k + 1] < j) k++;
    const a = gi[k], b = gi[k + 1]; p[j] = prof[a] + (prof[b] - prof[a]) * ((j - a) / (b - a));
  }
  const h = (EVIDENCE.smoothTaps - 1) / 2, s = new Float64Array(M);   // np.convolve(p, ones(5)/5, 'same'), zero padded
  for (let j = 0; j < M; j++) { let v = 0; for (let k = j - h; k <= j + h; k++) if (k >= 0 && k < M) v += p[k] / EVIDENCE.smoothTaps; s[j] = v; }
  const g = new Float64Array(M), dO = EVIDENCE.offsetsPx.step;   // np.gradient / 0.25
  for (let j = 0; j < M; j++) g[j] = (j === 0 ? s[1] - s[0] : j === M - 1 ? s[M - 1] - s[M - 2] : (s[j + 1] - s[j - 1]) / 2) / dO;
  for (let j = 0; j < M; j++) if (j < EVIDENCE.endZero || j >= M - EVIDENCE.endZero || !good[j]) g[j] = 0;
  const L = [], R = [];
  for (let i = 1; i < M - 1; i++) { if (g[i] > 0 && g[i] >= g[i - 1] && g[i] >= g[i + 1]) L.push(i); if (g[i] < 0 && g[i] <= g[i - 1] && g[i] <= g[i + 1]) R.push(i); }
  let best = null;
  for (const i of L) for (const j of R) {
    const w = OFFS[j] - OFFS[i]; if (Math.abs(w - Wexp) > tolW) continue;
    const cc = (OFFS[i] + OFFS[j]) / 2; if (Math.abs(cc) > latLim) continue;
    const sc = Math.min(g[i], -g[j]); if (!best || sc > best[2]) best = [i, j, sc];
  }
  if (!best) return null;
  const sub = (i) => { const a = g[i - 1], b = g[i], c2 = g[i + 1], den = a - 2 * b + c2; return OFFS[i] + (den !== 0 ? ((0.5 * (a - c2)) / den) * dO : 0); };
  const [i, j, sc] = best, l = sub(i), r = sub(j);
  return { lPx: l, rPx: r, cPx: (l + r) / 2, wPx: r - l, score: sc, gl: g[i], gr: -g[j] };
}

/** contrast.py station_contrast(C, O, phi, ts, W, band, along): per station left/right contrast and validity. */
export function stationContrastAt(c, O, phi, ts, W, { band = EVIDENCE.bandPx, along = EVIDENCE.alongPx } = {}) {
  const u = unit(phi), n = [-u[1], u[0]], h = W / 2, ins = arange(band[0], band[1] + 1e-9, 0.5), da = arange(-along, along + 1e-9, 1);
  const N = ts.length, out = { cl: new Float64Array(N), cr: new Float64Array(N), okl: new Uint8Array(N), okr: new Uint8Array(N) };
  const S = (t, offs) => {   // nanmean over (da x offs), and the unmasked fraction
    let sum = 0, k = 0;
    for (const d of da) for (const o of offs) {
      const TT = t + d, x = O[0] + TT * u[0] + o * n[0], y = O[1] + TT * u[1] + o * n[1];
      if (maskedAt(c, x, y)) continue; sum += samp(c.lum, c.W, c.H, x, y); k++;
    }
    return [k ? sum / k : NaN, k / (da.length * offs.length)];
  };
  for (let q = 0; q < N; q++) for (const sgn of [-1, 1]) {
    const [vi, oki] = S(ts[q], Array.from(ins, (x) => sgn * (h - x))), [vo, oko] = S(ts[q], Array.from(ins, (x) => sgn * (h + x)));
    const okv = Math.min(oki, oko) > 0.5 ? 1 : 0;
    if (sgn < 0) { out.cl[q] = vi - vo; out.okl[q] = okv; } else { out.cr[q] = vi - vo; out.okr[q] = okv; }
  }
  return out;
}

/** teebadge.py: the free width search, best edge pair over widths Wg on one profile. */
export function widthSearchAt(c, O, phi, t0, t1, { widths = EVIDENCE.widthsPx, tolW = EVIDENCE.widthTolPx, latLim = EVIDENCE.widthLatPx, minOk } = {}) {
  const P = profileAt(c, O, phi, t0, t1);
  let best = null;
  for (const Wg of arange(...widths)) { const e = P.prof ? edgePairOf(P, Wg, { tolW, latLim, minOk }) : null; if (e && (!best || e.score > best.score)) best = { ...e, wgPx: Wg }; }
  return best;
}

// ------------------------------------------------------------------ the mask (course.py), from owned pixel lists

/** binary_fill_holes (scipy default: 4-connected background) then binary_dilation, `iterations` times, cross element. */
export function spriteMaskOf(W, H, lists, { iterations = 2 } = {}) {
  const spr = new Uint8Array(W * H); for (const px of lists) for (const i of px) spr[i] = 1;
  const outside = new Uint8Array(W * H), stack = [];   // background reachable from the border = not a hole
  const seed = (i) => { if (!spr[i] && !outside[i]) { outside[i] = 1; stack.push(i); } };
  for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x); } for (let y = 0; y < H; y++) { seed(y * W); seed(y * W + W - 1); }
  while (stack.length) { const i = stack.pop(), x = i % W, y = (i / W) | 0; if (x > 0) seed(i - 1); if (x < W - 1) seed(i + 1); if (y > 0) seed(i - W); if (y < H - 1) seed(i + W); }
  const filled = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) filled[i] = outside[i] ? 0 : 1;
  let cur = filled;
  for (let it = 0; it < iterations; it++) {
    const nx = Uint8Array.from(cur);
    for (let i = 0; i < W * H; i++) { if (cur[i]) continue; const x = i % W, y = (i / W) | 0; if ((x > 0 && cur[i - 1]) || (x < W - 1 && cur[i + 1]) || (y > 0 && cur[i - W]) || (y < H - 1 && cur[i + W])) nx[i] = 1; }
    cur = nx;
  }
  return { filled, sprite: cur };
}

/** scipy.ndimage.uniform_filter1d(x, size), mode 'reflect'. */
function uniform1d(x, size) {
  const n = x.length, h = Math.floor(size / 2), out = new Float64Array(n);
  const at = (i) => { while (i < 0 || i >= n) i = i < 0 ? -i - 1 : 2 * n - i - 1; return x[i]; };
  for (let i = 0; i < n; i++) { let s = 0; for (let k = i - h; k < i - h + size; k++) s += at(k); out[i] = s / size; }
  return out;
}
/** course.py _r1: the C1 radius from the mean radial luminance around the basket points (sprites masked), C2 = 2 x C1. */
export function ringRadiusOf(lum, sprite, W, H, bps, { rs = [10, 260, 0.5] } = {}) {
  const th = Array.from(arange(0, 360, 1), (d) => (d * Math.PI) / 180), R = arange(...rs), prof = new Float64Array(R.length);
  R.forEach((r, ri) => {
    const v = [];
    for (const [bx, by] of bps) {
      let s = 0, k = 0;
      for (const a of th) { const x = bx + r * Math.cos(a), y = by + r * Math.sin(a); if (samp(sprite, W, H, x, y) < 0.01 && x > 1 && x < W - 2 && y > 1 && y < H - 2) { s += samp(lum, W, H, x, y); k++; } }
      if (k > 20) v.push(s / k);
    }
    prof[ri] = v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
  });
  const sm = uniform1d(prof, 15), hp = prof.map((p, i) => p - sm[i]);
  let best = null;
  for (let i = 0; i < R.length; i++) {
    const r = R[i]; if (2 * r > R[R.length - 1]) break;
    let j = 0; for (let k = 1; k < R.length; k++) if (Math.abs(R[k] - 2 * r) < Math.abs(R[j] - 2 * r)) j = k;
    const sc = hp[i] + hp[j]; if (!best || sc > best[0]) best = [sc, r];
  }
  return best ? best[1] : null;
}
/** course.py ring: |d - R1| <= 3.5 or |d - 2 R1| <= 4.5 px around every basket point. */
export function ringMaskOf(W, H, bps, R1) {
  const ring = new Uint8Array(W * H);
  for (const [bx, by] of bps) {
    const x0 = Math.trunc(Math.max(bx - 2 * R1 - 8, 0)), x1 = Math.trunc(Math.min(bx + 2 * R1 + 9, W)), y0 = Math.trunc(Math.max(by - 2 * R1 - 8, 0)), y1 = Math.trunc(Math.min(by + 2 * R1 + 9, H));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const d = Math.hypot(x - bx, y - by); if (Math.abs(d - R1) <= 3.5 || Math.abs(d - 2 * R1) <= 4.5) ring[y * W + x] = 1; }
  }
  return ring;
}
/** The path mask Part value: opaque sprites (filled, dilated 2 px) OR the C1/C2 rings. */
export function pathMaskOf(raster, lists, bps, { r1Range = [10, 260, 0.5], r1Px = null } = {}) {
  const W = raster.widthPx, H = raster.heightPx, { sprite } = spriteMaskOf(W, H, lists);
  const R1 = r1Px ?? ringRadiusOf(lumOf(raster), sprite, W, H, bps, { rs: r1Range });
  const ring = R1 ? ringMaskOf(W, H, bps, R1) : new Uint8Array(W * H), mask = new Uint8Array(W * H);
  let spriteN = 0, ringN = 0, n = 0;
  for (let i = 0; i < W * H; i++) { if (sprite[i]) spriteN++; if (ring[i]) ringN++; if (sprite[i] || ring[i]) { mask[i] = 1; n++; } }
  return { widthPx: W, heightPx: H, mask, r1Px: R1, spriteCount: spriteN, ringCount: ringN, maskedCount: n,
    rule: 'course.py MASK: owned sprite px (fill holes, dilate 2, cross) OR rings |d - R1| <= 3.5, |d - 2 R1| <= 4.5 px around BasketPoints; R1 = course.py _r1' };
}

// ------------------------------------------------------------------ the second measure: alpha overlay fraction on the same stations

/** Per station: the centre colour, the lateral colours at integer offsets -2w..2w, which samples the mask hides. */
export function samplesAt(c, O, phi, ts, W) {
  const w = W / 2, R = Math.ceil(BACKGROUND_BAND.toW * w), M = 2 * R + 1, N = ts.length, u = unit(phi), n = [-u[1], u[0]], { rgba } = c.raster;
  const rgbAt = (x, y) => [0, 1, 2].map((ch) => { const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, g = (X, Y) => rgba[(clampI(Y, c.H) * c.W + clampI(X, c.W)) * 4 + ch];
    return (1 - fy) * ((1 - fx) * g(x0, y0) + fx * g(x0 + 1, y0)) + fy * ((1 - fx) * g(x0, y0 + 1) + fx * g(x0 + 1, y0 + 1)); });
  const centerRgbLevel = new Float32Array(N * 3), lateralRgbLevel = new Float32Array(N * M * 3), hiddenCenter = new Uint8Array(N), hiddenLateral = new Uint8Array(N * M);
  for (let k = 0; k < N; k++) {
    const cx = O[0] + ts[k] * u[0], cy = O[1] + ts[k] * u[1];
    centerRgbLevel.set(rgbAt(cx, cy), k * 3); hiddenCenter[k] = maskedAt(c, cx, cy) ? 1 : 0;
    for (let j = -R; j <= R; j++) { const x = cx + j * n[0], y = cy + j * n[1], at = k * M + j + R; lateralRgbLevel.set(rgbAt(x, y), at * 3); hiddenLateral[at] = maskedAt(c, x, y) ? 1 : 0; }
  }
  let hidden = 0; for (const x of hiddenCenter) hidden += x;
  return { schema: 'nctk-s6-path-samples@1', stationsCount: N, windowPx: r3(w), lateralReachPx: R, offsetsPx: [-R, R], hiddenCount: hidden,
    layout: 'centerRgbLevel[k*3 + c]; lateralRgbLevel[(k*M + offset + R)*3 + c], M = 2R + 1; hidden* = 1 where the mask hides the sample',
    centerRgbLevel, lateralRgbLevel, hiddenCenter, hiddenLateral };
}

export function overlayAt(s, W, profile) {
  const withProfile = hasOverlay(profile, 'path'), overlay = withProfile ? profile.overlays.path : PROXY_OVERLAY, w = W / 2;
  const alpha = withProfile
    ? { condition: 'alpha profile', mode: 'profile', overlayRgbLevel: overlay.rgb, pathAlphaFrac: overlay.alpha, fitOn: overlay.fitOn ?? null }
    : { condition: 'no alpha profile', mode: 'proxy', reason: profile?.reason ?? (profile ? `profile has no fitted path overlay (${profile.overlays?.path?.reason ?? profile.status ?? 'unknown'})` : 'no profile given'), overlayRgbLevel: PROXY_OVERLAY.rgb, rule: PROXY_OVERLAY.rule };
  const N = s.stationsCount, R = s.lateralReachPx, M = 2 * R + 1, overlayFrac = new Array(N).fill(null), minBg = Math.max(3, Math.ceil(w / 2));
  let noBackground = 0;
  for (let k = 0; k < N; k++) {
    if (s.hiddenCenter[k]) continue;
    const bg = [[], [], []];
    for (let j = -R; j <= R; j++) {
      if (Math.abs(j) <= w || Math.abs(j) > BACKGROUND_BAND.toW * w) continue;
      const at = k * M + j + R; if (s.hiddenLateral[at]) continue;
      for (let ch = 0; ch < 3; ch++) bg[ch].push(s.lateralRgbLevel[at * 3 + ch]);
    }
    if (bg[0].length < minBg) { noBackground++; continue; }
    const f = contractOverlayFraction([0, 1, 2].map((ch) => s.centerRgbLevel[k * 3 + ch]), bg.map(median), overlay);
    if (f != null) overlayFrac[k] = r3(f);
  }
  return { schema: 'nctk-s6-overlay-fraction@1', kind: withProfile ? 'overlay fraction (alpha profile)' : 'PROXY overlay fraction (no alpha profile: white-overlay brightness)', alpha,
    background: BACKGROUND_BAND.rule, stationsCount: N, hiddenCount: s.hiddenCount, noBackgroundCount: noBackground, minBackgroundCount: minBg, overlayFrac };
}

/** Runs of consecutive visible stations that fail; a masked station ends a run (no evidence either way). */
function gapsOf(fail, visible, stepPx) {
  const gaps = []; let start = -1;
  for (let k = 0; k <= fail.length; k++) {
    const lost = k < fail.length && visible[k] && fail[k];
    if (lost) { if (start < 0) start = k; } else if (start >= 0) { gaps.push({ fromStation: start, toStation: k - 1, lengthPx: (k - start) * stepPx }); start = -1; }
  }
  return gaps.sort((a, b) => b.lengthPx - a.lengthPx || a.fromStation - b.fromStation);
}

/** Both measures on the same stations: the edge test (proven) and the overlay fraction (new), with their agreement. */
export function lossAt(c, a) {
  const { originPx: O, phiRad: phi, t0Px, t1Px, stepPx = 1, widthPx: W, profile = null, threshold = null, tauLum = EVIDENCE.tauLum } = a;
  const base = { schema: 'nctk-s6-path-loss-profile@1', originPx: O, phiRad: phi, t0Px, t1Px, stepPx, widthPx: W, tauLum };
  if (!(W > 0)) return { ...base, condition: 'no corridor width', stationsCount: 0 };
  const ts = arange(t0Px, t1Px, stepPx);
  if (!ts.length) return { ...base, condition: `no stations (t0 ${r3(t0Px)} px >= t1 ${r3(t1Px)} px)`, stationsCount: 0 };
  const sc = stationContrastAt(c, O, phi, ts, W), s = samplesAt(c, O, phi, ts, W), ov = overlayAt(s, W, profile);
  const N = ts.length, edgeMinLum = new Array(N), edgeVisible = new Uint8Array(N), edgeFail = new Uint8Array(N);
  let ev = 0, ep = 0;
  for (let k = 0; k < N; k++) {
    edgeVisible[k] = sc.okl[k] && sc.okr[k] ? 1 : 0; const m = Math.min(sc.cl[k], sc.cr[k]); edgeMinLum[k] = edgeVisible[k] ? r3(m) : null;
    if (edgeVisible[k]) { ev++; if (m > tauLum) ep++; else edgeFail[k] = 1; }
  }
  const thr = threshold?.frac, oVis = ov.overlayFrac.map((v) => (v != null ? 1 : 0)), oFail = ov.overlayFrac.map((v) => (v != null && thr != null && v < thr ? 1 : 0));
  const visO = ov.overlayFrac.filter((v) => v != null), op = thr != null ? visO.filter((v) => v >= thr).length : null;
  const both = { edgePassOverlayPass: 0, edgePassOverlayFail: 0, edgeFailOverlayPass: 0, edgeFailOverlayFail: 0 };
  if (thr != null) for (let k = 0; k < N; k++) if (edgeVisible[k] && oVis[k]) both[`edge${edgeFail[k] ? 'Fail' : 'Pass'}Overlay${oFail[k] ? 'Fail' : 'Pass'}`]++;
  const eg = gapsOf(edgeFail, edgeVisible, stepPx), og = gapsOf(oFail, oVis, stepPx);
  return {
    ...base, condition: null, stationsCount: N,
    edge: { measure: `edge test: min-side contrast > ${tauLum} lum (contrast.py station_contrast at W; s7edge)`, visibleCount: ev, passCount: ep, passFrac: ev ? r3(ep / ev) : null, lossFrac: ev ? r3(1 - ep / ev) : null, longestGapPx: eg[0]?.lengthPx ?? 0, gapsCount: eg.length, medianContrastLum: r3(median(edgeMinLum.filter((v) => v != null))) },
    overlay: { measure: ov.kind, alpha: ov.alpha, threshold: threshold ?? null, visibleCount: visO.length, meanOverlayFrac: visO.length ? r3(visO.reduce((x, y) => x + y, 0) / visO.length) : null, medianOverlayFrac: r3(median(visO)),
      passFrac: op != null && visO.length ? r3(op / visO.length) : null, lossFrac: op != null && visO.length ? r3(1 - op / visO.length) : null, longestGapPx: thr != null ? og[0]?.lengthPx ?? 0 : null, gapsCount: thr != null ? og.length : null, noBackgroundCount: ov.noBackgroundCount },
    agreementCounts: thr != null ? both : null,
    stations: { tPx: Array.from(ts, r3), edgeMinLum, overlayFrac: ov.overlayFrac, edgeGapsPx: eg.slice(0, 8), overlayGapsPx: og.slice(0, 8) },
    corridor: corridorOf(s, W)
  };
}
/** The straightened corridor for the render: rows = offset -R..R, columns = station. */
function corridorOf(s, W) {
  const N = s.stationsCount, R = s.lateralReachPx, M = 2 * R + 1, rgb = new Uint8Array(N * M * 3);
  for (let k = 0; k < N; k++) for (let j = 0; j < M; j++) for (let ch = 0; ch < 3; ch++) rgb[(j * N + k) * 3 + ch] = Math.round(s.lateralRgbLevel[(k * M + j) * 3 + ch]);
  return { widthPx: N, heightPx: M, offsetsPx: [-R, R], ribbonHalfPx: r3(W / 2), rgbLevel: rgb, hiddenCenter: s.hiddenCenter, layout: 'rgbLevel[(row*widthPx + col)*3 + c], row = offset + R, col = station' };
}

// ------------------------------------------------------------------ the queries

const rasterOf = (r) => (r && r.rgba && Number.isInteger(r.widthPx) ? r : null);
const cond = (fn, condition) => ({ value: { schema: 'nctk-s6-path@1', condition: `${fn}: ${condition}` }, unit: 'condition' });
const tsOf = (a) => arange(a.t0Px, a.t1Px, a.stepPx ?? 1);
const unpack = (v) => (v ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x instanceof Float64Array ? Array.from(x, (y) => (Number.isNaN(y) ? null : y)) : x instanceof Int32Array ? Array.from(x) : x])) : v);
const q = (fn, unitText, f) => ({ raster, mask = null, ...a }) => (rasterOf(raster) ? { value: f(ctxOf(raster, mask), a), unit: unitText } : cond(fn, "no raster (pass raster: 'px.image.cropped')"));

/** registerQueries(store, PATH_QUERIES): string arguments are Part references, resolved before the math runs. */
export const PATH_QUERIES = Object.freeze({
  'fn.q.path.profile': q('profile', PATH_UNITS.profile, (c, a) => { const p = profileAt(c, a.originPx, a.phiRad, a.t0Px, a.t1Px, { lat0: a.lat0Px ?? 0, step: a.stepPx ?? 1 }); return p.prof ? { offsetsPx: [OFFS[0], OFFS.at(-1), EVIDENCE.offsetsPx.step], profLum: Array.from(p.prof, (y) => (Number.isNaN(y) ? null : y)), okCount: Array.from(p.ok), stationsCount: p.nT } : { condition: 'no stations', stationsCount: 0 }; }),
  'fn.q.path.edgePair': q('edgePair', PATH_UNITS.edgePair, (c, a) => edgePairOf(profileAt(c, a.originPx, a.phiRad, a.t0Px, a.t1Px, { lat0: a.lat0Px ?? 0, step: a.stepPx ?? 1 }), a.widthPx, { tolW: a.tolPx ?? 3, latLim: a.latLimPx ?? 12, minOk: a.minOk ?? EVIDENCE.edgeMinOk }) ?? { condition: 'no edge pair' }),
  'fn.q.path.stationContrast': q('stationContrast', PATH_UNITS.stationContrast, (c, a) => { const r = stationContrastAt(c, a.originPx, a.phiRad, tsOf(a), a.widthPx, { band: a.bandPx ?? EVIDENCE.bandPx, along: a.alongPx ?? EVIDENCE.alongPx }); return { leftLum: Array.from(r.cl), rightLum: Array.from(r.cr), okLeft: Array.from(r.okl), okRight: Array.from(r.okr), stationsCount: r.cl.length }; }),
  'fn.q.path.width': q('width', PATH_UNITS.width, (c, a) => widthSearchAt(c, a.originPx, a.phiRad, a.t0Px, a.t1Px, { widths: a.widthsPx ?? EVIDENCE.widthsPx, tolW: a.tolPx ?? EVIDENCE.widthTolPx, latLim: a.latLimPx ?? EVIDENCE.widthLatPx, minOk: a.minOk ?? EVIDENCE.edgeMinOk }) ?? { condition: 'no edge pair at any width' }),
  'fn.q.path.overlayFraction': q('overlayFraction', PATH_UNITS.overlayFraction, (c, a) => (a.widthPx > 0 ? overlayAt(samplesAt(c, a.originPx, a.phiRad, tsOf(a), a.widthPx), a.widthPx, a.profile ?? null) : { condition: 'no corridor width' })),
  'fn.q.path.samples': q('samples', PATH_UNITS.samples, (c, a) => (a.widthPx > 0 ? samplesAt(c, a.originPx, a.phiRad, tsOf(a), a.widthPx) : { condition: 'no corridor width' })),
  'fn.q.path.loss': q('loss', PATH_UNITS.loss, (c, a) => lossAt(c, a))
});
export const PATH_QUERY_NAMES = Object.freeze(Object.keys(PATH_QUERIES));
export { noProfile, unpack };
