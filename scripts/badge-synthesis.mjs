/**
 * Synthetic badges for 1..27 composed at raw scale from DEV badge crops, so the learned abstention
 * (scripts/badge-calibration.mjs) sees two-digit numbers no dev course has (no non-validation course has more
 * than 18 holes). Nothing here is invented; every quantity is measured on the dev badges it is given:
 *
 *   - glyphs: each digit's anti-aliased coverage patch (coverage = (lum - plate) / (glyph - plate) with the badge's own
 *     LOCAL levels, coverageLevels), cut from the ink box (half coverage, frame excluded) widened by the fringe:
 *     lone 1..9 from badges 1..9, the left "1" and right 0..8 from 10..18;
 *   - placement: the font is proportional and centred by its advances; the advances, each digit's lone left edge and
 *     the pill padding are measured on dev (measureDev), and a "dX" puts d at lone(d) - adv(X)/2 and X at
 *     lone(X) + adv(d)/2 from the pill centre; the pill is a dev sprite's frame, its middle column repeated or dropped
 *     to the width adv(d) + adv(X) + padding (never narrower than a one-digit pill);
 *   - variation: the (plate, glyph) level pairs are drawn from dev badges, and the sub-pixel jitter is the spread of each
 *     dev badge's ink centroid about the mean of its label (the same sprite drawn at another phase). Glyphs are placed on a 4x grid and box-downsampled, which is
 *     how the sub-pixel phase reaches the pixels as anti-aliasing.
 *
 * Each synthetic badge is a raster plus the bbox body the readers sample (the whole raster), so it goes through the
 * readers' own crop-to-mask path, exactly as a real badge does.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { deserialize } from 'node:v8';
import { join, resolve } from 'node:path';
import { BADGE_SIZE_BY_LABEL } from '../fg/s1/fg.s1.badgeInvariants.observe.fg.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const C = require(join(ROOT, 'source/provider/packages/alg/dist/detectors/threeFactor/digits/badgeCoverageTemplateMath.js'));
const UP = 4;   // render grid per source px

const lum = (r, x, y) => { const o = (y * r.width + x) * 4; return (r.data[o] + r.data[o + 1] + r.data[o + 2]) / 3; };
const whole = (r) => ({ xPx: r.width / 2, yPx: r.height / 2, widthPx: r.width, heightPx: r.height });

/** A deterministic PRNG (mulberry32), so a synthesis is reproducible from its seed. */
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Coverage, frame mask and digit glyphs of one dev badge crop. */
function anatomy(raster) {
  const { width: W, height: H } = raster, lv = C.coverageLevels(raster, whole(raster)), span = Math.max(1, lv.glyphLum - lv.plateLum);
  const cov = new Float64Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) cov[y * W + x] = Math.max(0, Math.min(1, (lum(raster, x, y) - lv.plateLum) / span));
  // the frame: everything with any coverage connected to the raster border
  const frame = new Uint8Array(W * H), st = [];
  for (let x = 0; x < W; x++) st.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) st.push(y * W, y * W + W - 1);
  while (st.length) { const i = st.pop(); if (frame[i] || cov[i] < 0.1) continue; frame[i] = 1; const x = i % W, y = (i - x) / W;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < W && ny < H) st.push(ny * W + nx); } }
  const ink = (x, y) => !frame[y * W + x] && cov[y * W + x] >= 0.5;
  const cols = []; for (let x = 0; x < W; x++) { let a = false; for (let y = 0; y < H && !a; y++) a = ink(x, y); cols.push(a); }
  const glyphs = [];
  for (let x = 0; x < W; x++) {
    if (!cols[x]) continue; let x1 = x; while (x1 + 1 < W && cols[x1 + 1]) x1++;
    let y0 = H, y1 = -1; for (let y = 0; y < H; y++) for (let xx = x; xx <= x1; xx++) if (ink(xx, y)) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const X0 = x - 1, Y0 = y0 - 1, w = x1 - x + 3, h = y1 - y0 + 3, patch = new Float64Array(w * h);
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) { const X = X0 + xx, Y = Y0 + yy; if (X >= 0 && Y >= 0 && X < W && Y < H && !frame[Y * W + X]) patch[yy * w + xx] = cov[Y * W + X]; }
    glyphs.push({ x0: x, x1, y0, y1, w, h, patch }); x = x1;
  }
  return { lv, cov, frame, glyphs };
}

/** Everything the synthesis draws from, measured on the clean dev badges of the given attempts. */
export function measureDev(devAttempts) {
  const sprites = [], levels = [], gaps = [], tops = [], boxCentres = [], pads = [], widths = [];
  const lone = {}, left1 = [], right = {};
  for (const [course, attempt] of devAttempts) {
    const board = new Map(deserialize(readFileSync(join(ROOT, 'attempts/stages', attempt, 'fork/stage-output/early/s3.pxc.bin'))));
    const image = board.get('localImage'), { topPx } = board.get('viewport');
    for (const b of board.get('badges')) {
      const label = Number(b.label), [x, y, w, h] = b.bbox, size = BADGE_SIZE_BY_LABEL[label];
      if (!size || w !== size[0] || h !== size[1]) continue;   // off-size: a frame merged with a neighbour
      const data = new Uint8ClampedArray(w * h * 4);
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) { const o = ((y - topPx + yy) * image.width + x + xx) * 4, q = (yy * w + xx) * 4; data[q] = image.data[o]; data[q + 1] = image.data[o + 1]; data[q + 2] = image.data[o + 2]; data[q + 3] = 255; }
      const raster = { width: w, height: h, data }, a = anatomy(raster), want = String(label).length;
      if (a.glyphs.length !== want) continue;
      sprites.push({ course, label, raster, a });
      levels.push([a.lv.plateLum, a.lv.glyphLum]);
      const g0 = a.glyphs[0], gN = a.glyphs[a.glyphs.length - 1];
      // ink-box centre from the bbox centre (px), and the ink's coverage centroid: its spread about the label's mean
      // centroid is the sub-pixel jitter between instances of the same sprite
      let sx = 0, sw = 0; for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) if (!a.frame[yy * w + xx]) { sx += xx * a.cov[yy * w + xx]; sw += a.cov[yy * w + xx]; }
      boxCentres.push({ label, box: (g0.x0 + gN.x1) / 2 - (w - 1) / 2, centroid: sx / sw });
      tops.push(Math.min(...a.glyphs.map((g) => g.y0)));
      const c = (w - 1) / 2;
      for (const g of a.glyphs) g.rel = g.x0 - c;   // ink left edge, px from the bbox centre
      if (want === 1) (lone[label] ??= []).push(g0);
      else { gaps.push(a.glyphs[1].x0 - g0.x1 - 1); pads.push(w - (gN.x1 - g0.x0 + 1)); widths.push({ label, w }); left1.push({ ...g0, partner: label - 10 }); (right[label - 10] ??= []).push(a.glyphs[1]); }
    }
  }
  const meanCentroid = {};
  for (const c of boxCentres) (meanCentroid[c.label] ??= []).push(c.centroid);
  const centres = boxCentres.map((c) => c.box + c.centroid - meanCentroid[c.label].reduce((a, v) => a + v, 0) / meanCentroid[c.label].length);
  // The font is proportional and the text is centred by its advances (checked on 10..18: each "1X" puts its "1" at
  // lone(1) - adv(X)/2 and its X at lone(X) + adv(1)/2). Measured: adv(X) for X = 0..8 from the left "1" of 1X, adv(1)
  // from the right digits, and a digit's lone left edge lone(d) from badge d (lone(0) from 10). 9 never stands right of a
  // 1 on dev: adv(9) is the median advance of the digits whose ink is as wide as the 9's. The pill is its text's advance
  // plus a padding measured as width - adv(1) - adv(X) on the 1X pills wider than a one-digit pill.
  const med = (v) => { const q = [...v].sort((x, y) => x - y); return q.length ? (q[(q.length - 1) >> 1] + q[q.length >> 1]) / 2 : null; };
  const loneRel = {}; for (let d = 1; d <= 9; d++) if (lone[d]) loneRel[d] = med(lone[d].map((g) => g.rel));
  const adv = {};
  if (loneRel[1] != null) for (let X = 0; X <= 8; X++) { const L = left1.filter((g) => g.partner === X); if (L.length) adv[X] = -2 * (med(L.map((g) => g.rel)) - loneRel[1]); }
  const via1 = []; for (let X = 2; X <= 8; X++) if (right[X] && loneRel[X] != null) via1.push(2 * (med(right[X].map((g) => g.rel)) - loneRel[X]));
  if (via1.length) adv[1] = med(via1);
  if (right[0] && adv[1] != null) loneRel[0] = med(right[0].map((g) => g.rel)) - adv[1] / 2;
  const inkW = (d) => (lone[d] ?? right[d] ?? [])[0] && ((lone[d] ?? right[d])[0].x1 - (lone[d] ?? right[d])[0].x0 + 1);
  if (lone[9]) adv[9] = med(Object.keys(adv).map(Number).filter((d) => d !== 9 && inkW(d) === inkW(9)).map((d) => adv[d]));
  const minWidth = Math.min(...Object.values(BADGE_SIZE_BY_LABEL).map((sz) => sz[0]));
  const padding = med(widths.filter((x) => x.w > minWidth && adv[x.label - 10] != null).map((x) => x.w - adv[1] - adv[x.label - 10]));
  return { loneRel, adv, padding, sprites, levels, gaps, tops, centres, pads, lone, left1, right, minWidth };
}

/** Glyph patches for a label's digits: a lone digit for one-digit labels; left and right glyphs for two. */
function glyphsFor(M, label, pick) {
  const ds = [...String(label)].map(Number);
  const any = (d) => M.lone[d] ?? M.right[d];   // a course whose badge of a digit merged with a neighbour uses the other position's glyph
  if (ds.some((d) => !any(d)?.length)) return null;   // this course has no clean glyph of the digit: no badge for it
  if (ds.length === 1) return [pick(any(ds[0]))];
  const leftPool = ds[0] === 1 && M.left1.length ? M.left1 : any(ds[0]);   // a left 2 or 3 is the lone glyph (the font has one shape per digit)
  const rightPool = M.right[ds[1]] ?? M.lone[ds[1]];                       // a right 9 is the lone 9 (no dev badge has one)
  return [pick(leftPool), pick(rightPool)];
}

/** One synthetic badge raster for `label`, or null when this course lacks what it needs. */
function render(M, label, r) {
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const ds = [...String(label)].map(Number);
  const gl = glyphsFor(M, label, pick);
  if (!gl || ds.some((d) => M.loneRel[d] == null) || (ds.length === 2 && ds.some((d) => M.adv[d] == null))) return null;
  // left edges from the pill centre: lone(d) alone; lone(d) - adv(X)/2 and lone(X) + adv(d)/2 for "dX"
  const rel = ds.length === 1 ? [M.loneRel[ds[0]]] : [M.loneRel[ds[0]] - M.adv[ds[1]] / 2, M.loneRel[ds[1]] + M.adv[ds[0]] / 2];
  const base = pick(M.sprites.filter((s) => String(s.label).length === ds.length));
  const width = ds.length === 1 ? M.minWidth : Math.max(M.minWidth, Math.round(M.adv[ds[0]] + M.adv[ds[1]] + M.padding)), height = base.raster.height;
  const [plateLum, glyphLum] = pick(M.levels);
  // the pill: the base sprite's frame, its middle column repeated or dropped to reach the width
  const bw = base.raster.width, mid = Math.floor(bw / 2), extra = width - bw;
  const cov = new Float64Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sx = extra >= 0 ? (x < mid ? x : x < mid + extra ? mid : x - extra) : (x < mid ? x : x - extra), i = y * bw + Math.min(bw - 1, sx);
    cov[y * width + x] = base.a.frame[i] ? base.a.cov[i] : 0;
  }
  const centre = (width - 1) / 2 + (pick(M.centres) - Math.round(pick(M.centres) * 2) / 2);   // sub-pixel jitter only
  const hiW = width * UP, hiH = height * UP, hi = new Float64Array(hiW * hiH);
  gl.forEach((g, k) => {
    const ox = Math.round((centre + rel[k] - 1) * UP), oy = (g.y0 - 1) * UP;   // the patch starts one px before its ink
    for (let yy = 0; yy < g.h * UP; yy++) for (let xx = 0; xx < g.w * UP; xx++) {
      const X = ox + xx, Y = oy + yy; if (X < 0 || Y < 0 || X >= hiW || Y >= hiH) continue;
      // each source px is a UP x UP block (its coverage is the area it covers): a whole-px placement reproduces the
      // glyph exactly, a k/UP shift mixes neighbours by area as a render at that phase would
      hi[Y * hiW + X] = Math.max(hi[Y * hiW + X], g.patch[Math.floor(yy / UP) * g.w + Math.floor(xx / UP)]);
    }
  });
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let s = 0; for (let yy = 0; yy < UP; yy++) for (let xx = 0; xx < UP; xx++) s += hi[(y * UP + yy) * hiW + x * UP + xx];
    const c = Math.max(cov[y * width + x], s / (UP * UP)), v = plateLum + c * (glyphLum - plateLum), o = (y * width + x) * 4;
    data[o] = data[o + 1] = data[o + 2] = Math.round(v); data[o + 3] = 255;
  }
  return { width, height, data };
}

/** `variants` synthetic badges per label of `labels`, drawn from the measurements M. */
export function synthesize(M, labels, variants, seed = 1) {
  const r = rng(seed), out = [];
  for (const label of labels) for (let k = 0; k < variants; k++) { const raster = render(M, label, r); if (raster) out.push({ label, raster, body: whole(raster) }); }
  return out;
}
