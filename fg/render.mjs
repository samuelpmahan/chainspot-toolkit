/**
 * renderable: a default property of every Part (Sam, 2026-10-18). Any value at any address renders to flipbook frame
 * parts (fg/flipbook.mjs kinds: pxset, bbox, points, ledger, scalar, raster) by pattern matching on the shape of the
 * value, written once here. The same render feeds the UI and flipbook-style tests. Browser-safe.
 *
 * The union, in match order (first case that fits):
 *   pxset         a PixelSet (fg/pxset.mjs)                             -> pxset
 *   routeMatchView { schema: 'nctk-s7-trace-view@1', rows, ... }       -> the course picture with the traces, bends before / after and testimony (fg/s7trace/traceViewRender.mjs)
 *   routeTable    { schema: 'nctk-s7-route-table@1', matrix, ... }      -> raster heatmap holes x baskets + legend (fg/s7route/routeRender.mjs)
 *   spriteOverlap { schema: 'nctk-sprite-overlap@1', mean, shape, members } -> mean coverage and shape panels + ledger (fn.q.sprite.overlap)
 *   shellShape    { schema: 'chainspot-basket-shell-shape@1', overlap, learned, carried } -> agreement / learned / carried panels + ledger (S2)
 *   udiscHeader   { schema: 'nctk-udisc-header@1', bandRaster, glyphs, ... } -> the header band, glyphs boxed by confidence + legend (fg/header/headerRender.mjs)
 *   capture       { schema: 'nctk-capture@1' | 'nctk-capture-view@1', tiles, links, ... } -> the course raster with its tiles,
 *                 seams, links and badges (fg/stitch/captureRender.mjs)
 *   raster        { rgba, widthPx, heightPx }                          -> raster (size; pixels come from the viewer)
 *   alphaProfile  { schema: 'nctk-alpha-profile@1', overlays, ... }    -> ledger + raster swatches, crops, histogram (fg/alpha/alphaRender.mjs)
 *   plane         { width, height } + a typed array of width*height     -> raster (size) + ledger (value counts)
 *   pxsets        [{ px, bbox?, label? }]                                -> pxset (union) + bbox (labelled)
 *   boxes         [{ bbox }]                                             -> bbox (labelled)
 *   points        [{ center: [x, y] }]                                   -> points (labelled)
 *   rows          [{ ... }]                                              -> ledger (scalar fields)
 *   strips        { strips: [{ label, panels: [{ origin, widthPx, heightPx, rgb }], lines?, marks? }], legend? }
 *                 -> one raster (PNG) per strip: its crops side by side, upscaled, lines and marks drawn in raster
 *                 coords (the S5 residual strips, ports/s5pair) + a legend ledger + its scalar fields
 *   scalar        number / string / boolean / null                      -> scalar
 *   object        { ... }                                                -> ledger (one row per scalar field) + its renderable fields
 * A value that matches nothing is reported as { kind: 'unrenderable' }: the default-property test fails on it, and the
 * fix is a new case here, never a renderer at the call site.
 */
import { isPxSet, renderPart as renderPxSet } from './pxset.mjs';
import { encodePngRgb, base64 } from './png.mjs';
import { renderAlphaProfile } from './alpha/alphaRender.mjs';   // S7 lane: tk.s7.alphaProfile (contracts/alpha.profile@1)
import { isHallwayScene, renderHallwayScene } from './s7trace/sceneRender.mjs';   // S7 trace lane block: tk.s7.scene
import { isTraceView, renderTraceView } from './s7trace/traceViewRender.mjs';   // S7 trace lane block: tk.s7.routeMatchView
import { isRouteTable, renderRouteTable } from './s7route/routeRender.mjs';   // S7 scoring block: tk.s7.routeTable
import { isCourseGeometry, renderCourseGeometry } from './export/courseRender.mjs';   // export block: tk.export.course
import { isCapture, renderCapture } from './stitch/captureRender.mjs';   // S0 capture block: tk.source.capture / tk.source.captureView
import { isUdiscHeader, renderUdiscHeader } from './header/headerRender.mjs';   // S0 header block: tk.source.header (the UDisc header bar read)

const isTyped = (v) => ArrayBuffer.isView(v) && !(v instanceof DataView);
const isScalar = (v) => v === null || ['number', 'string', 'boolean'].includes(typeof v);
const labelOf = (it, i) => it.label ?? it.name ?? it.candidate ?? it.hole ?? String(i);
const scalarFields = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => isScalar(v) || (Array.isArray(v) && v.length <= 6 && v.every(isScalar))).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : v]));
const bboxOf = (it) => (Array.isArray(it.bbox) && it.bbox.length === 4 ? it.bbox : null);

export const PART_KINDS = Object.freeze(['pxset', 'raster', 'alphaProfile', 'plane', 'pxsets', 'boxes', 'points', 'rows', 'strips', 'scalar', 'object', 'pathLoss', 'pathProfile', 'hallwayScene', 'pairFeatures', 'routeTable', 'routeMatchView', 'courseGeometry', 'capture', 'shellShape', 'spriteOverlap', 'udiscHeader']);   // strips: S5-B; alphaProfile: S7-A; pathLoss, pathProfile: S6-B; hallwayScene: S7-B; pairFeatures: S6 scoring; routeTable: S7 scoring

/** Which case of the union a value is (the dispatch every default property can share). */
export function partKind(v) {
  const s6 = s6PathKind(v); if (s6) return s6;   // S6-B block below
  if (isPxSet(v)) return 'pxset';
  if (v && typeof v === 'object' && v.schema === 'nctk-alpha-profile@1') return 'alphaProfile';   // S7 lane block
  if (isHallwayScene(v)) return 'hallwayScene';   // S7 trace lane block
  if (isRouteTable(v)) return 'routeTable';   // S7 scoring block
  if (isCourseGeometry(v)) return 'courseGeometry';   // export block: the exported holes over the course
  if (isCapture(v)) return 'capture';   // S0 capture block: the tiles behind the course raster
  if (isUdiscHeader(v)) return 'udiscHeader';   // S0 header block: the band, glyphs boxed by confidence
  if (isTraceView(v)) return 'routeMatchView';   // S7 trace lane block: the traces over the course
  if (v && typeof v === 'object' && v.schema === 'chainspot-basket-shell-shape@1') return 'shellShape';   // S2: px.baskets.shellShape
  if (v && typeof v === 'object' && v.schema === 'nctk-sprite-overlap@1') return 'spriteOverlap';   // fn.q.sprite.overlap answers
  if (v && typeof v === 'object' && v.rgba && Number.isInteger(v.widthPx) && Number.isInteger(v.heightPx)) return 'raster';
  if (Array.isArray(v)) {
    const it = v.find((x) => x && typeof x === 'object');
    if (!v.length || !it) return v.every(isScalar) ? 'rows' : 'unrenderable';
    if (it.px && (isTyped(it.px) || Array.isArray(it.px))) return 'pxsets';
    if (bboxOf(it)) return 'boxes';
    if (Array.isArray(it.center) && it.center.length === 2) return 'points';
    return 'rows';
  }
  if (isScalar(v)) return 'scalar';
  if (isTyped(v)) return 'scalar';
  if (v && typeof v === 'object' && Array.isArray(v.strips) && v.strips.every((s) => s && Array.isArray(s.panels))) return 'strips';
  if (v && typeof v === 'object') return 'object';
  return 'unrenderable';
}

/** Frame parts for one value. dims: { widthPx, heightPx } of the image (for px coordinates). */
export function renderValue(address, v, dims = null, depth = 0, opts = {}) {
  const W = dims?.widthPx ?? null;
  const kind = partKind(v);
  switch (kind) {
    case 'pathLoss': case 'pathProfile': return renderS6Path(address, v, kind);   // S6-B block below
    case 'pairFeatures': return renderPairFeatures(address, v);   // S6 scoring block below
    case 'pxset': return { kind, parts: [renderPxSet(v, { address })] };
    case 'raster': return { kind, parts: [{ address, kind: 'raster', data: { width: v.widthPx, height: v.heightPx } }] };
    case 'alphaProfile': return renderAlphaProfile(address, v, dims);   // S7 lane block: swatches, unmixed crops, residual histogram
    case 'hallwayScene': return renderHallwayScene(address, v);   // S7 trace lane block: luminance, mask, BasketPoints
    case 'routeMatchView': return renderTraceView(address, v, dims, { canvas: s6Canvas, deflate: opts.deflate ?? null });   // S7 trace lane block: routes, bends before / after, testimony over the course
    case 'courseGeometry': return renderCourseGeometry(address, v, dims, { canvas: s6Canvas, deflate: opts.deflate ?? null });   // export block: holes, bends, badges, candidates over the course
    case 'capture': return renderCapture(address, v, dims, { canvas: s6Canvas, deflate: opts.deflate ?? null });
    case 'udiscHeader': return renderUdiscHeader(address, v, { canvas: s6Canvas, deflate: opts.deflate ?? null });
    case 'shellShape': return renderShellShape(address, v);   // S2 block below
    case 'spriteOverlap': return renderSpriteOverlap(address, v);   // S2 block below   // S0 capture block: tiles, seams, links, badges over the course
    case 'routeTable': return renderRouteTable(address, v, { canvas: s6Canvas });   // S7 scoring block: holes x baskets heatmap
    case 'pxsets': {
      const px = []; for (const it of v) for (const i of it.px) px.push(i);
      const boxes = v.map((it, i) => (bboxOf(it) ? [...bboxOf(it), labelOf(it, i)] : null)).filter(Boolean);
      return { kind, parts: [{ address: `${address}#px`, kind: 'pxset', data: { width: W, height: dims?.heightPx ?? null, px } }, ...(boxes.length ? [{ address: `${address}#bbox`, kind: 'bbox', data: { boxes } }] : [])] };
    }
    case 'boxes': return { kind, parts: [{ address, kind: 'bbox', data: { boxes: v.map((it, i) => [...bboxOf(it), labelOf(it, i)]) } }] };
    case 'points': return { kind, parts: [{ address, kind: 'points', data: { points: v.map((it, i) => [...it.center, labelOf(it, i)]) } }] };
    case 'rows': return { kind, parts: [{ address, kind: 'ledger', data: { rows: v.map((it) => (isScalar(it) ? { value: it } : scalarFields(it))) } }] };
    case 'strips': {
      const own = scalarFields(v);
      const parts = Object.keys(own).length ? [{ address, kind: 'ledger', data: { rows: Object.entries(own).map(([field, value]) => ({ field, value })) } }] : [];
      if (Array.isArray(v.legend) && v.legend.length) parts.push({ address: `${address}#legend`, kind: 'ledger', data: { rows: v.legend.map((l) => ({ colour: `rgb(${l.color.join(', ')})`, meaning: l.meaning })) } });
      v.strips.forEach((s, i) => parts.push({ address: s.label ?? `${address}#${i}`, kind: 'raster', data: stripPng(s, v.scale ?? 4) }));
      return { kind, parts };
    }
    case 'scalar': return { kind, parts: [{ address, kind: 'scalar', data: isTyped(v) ? { value: v.length, unit: `elements (${v.constructor.name})` } : { value: v, unit: null } }] };
    case 'object': {
      // a plane: a typed array covering the image -> its size and value histogram
      const planes = Object.entries(v).filter(([, x]) => isTyped(x) && W && x.length === W * (dims?.heightPx ?? -1));
      const own = scalarFields(v);
      const parts = Object.keys(own).length ? [{ address, kind: 'ledger', data: { rows: Object.entries(own).map(([field, value]) => ({ field, value })) } }] : [];
      for (const [k, x] of planes) {
        const counts = new Map(); for (let i = 0; i < x.length; i++) counts.set(x[i], (counts.get(x[i]) ?? 0) + 1);
        parts.push({ address: `${address}.${k}`, kind: 'raster', data: { width: W, height: dims.heightPx } },
          { address: `${address}.${k}#values`, kind: 'ledger', data: { rows: [...counts].sort((a, b) => a[0] - b[0]).slice(0, 64).map(([value, px]) => ({ value, px })) } });
      }
      if (depth < 2) for (const [k, x] of Object.entries(v)) {
        if (isScalar(x) || isTyped(x) || (Array.isArray(x) && x.every(isScalar))) continue;
        const sub = renderValue(`${address}.${k}`, x, dims, depth + 1);
        if (sub.kind !== 'unrenderable') parts.push(...sub.parts);
      }
      return { kind, parts };
    }
    default: return { kind: 'unrenderable', parts: [] };
  }
}

/**
 * One strip as a PNG (fg/png.mjs, stored deflate): panels side by side with a 2 px gap, each upscaled by `scale`
 * (nearest), lines clipped to each panel and drawn 1 px wide, marks as 3-px-arm crosses. Coordinates are raster px
 * (pixel i's centre at i), so a line drawn over two panels shows the same geometry in both.
 */
function stripPng(strip, scale) {
  const gap = 2, panels = strip.panels, H = Math.max(...panels.map((p) => p.heightPx)) * scale;
  const offs = []; let W = 0; for (const p of panels) { offs.push(W); W += p.widthPx * scale + gap; } W -= gap;
  const rgb = new Uint8Array(W * H * 3).fill(255);
  panels.forEach((p, k) => {
    for (let y = 0; y < p.heightPx * scale; y++) for (let x = 0; x < p.widthPx * scale; x++) {
      const s = (Math.floor(y / scale) * p.widthPx + Math.floor(x / scale)) * 3, d = (y * W + offs[k] + x) * 3;
      rgb[d] = p.rgb[s]; rgb[d + 1] = p.rgb[s + 1]; rgb[d + 2] = p.rgb[s + 2];
    }
  });
  const put = (k, X, Y, c) => {   // raster coords -> panel k's scaled px
    const p = panels[k], lx = Math.floor((X - p.origin[0] + 0.5) * scale), ly = Math.floor((Y - p.origin[1] + 0.5) * scale);
    if (lx < 0 || ly < 0 || lx >= p.widthPx * scale || ly >= p.heightPx * scale) return;
    const d = (ly * W + offs[k] + lx) * 3; rgb[d] = c[0]; rgb[d + 1] = c[1]; rgb[d + 2] = c[2];
  };
  panels.forEach((p, k) => {
    const lo = [p.origin[0] - 0.5, p.origin[1] - 0.5], hi = [p.origin[0] + p.widthPx - 0.5, p.origin[1] + p.heightPx - 0.5];
    for (const l of strip.lines ?? []) {
      const d = [l.to[0] - l.from[0], l.to[1] - l.from[1]]; let t0 = 0, t1 = 1;
      for (let a = 0; a < 2; a++) {   // clip the segment to the panel (Liang-Barsky)
        if (Math.abs(d[a]) < 1e-12) { if (l.from[a] < lo[a] || l.from[a] > hi[a]) t1 = -1; continue; }
        let ta = (lo[a] - l.from[a]) / d[a], tb = (hi[a] - l.from[a]) / d[a]; if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      }
      if (t1 <= t0) continue;
      const steps = Math.ceil(Math.hypot(d[0], d[1]) * (t1 - t0) * scale * 2);
      for (let s = 0; s <= steps; s++) { const t = t0 + ((t1 - t0) * s) / steps; put(k, l.from[0] + t * d[0], l.from[1] + t * d[1], l.color); }
    }
    for (const m of strip.marks ?? []) for (let e = -3; e <= 3; e++) { put(k, m.at[0] + e / scale, m.at[1], m.color); put(k, m.at[0], m.at[1] + e / scale, m.color); }
  });
  return { width: W, height: H, png: base64(encodePngRgb({ width: W, height: H, rgb })) };
}

// ====================================================================================================================
// S2 block: px.baskets.shellShape (provider Basket.learnShellShape). Three panels in the sprite-frame window (the body
// padded by its own size): how many members are dark at each px (grey ramp; red where at least the agreement count),
// the learned shape and the carried dev prior (white = frame px, blue = the body bbox), and a ledger of the source, the
// agreement count and the learned-vs-carried comparison.
// ====================================================================================================================
function renderShellShape(address, v) {
  const { window: win, agree, memberCount } = v.overlap, n = win.width * win.height, need = v.agreementCount;
  const [bw, bh] = [win.width / 3, win.height / 3];
  const body = (x, y) => x >= win.bodyX && x < win.bodyX + bw && y >= win.bodyY && y < win.bodyY + bh;
  const panel = (paint) => { const rgb = new Uint8Array(n * 3); for (let i = 0; i < n; i++) { const c = paint(i, i % win.width, Math.floor(i / win.width)); rgb[i * 3] = c[0]; rgb[i * 3 + 1] = c[1]; rgb[i * 3 + 2] = c[2]; } return { origin: [0, 0], widthPx: win.width, heightPx: win.height, rgb }; };
  const shapeSet = (g) => { const s = new Set(); if (!g) return s; const [l, t, r] = g.margins, w = bw + l + r; for (const o of g.offsets) { const x = o % w; s.add((win.bodyY - t + (o - x) / w) * win.width + win.bodyX - l + x); } return s; };
  const shapePanel = (set) => panel((i, x, y) => (set.has(i) ? [255, 255, 255] : body(x, y) ? [40, 70, 140] : [24, 24, 24]));
  const heat = panel((i) => { const a = memberCount ? agree[i] / memberCount : 0; return agree[i] >= need && memberCount ? [230, 40, 40] : [Math.round(a * 200), Math.round(a * 200), Math.round(a * 200)]; });
  const strips = { scale: 3, strips: [{ label: `${address}#overlap|learned|carried`, panels: [heat, { ...shapePanel(shapeSet(v.learned)), origin: [0, 0] }, shapePanel(shapeSet(v.carried))] }],
    legend: [{ color: [230, 40, 40], meaning: `dark in >= ${need} of ${memberCount} members (the agreement)` }, { color: [160, 160, 160], meaning: 'grey ramp: share of members dark at the px' },
      { color: [255, 255, 255], meaning: 'frame px of the shape (panel 2 learned, panel 3 carried prior)' }, { color: [40, 70, 140], meaning: 'the bright body bbox' }] };
  const parts = [{ address, kind: 'ledger', data: { rows: Object.entries({ source: v.source, memberCount, agreementCount: need, agreementMin: v.agreementMin, margins: v.margins?.join(', ') ?? null,
    learnedMargins: v.learned?.margins.join(', ') ?? null, learnedPx: v.learned?.offsets.length ?? null, carriedMargins: v.carried.margins.join(', '), carriedPx: v.carried.offsets.length, carriedFromMembers: v.carried.members,
    learnedCondition: v.learnedCondition, ...(v.comparison ? { marginsAgree: v.comparison.marginsAgree, sharedPx: v.comparison.sharedPx, iou: Number(v.comparison.iou.toFixed(4)) } : {}) }).map(([field, value]) => ({ field, value })) } },
    { address: `${address}#legend`, kind: 'ledger', data: { rows: strips.legend.map((l) => ({ colour: `rgb(${l.color.join(', ')})`, meaning: l.meaning })) } },
    { address: strips.strips[0].label, kind: 'raster', data: stripPng(strips.strips[0], strips.scale) }];
  return { kind: 'shellShape', parts };
}

/** fn.q.sprite.overlap: mean coverage (grey ramp, white = every member covers the cell) and the shape (red), on the fine grid. */
function renderSpriteOverlap(address, v) {
  const n = v.fineWidth * v.fineHeight, panel = (paint) => { const rgb = new Uint8Array(n * 3); for (let i = 0; i < n; i++) { const c = paint(i); rgb[i * 3] = c[0]; rgb[i * 3 + 1] = c[1]; rgb[i * 3 + 2] = c[2]; } return { origin: [0, 0], widthPx: v.fineWidth, heightPx: v.fineHeight, rgb }; };
  const grey = (i) => { const g = Math.round(v.mean[i] * 255); return [g, g, g]; };
  const strip = { label: `${address}#mean|shape`, panels: [panel(grey), panel((i) => (v.shape[i] ? [230, 40, 40] : grey(i).map((c) => c >> 2)))] };
  const residuals = v.members.map((m) => m.residual);
  return { kind: 'spriteOverlap', parts: [
    { address, kind: 'ledger', data: { rows: Object.entries({ polarity: v.polarity, factor: v.factor, window: `${v.window.width} x ${v.window.height} px`, anchorAt: v.window.anchorAt.join(', '),
      memberCount: v.memberCount, agreementCount: v.agreementCount, level: v.level, shapeCells: v.shape.reduce((s, x) => s + x, 0),
      residualMax: residuals.length ? Number(Math.max(...residuals).toFixed(4)) : null }).map(([field, value]) => ({ field, value })) } },
    { address: `${address}#legend`, kind: 'ledger', data: { rows: [{ colour: 'grey ramp', meaning: 'mean coverage over members (white = 1)' }, { colour: 'rgb(230, 40, 40)', meaning: `the shape: >= ${v.agreementCount} of ${v.memberCount} members cover the cell` }] } },
    { address: strip.label, kind: 'raster', data: stripPng(strip, Math.max(1, Math.round(4 / v.factor))) }] };
}

/** A flipbook page for one Part (fg/guarantee.mjs frame shape). */
export function partFrame(address, value, dims = null) {
  const r = renderValue(address, value, dims);
  return { title: `${address} (${r.kind})`, calculation: 'fg.render', tick: 'render', parts: r.parts, verdicts: [{ name: `${address} renders`, ok: r.kind !== 'unrenderable' }] };
}

// ====================================================================================================================
// S6-B block (agent B of the S6 lane; ports/s6straight/pathLoss.mjs): the path-loss renders. Keep S6-B edits in here.
//   pathLoss     tk.s6.pathLoss (schema nctk-s6-path-loss@1): one contact sheet, a row per tee -> basket pair
//   pathProfile  one fn.q.path.loss / overlayFraction answer: the same row for one segment
// A row: the straightened corridor (columns = stations 1 px apart along tee cap -> basket, rows = lateral offset) with
// the ribbon window +-W/2 drawn, and under it on the same x axis two strip charts: the edge test (min-side contrast,
// lum; tau line) and the overlay fraction (threshold line); failing stations shaded, masked stations marked. The row's
// frame is coloured by Sam's verdict (testimony; agreement only). Legend on top. PNGs inline (fg/png.mjs).
// ====================================================================================================================
const S6_COL = Object.freeze({
  bg: [250, 250, 250], ink: [20, 20, 20], dim: [120, 120, 120], samStraight: [60, 180, 75], samBent: [245, 130, 48], unjudged: [150, 150, 150],
  pass: [67, 99, 216], fail: [230, 25, 75], gap: [255, 214, 220], masked: [90, 90, 90], window: [255, 225, 25], tau: [230, 25, 75], chart: [255, 255, 255]
});
// 5 x 7 bitmap font (rows top to bottom, 5 bits, MSB = left); lower case renders as upper case
const S6_FONT = (() => {
  const g = {
    0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31], 3: [31, 2, 4, 2, 1, 17, 14], 4: [2, 6, 10, 18, 31, 2, 2],
    5: [31, 16, 30, 1, 1, 17, 14], 6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 8: [14, 17, 17, 14, 17, 17, 14], 9: [14, 17, 17, 15, 1, 2, 12],
    A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14], D: [28, 18, 17, 17, 17, 18, 28], E: [31, 16, 16, 30, 16, 16, 31],
    F: [31, 16, 16, 30, 16, 16, 16], G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12],
    K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31], M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14],
    P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17], S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
    U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17], Y: [17, 17, 17, 10, 4, 4, 4],
    Z: [31, 1, 2, 4, 8, 16, 31], ' ': [0, 0, 0, 0, 0, 0, 0], '.': [0, 0, 0, 0, 0, 12, 12], ',': [0, 0, 0, 0, 12, 4, 8], ':': [0, 12, 12, 0, 12, 12, 0],
    '-': [0, 0, 0, 31, 0, 0, 0], '>': [8, 4, 2, 1, 2, 4, 8], '<': [2, 4, 8, 16, 8, 4, 2], '(': [2, 4, 8, 8, 8, 4, 2], ')': [8, 4, 2, 2, 2, 4, 8],
    '/': [0, 1, 2, 4, 8, 16, 0], '%': [24, 25, 2, 4, 8, 19, 3], '+': [0, 4, 4, 31, 4, 4, 0], '=': [0, 0, 31, 0, 31, 0, 0], '_': [0, 0, 0, 0, 0, 0, 31],
    '#': [10, 10, 31, 10, 31, 10, 10], '?': [14, 17, 1, 2, 4, 0, 4], '[': [14, 8, 8, 8, 8, 8, 14], ']': [14, 2, 2, 2, 2, 2, 14], '|': [4, 4, 4, 4, 4, 4, 4],
    '*': [0, 4, 21, 14, 21, 4, 0], "'": [4, 4, 8, 0, 0, 0, 0], '!': [4, 4, 4, 4, 4, 0, 4], '~': [0, 0, 8, 21, 2, 0, 0], ';': [0, 12, 12, 0, 12, 4, 8]
  };
  return new Map(Object.entries(g).map(([k, v]) => [String(k), v]));
})();
function s6Canvas(w, h) {
  const rgb = new Uint8Array(w * h * 3); for (let i = 0; i < w * h; i++) rgb.set(S6_COL.bg, i * 3);
  const put = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < w && y < h) rgb.set(c, (y * w + x) * 3); };
  const fill = (x, y, ww, hh, c) => { for (let yy = y; yy < y + hh; yy++) for (let xx = x; xx < x + ww; xx++) put(xx, yy, c); };
  const text = (x, y, s, c = S6_COL.ink, k = 1) => {
    for (const ch of String(s).toUpperCase()) { const g = S6_FONT.get(ch) ?? S6_FONT.get('?'); g.forEach((row, r) => { for (let b = 0; b < 5; b++) if (row & (16 >> b)) fill(x + b * k, y + r * k, k, k, c); }); x += 6 * k; }
    return x;
  };
  const hdash = (x0, x1, y, c, on = 4, off = 3) => { for (let x = x0; x < x1; x++) if ((x - x0) % (on + off) < on) put(x, y, c); };
  const frame = (x, y, ww, hh, c, t = 1) => { fill(x, y, ww, t, c); fill(x, y + hh - t, ww, t, c); fill(x, y, t, hh, c); fill(x + ww - t, y, t, hh, c); };
  return { w, h, rgb, put, fill, text, hdash, frame };
}
const S6_ROW = Object.freeze({ left: 64, head: 20, line: 11, chartPx: 56, axis: 12, gapPx: 14 });
const s6pct = (v) => (v == null ? 'N/A' : `${Math.round(v * 1000) / 10}%`);
const s6num = (v, d = 3) => (v == null ? 'N/A' : String(Math.round(v * 10 ** d) / 10 ** d));
function s6RowHeight(r) { return S6_ROW.head + 2 * S6_ROW.line + 6 + (r.corridor?.heightPx ?? 0) + 8 + 2 * (S6_ROW.chartPx + 6) + S6_ROW.axis + S6_ROW.gapPx; }
/** One row: r = { title, lines[], verdictColor, corridor, ribbonHalfPx, edgeMinLum[], tauLum, overlayFrac[], thresholdFrac, overlayLabel } */
function s6DrawRow(cv, y0, r) {
  const L = S6_ROW.left, N = Math.max(r.edgeMinLum?.length ?? 0, r.overlayFrac?.length ?? 0, r.corridor?.widthPx ?? 0);
  cv.frame(2, y0, cv.w - 4, s6RowHeight(r) - S6_ROW.gapPx / 2, r.verdictColor, 3);
  let y = y0 + 6;
  cv.text(10, y, r.title, S6_COL.ink, 2); y += S6_ROW.head;
  for (const ln of r.lines) { cv.text(10, y, ln, S6_COL.ink, 1); y += S6_ROW.line; }
  y += 4;
  const c = r.corridor;
  if (c) {
    const M = c.heightPx, R = (M - 1) / 2;
    for (let j = 0; j < M; j++) for (let k = 0; k < c.widthPx; k++) cv.put(L + k, y + j, Array.from(c.rgbLevel.subarray((j * c.widthPx + k) * 3, (j * c.widthPx + k) * 3 + 3)));
    for (const s of [-1, 1]) cv.hdash(L, L + c.widthPx, Math.round(y + R + s * c.ribbonHalfPx), S6_COL.window);
    cv.text(4, y + R - 3, 'TEE>BKT', S6_COL.dim);
    y += M + 1;
    for (let k = 0; k < c.widthPx; k++) if (c.hiddenCenter?.[k]) cv.fill(L + k, y, 1, 4, S6_COL.masked);
    y += 7;
  }
  const chart = (vals, lo, hi, thr, label, unitLabel) => {
    const Hc = S6_ROW.chartPx, yv = (v) => y + Hc - 1 - Math.round(((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (Hc - 1));
    cv.fill(L, y, N, Hc, S6_COL.chart);
    vals.forEach((v, k) => { if (v != null && thr != null && v <= thr) cv.fill(L + k, y, 1, Hc, S6_COL.gap); if (v == null) cv.fill(L + k, y + Hc - 3, 1, 3, S6_COL.masked); });
    if (thr != null) { cv.hdash(L, L + N, yv(thr), S6_COL.tau); cv.text(L + N + 3, yv(thr) - 3, s6num(thr, 3), S6_COL.tau); }
    vals.forEach((v, k) => { if (v != null) { const col = thr != null && v <= thr ? S6_COL.fail : S6_COL.pass; cv.put(L + k, yv(v), col); cv.put(L + k, yv(v) + 1, col); } });
    cv.frame(L - 1, y - 1, N + 2, Hc + 2, S6_COL.dim);
    cv.text(4, y, s6num(hi, 2), S6_COL.dim); cv.text(4, y + Hc - 7, s6num(lo, 2), S6_COL.dim); cv.text(4, y + Hc / 2 - 8, label, S6_COL.ink); cv.text(4, y + Hc / 2 + 1, unitLabel, S6_COL.dim);
    y += Hc + 6;
  };
  chart(r.edgeMinLum ?? [], -20, 60, r.tauLum, 'EDGE', 'LUM');
  const ov = r.overlayFrac ?? [], ovMax = Math.max(0.1, (r.thresholdFrac ?? 0) * 3, ...ov.filter((v) => v != null).map((v) => Math.min(1, v)));
  chart(ov, 0, Math.min(1, Math.ceil(ovMax * 20) / 20), r.thresholdFrac, 'ALPHA', r.overlayLabel);
  for (let k = 0; k <= N; k += 50) cv.text(L + k, y - 4, `${k}`, S6_COL.dim);
  cv.text(L + N + 3, y - 4, 'PX ALONG', S6_COL.dim);
}
function s6Legend(cv, y, lines) {
  let x = 10;
  const sw = (c, label) => { cv.fill(x, y, 10, 8, c); x = cv.text(x + 14, y, label) + 14; };
  sw(S6_COL.samStraight, 'FRAME: SAM STRAIGHT'); sw(S6_COL.samBent, 'SAM BENT'); sw(S6_COL.unjudged, 'NOT JUDGED (NO TESTIMONY MATCH)');
  sw(S6_COL.window, 'RIBBON WINDOW +-W/2'); sw(S6_COL.masked, 'MASKED STATION (SPRITE / RING: NO EVIDENCE)');
  y += 12; x = 10;
  sw(S6_COL.pass, 'STATION PASSES'); sw(S6_COL.fail, 'STATION FAILS'); sw(S6_COL.gap, 'FAILING STATION (SHADED)'); sw(S6_COL.tau, 'TAU / THRESHOLD LINE');
  y += 14;
  for (const ln of lines) { cv.text(10, y, ln); y += 11; }
  return y;
}
const S6_LEGEND_PX = (n) => 34 + 11 * n;
function s6PathKind(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  if (v.schema === 'nctk-s6-path-loss@1') return 'pathLoss';
  if (['nctk-s6-pair-features@1', 'nctk-s6-pair-feature-family@1', 'nctk-s6-pair-candidates@1'].includes(v.schema)) return 'pairFeatures';
  if ((v.schema === 'nctk-s6-path-loss-profile@1' || v.schema === 'nctk-s6-overlay-fraction@1') && !v.condition) return 'pathProfile';
  return null;
}
function s6Sheet(rows, legendLines) {
  const N = Math.max(1, ...rows.map((r) => Math.max(r.edgeMinLum?.length ?? 0, r.overlayFrac?.length ?? 0, r.corridor?.widthPx ?? 0)));
  const longest = Math.max(...rows.flatMap((r) => [r.title.length * 12, ...r.lines.map((l) => l.length * 6)]), ...legendLines.map((l) => l.length * 6), 760);
  const w = Math.max(S6_ROW.left + N + 60, longest + 24), h = S6_LEGEND_PX(legendLines.length) + rows.reduce((a, r) => a + s6RowHeight(r), 0) + 8;
  const cv = s6Canvas(w, h);
  let y = s6Legend(cv, 6, legendLines) + 6;
  for (const r of rows) { s6DrawRow(cv, y, r); y += s6RowHeight(r); }
  return { width: w, height: h, png: base64(encodePngRgb({ width: w, height: h, rgb: cv.rgb })) };
}
function renderS6Path(address, v, kind) {
  if (kind === 'pathProfile') {
    const one = v.stations ?? {}, thr = v.overlay?.threshold?.frac ?? null;
    const row = { title: `${address}`.slice(0, 70), verdictColor: S6_COL.unjudged, corridor: v.corridor ?? null, tauLum: v.tauLum ?? null,
      edgeMinLum: one.edgeMinLum ?? [], overlayFrac: one.overlayFrac ?? v.overlayFrac ?? [], thresholdFrac: thr, overlayLabel: v.alpha?.mode === 'profile' || v.overlay?.alpha?.mode === 'profile' ? 'FRAC' : 'PROXY',
      lines: [`EDGE TEST (> ${v.tauLum ?? 8} LUM): PASS ${s6pct(v.edge?.passFrac)} OF ${v.edge?.visibleCount ?? 0} VISIBLE STATIONS, LONGEST GAP ${v.edge?.longestGapPx ?? 'N/A'} PX`,
        `OVERLAY (${v.overlay?.measure ?? v.kind ?? ''}): MEAN ${s6num(v.overlay?.meanOverlayFrac)}, LOSS ${s6pct(v.overlay?.lossFrac)}, LONGEST GAP ${v.overlay?.longestGapPx ?? 'N/A'} PX`] };
    const sheet = s6Sheet([row], ['ONE SEGMENT: STATIONS 1 PX APART ALONG THE CENTRELINE']);
    const ledger = Object.fromEntries(Object.entries({ stationsCount: v.stationsCount, edgePassFrac: v.edge?.passFrac, edgeLongestGapPx: v.edge?.longestGapPx, meanOverlayFrac: v.overlay?.meanOverlayFrac ?? null, overlayLossFrac: v.overlay?.lossFrac ?? null, alpha: v.alpha?.condition ?? v.overlay?.alpha?.condition ?? null }).filter(([, x]) => x !== undefined));
    return { kind, parts: [{ address: `${address}#sheet`, kind: 'raster', data: sheet }, { address, kind: 'ledger', data: { rows: Object.entries(ledger).map(([field, value]) => ({ field, value })) } }] };
  }
  const pairs = v.pairs ?? [], proxy = v.alpha?.mode !== 'profile', thr = v.threshold?.frac ?? null;
  const verdictColor = (p) => (p.samHole == null ? S6_COL.unjudged : p.samBent ? S6_COL.samBent : S6_COL.samStraight);
  const rows = pairs.filter((p) => p.condition == null).map((p) => ({
    title: `${p.pair}   SAM: ${p.samHole == null ? 'NOT JUDGED' : `HOLE ${p.samHole} ${p.samBent ? 'BENT' : 'STRAIGHT'}${p.samBasketAgrees === false ? ' (OTHER BASKET)' : ''}`}`,
    verdictColor: verdictColor(p), corridor: p.corridor, tauLum: v.edgeTest?.tauLum ?? 8, edgeMinLum: p.stations?.edgeMinLum ?? [], overlayFrac: p.stations?.overlayFrac ?? [], thresholdFrac: thr, overlayLabel: proxy ? 'PROXY' : 'FRAC',
    lines: [`EDGE TEST (MIN-SIDE CONTRAST > ${v.edgeTest?.tauLum ?? 8} LUM): PASS ${s6pct(p.edgePassFrac)} OF ${p.edgeVisibleCount} VISIBLE STATIONS, LONGEST GAP ${p.edgeLongestGapPx} PX, MEDIAN ${s6num(p.edgeMedianContrastLum, 1)} LUM`,
      `OVERLAY ${proxy ? 'PROXY (NO ALPHA PROFILE)' : 'ALPHA'}: MEAN ${s6num(p.meanOverlayFrac)}, LOSS ${s6pct(p.overlayLossFrac)} BELOW ${s6num(thr)}, LONGEST GAP ${p.overlayLongestGapPx ?? 'N/A'} PX | S3 3-POINT: ${p.straight3} | SEGMENT ${s6num(p.lengthPx, 1)} PX, STATIONS ${s6num(p.t0Px, 1)}..${s6num(p.t1Px, 1)} PX`]
  }));
  const ag = v.agreement, legend = [
    `${address}: ${pairs.length} TEE CAP -> BASKETPOINT PAIRS (S3 ASSOCIATION, STRAIGHT3 BASKET); CORRIDOR W = ${s6num(v.corridor?.widthPx, 2)} PX (TK.S6.HALLWAY); ALPHA: ${String(v.alpha?.condition ?? '').toUpperCase()}`,
    `OVERLAY THRESHOLD ${s6num(thr)} = ${String(v.threshold?.rule ?? 'NONE').toUpperCase()}; LEVEL LEARNED ON STRAIGHT HOLES ${s6num(v.pathLevel?.learnedLevelFrac)} (${v.pathLevel?.fromPairsCount ?? 0} PAIRS)`,
    ag ? `SAM STRAIGHT (${ag.straight.pairsCount}): EDGE PASS ${s6pct(ag.straight.meanEdgePassFrac)}, MEAN OVERLAY ${s6num(ag.straight.meanOverlayFrac)} | SAM BENT (${ag.bent.pairsCount}): EDGE PASS ${s6pct(ag.bent.meanEdgePassFrac)}, MEAN OVERLAY ${s6num(ag.bent.meanOverlayFrac)} | AGREEMENT ONLY` : 'NO TESTIMONY: NOTHING JUDGED'
  ];
  const parts = [];
  if (rows.length) parts.push({ address: `${address}#sheet`, kind: 'raster', data: s6Sheet(rows, legend) });
  parts.push({ address, kind: 'ledger', data: { rows: pairs.map((p) => ({ pair: p.pair, samHole: p.samHole, samBent: p.samBent, straight3: p.straight3, edgePassFrac: p.edgePassFrac, edgeLongestGapPx: p.edgeLongestGapPx, meanOverlayFrac: p.meanOverlayFrac, overlayLossFrac: p.overlayLossFrac, overlayLongestGapPx: p.overlayLongestGapPx, condition: p.condition })) } });
  const pts = pairs.flatMap((p) => [[...p.capPx, `${p.candidate} cap`], [...p.basketPx, p.basketCandidate]]);
  if (pts.length) parts.push({ address: `${address}#segments`, kind: 'points', data: { points: pts } });
  if (!pairs.length) parts.push({ address: `${address}#condition`, kind: 'scalar', data: { value: v.condition ?? 'no pairs', unit: null } });
  return { kind, parts };
}

// ---- S6 scoring block (ports/s6straight/pairFeatures.mjs): the pair table and its feature families, rendered as ledgers.
const PAIR_ROWS_SHOWN = 600;
function renderPairFeatures(address, v) {
  const names = { holes: new Map((v.holes ?? []).map((h) => [h.id, `${h.label} ${h.from}`])), baskets: new Map((v.baskets ?? []).map((k) => [k.index, k.name])) };
  const own = scalarFields(v);
  const parts = [];
  if (v.columns) parts.push({ address: `${address}#columns`, kind: 'ledger', data: { rows: Object.entries(v.columns).map(([column, c]) => ({ column, family: typeof c === 'string' ? '' : c.family ?? '', unit: typeof c === 'string' ? c : c.unit })) } });
  if (v.holes) parts.push({ address: `${address}#holes`, kind: 'ledger', data: { rows: v.holes.map((h) => ({ hole: h.id, label: h.label, from: h.from, tee: h.pair?.tee?.name ?? '', centre: h.centerPx?.map((x) => Math.round(x * 100) / 100).join(', ') })) } });
  if (v.rows) {
    const rows = v.rows.slice(0, PAIR_ROWS_SHOWN).map((r) => ({ pair: `${names.holes.get(r.hole) ?? r.hole} -> ${names.baskets.get(r.basket) ?? r.basket}`, ...scalarFields(r) }));
    if (v.rows.length > PAIR_ROWS_SHOWN) rows.push({ pair: `... ${v.rows.length - PAIR_ROWS_SHOWN} more rows (shown: first ${PAIR_ROWS_SHOWN}; vector columns omitted)` });
    parts.push({ address: `${address}#rows`, kind: 'ledger', data: { rows } });
  }
  if (Object.keys(own).length) parts.push({ address, kind: 'ledger', data: { rows: Object.entries(own).map(([field, value]) => ({ field, value })) } });
  if (!parts.length) parts.push({ address, kind: 'ledger', data: { rows: [{ field: 'empty', value: '' }] } });
  return { kind: 'pairFeatures', parts };
}
