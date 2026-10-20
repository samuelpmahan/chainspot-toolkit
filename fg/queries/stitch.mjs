/**
 * fn.q.stitch.*: the tiles of ONE capture into one course raster, math written once behind the PxC boundary
 * (docs/agents/boundary.md; Sam, 2026-10-19: "a stitched course is one raster", "stitching is native, now").
 *
 * Badges place, pixels confirm and tighten (the approved design):
 *   1. fn.q.identity.place (A2, fg/queries/identityPlace.mjs) pairs badges by hole number, restricted to translation (one
 *      capture = one device at one zoom), Prim max-weight spanning tree, strongest seed. A 1-badge edge is only a hypothesis.
 *   2. Every tree link is confirmed and tightened by pixels: the luma translation search of ChainSpot's
 *      source/provider/packages/alg/src/stitch.ts (mean absolute luma difference over the overlap, coarse-to-fine), searched
 *      in a window around the badge-predicted offset whose radius is the capture's own badge width (a clipped badge's centre
 *      is off by up to half of it). A link is CONFIRMED when its best residual is a clear minimum of the window (contrast =
 *      best / median residual <= confirmContrast) and lies inside it. A rejected link is cut and the tree re-solved.
 *   3. A tile no badge edge places is searched over the full overlap (findBestTranslation, ported), same confirmation.
 *   4. Escalation, only on evidence: a link with >= 3 shared badges whose similarity fit is far tighter than the translation
 *      fit is re-scored by pixels as a similarity; it is kept only when the pixels agree (residual drops by escalateGain).
 * Transforms are composed down the tree after every link is final (no parent moves after its children are placed: the
 * ChainSpot poseGraph fusion bug), then re-expressed in the frame of the tile whose scale is the median, so the fewest tiles
 * are resampled. Every non-tree overlapping pair is scored at the final placement (loop closure).
 *
 * Frame and composite follow ChainSpot main (src/lib/stitch/stitchPipeline.ts, renderComposite.ts, domain/provenance.ts):
 * transform = tile source-raster px -> composite px, [a, b, c, d, e, f]; the union of the coverage polygons is shifted by
 * -floor(min) to the origin; an exact integer translation is a direct copy, anything else nearest-neighbour sampled at the
 * pixel centre. Uncovered pixels are OPAQUE black (0, 0, 0, 255) and owner 0: ChainSpot leaves them transparent, but every
 * toolkit stage FG balances its frame over opaque pixels (remaining opaque + owned = frame), so the course raster is opaque and
 * the owner plane says what no tile covers. Overlap rule (recorded on the Part): THE TILE THAT SEES THE
 * POINT DEEPEST WINS ('deepest-inside-tile-v1': largest distance from the point to its own crop edge, in that tile's source px;
 * ties: the earlier tile of the capture). Screen-fixed overlays (the Maps mark, the MAP / SAT switch) sit at a tile's edges,
 * so wherever another tile also sees the point, the overlay loses.
 *
 * Units: px of the tile source rasters (canonical per tile = S0's crop of it) and of the composite; residuals are luma levels
 * (0..255, Rec.601 integer luma, the provider's toGrayRaster); contrast is a ratio.
 */
import { placeTiles } from './identityPlace.mjs';
import { estimateSimilarity } from './identity.mjs';

export const STITCH = Object.freeze({
  minOverlapFraction: 0.08, coarseTargetDim: 128, refineRadiusFactor: 1.5,   // stitch.ts, unchanged
  localLevels: [8, 2, 1],     // the local search pyramid (px per level px): the window at 8, then 2, then full resolution
  confirmContrast: 0.5,       // ratio: best residual / median residual over the window; a link above it is not confirmed
  escalateMinShared: 3,       // badges: a scale needs >= 3 shared badges to be evidenced at all
  escalateBadgeGain: 2,       // ratio: translation badge RMS / similarity badge RMS
  escalateResidualRatio: 2,   // ratio: this link's translation residual / the capture's median translation link residual
  escalateGain: 1.25,         // ratio: translation pixel residual / similarity pixel residual, to keep the similarity
  rowStride: 2, fineStride: 4,   // rows and columns sampled below the coarse level, and at full resolution (stitch.ts: 4)
  overlapRule: 'deepest-inside-tile-v1'
});

// ----------------------------------------------------------------- rasters
/** Rec.601 integer luma of rect { xPx, yPx, widthPx, heightPx } of an RGBA raster (the provider's toGrayRaster, cropped). */
export function lumaOf({ rgba, widthPx }, rect) {
  const g = new Uint8Array(rect.widthPx * rect.heightPx);
  for (let y = 0; y < rect.heightPx; y++) {
    let o = ((rect.yPx + y) * widthPx + rect.xPx) * 4, d = y * rect.widthPx;
    for (let x = 0; x < rect.widthPx; x++, o += 4) g[d + x] = (rgba[o] * 77 + rgba[o + 1] * 150 + rgba[o + 2] * 29) >> 8;
  }
  return { widthPx: rect.widthPx, heightPx: rect.heightPx, gray: g };
}
const PYRAMID = new WeakMap();   // per gray raster: its downsampled levels, computed once (a raster is write-once)
export function downsample(r, factor) {   // stitch.ts downsample
  if (factor <= 1) return r;
  const levels = PYRAMID.get(r) ?? PYRAMID.set(r, new Map()).get(r);
  if (levels.has(factor)) return levels.get(factor);
  const out = downsampleOnce(r, factor); levels.set(factor, out); return out;
}
function downsampleOnce(r, factor) {
  const w = Math.max(1, Math.floor(r.widthPx / factor)), h = Math.max(1, Math.floor(r.heightPx / factor)), gray = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let sy = 0; sy < factor; sy++) { const row = (y * factor + sy) * r.widthPx + x * factor; for (let sx = 0; sx < factor; sx++) sum += r.gray[row + sx]; }
    gray[y * w + x] = sum / (factor * factor);
  }
  return { widthPx: w, heightPx: h, gray };
}

// ----------------------------------------------------------------- residual of one placement of b in a
/**
 * Mean absolute luma difference over the overlap when b's pixel q maps to a's pixel L q + (dx, dy) (L = [la, lb, lc, ld],
 * null: identity), sampled every rowStride rows and columns. Null when the overlap is under minFraction of the smaller raster.
 */
export function residualAt(a, b, dx, dy, { linear = null, rowStride = 1, minFraction = STITCH.minOverlapFraction } = {}) {
  const minArea = Math.min(a.widthPx * a.heightPx, b.widthPx * b.heightPx) * minFraction;
  if (!linear) {   // stitch.ts scoreOffset
    const x0 = Math.max(0, dx), y0 = Math.max(0, dy), x1 = Math.min(a.widthPx, dx + b.widthPx), y1 = Math.min(a.heightPx, dy + b.heightPx), ow = x1 - x0, oh = y1 - y0;
    if (ow <= 0 || oh <= 0 || ow * oh < minArea) return null;
    let sum = 0, n = 0;
    for (let y = y0; y < y1; y += rowStride) {
      const ai = y * a.widthPx + x0, bi = (y - dy) * b.widthPx + (x0 - dx);
      for (let x = 0; x < ow; x += rowStride) { sum += Math.abs(a.gray[ai + x] - b.gray[bi + x]); n++; }
    }
    return { residual: sum / n, overlapPx: ow * oh };
  }
  const [la, lb, lc, ld] = linear, det = la * ld - lb * lc, ia = ld / det, ib = -lb / det, ic = -lc / det, id = la / det;
  const cs = [[0, 0], [b.widthPx, 0], [0, b.heightPx], [b.widthPx, b.heightPx]].map(([x, y]) => [la * x + lc * y + dx, lb * x + ld * y + dy]);
  const x0 = Math.max(0, Math.floor(Math.min(...cs.map((c) => c[0])))), x1 = Math.min(a.widthPx, Math.ceil(Math.max(...cs.map((c) => c[0]))));
  const y0 = Math.max(0, Math.floor(Math.min(...cs.map((c) => c[1])))), y1 = Math.min(a.heightPx, Math.ceil(Math.max(...cs.map((c) => c[1]))));
  let sum = 0, n = 0;
  for (let y = y0; y < y1; y += rowStride) for (let x = x0; x < x1; x += rowStride) {
    const u = x + 0.5 - dx, v = y + 0.5 - dy, bx = Math.floor(ia * u + ic * v), by = Math.floor(ib * u + id * v);
    if (bx < 0 || by < 0 || bx >= b.widthPx || by >= b.heightPx) continue;
    sum += Math.abs(a.gray[y * a.widthPx + x] - b.gray[by * b.widthPx + bx]); n++;
  }
  if (n * rowStride * rowStride < minArea) return null;
  return { residual: sum / n, overlapPx: n * rowStride * rowStride };
}

function sweep(a, b, cx, cy, r, { linear, rowStride, minFraction, ry = r }) {
  let best = null; const all = [];
  for (let dy = cy - ry; dy <= cy + ry; dy++) for (let dx = cx - r; dx <= cx + r; dx++) {
    const s = residualAt(a, b, dx, dy, { linear, rowStride, minFraction });
    if (!s) continue;
    all.push(s.residual);
    if (!best || s.residual < best.residual) best = { dx, dy, ...s };
  }
  if (!best) return null;
  all.sort((p, q) => p - q);
  return { ...best, medianResidual: all[all.length >> 1], offsets: all.length };
}

/**
 * Local search: the offset of b's origin in a (cropped rasters), coarse-to-fine in a window of radiusPx around `predicted`
 * ([dx, dy], a's px). Levels (px per level px): localLevels[0] sweeps the whole window (its median residual is the contrast
 * reference); each next level sweeps +- (previous factor / this factor + 1) around the winner carried down.
 */
export function localSearch(a, b, { predicted, radiusPx, linear = null }) {
  const L = STITCH.localLevels, f0 = L[0], cr = Math.ceil(radiusPx / f0);
  const pyramid = (r) => L.map((f) => downsample(r, f)), A = pyramid(a), B = pyramid(b);   // levels cached per raster
  const coarse = sweep(A[0], B[0], Math.round(predicted[0] / f0), Math.round(predicted[1] / f0), cr, { linear, rowStride: 1, minFraction: 0.01 });
  if (!coarse) return { found: false, condition: 'no overlap anywhere in the search window' };
  let at = coarse;
  for (let k = 1; k < L.length; k++) {
    const r = Math.ceil(L[k - 1] / L[k]) + 1, s = L[k - 1] / L[k];
    at = sweep(A[k], B[k], Math.round(at.dx * s), Math.round(at.dy * s), r, { linear, rowStride: L[k] === 1 ? STITCH.fineStride : STITCH.rowStride, minFraction: 0.01 }) ?? at;
  }
  const fine = sweep(a, b, at.dx, at.dy, 1, { linear, rowStride: STITCH.rowStride, minFraction: 0.01 }) ?? at;   // polish: +- 1 px, every 2nd row and column
  const atPredicted = residualAt(a, b, Math.round(predicted[0]), Math.round(predicted[1]), { linear, rowStride: STITCH.fineStride, minFraction: 0.01 });
  const contrast = fine.residual / coarse.medianResidual;
  const shiftPx = Math.hypot(fine.dx - predicted[0], fine.dy - predicted[1]);
  const inside = Math.abs(coarse.dx - Math.round(predicted[0] / f0)) < cr && Math.abs(coarse.dy - Math.round(predicted[1] / f0)) < cr;
  return { found: true, offset: [fine.dx, fine.dy], residual: fine.residual, overlapPx: fine.overlapPx, windowMedianResidual: coarse.medianResidual, contrast,
    residualAtPredicted: atPredicted?.residual ?? null, tightenedPx: shiftPx, insideWindow: inside, confirmed: inside && contrast <= STITCH.confirmContrast, windowRadiusPx: radiusPx };
}

/** Full search (stitch.ts findBestTranslation, ported) plus the coarse median residual for the same confirmation rule. */
export function fullSearch(a, b) {
  const factor = Math.max(1, Math.floor(Math.min(a.widthPx, a.heightPx, b.widthPx, b.heightPx) / STITCH.coarseTargetDim));
  const ca = downsample(a, factor), cb = downsample(b, factor);
  const w = (cb.widthPx + ca.widthPx) >> 1, h = (cb.heightPx + ca.heightPx) >> 1;   // every offset with any overlap: stitch.ts's range
  const coarse = sweep(ca, cb, (ca.widthPx - cb.widthPx) >> 1, (ca.heightPx - cb.heightPx) >> 1, w, { linear: null, rowStride: 1, minFraction: STITCH.minOverlapFraction, ry: h });
  if (!coarse) return { found: false, condition: 'no offset overlaps the minimum fraction' };
  let cx = coarse.dx * factor, cy = coarse.dy * factor;
  const mid = Math.max(1, Math.floor(factor / 4));
  if (mid > 1) {
    const rm = Math.ceil((factor / mid) * STITCH.refineRadiusFactor), m = sweep(downsample(a, mid), downsample(b, mid), Math.round(cx / mid), Math.round(cy / mid), rm, { linear: null, rowStride: 2, minFraction: STITCH.minOverlapFraction });
    if (m) { cx = m.dx * mid; cy = m.dy * mid; }
  }
  const fine = sweep(a, b, cx, cy, Math.ceil(mid * STITCH.refineRadiusFactor), { linear: null, rowStride: 4, minFraction: STITCH.minOverlapFraction });
  const contrast = fine.residual / coarse.medianResidual;
  return { found: true, offset: [fine.dx, fine.dy], residual: fine.residual, overlapPx: fine.overlapPx, windowMedianResidual: coarse.medianResidual, contrast, confirmed: contrast <= STITCH.confirmContrast, coarseFactor: factor };
}

// ----------------------------------------------------------------- affine helpers (affine6 convention)
const I6 = Object.freeze([1, 0, 0, 1, 0, 0]);
const apply6 = (c, x, y) => [c[0] * x + c[2] * y + c[4], c[1] * x + c[3] * y + c[5]];
const compose6 = ([A, B, C, D, E, F], [a, b, c, d, e, f]) => [A * a + C * b, B * a + D * b, A * c + C * d, B * c + D * d, A * e + C * f + E, B * e + D * f + F];
const invert6 = ([a, b, c, d, e, f]) => { const det = a * d - b * c; return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det]; };
const scaleOf = (c) => Math.sqrt(Math.abs(c[0] * c[3] - c[1] * c[2]));
const isTranslation = (c) => c[0] === 1 && c[1] === 0 && c[2] === 0 && c[3] === 1;
const clean = (c) => c.map((v) => (Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v) : v));
export const TRANSFORM = Object.freeze({ apply: apply6, compose: compose6, invert: invert6, identity: I6 });

// ----------------------------------------------------------------- placement of one capture
const badgeFrame = (t) => ({ name: t.name, badges: t.badges });
const median = (v) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : null; };

/**
 * The link b -> a (b's SOURCE px to a's source px) from the shared badges, confirmed and tightened by pixels. Returns the
 * link record; `coefficients` is the final source-frame transform when confirmed.
 */
function linkOf(a, b, { radiusPx }) {
  const pairs = sharedPairs(a, b), tr = [1, 0, 0, 1, pairs.reduce((s, [p, q]) => s + p.xPx - q.xPx, 0) / pairs.length, pairs.reduce((s, [p, q]) => s + p.yPx - q.yPx, 0) / pairs.length];
  const px = localSearch(a.gray, b.gray, { predicted: croppedOffset(a, b, tr), radiusPx });
  const link = { a: a.name, b: b.name, evidence: 'badges', sharedHoles: pairs.map(([p]) => p.holeNumber), shared: pairs.length, model: 'translation',
    badgeOffsetPx: [round3(tr[4]), round3(tr[5])], badgeRmsPx: round3(badgeRms(pairs, tr)), pixel: px.found ? pick(px) : { found: false, condition: px.condition } };
  return settle(link, px.found && px.confirmed ? { coefficients: fromCropped(a, b, tr, px.offset), px } : null);
}
const sharedPairs = (a, b) => { const bm = new Map(b.badges.map((p) => [p.holeNumber, p])); return a.badges.filter((p) => bm.has(p.holeNumber)).map((p) => [p, bm.get(p.holeNumber)]); };
const badgeRms = (pairs, c) => Math.sqrt(pairs.reduce((s, [p, q]) => { const m = apply6(c, q.xPx, q.yPx); return s + (m[0] - p.xPx) ** 2 + (m[1] - p.yPx) ** 2; }, 0) / pairs.length);
// source frame -> cropped rasters: q_a = M q_b + t' with t' = M (crop_b origin) + t - (crop_a origin)
const croppedOffset = (a, b, c) => { const [ox, oy] = apply6(c, b.crop.xPx, b.crop.yPx); return [ox - a.crop.xPx, oy - a.crop.yPx]; };
const fromCropped = (a, b, c, off) => { const [ox, oy] = apply6([c[0], c[1], c[2], c[3], 0, 0], b.crop.xPx, b.crop.yPx); return [c[0], c[1], c[2], c[3], off[0] + a.crop.xPx - ox, off[1] + a.crop.yPx - oy]; };
function settle(link, best) {
  link.confirmed = Boolean(best);
  if (best) Object.assign(link, { coefficients: clean(best.coefficients), residualLuma: round3(best.px.residual), overlapPx: best.px.overlapPx, contrast: round3(best.px.contrast), tightenedPx: round3(best.px.tightenedPx ?? 0) });
  return link;
}
/**
 * Escalation, only on evidence: the link's translation residual stands out against the capture's (escalateResidualRatio x its
 * median), >= escalateMinShared badges, and their similarity fit is escalateBadgeGain x tighter than translation. The similarity is
 * re-searched by pixels and kept only when its residual is escalateGain x lower. Returns the link, possibly escalated.
 */
function escalate(link, a, b, { similarity, radiusPx, medianResidual }) {
  if (!similarity || !link.confirmed || link.shared < STITCH.escalateMinShared || !(link.residualLuma > STITCH.escalateResidualRatio * medianResidual)) return link;
  const pairs = sharedPairs(a, b), tr = [1, 0, 0, 1, link.badgeOffsetPx[0], link.badgeOffsetPx[1]];
  const s = similarity(pairs.map(([p, q]) => ({ id: String(p.holeNumber), enabled: true, source: { xPx: q.xPx, yPx: q.yPx }, target: { xPx: p.xPx, yPx: p.yPx } })));
  if (!s || !('transform' in s) || !(s.metrics.rmsDistance * STITCH.escalateBadgeGain < badgeRms(pairs, tr))) return link;
  const c = s.transform.coefficients, sp = localSearch(a.gray, b.gray, { predicted: croppedOffset(a, b, c), radiusPx, linear: [c[0], c[1], c[2], c[3]] });
  const gain = sp.found ? link.residualLuma / sp.residual : null;
  link.escalation = { model: 'similarity', why: `translation residual ${link.residualLuma} luma > ${STITCH.escalateResidualRatio} x capture median ${round3(medianResidual)}`, badgeRmsPx: round3(s.metrics.rmsDistance),
    scale: round6(scaleOf(c)), rotationDeg: round3(Math.atan2(c[1], c[0]) * 180 / Math.PI), pixel: sp.found ? pick(sp) : { found: false, condition: sp.condition },
    translationResidualLuma: link.residualLuma, residualGain: gain == null ? null : round3(gain), kept: Boolean(sp.found && sp.confirmed && gain >= STITCH.escalateGain) };
  if (!link.escalation.kept) return link;
  link.model = 'similarity';
  return settle(link, { coefficients: fromCropped(a, b, c, sp.offset), px: sp });
}
function pixelLinkOf(a, b) {
  const px = fullSearch(a.gray, b.gray);
  const link = { a: a.name, b: b.name, evidence: 'pixels', sharedHoles: [], shared: 0, model: 'translation', pixel: px.found ? pick(px) : { found: false, condition: px.condition } };
  link.confirmed = Boolean(px.found && px.confirmed);
  if (link.confirmed) { link.coefficients = [1, 0, 0, 1, px.offset[0] + a.crop.xPx - b.crop.xPx, px.offset[1] + a.crop.yPx - b.crop.yPx]; link.residualLuma = round3(px.residual); link.overlapPx = px.overlapPx; link.contrast = round3(px.contrast); }
  return link;
}
const round3 = (v) => Math.round(v * 1000) / 1000, round6 = (v) => Math.round(v * 1e6) / 1e6;
const pick = (p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, typeof v === 'number' ? round3(v) : v]));

/**
 * tiles: [{ name, crop: { xPx, yPx, widthPx, heightPx } (S0's crop, source px), gray (luma of the crop), badges: [{ holeNumber,
 * xPx, yPx }] (source px), badgeWidthPx }]. place: A2's placeTiles; similarity: estimateSimilarity (fg/queries/identity.mjs).
 */
export function placeCapture(tiles, { place = placeTiles, similarity = (pairs) => estimateSimilarity({ pairs }) } = {}) {
  const n = tiles.length, byName = new Map(tiles.map((t) => [t.name, t]));
  if (n === 1) return { seed: tiles[0].name, frameTile: tiles[0].name, tree: [], links: [], rejected: [], closures: [], transforms: { [tiles[0].name]: [...I6] }, unplaced: [], badgeGraph: null };
  const radiusPx = Math.ceil(median(tiles.map((t) => t.badgeWidthPx).filter((w) => w > 0)) ?? 48);
  // every pair that shares a badge is a hypothesis; pixels confirm (or reject) each one, and tighten it
  const hyp = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const shared = tiles[i].badges.filter((p) => tiles[j].badges.some((q) => q.holeNumber === p.holeNumber)).length;
    if (shared) hyp.push(linkOf(tiles[i], tiles[j], { radiusPx }));
  }
  const medianResidual = median(hyp.filter((l) => l.confirmed).map((l) => l.residualLuma));
  for (const l of hyp) escalate(l, byName.get(l.a), byName.get(l.b), { similarity, radiusPx, medianResidual });
  const links = hyp.filter((l) => l.confirmed), rejected = hyp.filter((l) => !l.confirmed);
  // the badge tree (A2's place, translation only), every rejected link cut; among equally supported badge edges the pixel
  // residual decides (a weight adjustment smaller than any difference in shared badges)
  const graph = place(tiles.map(badgeFrame), { minShared: 1, models: ['translation'], exclude: rejected.map((r) => `${r.a}|${r.b}`),
    adjust: Object.fromEntries(links.map((l) => [`${l.a}|${l.b}`, -l.residualLuma / 100])) });
  const linkFor = (p, c) => { const l = links.find((x) => x.a === p && x.b === c); if (l) return { link: l, coefficients: l.coefficients }; const r = links.find((x) => x.a === c && x.b === p); return { link: r, coefficients: clean(invert6(r.coefficients)) }; };
  const T = new Map([[graph.seed, [...I6]]]), tree = [];
  for (const e of graph.tree) { const { link, coefficients } = linkFor(e.parent, e.child); T.set(e.child, compose6(T.get(e.parent), coefficients)); tree.push({ parent: e.parent, child: e.child, evidence: link.evidence, model: link.model, sharedHoles: link.sharedHoles }); }
  // pixels alone, for tiles no badge edge placed: full-overlap search against every placed tile, the clearest confirmed link wins
  for (let progress = true; progress && T.size < n;) {
    progress = false;
    for (const t of tiles) {
      if (T.has(t.name)) continue;
      const tries = [...T.keys()].map((p) => pixelLinkOf(byName.get(p), t)).filter((l) => l.confirmed).sort((x, y) => x.contrast - y.contrast);
      if (!tries.length) continue;
      links.push(tries[0]); tree.push({ parent: tries[0].a, child: t.name, evidence: 'pixels', model: 'translation', sharedHoles: [] });
      T.set(t.name, compose6(T.get(tries[0].a), tries[0].coefficients)); progress = true;
    }
  }
  // frame: the placed tile whose scale is the median (translation-only captures: the seed)
  const placed = tiles.filter((t) => T.has(t.name)), scales = placed.map((t) => scaleOf(T.get(t.name))), ms = median(scales);
  const frameTile = placed[scales.findIndex((s) => s === ms)]?.name ?? graph.seed, R = invert6(T.get(frameTile));
  const transforms = Object.fromEntries(placed.map((t) => [t.name, clean(compose6(R, T.get(t.name)))]));
  // loop closure: every confirmed link not in the tree, against the final placement (px at b's crop centre)
  const inTree = (l) => tree.some((e) => (e.parent === l.a && e.child === l.b) || (e.parent === l.b && e.child === l.a));
  const closures = links.filter((l) => !inTree(l) && transforms[l.a] && transforms[l.b]).map((l) => {
    const t = byName.get(l.b), c = [t.crop.xPx + t.crop.widthPx / 2, t.crop.yPx + t.crop.heightPx / 2];
    const direct = apply6(compose6(transforms[l.a], l.coefficients), ...c), placedAt = apply6(transforms[l.b], ...c);
    return { a: l.a, b: l.b, sharedHoles: l.sharedHoles, residualLuma: l.residualLuma, disagreementPx: round3(Math.hypot(direct[0] - placedAt[0], direct[1] - placedAt[1])) };
  });
  return { seed: graph.seed, frameTile, radiusPx, tree, links, rejected, closures, transforms, unplaced: tiles.filter((t) => !T.has(t.name)).map((t) => t.name),
    badgeGraph: { edges: graph.edges.map((e) => ({ a: e.a, b: e.b, shared: e.shared, sharedHoles: e.sharedHoles, rmsPx: e.rmsPx, verified: e.verified })) } };
}

// ----------------------------------------------------------------- the composite frame and its pixels
const cornersOf = (crop) => [[crop.xPx, crop.yPx], [crop.xPx + crop.widthPx, crop.yPx], [crop.xPx + crop.widthPx, crop.yPx + crop.heightPx], [crop.xPx, crop.yPx + crop.heightPx]];

/** ChainSpot stitchPipeline: shift the union of the coverage polygons by -floor(min); widths ceil(max) - floor(min). */
export function compositeFrame(tiles, transforms) {
  const raw = tiles.filter((t) => transforms[t.name]).map((t) => ({ t, poly: cornersOf(t.crop).map(([x, y]) => apply6(transforms[t.name], x, y)) }));
  const xs = raw.flatMap((r) => r.poly.map((p) => p[0])), ys = raw.flatMap((r) => r.poly.map((p) => p[1]));
  const sx = -Math.floor(Math.min(...xs)), sy = -Math.floor(Math.min(...ys));
  const widthPx = Math.ceil(Math.max(...xs)) - Math.floor(Math.min(...xs)), heightPx = Math.ceil(Math.max(...ys)) - Math.floor(Math.min(...ys));
  const placed = raw.map(({ t }) => {
    const c = clean(compose6([1, 0, 0, 1, sx, sy], transforms[t.name]));
    const [cx, cy] = apply6(c, t.crop.xPx + t.crop.widthPx / 2, t.crop.yPx + t.crop.heightPx / 2);
    return { name: t.name, transform: { model: isTranslation(c) ? 'translation' : 'similarity', coefficients: c }, coveragePolygon: cornersOf(t.crop).map(([x, y]) => { const p = apply6(c, x, y); return { xPx: round3(p[0]), yPx: round3(p[1]) }; }),
      centrePx: [round3(cx), round3(cy)], copy: isTranslation(c) && Number.isInteger(c[4]) && Number.isInteger(c[5]) ? 'direct' : 'nearest' };
  });
  return { widthPx, heightPx, tiles: placed };
}

/**
 * The course raster: every output pixel from the covering tile that sees it deepest (overlapRule), sampled at the pixel
 * centre (ChainSpot paintResampled; an integer translation is the same pixel as a direct copy). owner: Uint8Array, tile
 * index + 1 per pixel (0: uncovered, painted opaque black).
 */
export function compositeRaster(tiles, frame) {
  const W = frame.widthPx, H = frame.heightPx, rgba = new Uint8ClampedArray(W * H * 4), owner = new Uint8Array(W * H);
  const byName = new Map(tiles.map((t, i) => [t.name, { t, i }]));
  const P = frame.tiles.map((p) => {
    const { t, i } = byName.get(p.name), inv = invert6(p.transform.coefficients), xs = p.coveragePolygon.map((q) => q.xPx), ys = p.coveragePolygon.map((q) => q.yPx);
    return { t, i, inv, cx: p.centrePx[0], cy: p.centrePx[1], x0: Math.max(0, Math.floor(Math.min(...xs))), x1: Math.min(W - 1, Math.ceil(Math.max(...xs))), y0: Math.max(0, Math.floor(Math.min(...ys))), y1: Math.min(H - 1, Math.ceil(Math.max(...ys))) };
  });
  const best = new Float64Array(W * H).fill(-Infinity), src = new Int32Array(W * H).fill(-1);
  for (const p of P) {
    const { crop, widthPx } = p.t, [a, b, c, d, e, f] = p.inv;
    if (a === 1 && b === 0 && c === 0 && d === 1 && Number.isInteger(e) && Number.isInteger(f)) {   // integer translation: a direct copy
      const X0 = Math.max(0, crop.xPx - e), X1 = Math.min(W, crop.xPx + crop.widthPx - e), Y0 = Math.max(0, crop.yPx - f), Y1 = Math.min(H, crop.yPx + crop.heightPx - f);
      for (let y = Y0; y < Y1; y++) {
        const sy = y + f, dyEdge = Math.min(sy + 0.5 - crop.yPx, crop.yPx + crop.heightPx - sy - 0.5);
        for (let x = X0; x < X1; x++) {
          const sx = x + e, k = y * W + x, depth = Math.min(dyEdge, sx + 0.5 - crop.xPx, crop.xPx + crop.widthPx - sx - 0.5);
          if (depth > best[k]) { best[k] = depth; owner[k] = p.i + 1; src[k] = sy * widthPx + sx; }
        }
      }
      continue;
    }
    for (let y = p.y0; y <= p.y1; y++) for (let x = p.x0; x <= p.x1; x++) {
      const u = x + 0.5, v = y + 0.5, mx = a * u + c * v + e, my = b * u + d * v + f, sx = Math.floor(mx), sy = Math.floor(my);
      if (sx < crop.xPx || sy < crop.yPx || sx >= crop.xPx + crop.widthPx || sy >= crop.yPx + crop.heightPx) continue;
      const k = y * W + x, depth = Math.min(mx - crop.xPx, crop.xPx + crop.widthPx - mx, my - crop.yPx, crop.yPx + crop.heightPx - my);
      if (depth > best[k]) { best[k] = depth; owner[k] = p.i + 1; src[k] = sy * widthPx + sx; }
    }
  }
  for (let k = 0; k < W * H; k++) {
    const o = k * 4;
    if (!owner[k]) { rgba[o + 3] = 255; continue; }   // uncovered: opaque black
    const s = src[k] * 4, rgbaT = tiles[owner[k] - 1].rgba; rgba[o] = rgbaT[s]; rgba[o + 1] = rgbaT[s + 1]; rgba[o + 2] = rgbaT[s + 2]; rgba[o + 3] = rgbaT[s + 3];
  }
  return { widthPx: W, heightPx: H, rgba, owner };
}

/** A composite point back to its tiles: every tile whose crop covers it, in source px, the owner (overlap rule) first. */
export function sourcePoint(frame, owner, point) {
  const k = Math.floor(point.yPx) * frame.widthPx + Math.floor(point.xPx), own = owner && k >= 0 && k < owner.length ? owner[k] : 0;
  return frame.tiles.map((p, i) => ({ p, i })).map(({ p, i }) => {
    const [x, y] = apply6(invert6(p.transform.coefficients), point.xPx, point.yPx);
    const poly = p.coveragePolygon, inside = point.xPx >= Math.min(...poly.map((q) => q.xPx)) && point.xPx < Math.max(...poly.map((q) => q.xPx)) && point.yPx >= Math.min(...poly.map((q) => q.yPx)) && point.yPx < Math.max(...poly.map((q) => q.yPx));
    return { tile: p.name, xPx: round3(x), yPx: round3(y), covers: inside, owner: own === i + 1 };
  }).filter((c) => c.covers).sort((a, b) => b.owner - a.owner);
}

export const STITCH_QUERIES = Object.freeze({
  // tiles / a / b: rasters or the tiles Part of a capture (a Part reference string resolves through the store)
  'fn.q.stitch.local': ({ a, b, predicted, radiusPx, linear }) => ({ value: localSearch(a, b, { predicted, radiusPx, linear }), unit: 'offset: px (b origin in a, cropped rasters); residual: luma levels 0..255 (mean |a - b| over the overlap); contrast: ratio (best / window median residual)' }),
  'fn.q.stitch.full': ({ a, b }) => ({ value: fullSearch(a, b), unit: 'offset: px (b origin in a); residual: luma levels 0..255; contrast: ratio' }),
  'fn.q.stitch.place': ({ tiles }) => ({ value: placeCapture(tiles), unit: 'transforms: tile source px -> frame-tile source px ([a, b, c, d, e, f]); residualLuma: luma levels 0..255; contrast: ratio; badge offsets / rms: px' }),
  'fn.q.stitch.frame': ({ tiles, transforms }) => ({ value: compositeFrame(tiles, transforms), unit: 'px (composite frame; transform: tile source px -> composite px)' }),
  'fn.q.stitch.composite': ({ tiles, frame }) => ({ value: compositeRaster(tiles, frame), unit: 'raster RGBA, composite px; owner: tile index + 1 per pixel (0: uncovered)' }),
  'fn.q.stitch.sourcePoint': ({ frame, owner, point }) => ({ value: sourcePoint(frame, owner, point), unit: 'px (tile source raster; owner: the tile the overlap rule painted the point from)' })
});
