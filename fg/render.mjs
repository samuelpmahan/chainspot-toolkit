/**
 * renderable: a default property of every Part (Sam, 2026-10-18). Any value at any address renders to flipbook frame
 * parts (fg/flipbook.mjs kinds: pxset, bbox, points, ledger, scalar, raster) by pattern matching on the shape of the
 * value, written once here. The same render feeds the UI and flipbook-style tests. Browser-safe.
 *
 * The union, in match order (first case that fits):
 *   pxset         a PixelSet (fg/pxset.mjs)                             -> pxset
 *   raster        { rgba, widthPx, heightPx }                          -> raster (size; pixels come from the viewer)
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

const isTyped = (v) => ArrayBuffer.isView(v) && !(v instanceof DataView);
const isScalar = (v) => v === null || ['number', 'string', 'boolean'].includes(typeof v);
const labelOf = (it, i) => it.label ?? it.name ?? it.candidate ?? it.hole ?? String(i);
const scalarFields = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => isScalar(v) || (Array.isArray(v) && v.length <= 6 && v.every(isScalar))).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : v]));
const bboxOf = (it) => (Array.isArray(it.bbox) && it.bbox.length === 4 ? it.bbox : null);

export const PART_KINDS = Object.freeze(['pxset', 'raster', 'plane', 'pxsets', 'boxes', 'points', 'rows', 'strips', 'scalar', 'object']);

/** Which case of the union a value is (the dispatch every default property can share). */
export function partKind(v) {
  if (isPxSet(v)) return 'pxset';
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
export function renderValue(address, v, dims = null, depth = 0) {
  const W = dims?.widthPx ?? null;
  const kind = partKind(v);
  switch (kind) {
    case 'pxset': return { kind, parts: [renderPxSet(v, { address })] };
    case 'raster': return { kind, parts: [{ address, kind: 'raster', data: { width: v.widthPx, height: v.heightPx } }] };
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

/** A flipbook page for one Part (fg/guarantee.mjs frame shape). */
export function partFrame(address, value, dims = null) {
  const r = renderValue(address, value, dims);
  return { title: `${address} (${r.kind})`, calculation: 'fg.render', tick: 'render', parts: r.parts, verdicts: [{ name: `${address} renders`, ok: r.kind !== 'unrenderable' }] };
}
