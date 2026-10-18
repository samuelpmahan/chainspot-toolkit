/**
 * The render of an alpha profile (contracts/alpha.profile@1.mjs), browser-safe. fg/render.mjs dispatches the Part here
 * (one case, written once); the runner lays the same raster parts out on one labelled sheet (contactSheet).
 *
 *   swatches   each fitted overlay composited at its alpha over black | white | grey 128 | the opaque colour
 *   crops      original vs unmixed (the contract's unmix, fills / path removed by geometry) around one basket and along
 *              one straight tee -> badge segment (needs the image raster: dims.rgba)
 *   histogram  per-pair residual of each class's fit, RGB levels
 *   ledger     per class alpha, rgb, sigmas, residual, samples, where fitted (units in the column names)
 */
import { composite, unmix, OVERLAY_CLASSES } from '../../contracts/alpha.profile@1.mjs';
import { encodePngRgb, base64 } from '../png.mjs';

export const CLASS_COLOUR = Object.freeze({ c1Fill: [40, 160, 90], c2Fill: [120, 200, 120], path: [150, 150, 170], c2Dash: [220, 120, 60] });
const LABEL = Object.freeze({ c1Fill: 'C1 FILL', c2Fill: 'C2 FILL', path: 'PATH', c2Dash: 'C2 DASH' });
const fitted = (v) => OVERLAY_CLASSES.filter((c) => v.overlays?.[c]?.alpha != null);

/** An RGB canvas: { width, height, rgb }, with fill / blit / text. */
export function canvas(width, height, bg = [255, 255, 255]) {
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i++) rgb.set(bg, i * 3);
  return { width, height, rgb };
}
export function fillRect(cv, x, y, w, h, col) {
  for (let yy = Math.max(0, y); yy < Math.min(cv.height, y + h); yy++) for (let xx = Math.max(0, x); xx < Math.min(cv.width, x + w); xx++) cv.rgb.set(col.map((c) => Math.round(Math.max(0, Math.min(255, c)))), (yy * cv.width + xx) * 3);
}
export function blit(cv, src, x, y) {
  for (let yy = 0; yy < src.height; yy++) for (let xx = 0; xx < src.width; xx++) {
    const X = x + xx, Y = y + yy; if (X < 0 || Y < 0 || X >= cv.width || Y >= cv.height) continue;
    cv.rgb.set(src.rgb.subarray((yy * src.width + xx) * 3, (yy * src.width + xx) * 3 + 3), (Y * cv.width + X) * 3);
  }
}
const toPng = (cv, deflate) => encodePngRgb({ width: cv.width, height: cv.height, rgb: cv.rgb, ...(deflate ? { deflate } : {}) });
const rasterPart = (address, cv, extra = {}) => ({ address, kind: 'raster', data: { width: cv.width, height: cv.height, png: base64(toPng(cv)), ...extra } });

// ---- a 5x7 bitmap font (rows top to bottom, bit 4 = leftmost), so labels live in the pixels
const G = {
  0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31], 3: [31, 2, 4, 2, 1, 17, 14], 4: [2, 6, 10, 18, 31, 2, 2],
  5: [31, 16, 30, 1, 1, 17, 14], 6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 8: [14, 17, 17, 14, 17, 17, 14], 9: [14, 17, 17, 15, 1, 2, 12],
  A: [14, 17, 17, 17, 31, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14], D: [28, 18, 17, 17, 17, 18, 28], E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16], G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31], M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17], S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17], Y: [17, 17, 17, 10, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31], ' ': [0, 0, 0, 0, 0, 0, 0], '.': [0, 0, 0, 0, 0, 12, 12], ',': [0, 0, 0, 0, 12, 4, 8], ':': [0, 12, 12, 0, 12, 12, 0],
  '-': [0, 0, 0, 31, 0, 0, 0], '+': [0, 4, 4, 31, 4, 4, 0], '/': [0, 1, 2, 4, 8, 16, 0], '(': [2, 4, 8, 8, 8, 4, 2], ')': [8, 4, 2, 2, 2, 4, 8],
  '=': [0, 0, 31, 0, 31, 0, 0], '%': [24, 25, 2, 4, 8, 19, 3], '>': [8, 4, 2, 1, 2, 4, 8], '<': [2, 4, 8, 16, 8, 4, 2], '_': [0, 0, 0, 0, 0, 0, 31],
  '|': [4, 4, 4, 4, 4, 4, 4], ';': [0, 12, 12, 0, 12, 4, 8], '*': [0, 4, 21, 14, 21, 4, 0], '!': [4, 4, 4, 4, 4, 0, 4], "'": [4, 4, 8, 0, 0, 0, 0], '"': [10, 10, 0, 0, 0, 0, 0], '#': [10, 10, 31, 10, 31, 10, 10], '?': [14, 17, 1, 2, 4, 0, 4]
};
export function text(cv, x, y, s, { col = [20, 20, 20], scale = 2 } = {}) {
  let cx = x;
  for (const ch of String(s).toUpperCase().replace(/±/g, '+-')) {
    const g = G[ch] ?? G['?'];
    g.forEach((row, ry) => { for (let rx = 0; rx < 5; rx++) if (row & (16 >> rx)) fillRect(cv, cx + rx * scale, y + ry * scale, scale, scale, col); });
    cx += 6 * scale;
  }
  return cx;
}
export const textWidth = (s, scale = 2) => String(s).length * 6 * scale;

// ---- the pieces
export function swatch(o, size = 56) {
  const cv = canvas(size * 4 + 12, size, [255, 255, 255]);
  [[0, 0, 0], [255, 255, 255], [128, 128, 128]].forEach((bg, i) => fillRect(cv, i * (size + 4), 0, size, size, composite(bg, o)));
  fillRect(cv, 3 * (size + 4), 0, size, size, o.rgb);
  return cv;
}

/** Which overlays cover px (x, y) in the crop, by geometry, top layer first. */
function coverOf(x, y, v) {
  const a = v.fit?.anchors ?? {}, out = [], r1 = v.r1Px;
  const g = v.fit?.geometry ?? { c1StrokeFwhmPx: 5, c2StrokeFwhmPx: 9, aaBandPx: 1.5 };
  if (a.segment && v.overlays.path?.alpha != null) {
    const { a: p, b: q, widthPx } = a.segment, dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy);
    const t = ((x - p[0]) * dx + (y - p[1]) * dy) / L, l = Math.abs(((x - p[0]) * dy - (y - p[1]) * dx) / L);
    if (t >= 0 && t <= L && l <= widthPx / 2 - 1.5) out.push('path');
  }
  for (const k of a.baskets ?? (a.basket ? [a.basket] : [])) {
    if (!r1) break;
    const d = Math.hypot(x - k.centre[0], y - k.centre[1]), e1 = g.c1StrokeFwhmPx / 2 + g.aaBandPx, e2 = g.c2StrokeFwhmPx / 2 + g.aaBandPx;
    if (d < r1 - e1) { if (v.overlays.c1Fill?.alpha != null) out.push('c1Fill'); if (v.overlays.c2Fill?.alpha != null) out.push('c2Fill'); }
    else if (d > r1 + e1 && d < 2 * r1 - e2) { if (v.overlays.c2Fill?.alpha != null) out.push('c2Fill'); }
    else if (Math.abs(d - r1) <= e1 || Math.abs(d - 2 * r1) <= e2) out.push('stroke');
  }
  return out;
}

/**
 * An original and an unmixed crop (size px square, nearest-neighbour scale) around a centre. keep: raster indices of
 * opaque sprites in the window (they sit above every overlay and are shown as drawn, never unmixed).
 */
export function crops(raster, v, centre, size, scale = 1, keep = null) {
  const kept = new Set(keep ?? []);
  const W = raster.widthPx, H = raster.heightPx, n = size * scale;
  const orig = canvas(n, n, [128, 128, 128]), un = canvas(n, n, [128, 128, 128]);
  const x0 = Math.round(centre[0] - size / 2), y0 = Math.round(centre[1] - size / 2);
  for (let yy = 0; yy < size; yy++) for (let xx = 0; xx < size; xx++) {
    const X = x0 + xx, Y = y0 + yy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
    const i = (Y * W + X) * 4, o = [raster.rgba[i], raster.rgba[i + 1], raster.rgba[i + 2]];
    let u = o;
    if (!kept.has(Y * W + X)) for (const c of coverOf(X, Y, v)) { if (c === 'stroke') continue; u = unmix(u, v.overlays[c]) ?? u; }
    fillRect(orig, xx * scale, yy * scale, scale, scale, o); fillRect(un, xx * scale, yy * scale, scale, scale, u);
  }
  return { orig, un, origin: [x0, y0] };
}

export function histogramCanvas(v, { w = 420, h = 150 } = {}) {
  const cv = canvas(w, h, [255, 255, 255]), cls = fitted(v).filter((c) => v.fit?.perClass?.[c]?.residualHistogram?.counts?.length);
  const maxBin = Math.max(1, ...cls.map((c) => v.fit.perClass[c].residualHistogram.counts.length)), bw = Math.max(1, Math.floor((w - 20) / (maxBin * Math.max(1, cls.length))));
  const maxCount = Math.max(1e-9, ...cls.flatMap((c) => v.fit.perClass[c].residualHistogram.counts.map((n, i) => n / v.fit.perClass[c].pairs)));
  fillRect(cv, 10, h - 12, w - 20, 1, [0, 0, 0]);
  cls.forEach((c, k) => v.fit.perClass[c].residualHistogram.counts.forEach((n, i) => {
    const bh = Math.round(((n / v.fit.perClass[c].pairs) / maxCount) * (h - 20));
    fillRect(cv, 10 + (i * cls.length + k) * bw, h - 12 - bh, bw, bh, CLASS_COLOUR[c]);
  }));
  return { cv, binsPx: bw * cls.length, maxBin };
}

/** The render case (fg/render.mjs): frame parts for the flipbook. dims: the image raster when the store has it. */
export function renderAlphaProfile(address, v, dims = null) {
  const parts = [{ address, kind: 'ledger', data: { rows: OVERLAY_CLASSES.map((c) => {
    const o = v.overlays?.[c] ?? {};
    return o.alpha == null ? { class: c, status: o.status ?? 'absent', reason: o.reason ?? null }
      : { class: c, alphaFraction: o.alpha, sigmaAlpha: o.sigmaAlpha, rgbLevels: o.rgb.join(' / '), sigmaRgbLevels: o.sigmaRgb.join(' / '), residualRmsLevels: o.residualRms, samplesPx: o.samplesPx, fitOn: o.fitOn };
  }).concat([{ class: 'scale', r1Px: v.r1Px, course: v.course, method: v.method }]) } }];
  for (const c of fitted(v)) parts.push(rasterPart(`${address}#swatch:${c}`, swatch(v.overlays[c]), { label: `${c} at alpha ${v.overlays[c].alpha} over black | white | grey 128 | opaque rgb ${v.overlays[c].rgb.join('/')}` }));
  const raster = dims?.rgba ? dims : null, a = v.fit?.anchors ?? {};
  if (raster && a.basket && v.r1Px) {
    const size = Math.min(260, Math.ceil(4.4 * v.r1Px)), c = crops(raster, v, a.basket.centre, size, 1, a.basket.spritesInWindow);
    parts.push(rasterPart(`${address}#crop:${a.basket.name}:original`, c.orig, { origin: c.origin }), rasterPart(`${address}#crop:${a.basket.name}:unmixed`, c.un, { origin: c.origin }));
  }
  if (raster && a.segment) {
    const m = [(a.segment.a[0] + a.segment.b[0]) / 2, (a.segment.a[1] + a.segment.b[1]) / 2], L = Math.hypot(a.segment.b[0] - a.segment.a[0], a.segment.b[1] - a.segment.a[1]);
    const c = crops(raster, v, m, Math.min(260, Math.ceil(L + 2 * a.segment.widthPx)), 1, a.segment.spritesInWindow);
    parts.push(rasterPart(`${address}#crop:${a.segment.name}:original`, c.orig, { origin: c.origin }), rasterPart(`${address}#crop:${a.segment.name}:unmixed`, c.un, { origin: c.origin }));
  }
  if (fitted(v).some((c) => v.fit?.perClass?.[c]?.residualHistogram)) {
    parts.push(rasterPart(`${address}#residualHistogram`, histogramCanvas(v).cv, { label: 'pairs per 1-level bin of residual (RGB levels), per class' }));
    parts.push({ address: `${address}#residualHistogram:counts`, kind: 'ledger', data: { rows: fitted(v).filter((c) => v.fit.perClass?.[c]?.residualHistogram).map((c) => ({ class: c, binWidthLevels: v.fit.perClass[c].residualHistogram.binWidth, pairsPerBin: v.fit.perClass[c].residualHistogram.counts.join(' ') })) } });
  }
  return { kind: 'alphaProfile', parts };
}

/** All of it on one labelled PNG sheet (node passes zlib.deflateSync for size). Returns PNG bytes, or null. */
export function contactSheet(v, raster, { title = 'alpha profile', deflate } = {}) {
  const W = 1100, rows = fitted(v), a = v.fit?.anchors ?? {};
  const cropSize = v.r1Px ? Math.min(240, Math.ceil(4.4 * v.r1Px)) : 0, segSize = a.segment ? Math.min(240, Math.ceil(Math.hypot(a.segment.b[0] - a.segment.a[0], a.segment.b[1] - a.segment.a[1]) + 2 * a.segment.widthPx)) : 0;
  const cropScale = Math.max(1, Math.floor(240 / Math.max(cropSize, segSize, 1)));
  const H = 60 + Math.max(1, OVERLAY_CLASSES.length) * 78 + 40 + (cropSize || segSize ? Math.max(cropSize, segSize) * cropScale + 60 : 0) + 230;
  const cv = canvas(W, H, [250, 250, 250]);
  let y = 12;
  text(cv, 12, y, `${title}  R1 ${v.r1Px} PX (FROM THE RINGS)`, { scale: 2 }); y += 26;
  text(cv, 12, y, 'OBSERVED = ALPHA X RGB + (1 - ALPHA) X BACKGROUND', { scale: 1, col: [80, 80, 80] });
  ['OVER BLACK', 'OVER WHITE', 'OVER GREY', 'OPAQUE'].forEach((s, i) => text(cv, 600 + i * 60, y, s.replace('OVER ', ''), { scale: 1, col: [90, 90, 90] }));
  y += 18;
  for (const c of OVERLAY_CLASSES) {
    const o = v.overlays?.[c] ?? {};
    fillRect(cv, 12, y + 4, 12, 12, CLASS_COLOUR[c]);
    if (o.alpha == null) { text(cv, 32, y + 4, `${LABEL[c]}: NOT FITTED`, { col: [170, 60, 40] }); text(cv, 32, y + 24, String(o.reason ?? '').slice(0, 170), { scale: 1, col: [120, 120, 120] }); y += 78; continue; }
    text(cv, 32, y + 4, `${LABEL[c]}  ALPHA ${o.alpha.toFixed(3)} +- ${o.sigmaAlpha.toFixed(3)}`, { col: [20, 20, 20] });
    text(cv, 32, y + 26, `RGB ${o.rgb.map((x) => x.toFixed(0)).join('/')} +- ${o.sigmaRgb.map((x) => x.toFixed(0)).join('/')} LEVELS`, { scale: 1 });
    text(cv, 32, y + 38, `RESIDUAL RMS ${o.residualRms} LEVELS, ${o.samplesPx} PX SAMPLED`, { scale: 1 });
    text(cv, 32, y + 50, String(o.fitOn).slice(0, 80), { scale: 1, col: [110, 110, 110] });
    blit(cv, swatch(o, 56), 600, y);
    y += 78;
  }
  y += 4;
  if (raster && (a.basket || a.segment)) {
    let x = 12;
    const place = (cr, label1, label2) => {
      text(cv, x, y, label1, { scale: 1 }); blit(cv, cr.orig, x, y + 12); text(cv, x + cr.orig.width + 8, y, label2, { scale: 1 }); blit(cv, cr.un, x + cr.orig.width + 8, y + 12);
      x += 2 * cr.orig.width + 28;
    };
 if (a.basket && v.r1Px) place(crops(raster, v, a.basket.centre, cropSize, cropScale, a.basket.spritesInWindow), `${a.basket.name} ORIGINAL`, 'UNMIXED: C1, C2 FILLS OUT');
    if (a.segment && x + 2 * segSize * cropScale + 20 <= W) place(crops(raster, v, [(a.segment.a[0] + a.segment.b[0]) / 2, (a.segment.a[1] + a.segment.b[1]) / 2], segSize, cropScale, a.segment.spritesInWindow), `${a.segment.name} ORIGINAL`.slice(0, 40), 'UNMIXED: PATH OUT');
    y += Math.max(cropSize, segSize) * cropScale + 30;
    text(cv, 12, y - 12, `CROPS X${cropScale}; RING STROKES AND THEIR AA BAND ARE LEFT AS DRAWN (NOT FITTED); OPAQUE SPRITES UNTOUCHED`, { scale: 1, col: [90, 90, 90] });
  }
  y += 8;
  text(cv, 12, y, 'RESIDUAL PER PAIR (RGB LEVELS), SHARE OF PAIRS PER 1-LEVEL BIN', { scale: 1 });
  const h = histogramCanvas(v, { w: 700, h: 170 }); blit(cv, h.cv, 12, y + 12);
  for (let t = 0; t <= h.maxBin; t += 5) text(cv, 12 + 10 + t * h.binsPx, y + 12 + 172, String(t), { scale: 1, col: [90, 90, 90] });
  fitted(v).forEach((c, i) => { fillRect(cv, 740, y + 20 + i * 18, 12, 12, CLASS_COLOUR[c]); text(cv, 758, y + 22 + i * 18, `${LABEL[c]} (${v.fit?.perClass?.[c]?.pairs ?? 0} PAIRS)`, { scale: 1 }); });
  return encodePngRgb({ width: cv.width, height: cv.height, rgb: cv.rgb, ...(deflate ? { deflate } : {}) });
}
