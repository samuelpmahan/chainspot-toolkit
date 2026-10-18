/**
 * fn.q.alpha.*: alpha composition, written once behind the PxC boundary (docs/agents/boundary.md). Browser-safe.
 *
 * The scene (DOCTRINE "The scene") composites translucent sprites over the photo, one rule per pixel
 * (contracts/alpha.profile@1.mjs):   observed = alpha * overlayRgb + (1 - alpha) * background.
 * Across many backgrounds that is a line per channel with ONE slope (1 - alpha) and intercept alpha * rgb, so a set of
 * pixel pairs straddling an overlay edge (inside: overlay over background; outside, at the same angle/station: the
 * same background without it) fixes rgb and alpha. The fills are the best calibration because their geometry is known
 * exactly: centre = BasketPoint, C1 radius R1 (from the rings), C2 radius 2 x R1 (DOCTRINE).
 *
 * Errors in variables: the outside pixel is a neighbour of the inside pixel's background, not the background itself,
 * so ordinary least squares attenuates the slope (alpha comes out high). The fit is Deming (total) least squares with
 * the error-variance ratio (1 - alpha)^2 that the compositing rule implies (inside texture is scaled by 1 - alpha,
 * outside texture is not), iterated; pairs are bin means (a few px of arc x a few px of depth), outliers (spokes,
 * crossing paths, unowned sprites) are trimmed at median + 3 x 1.4826 MAD of the per-pair residual, and the sigmas are
 * a group jackknife (one group per basket / segment: pairs from one basket are not independent).
 *
 * Anti-aliased px are never muted (DOCTRINE): they are excluded from the samples by geometry (the ring stroke +-
 * its AA band, the ribbon edge +- its AA band, every opaque sprite dilated by its AA fringe) and counted.
 *
 *   fitOverlay(pairs)                         { rgb, alpha, sigmaRgb, sigmaAlpha, residualRms, n, ... }
 *   ringScale(raster, centres, opaque)        R1 from the rings: the (R, 2R) radial luminance pair (ringfit.py, ported)
 *   ringSamples(raster, opts)                 bin-mean pairs straddling the C1 or C2 fill edge of every basket
 *   ribbonSamples(raster, opts)               bin-mean pairs straddling the path ribbon edge of straight segments
 *   unmixPx / overlayFractionPx               the contract's pure functions over a pixel list
 */
import { composite, unmix, overlayFraction } from '../../contracts/alpha.profile@1.mjs';
import { ownedPx, forEach, resolvePxSet, isPxSet } from '../pxset.mjs';
import { imageDims, registerQueries } from '../store.mjs';

const r3 = (v) => Math.round(v * 1000) / 1000;
const r2 = (v) => Math.round(v * 100) / 100;
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** GLOBAL screen-px geometry the samples avoid (fg/scene/invariants.mjs SCREEN_PX, ledger): never map-scaled. */
export const ALPHA_GEOMETRY = Object.freeze({
  c1StrokeFwhmPx: 5,       // px: the C1S stroke's full radial influence (FWHM 2.75-3.5 px GLOBAL, + BasketPoint jitter ~1 px);
                           //     golden mean radial profile: excess from -4 to +3 px around R1
  c2StrokeFwhmPx: 9,       // px: the C2D dash's full radial influence (FWHM 3.75-4.0 px + its AA halo; golden profile: -6 to +6 px)
  aaBandPx: 1.5,           // px beyond the stroke half-width: the stroke's anti-aliased blend, excluded
  ribbonAaBandPx: 2.5,     // px either side of the ribbon edge: AA blend + the 0.5 px quantisation of the learned width
  spriteAaFringePx: 2,     // px: opaque sprites (baskets, badges, tees) dilated by their black-outline AA seam (S4 basketFringePx)
  depthPx: 4,              // px: depth of the sample band on each side of an edge (the fit also runs at 2 px: geometry spread)
  binArcPx: 6              // px of arc (or of station) averaged into one pair
});

// ---------------------------------------------------------------------------------------------------------------
// The fit
// ---------------------------------------------------------------------------------------------------------------

/** Sufficient statistics of a pair set (per channel sums), so a jackknife refit is a subtraction. */
function statsOf(pairs) {
  const s = { n: 0, x: [0, 0, 0], y: [0, 0, 0], xx: [0, 0, 0], yy: [0, 0, 0], xy: [0, 0, 0], vi: 0, vo: 0, np: 0 };
  for (const p of pairs) addTo(s, p, 1);
  return s;
}
function addTo(s, p, w) {
  s.n += w;
  if (p.varIn != null && p.varOut != null) { s.vi += w * (p.px ?? 1) * p.varIn; s.vo += w * (p.px ?? 1) * p.varOut; s.np += w * (p.px ?? 1); }
  for (let c = 0; c < 3; c++) { const x = p.out[c], y = p.in[c]; s.x[c] += w * x; s.y[c] += w * y; s.xx[c] += w * x * x; s.yy[c] += w * y * y; s.xy[c] += w * x * y; }
}
const minus = (a, b) => ({ n: a.n - b.n, vi: a.vi - b.vi, vo: a.vo - b.vo, np: a.np - b.np, ...Object.fromEntries(['x', 'y', 'xx', 'yy', 'xy'].map((k) => [k, a[k].map((v, c) => v - b[k][c])])) });

/** Pooled (over the three channels) centred moments: the lever Sxx, the covariance Sxy, Syy, and the means. */
function moments(s) {
  let Sxx = 0, Syy = 0, Sxy = 0;
  const mx = s.x.map((v) => v / s.n), my = s.y.map((v) => v / s.n);
  for (let c = 0; c < 3; c++) { Sxx += s.xx[c] - s.n * mx[c] * mx[c]; Syy += s.yy[c] - s.n * my[c] * my[c]; Sxy += s.xy[c] - s.n * mx[c] * my[c]; }
  return { Sxx, Syy, Sxy, mx, my };
}

/**
 * One shared slope (1 - alpha) across the three channels, per-channel intercepts (alpha * rgb).
 *   calibrated  slope = OLS slope at the edge / OLS slope at a control edge of the same geometry whose true slope is
 *               exactly 1 (both sides under the same overlays): the reliability ratio of errors-in-variables, measured
 *               on the same image instead of assumed (the outside px is a neighbour of the background, not the background)
 *   deming      total least squares with error-variance ratio (1 - alpha)^2, iterated (assumes equal texture noise)
 *   ols         ordinary least squares (attenuated: alpha comes out high on textured backgrounds)
 */
function solve(s, { method = 'calibrated', control = null, iterations = 8 } = {}) {
  if (s.n < 2) return null;
  const { Sxx, Syy, Sxy, mx, my } = moments(s);
  if (method !== 'contrast' && (Sxx <= 1e-9 || Math.abs(Sxy) <= 1e-9)) return null;
  const ols = Sxx > 1e-9 ? Sxy / Sxx : NaN;
  let slope = ols, reliability = null;
  if (method === 'contrast') {
    if (!(s.vo > MIN_TEXTURE_VAR * s.np)) return null;   // no texture to compare (flat terrain): undecidable here
    slope = Math.sqrt(s.vi / s.vo);
    if (control) { if (!(control.vo > 1e-9) || !(control.vi > 1e-9)) return null; reliability = Math.sqrt(control.vi / control.vo); slope /= reliability; }
  } else if (method === 'calibrated') {
    if (!control || control.n < 2) return null;
    const c = moments(control);
    if (c.Sxx <= 1e-9) return null;
    reliability = c.Sxy / c.Sxx;
    if (!(reliability > 0.05)) return null;
    slope = ols / reliability;
  } else if (method === 'deming') {
    for (let k = 0; k < iterations; k++) {
      const d = Math.max(1e-4, slope * slope), q = Syy - d * Sxx;
      slope = (q + Math.sqrt(q * q + 4 * d * Sxy * Sxy)) / (2 * Sxy);
    }
  }
  const alpha = 1 - slope, k = my.map((m, c) => m - slope * mx[c]);
  return { alpha, rgb: k.map((v) => (Math.abs(alpha) > 1e-6 ? v / alpha : NaN)), slope, k, alphaOls: 1 - ols, reliability };
}

const residualOf = (fit, p) => { let e = 0; for (let c = 0; c < 3; c++) { const r = p.in[c] - (fit.slope * p.out[c] + fit.k[c]); e += r * r; } return Math.sqrt(e / 3); };
const groupJackknife = (pairs) => {
  const real = new Set(pairs.map((p) => p.group ?? null)), useReal = real.size >= 3 && !real.has(null);
  return { key: (p, i) => (useReal ? p.group : i % 10), rule: useReal ? 'group jackknife (one group per basket / segment)' : 'jackknife over 10 interleaved pseudo-groups' };
};
function trim(pairs, fitOf, { trimK, maxTrim, minPairs }) {
  let kept = pairs, fit = fitOf(kept);
  if (!fit) return { kept, fit };
  for (let it = 0; it < maxTrim; it++) {
    const res = kept.map((p) => residualOf(fit, p)), m = median(res), mad = median(res.map((r) => Math.abs(r - m))) * 1.4826;
    const lim = m + trimK * Math.max(mad, 1e-6), next = kept.filter((_, i) => res[i] <= lim);
    if (next.length === kept.length || next.length < minPairs) break;
    const f = fitOf(next); if (!f) break;
    kept = next; fit = f;
  }
  return { kept, fit };
}

/**
 * Solve observed = a * rgb + (1 - a) * bg for one rgb and one alpha over many backgrounds.
 * pairs: [{ in: [r, g, b] (overlay over bg), out: [r, g, b] (the bg beside it), group? }]; control: pairs of the same
 * geometry straddling no edge (method 'calibrated', the default when control is given). Outliers trimmed at median +
 * trimK x 1.4826 MAD of the per-pair residual (edge and control separately); sigmas: group jackknife. Total: a data
 * condition is returned as { status: 'not fitted', reason }, never thrown.
 */
export const RELIABLE_REGRESSION = 0.95;
export const MIN_TEXTURE_VAR = 4;          // RGB levels^2 per px: below it the outside band has no texture to scale (flat terrain)   // control OLS slope at or above which the outside mean IS the background (flat terrain)

export function fitOverlay(pairs, opts = {}) {
  const { control = null, method = 'auto' } = opts;
  if (method !== 'auto') return fitOverlayBy(pairs, opts);
  // auto: the control edge says whether regression is safe. Its OLS slope (true slope 1) is the reliability of the
  // outside mean as a stand-in for the background: >= RELIABLE_REGRESSION (flat terrain) -> calibrated regression;
  // below (texture) -> texture contrast, which does not need the outside px to be the background.
  const rel = Array.isArray(control) && control.length >= 2 ? solve(statsOf(control), { method: 'ols' })?.slope ?? null : null;
  const pick = rel != null && rel >= RELIABLE_REGRESSION ? 'calibrated' : 'contrast';
  const f = fitOverlayBy(pairs, { ...opts, method: pick });
  const why = rel == null ? 'no control: texture contrast' : `control reliability ${r3(rel)} ${pick === 'calibrated' ? '>=' : '<'} ${RELIABLE_REGRESSION}: ${pick === 'calibrated' ? 'regression calibrated by the control' : 'texture contrast calibrated by the control'}`;
  if (f.status && pick === 'contrast') { const g = fitOverlayBy(pairs, { ...opts, method: control ? 'calibrated' : 'ols' }); if (!g.status) return { ...g, methodWhy: `${why}; contrast not fitted (${f.reason}), fell back to ${g.method}` }; }
  return { ...f, methodWhy: why };
}

function fitOverlayBy(pairs, { control = null, method = 'contrast', trimK = 3, maxTrim = 6, minPairs = 12 } = {}) {
  const given = pairs?.length ?? 0;
  if (!Array.isArray(pairs) || pairs.length < minPairs) return { status: 'not fitted', reason: `${pairs?.length ?? 0} sample pairs (< ${minPairs})`, n: pairs?.length ?? 0 };
  if (method === 'calibrated' && (!Array.isArray(control) || control.length < minPairs)) return { status: 'not fitted', reason: `${control?.length ?? 0} control pairs (< ${minPairs}): no reliability to calibrate with`, n: pairs.length };
  const opts = { trimK, maxTrim, minPairs };
  if (method === 'contrast') {
    // texture contrast: a bin whose inside / outside variance ratio is an outlier (a spoke, a crossing path edge, an
    // unowned sprite) is trimmed in log space first, so one bright line cannot dominate the pooled variance
    const lr = (p) => Math.log((p.varIn + 1e-3) / (p.varOut + 1e-3));
    const cut = (ps) => { const v = ps.map(lr), m = median(v), mad = 1.4826 * median(v.map((x) => Math.abs(x - m))); return ps.filter((p, i) => Math.abs(v[i] - m) <= trimK * Math.max(mad, 1e-6)); };
    pairs = cut(pairs.filter((p) => p.varIn != null && p.varOut != null));
    if (control) control = cut(control.filter((p) => p.varIn != null && p.varOut != null));
    if (pairs.length < minPairs) return { status: 'not fitted', reason: `${pairs.length} pairs with texture contrast after trimming (< ${minPairs})`, n: pairs.length };
  }
  const ctl = method === 'calibrated' ? trim(control, (ps) => solve(statsOf(ps), { method: 'ols' }), opts).kept : method === 'contrast' && control ? control : null;
  const ctlStats = ctl ? statsOf(ctl) : null;
  const { kept, fit } = trim(pairs, (ps) => solve(statsOf(ps), { method, control: ctlStats }), opts);
  if (!fit) return { status: 'not fitted', reason: 'degenerate: the backgrounds do not vary (no lever on the slope)', n: pairs.length };
  const all = statsOf(kept), J = groupJackknife(kept);
  const groups = new Map(); kept.forEach((p, i) => { const g = J.key(p, i); if (!groups.has(g)) groups.set(g, { e: [], c: [] }); groups.get(g).e.push(p); });
  if (ctl) ctl.forEach((p, i) => { const g = J.key(p, i); if (groups.has(g)) groups.get(g).c.push(p); });
  const loo = [...groups.values()].map(({ e, c }) => solve(minus(all, statsOf(e)), { method, control: ctlStats ? minus(ctlStats, statsOf(c)) : null })).filter(Boolean);
  const G = loo.length, jk = (f) => { if (G < 2) return null; const v = loo.map(f), m = v.reduce((a, b) => a + b, 0) / G; return Math.sqrt(((G - 1) / G) * v.reduce((a, b) => a + (b - m) ** 2, 0)); };
  const res = kept.map((p) => residualOf(fit, p));
  const residualRms = Math.sqrt(res.reduce((a, r) => a + r * r, 0) / res.length);
  const sd = (f) => (jk(f) == null ? null : jk(f));
  return {
    rgb: fit.rgb.map(r2), alpha: r3(fit.alpha), sigmaRgb: [0, 1, 2].map((c) => (sd((f) => f.rgb[c]) == null ? null : r2(sd((f) => f.rgb[c])))), sigmaAlpha: sd((f) => f.alpha) == null ? null : r3(sd((f) => f.alpha)),
    residualRms: r2(residualRms), n: kept.length, trimmedPairs: given - kept.length, controlPairs: ctl?.length ?? 0, trimmedControlPairs: ctl ? control.length - ctl.length : 0,
    reliability: fit.reliability == null ? null : r3(fit.reliability), groups: G, jackknife: J.rule,
    alphaOls: r3(fit.alphaOls), method, residuals: res.map(r2)
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Geometry: opaque sprites, their AA fringe, and the pixel reads
// ---------------------------------------------------------------------------------------------------------------

const rgbAt = (img, x, y) => { const i = (y * img.widthPx + x) * 4; return [img.rgba[i], img.rgba[i + 1], img.rgba[i + 2]]; };
const lumAt = (img, x, y) => { const i = (y * img.widthPx + x) * 4; return (img.rgba[i] + img.rgba[i + 1] + img.rgba[i + 2]) / 3; };

/**
 * Opaque sprites as a plane: 1 = owned by a sprite (every pixel list its Part owns, ownedPx), 2 = its AA fringe (within
 * spriteAaFringePx, Euclidean, of an owned px and not owned): the seam is not muted, it is kept out of the samples and
 * counted. sprites: arrays of Parts (px.baskets, px.badges, px.tees, ...).
 */
const OPAQUE_MEMO = new WeakMap();
export function opaquePlane(img, spriteLists, { fringePx = ALPHA_GEOMETRY.spriteAaFringePx } = {}) {
  const key = spriteLists[0] ?? img;
  const memo = OPAQUE_MEMO.get(img)?.get(key);
  if (memo && memo.lists.length === spriteLists.length && memo.lists.every((l, i) => l === spriteLists[i])) return memo.plane;
  const W = img.widthPx, H = img.heightPx, plane = new Uint8Array(W * H);
  let owned = 0, fringe = 0;
  for (const list of spriteLists) for (const part of list ?? []) {
    const set = isPxSet(part) ? part : ownedPx(W, H, part);
    forEach(set, (i) => { if (!plane[i]) { plane[i] = 1; owned++; } });
  }
  const f = Math.ceil(fringePx), f2 = fringePx * fringePx;
  for (let i = 0; i < W * H; i++) {
    if (plane[i] !== 1) continue;
    const x = i % W, y = (i / W) | 0;
    for (let dy = -f; dy <= f; dy++) for (let dx = -f; dx <= f; dx++) {
      if (dx * dx + dy * dy > f2) continue;
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx; if (!plane[j]) { plane[j] = 2; fringe++; }
    }
  }
  const out = { plane, ownedPx: owned, fringePx: fringe, rule: `sprite px (ownedPx) + an AA fringe of ${fringePx} px (Euclidean), excluded from samples, never muted` };
  if (!OPAQUE_MEMO.has(img)) OPAQUE_MEMO.set(img, new Map());
  OPAQUE_MEMO.get(img).set(key, { lists: [...spriteLists], plane: out });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// R1 from the rings only (DOCTRINE: scale comes from the rings; C2 = 2 x C1 exactly)
// ---------------------------------------------------------------------------------------------------------------

/**
 * The (R, 2R) pair that maximises the summed excess radial luminance around every BasketPoint, opaque sprites and their
 * fringe masked (docs/evidence/scene/ringfit.py, ported): radial profile = mean over baskets of the median luminance on
 * the circle; excess = profile - its running median over 10 px; each ring then refined to its own local peak (+-3 px),
 * so the 2x ratio is measured, not imposed. Radii are searched over [6 px, min(W, H) / 3]: bounded by the image, never
 * by an absolute map-scaled px bound.
 */
export function ringScale(img, centres, opaque, { stepPx = 0.25, angleStepDeg = 1 } = {}) {
  if (!centres.length) return { status: 'not fitted', reason: 'no BasketPoints: no rings to measure' };
  const W = img.widthPx, H = img.heightPx, rMax = Math.min(W, H) / 3, plane = opaque.plane;
  const rs = []; for (let r = 6; r <= rMax; r += stepPx) rs.push(r);
  const nA = Math.round(360 / angleStepDeg), cs = [], sn = [];
  for (let k = 0; k < nA; k++) { const t = (k * angleStepDeg * Math.PI) / 180; cs.push(Math.cos(t)); sn.push(Math.sin(t)); }
  const prof = rs.map((r) => {
    let sum = 0, cnt = 0;
    for (const [bx, by] of centres) {
      const vals = [];
      for (let k = 0; k < nA; k++) {
        const x = Math.round(bx + r * cs[k]), y = Math.round(by + r * sn[k]);
        if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1 || plane[y * W + x]) continue;
        vals.push(lumAt(img, x, y));
      }
      if (vals.length > nA / 9) { sum += median(vals); cnt++; }
    }
    return cnt ? sum / cnt : NaN;
  });
  const half = Math.round(5 / stepPx), base = prof.map((_, i) => median(prof.slice(Math.max(0, i - half), i + half + 1).filter(Number.isFinite)) ?? 0);
  const e = prof.map((v, i) => (Number.isFinite(v) ? v - base[i] : -9));
  const idx = (r) => Math.max(0, Math.min(rs.length - 1, Math.round((r - rs[0]) / stepPx)));
  let best = null;
  rs.forEach((r, i) => { if (r < 12 || 2 * r > rs.at(-1)) return; const sc = e[i] + e[idx(2 * r)]; if (!best || sc > best.sc) best = { sc, i }; });
  if (!best) return { status: 'not fitted', reason: 'image too small for a (R, 2R) ring pair' };
  const refine = (i) => { const w = Math.round(3 / stepPx); let b = i; for (let j = Math.max(0, i - w); j <= Math.min(rs.length - 1, i + w); j++) if (e[j] > e[b]) b = j; return b; };
  const i1 = refine(best.i), i2 = refine(idx(2 * rs[best.i]));
  const fwhm = (i) => { const h = e[i] / 2; let l = i, r = i; while (l > 0 && e[l] > h) l--; while (r < e.length - 1 && e[r] > h) r++; return r3(rs[r] - rs[l]); };
  return { r1Px: r3(rs[i1]), r2Px: r3(rs[i2]), ratio: r3(rs[i2] / rs[i1]), c1StrokeFwhmPx: fwhm(i1), c2StrokeFwhmPx: fwhm(i2),
    c1ExcessLum: r2(e[i1]), c2ExcessLum: r2(e[i2]), baskets: centres.length, rule: 'radial luminance excess around every BasketPoint; best (R, 2R) pair, each refined to its own peak (ringfit.py)' };
}

// ---------------------------------------------------------------------------------------------------------------
// Samples straddling a known edge
// ---------------------------------------------------------------------------------------------------------------

/** One bin: sums and sums of squares of the inside and outside px, so a pair carries its means and its texture contrast. */
function binAcc() {
  const si = [0, 0, 0], so = [0, 0, 0], qi = [0, 0, 0], qo = [0, 0, 0]; let n = 0;
  return {
    get n() { return n; },
    add(a, z) { for (let c = 0; c < 3; c++) { si[c] += a[c]; so[c] += z[c]; qi[c] += a[c] * a[c]; qo[c] += z[c] * z[c]; } n++; },
    pair(extra) {
      const mi = si.map((v) => v / n), mo = so.map((v) => v / n);
      const v = (q, m) => Math.max(0, q.reduce((acc, x, c) => acc + x / n - m[c] * m[c], 0) / 3);
      return { in: mi, out: mo, varIn: v(qi, mi), varOut: v(qo, mo), px: n, ...extra };
    }
  };
}

/**
 * Pairs straddling the C1 (ring 'c1', radius R1) or C2 (ring 'c2', radius 2 x R1) fill edge of every basket: inside at
 * radius R - e - d, outside at R + e + d (d = 0..depth-1 px, e = stroke half-width + AA band), same angle, nearest
 * pixel; averaged into bins of binArcPx of arc. A sample is dropped when it is on an opaque sprite or its AA fringe,
 * outside the image, or on any ring stroke (+- AA) of ANY basket; a pair is dropped when another basket's C1 or C2
 * disc holds one side and not the other (its fill edge lies between them). Counts say how many px each rule excluded.
 */
export function ringSamples(img, { centres, r1Px, ring = 'c1', opaque, names = null, geometry = ALPHA_GEOMETRY, edgeRadiusPx = null }) {
  const W = img.widthPx, H = img.heightPx, plane = opaque.plane;
  const R = edgeRadiusPx ?? (ring === 'c1' ? r1Px : 2 * r1Px);
  const e = (ring === 'c1' ? geometry.c1StrokeFwhmPx : geometry.c2StrokeFwhmPx) / 2 + geometry.aaBandPx;
  const strokeBand = [[r1Px, geometry.c1StrokeFwhmPx / 2 + geometry.aaBandPx], [2 * r1Px, geometry.c2StrokeFwhmPx / 2 + geometry.aaBandPx]];
  const counts = { candidatePx: 0, spritePx: 0, spriteAaFringePx: 0, ringStrokeAaPx: 0, outsideImagePx: 0, crossesOtherFillEdgePx: 0, keptPx: 0 };
  const onAnyStroke = (x, y) => centres.some(([cx, cy]) => { const d = Math.hypot(x - cx, y - cy); return strokeBand.some(([rr, hw]) => Math.abs(d - rr) <= hw); });
  const pairs = [];
  const nBins = Math.max(8, Math.round((2 * Math.PI * R) / geometry.binArcPx)), perBin = Math.max(1, Math.round(geometry.binArcPx));
  centres.forEach(([cx, cy], b) => {
    for (let bin = 0; bin < nBins; bin++) {
      const acc = binAcc();
      for (let k = 0; k < perBin; k++) {
        // arc-matched: the same arc offset u (px) on both circles, so inside and outside samples are spaced alike
        const tc = ((bin + 0.5) / nBins) * 2 * Math.PI, u = k + 0.5 - perBin / 2;
        for (let d = 0; d < geometry.depthPx; d++) {
          counts.candidatePx += 2;
          const ri = R - e - d, ro = R + e + d;
          if (ri <= 1) continue;
          const ti = tc + u / ri, to = tc + u / ro;
          const pi = [Math.round(cx + ri * Math.cos(ti)), Math.round(cy + ri * Math.sin(ti))], po = [Math.round(cx + ro * Math.cos(to)), Math.round(cy + ro * Math.sin(to))];
          let bad = false;
          for (const [x, y] of [pi, po]) {
            if (x < 0 || y < 0 || x >= W || y >= H) { counts.outsideImagePx++; bad = true; continue; }
            const o = plane[y * W + x];
            if (o === 1) { counts.spritePx++; bad = true; } else if (o === 2) { counts.spriteAaFringePx++; bad = true; } else if (onAnyStroke(x, y)) { counts.ringStrokeAaPx++; bad = true; }
          }
          if (bad) continue;
          const crosses = centres.some(([ox, oy], j) => j !== b && [r1Px, 2 * r1Px].some((rr) => (Math.hypot(pi[0] - ox, pi[1] - oy) <= rr) !== (Math.hypot(po[0] - ox, po[1] - oy) <= rr)));
          if (crosses) { counts.crossesOtherFillEdgePx += 2; continue; }
          acc.add(rgbAt(img, pi[0], pi[1]), rgbAt(img, po[0], po[1]));
          counts.keptPx += 2;
        }
      }
      if (acc.n >= Math.max(2, (perBin * geometry.depthPx) / 3)) pairs.push(acc.pair({ group: names?.[b] ?? `basket ${b}`, at: [r2(cx + R * Math.cos(((bin + 0.5) / nBins) * 2 * Math.PI)), r2(cy + R * Math.sin(((bin + 0.5) / nBins) * 2 * Math.PI))] }));
    }
  });
  return { pairs, counts, ring, radiusPx: r3(R), edgeGapPx: r3(e), rule: `inside r = R - ${r3(e)} - d, outside r = R + ${r3(e)} + d, d = 0..${geometry.depthPx - 1} px; bins of ${geometry.binArcPx} px of arc` };
}

/**
 * Pairs straddling the path ribbon edge along straight segments (Sam: the tee -> badge segment is straight hallway):
 * at stations every binArcPx along a -> b, on both sides, inside at |l| = W/2 - e - d, outside at W/2 + e + d. Samples
 * on opaque sprites (+ AA fringe), outside the image, or inside any basket's C2 disc (+ its stroke band: the fills
 * would sit on one side only) are dropped and counted. segments: [{ a: [x, y], b: [x, y], name, from?, to? }] with
 * from / to the station range (px along a -> b).
 */
export function ribbonSamples(img, { segments, widthPx, opaque, centres = [], r1Px = 0, geometry = ALPHA_GEOMETRY, edgeOffsetPx = null }) {
  const W = img.widthPx, H = img.heightPx, plane = opaque.plane, e = geometry.ribbonAaBandPx, half = edgeOffsetPx ?? widthPx / 2;
  const discR = 2 * r1Px + geometry.c2StrokeFwhmPx / 2 + geometry.aaBandPx;
  const counts = { candidatePx: 0, spritePx: 0, spriteAaFringePx: 0, fillDiscPx: 0, outsideImagePx: 0, keptPx: 0 };
  const pairs = [];
  if (!(half - e - geometry.depthPx > 0)) return { pairs, counts, rule: `ribbon too narrow (${widthPx} px) for a ${geometry.depthPx} px band inside its AA edge` };
  for (const s of segments) {
    const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    const t0 = s.from ?? 0, t1 = s.to ?? L;
    for (let t = t0; t + geometry.binArcPx <= t1; t += geometry.binArcPx) for (const sg of [1, -1]) {
      const acc = binAcc();
      for (let k = 0; k < geometry.binArcPx; k++) for (let d = 0; d < geometry.depthPx; d++) {
        counts.candidatePx += 2;
        const cx = s.a[0] + ux * (t + k + 0.5), cy = s.a[1] + uy * (t + k + 0.5);
        const pi = [Math.round(cx + sg * nx * (half - e - d)), Math.round(cy + sg * ny * (half - e - d))], po = [Math.round(cx + sg * nx * (half + e + d)), Math.round(cy + sg * ny * (half + e + d))];
        let bad = false;
        for (const [x, y] of [pi, po]) {
          if (x < 0 || y < 0 || x >= W || y >= H) { counts.outsideImagePx++; bad = true; continue; }
          const o = plane[y * W + x];
          if (o === 1) { counts.spritePx++; bad = true; } else if (o === 2) { counts.spriteAaFringePx++; bad = true; } else if (centres.some(([bx, by]) => Math.hypot(x - bx, y - by) <= discR)) { counts.fillDiscPx++; bad = true; }
        }
        if (bad) continue;
        acc.add(rgbAt(img, pi[0], pi[1]), rgbAt(img, po[0], po[1]));
        counts.keptPx += 2;
      }
      if (acc.n >= Math.max(2, (geometry.binArcPx * geometry.depthPx) / 3)) pairs.push(acc.pair({ group: s.name, at: [r2(s.a[0] + ux * t), r2(s.a[1] + uy * t)] }));
    }
  }
  return { pairs, counts, widthPx, edgeGapPx: e, rule: `inside |l| = W/2 - ${e} - d, outside |l| = W/2 + ${e} + d, d = 0..${geometry.depthPx - 1} px, W = ${widthPx} px; stations every ${geometry.binArcPx} px` };
}

// ---------------------------------------------------------------------------------------------------------------
// The contract's pure functions over a pixel list
// ---------------------------------------------------------------------------------------------------------------

const pixelIndices = (px) => { if (isPxSet(px)) { const out = []; forEach(px, (i) => out.push(i)); return out; } return Array.from(px ?? []); };

/** Background behind each px of the list under one overlay; null for an opaque overlay (alpha 1). */
export function unmixPx(img, px, overlay) {
  const list = pixelIndices(px), W = img.widthPx;
  return list.map((i) => unmix(rgbAt(img, i % W, (i / W) | 0), overlay));
}

/** The overlay fraction each px carries, given one background rgb or one per px. */
export function overlayFractionPx(img, px, background, overlay) {
  const list = pixelIndices(px), W = img.widthPx, per = Array.isArray(background?.[0]);
  return list.map((i, k) => overlayFraction(rgbAt(img, i % W, (i / W) | 0), per ? background[k] : background, overlay));
}

export { composite };

// ---------------------------------------------------------------------------------------------------------------
// The queries
// ---------------------------------------------------------------------------------------------------------------

const summary = (v) => { const ok = v.filter((x) => x != null); return { n: v.length, defined: ok.length, median: ok.length ? r3(median(ok)) : null, mean: ok.length ? r3(ok.reduce((a, b) => a + b, 0) / ok.length) : null }; };

/** Raster indices of opaque sprite px (owned, not the fringe) in a size x size window: what a render keeps as drawn. */
export function spritesInWindow(img, opaque, centre, size) {
  const W = img.widthPx, H = img.heightPx, out = [], x0 = Math.round(centre[0] - size / 2), y0 = Math.round(centre[1] - size / 2);
  for (let y = Math.max(0, y0); y < Math.min(H, y0 + size); y++) for (let x = Math.max(0, x0); x < Math.min(W, x0 + size); x++) if (opaque.plane[y * W + x] === 1) out.push(y * W + x);
  return out;
}

export const ALPHA_QUERIES = Object.freeze({
  'fn.q.alpha.spritesInWindow': ({ raster, sprites, centre, size }) => ({ value: spritesInWindow(raster, opaquePlane(raster, sprites), centre, size), unit: 'raster indices (canonical S0-cropped frame) of opaque sprite px in the window' }),
  // arguments that are strings are Part references, resolved before the math runs (a PixelSet, a Part value, ...)
  'fn.q.alpha.fitOverlay': ({ pairs, options = {} }) => {
    const f = fitOverlay(pairs, options);
    const { residuals, ...value } = f;
    return { value: { ...value, residualHistogram: residuals ? histogram(residuals) : null }, unit: 'rgb: RGB levels 0-255; alpha: fraction 0-1; sigmas: same units (jackknife); residualRms: RGB levels; n: pairs (bin means)' };
  },
  'fn.q.alpha.unmix': ({ raster, px, overlay }) => {
    const v = unmixPx(raster, px, overlay);
    return { value: v.map((c) => (c ? c.map(r2) : null)), unit: 'RGB levels 0-255 per px (the background behind the overlay); null where the overlay is opaque' };
  },
  'fn.q.alpha.overlayFraction': ({ raster, px, background, overlay }) => {
    const v = overlayFractionPx(raster, px, background, overlay);
    return { value: { fractions: v.map((x) => (x == null ? null : r3(x))), summary: summary(v) }, unit: 'fraction 0-1 of overlay per px; null where the background equals the overlay colour' };
  },
  'fn.q.alpha.ringScale': ({ raster, centres, sprites }) => {
    const v = ringScale(raster, centres, opaquePlane(raster, sprites));
    return { value: v, unit: 'px (radii, stroke FWHM, in the canonical S0-cropped frame); ratio; excess luminance in RGB levels' };
  },
  'fn.q.alpha.ringSamples': ({ raster, centres, sprites, r1Px, ring, names = null, geometry = {}, edgeRadiusPx = null }) => {
    const v = ringSamples(raster, { centres, r1Px, ring, opaque: opaquePlane(raster, sprites), names, geometry: { ...ALPHA_GEOMETRY, ...geometry }, edgeRadiusPx });
    return { value: v, unit: 'pairs of bin-mean RGB levels (inside, outside); counts in px' };
  },
  'fn.q.alpha.ribbonSamples': ({ raster, segments, widthPx, sprites, centres = [], r1Px = 0, geometry = {}, edgeOffsetPx = null }) => {
    const v = ribbonSamples(raster, { segments, widthPx, opaque: opaquePlane(raster, sprites), centres, r1Px, geometry: { ...ALPHA_GEOMETRY, ...geometry }, edgeOffsetPx });
    return { value: v, unit: 'pairs of bin-mean RGB levels (inside, outside); counts in px' };
  }
});

/** Residuals (RGB levels) as a histogram: 1-level bins up to the 99th percentile, the rest in the last bin. */
export function histogram(values, { binWidth = 1 } = {}) {
  if (!values.length) return { binWidth, counts: [], unit: 'pairs per bin of residual (RGB levels)' };
  const s = [...values].sort((a, b) => a - b), top = Math.ceil(s[Math.floor(0.99 * (s.length - 1))] / binWidth) + 1;
  const counts = new Array(top + 1).fill(0);
  for (const v of values) counts[Math.min(top, Math.floor(v / binWidth))]++;
  return { binWidth, counts, overflowFrom: top * binWidth, unit: 'pairs per bin of residual (RGB levels)' };
}

/**
 * Register fn.q.alpha.* on a store. A string argument is a Part reference: `address#...` resolves to a PixelSet
 * (fg/pxset.mjs resolvePxSet), a plain address to the Part's value. `sprites` may be a list of addresses.
 */
export function registerAlphaQueries(store) {
  // a string that names a Part on the store is a reference; any other string ('c1', a name) is a plain argument
  const resolve = (ref) => { const s = String(ref), a = s.split('#')[0]; if (!store.has(a)) return ref; return s.includes('#') ? resolvePxSet((x) => store.get(x), s, () => imageDims(store)) : store.get(s); };
  const wrapped = Object.fromEntries(Object.entries(ALPHA_QUERIES).map(([fn, q]) => [fn, (args, raw) => q({ ...args, sprites: Array.isArray(raw.sprites) ? raw.sprites.map((a) => (typeof a === 'string' ? resolve(a) : a)) : args.sprites }, raw)]));
  registerQueries(store, wrapped, { resolve, note: 'alpha composition behind the PxC boundary (fg/alpha/alphaSpace.mjs)' });
}
