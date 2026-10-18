/**
 * fn.q.path.*: the hole-path measurement along a segment, written once behind the PxC boundary (docs/agents/boundary.md;
 * scaffolded by `node scripts/pxc.mjs scaffold query path`). Browser-safe.
 *
 * The scene (DOCTRINE): the hole path is a semi-transparent grey ribbon composited over the photo. Along a straight
 * hole it runs from the tee to the basket without leaving the segment (S6: "straight holes are the trivial case:
 * objective path loss along tee to basket; learn the course-local path transparency profile there"). These questions
 * measure how much path overlay each pixel on a segment carries; nothing here decides straight or bent.
 *
 * State is an argument, never a global. Every question takes:
 *   raster    Part reference (string) to the canonical pixels: 'px.image.cropped' ({ rgba, widthPx, heightPx })
 *   opaque    Part reference (string) to a Part carrying `occ`, one byte per raster px, nonzero where an opaque sprite
 *             covers it ('tk.s4.evidence'); null = no opaque plane (nothing is hidden)
 *   segment   { fromPx: [x, y], toPx: [x, y] }: tee centre -> basket point, canonical px
 *   windowPx  w = half the corridor width (px): the ribbon is the lateral band |offset| <= w
 *   profile   the tk.s7.alphaProfile value (contracts/alpha.profile@1) or null / a noProfile condition
 *   threshold (loss only) { frac, rule }: a pixel whose overlay fraction is below frac is lost
 *
 *   fn.q.path.samples          one sample per 1 px of segment length: its centre colour and the lateral colours at
 *                              integer offsets -2w..2w px across it (bilinear over every raster px, AA blend included:
 *                              nothing is muted); which samples an opaque sprite hides
 *   fn.q.path.overlayFraction  per sample, the fraction of path overlay the centre pixel carries:
 *                              overlayFraction(observed, background, profile.overlays.path) (the contract's least-squares
 *                              alpha), background = per-channel median of the visible lateral samples outside the ribbon
 *                              (w < |offset| <= 2w). Without a profile: the recorded condition `no alpha profile` and a
 *                              PROXY, the same least-squares alpha against a white overlay (rgb 255, 255, 255): the
 *                              ribbon's brightness over its own background, not its alpha
 *   fn.q.path.loss             the loss profile: lossFrac (fraction of the visible segment length whose overlay fraction
 *                              is below the threshold), longestGapPx, meanOverlayFrac, the gaps, plus the profile above
 *
 * Data conditions (a degenerate segment, no corridor width, no background, no threshold) are recorded in the answer,
 * never thrown. registerQueries (fg/store.mjs) caches each answer by its arguments and profiles each call.
 */
import { overlayFraction as contractOverlayFraction, hasOverlay, noProfile } from '../../contracts/alpha.profile@1.mjs';

const r3 = (v) => (v == null || Number.isNaN(v) ? null : Math.round(v * 1000) / 1000);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };

/** The overlay a proxy assumes when no alpha profile exists: white. Its "fraction" is brightness, not alpha. */
export const PROXY_OVERLAY = Object.freeze({ rgb: Object.freeze([255, 255, 255]), rule: 'proxy: least-squares alpha against a WHITE overlay (no fitted path colour); a brightness measure, not the path alpha' });
/** The background band, in multiples of w: outside the ribbon, inside the sampled strip. */
export const BACKGROUND_BAND = Object.freeze({ fromW: 1, toW: 2, rule: 'background = per-channel median of the visible lateral samples with w < |offset| <= 2w' });

export const PATH_UNITS = Object.freeze({
  samples: 'per sample: centre RGB level and lateral RGB level at offsetsPx (px across the segment); 1 px of segment length per sample',
  overlayFraction: 'fraction (0..1) of path overlay per sample (alpha, or the white-overlay proxy when no profile)',
  loss: 'lossFrac fraction of the visible segment length; longestGapPx px; meanOverlayFrac fraction'
});

/** Bilinear RGB at (x, y), 0..255 per channel; null off the raster. */
function rgbAt({ rgba, widthPx: W, heightPx: H }, x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  if (x0 < 0 || y0 < 0 || x0 >= W || y0 >= H || (fx > 0 && x0 + 1 >= W) || (fy > 0 && y0 + 1 >= H)) return null;
  const out = [0, 0, 0];
  const w = [[x0, y0, (1 - fx) * (1 - fy)], [x0 + 1, y0, fx * (1 - fy)], [x0, y0 + 1, (1 - fx) * fy], [x0 + 1, y0 + 1, fx * fy]];
  for (const [X, Y, k] of w) {
    if (!k) continue;
    const i = (Y * W + X) * 4;
    out[0] += rgba[i] * k; out[1] += rgba[i + 1] * k; out[2] += rgba[i + 2] * k;
  }
  return out;
}
const coveredAt = (opaque, W, H, x, y) => {
  const X = Math.round(x), Y = Math.round(y);
  if (X < 0 || Y < 0 || X >= W || Y >= H) return true;
  return Boolean(opaque?.occ && opaque.occ[Y * W + X]);
};

// ------------------------------------------------------------------ the math, once

/** fn.q.path.samples: centre and lateral colours along the segment, 1 px apart. */
export function sampleSegment(raster, { segment, windowPx, opaque = null }) {
  const from = segment?.fromPx, to = segment?.toPx;
  const base = { schema: 'nctk-s6-path-samples@1', segment: { fromPx: from ?? null, toPx: to ?? null }, windowPx: r3(windowPx) };
  if (!Array.isArray(from) || !Array.isArray(to)) return { ...base, condition: 'no segment', samplesCount: 0 };
  if (!(windowPx > 0)) return { ...base, condition: 'no corridor width', samplesCount: 0 };
  const L = Math.hypot(to[0] - from[0], to[1] - from[1]);
  if (L < 1) return { ...base, condition: 'degenerate segment (shorter than 1 px)', samplesCount: 0 };
  const W = raster.widthPx, H = raster.heightPx;
  const u = [(to[0] - from[0]) / L, (to[1] - from[1]) / L], n = [-u[1], u[0]];
  const R = Math.ceil(BACKGROUND_BAND.toW * windowPx), M = 2 * R + 1, N = Math.floor(L) + 1;
  const centerRgbLevel = new Float32Array(N * 3), lateralRgbLevel = new Float32Array(N * M * 3).fill(NaN);
  const hiddenCenter = new Uint8Array(N), hiddenLateral = new Uint8Array(N * M);
  for (let k = 0; k < N; k++) {
    const cx = from[0] + u[0] * k, cy = from[1] + u[1] * k;
    const c = rgbAt(raster, cx, cy);
    if (c) centerRgbLevel.set(c, k * 3); else centerRgbLevel.fill(NaN, k * 3, k * 3 + 3);
    hiddenCenter[k] = !c || coveredAt(opaque, W, H, cx, cy) ? 1 : 0;
    for (let j = -R; j <= R; j++) {
      const x = cx + n[0] * j, y = cy + n[1] * j, at = k * M + (j + R);
      const p = rgbAt(raster, x, y);
      if (p) lateralRgbLevel.set(p, at * 3);
      hiddenLateral[at] = !p || coveredAt(opaque, W, H, x, y) ? 1 : 0;
    }
  }
  let hidden = 0; for (const h of hiddenCenter) hidden += h;
  return {
    ...base, condition: null, lengthPx: r3(L), stepPx: 1, samplesCount: N, lateralReachPx: R, offsetsPx: [-R, R],
    directionUnit: u.map(r3), normalUnit: n.map(r3), hiddenCount: hidden,
    layout: 'centerRgbLevel[k*3 + c]; lateralRgbLevel[(k*M + (offset + R))*3 + c], M = 2R + 1; hidden* = 1 where an opaque sprite covers the px or it is off the raster',
    centerRgbLevel, lateralRgbLevel, hiddenCenter, hiddenLateral
  };
}

/** fn.q.path.overlayFraction: per sample, the overlay fraction the centre pixel carries (alpha, or the proxy). */
export function overlayProfile(s, { windowPx, profile = null }) {
  const withProfile = hasOverlay(profile, 'path');
  const overlay = withProfile ? profile.overlays.path : PROXY_OVERLAY;
  const alpha = withProfile
    ? { condition: 'alpha profile', mode: 'profile', overlayRgbLevel: overlay.rgb, pathAlphaFrac: overlay.alpha, fitOn: overlay.fitOn ?? null }
    : { condition: 'no alpha profile', mode: 'proxy', reason: profile?.reason ?? (profile ? `profile has no fitted path overlay (${profile.overlays?.path?.reason ?? profile.status ?? 'unknown'})` : 'no profile given'), overlayRgbLevel: PROXY_OVERLAY.rgb, rule: PROXY_OVERLAY.rule };
  const base = { schema: 'nctk-s6-overlay-fraction@1', kind: withProfile ? 'overlay fraction (alpha profile)' : 'PROXY overlay fraction (no alpha profile: white-overlay brightness)', alpha, segment: s.segment, windowPx: s.windowPx, background: BACKGROUND_BAND.rule };
  if (s.condition) return { ...base, condition: s.condition, samplesCount: 0, overlayFrac: [], corridor: null };
  const N = s.samplesCount, R = s.lateralReachPx, M = 2 * R + 1;
  const overlayFrac = new Array(N).fill(null);
  let noBackground = 0, undecidable = 0;
  const minBackground = Math.max(3, Math.ceil(windowPx / 2));   // need a real band, not one stray px
  for (let k = 0; k < N; k++) {
    if (s.hiddenCenter[k]) continue;
    const bg = [[], [], []];
    for (let j = -R; j <= R; j++) {
      if (Math.abs(j) <= windowPx || Math.abs(j) > BACKGROUND_BAND.toW * windowPx) continue;
      const at = k * M + (j + R);
      if (s.hiddenLateral[at]) continue;
      for (let c = 0; c < 3; c++) bg[c].push(s.lateralRgbLevel[at * 3 + c]);
    }
    if (bg[0].length < minBackground) { noBackground++; continue; }
    const background = bg.map(median), observed = [0, 1, 2].map((c) => s.centerRgbLevel[k * 3 + c]);
    const f = contractOverlayFraction(observed, background, overlay);
    if (f == null) { undecidable++; continue; }
    overlayFrac[k] = r3(f);
  }
  // the straightened corridor (rows: offset -R..R across, columns: 1 px along), for the render: the samples' own colours
  const rgb = new Uint8Array(N * M * 3).fill(96);
  for (let k = 0; k < N; k++) for (let j = 0; j < M; j++) for (let c = 0; c < 3; c++) {
    const v = s.lateralRgbLevel[(k * M + j) * 3 + c]; if (!Number.isNaN(v)) rgb[(j * N + k) * 3 + c] = Math.round(v);
  }
  return {
    ...base, condition: null, samplesCount: N, stepPx: 1, lengthPx: s.lengthPx, hiddenCount: s.hiddenCount, noBackgroundCount: noBackground, undecidableCount: undecidable,
    minBackgroundCount: minBackground, overlayFrac,
    corridor: { widthPx: N, heightPx: M, offsetsPx: [-R, R], ribbonHalfPx: s.windowPx, rgbLevel: rgb, hiddenCenter: s.hiddenCenter, layout: 'rgbLevel[(row*widthPx + col)*3 + c], row = offset + R (across), col = sample (along)' }
  };
}

/** fn.q.path.loss: the loss profile from an overlay profile and a threshold. */
export function lossProfile(p, { threshold = null }) {
  const thr = threshold?.frac;
  const base = { schema: 'nctk-s6-path-loss-profile@1', alpha: p.alpha, threshold: threshold ? { frac: thr ?? null, rule: threshold.rule ?? null } : null, segment: p.segment, windowPx: p.windowPx };
  if (p.condition) return { ...base, condition: p.condition, lossFrac: null, longestGapPx: null, meanOverlayFrac: null, gapsPx: [], profile: p };
  const f = p.overlayFrac, visible = f.filter((v) => v != null);
  const meanOverlayFrac = visible.length ? r3(visible.reduce((a, b) => a + b, 0) / visible.length) : null;
  const common = { segmentLengthPx: p.lengthPx, samplesCount: p.samplesCount, visiblePx: visible.length, hiddenPx: p.hiddenCount, unmeasuredPx: p.samplesCount - visible.length, meanOverlayFrac, medianOverlayFrac: r3(median(visible)) };
  if (!(thr >= 0)) return { ...base, ...common, condition: 'no threshold', lossFrac: null, longestGapPx: null, belowPx: null, gapsPx: [], profile: p };
  if (!visible.length) return { ...base, ...common, condition: 'no visible samples (every sample hidden or without background)', lossFrac: null, longestGapPx: null, belowPx: null, gapsPx: [], profile: p };
  // a gap: consecutive VISIBLE samples below the threshold; a hidden or unmeasured sample ends a gap (no evidence either way)
  const gaps = []; let below = 0, start = -1;
  for (let k = 0; k <= f.length; k++) {
    const lost = k < f.length && f[k] != null && f[k] < thr;
    if (lost) { below++; if (start < 0) start = k; }
    else if (start >= 0) { gaps.push({ fromPx: start, toPx: k - 1, lengthPx: k - start }); start = -1; }
  }
  gaps.sort((a, b) => b.lengthPx - a.lengthPx || a.fromPx - b.fromPx);
  return { ...base, ...common, condition: null, belowPx: below, lossFrac: r3(below / visible.length), longestGapPx: gaps[0]?.lengthPx ?? 0, gapsCount: gaps.length, gapsPx: gaps, profile: p };
}

// ------------------------------------------------------------------ store-side memo (one per raster and opaque plane)

const MEMO = new WeakMap(), NO_OPAQUE = {};
const memoOf = (raster, opaque) => {
  let byOpaque = MEMO.get(raster); if (!byOpaque) MEMO.set(raster, (byOpaque = new WeakMap()));
  const o = opaque ?? NO_OPAQUE; let m = byOpaque.get(o); if (!m) byOpaque.set(o, (m = new Map()));
  return m;
};
const memo = (m, key, f) => { if (!m.has(key)) m.set(key, f()); return m.get(key); };
const samplesOf = (raster, opaque, a) => memo(memoOf(raster, opaque), `s ${JSON.stringify([a.segment?.fromPx, a.segment?.toPx, a.windowPx])}`, () => sampleSegment(raster, { segment: a.segment, windowPx: a.windowPx, opaque }));
const fractionsOf = (raster, opaque, a) => memo(memoOf(raster, opaque), `f ${JSON.stringify([a.segment?.fromPx, a.segment?.toPx, a.windowPx, a.profile ?? null])}`, () => overlayProfile(samplesOf(raster, opaque, a), { windowPx: a.windowPx, profile: a.profile ?? null }));
const rasterOf = (r) => (r && r.rgba && Number.isInteger(r.widthPx) ? r : null);
const noRaster = (fn) => ({ value: { schema: 'nctk-s6-path@1', condition: `${fn}: no raster (pass raster: 'px.image.cropped')` }, unit: 'condition' });

/** registerQueries(store, PATH_QUERIES): string arguments are Part references, resolved before the math runs. */
export const PATH_QUERIES = Object.freeze({
  'fn.q.path.samples': ({ raster, opaque = null, ...a }) => (rasterOf(raster) ? { value: samplesOf(raster, opaque, a), unit: PATH_UNITS.samples } : noRaster('samples')),
  'fn.q.path.overlayFraction': ({ raster, opaque = null, ...a }) => (rasterOf(raster) ? { value: fractionsOf(raster, opaque, a), unit: PATH_UNITS.overlayFraction } : noRaster('overlayFraction')),
  'fn.q.path.loss': ({ raster, opaque = null, ...a }) => (rasterOf(raster) ? { value: lossProfile(fractionsOf(raster, opaque, a), { threshold: a.threshold ?? null }), unit: PATH_UNITS.loss } : noRaster('loss'))
});
export const PATH_QUERY_NAMES = Object.freeze(Object.keys(PATH_QUERIES));
export { noProfile };
