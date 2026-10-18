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
 *   scalar        number / string / boolean / null                      -> scalar
 *   object        { ... }                                                -> ledger (one row per scalar field) + its renderable fields
 * A value that matches nothing is reported as { kind: 'unrenderable' }: the default-property test fails on it, and the
 * fix is a new case here, never a renderer at the call site.
 */
import { isPxSet, renderPart as renderPxSet } from './pxset.mjs';

const isTyped = (v) => ArrayBuffer.isView(v) && !(v instanceof DataView);
const isScalar = (v) => v === null || ['number', 'string', 'boolean'].includes(typeof v);
const labelOf = (it, i) => it.label ?? it.name ?? it.candidate ?? it.hole ?? String(i);
const scalarFields = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => isScalar(v) || (Array.isArray(v) && v.length <= 6 && v.every(isScalar))).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : v]));
const bboxOf = (it) => (Array.isArray(it.bbox) && it.bbox.length === 4 ? it.bbox : null);

export const PART_KINDS = Object.freeze(['pxset', 'raster', 'plane', 'pxsets', 'boxes', 'points', 'rows', 'scalar', 'object']);

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

/** A flipbook page for one Part (fg/guarantee.mjs frame shape). */
export function partFrame(address, value, dims = null) {
  const r = renderValue(address, value, dims);
  return { title: `${address} (${r.kind})`, calculation: 'fg.render', tick: 'render', parts: r.parts, verdicts: [{ name: `${address} renders`, ok: r.kind !== 'unrenderable' }] };
}
