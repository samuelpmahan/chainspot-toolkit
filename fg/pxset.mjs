/**
 * PixelSet: a tagged union over backings, and the pixel-set math written ONCE, here, by pattern matching on them
 * (browser-safe). Code outside the PxC boundary asks questions (fn.q.pxset.* on the store, by Part address) and never
 * sees a backing, so a backing can be refined (a list today, a selector over a shared plane tomorrow) without anything
 * outside changing. Sam, 2026-10-18: "math gets written ONCE inside the store and INVOKED from the outside".
 *
 *   { kind: 'pxset', backing: 'list',  W, H, px }            px: raster indices (Uint32Array or array), any order
 *   { kind: 'pxset', backing: 'label', W, H, plane, label, box? }  the px of `plane` (Int32Array/Uint16Array of W*H) ==
 *                                                         label; box [x0, y0, x1, y1] (inclusive), when known, bounds the scan
 *
 * Every answer carries its unit (unitful) and every set has a default render (renderable): a frame part of kind
 * 'pxset' for the flipbook and the UI alike.
 */
export const PXSET = 'pxset';

export const pxList = (W, H, px) => ({ kind: PXSET, backing: 'list', W, H, px });
export const pxLabel = (W, H, plane, label, box = null) => ({ kind: PXSET, backing: 'label', W, H, plane, label, box });

/** One pass over a label plane: every label's bounding box [x0, y0, x1, y1], so a label set scans only its box. */
export function labelBoxes(W, H, plane) {
  const boxes = new Map();
  for (let i = 0; i < W * H; i++) {
    const l = plane[i]; if (!l) continue;
    const x = i % W, y = (i / W) | 0, b = boxes.get(l);
    if (!b) boxes.set(l, [x, y, x, y]); else { if (x < b[0]) b[0] = x; if (x > b[2]) b[2] = x; if (y < b[1]) b[1] = y; if (y > b[3]) b[3] = y; }
  }
  return boxes;
}
export const isPxSet = (v) => Boolean(v && v.kind === PXSET);

/** Pattern match on the backing: one function per case, a missing case throws by name. */
export function match(set, cases) {
  if (!isPxSet(set)) throw new Error(`pxset: not a PixelSet (${JSON.stringify(set?.kind ?? typeof set)})`);
  const f = cases[set.backing];
  if (!f) throw new Error(`pxset: no case for backing '${set.backing}'`);
  return f(set);
}

/** Visit every px index once (the one primitive every other answer is built from unless a case does better). */
export const forEach = (set, fn) => match(set, {
  list: ({ px }) => { for (const i of px) fn(i); },
  label: ({ W, plane, label, box }) => {
    if (!box) { for (let i = 0; i < plane.length; i++) if (plane[i] === label) fn(i); return; }
    for (let y = box[1]; y <= box[3]; y++) for (let x = box[0], i = y * W + x; x <= box[2]; x++, i++) if (plane[i] === label) fn(i);
  }
});

export const has = (set, i) => match(set, {
  list: (s) => (s._index ??= new Set(s.px)).has(i),
  label: ({ plane, label }) => plane[i] === label
});

export function count(set) {
  return match(set, { list: ({ px }) => px.length, label: (s) => { let n = 0; forEach(s, () => n++); return n; } });
}

export function bbox(set) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  forEach(set, (i) => { const x = i % set.W, y = (i / set.W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; });
  return x1 < 0 ? null : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
}

/** |a ∩ b| by the cheapest pairing: two labels of one plane are disjoint unless equal; otherwise walk the smaller. */
export function intersectCount(a, b) {
  if (a.backing === 'label' && b.backing === 'label' && a.plane === b.plane) return a.label === b.label ? count(a) : 0;
  const [small, big] = a.backing === 'list' && (b.backing !== 'list' || a.px.length <= b.px.length) ? [a, b] : [b, a];
  let n = 0; forEach(small, (i) => { if (has(big, i)) n++; });
  return n;
}

/**
 * Ownership plane: one Uint16 per px naming the set that owns it (1-based; 0 = nobody). Built once from any sets; a set
 * that claims an already-owned px is an overlap, counted (exclusive ownership is the default, sharing is explicit).
 */
export function ownerPlane(W, H, sets, { overlap = 'first' } = {}) {   // overlap: which claim keeps a contested px
  const plane = new Uint16Array(W * H); let overlapPx = 0;
  sets.forEach((s, k) => forEach(s, (i) => { if (plane[i]) { overlapPx++; if (overlap === 'last') plane[i] = k + 1; } else plane[i] = k + 1; }));
  return { plane, overlapPx };
}

/** The default render of a set: a frame part (fg/guarantee.mjs kind 'pxset') for flipbooks and the UI. */
export const renderPart = (set, { address, label = null } = {}) => {
  const px = []; forEach(set, (i) => px.push(i));
  return { address, kind: 'pxset', data: { widthPx: set.W, px, label, count: px.length, bbox: bbox(set) } };
};

export const PXSET_UNITS = Object.freeze({ count: 'px', bbox: 'px [x, y, width, height]', intersect: 'px', overlap: 'px' });

/**
 * The queries every PxC store answers (fg/store.mjs registers them): arguments are Part ADDRESSES (or a Part's field
 * path `address#key`), results are { value, unit }. Parts are write-once, so an answer is cached by its arguments.
 */
export const PXSET_QUERIES = Object.freeze({
  'fn.q.pxset.count': ({ a }) => ({ value: count(a), unit: PXSET_UNITS.count }),
  'fn.q.pxset.bbox': ({ a }) => ({ value: bbox(a), unit: PXSET_UNITS.bbox }),
  'fn.q.pxset.intersectCount': ({ a, b }) => ({ value: intersectCount(a, b), unit: PXSET_UNITS.intersect }),
  'fn.q.pxset.render': ({ a }, { address }) => ({ value: renderPart(a, { address }), unit: 'frame part' })
});

/**
 * Resolve a query argument to a PixelSet by the shape of the Part behind it (one rule, here): `address` holding a
 * PixelSet; `address#i` = item i of a list of objects carrying `px`; `address#bright:L` / `address#dark:L` = label L of
 * a components Part ({ bright: { mask: { width, height }, labels } }). dims: { widthPx, heightPx } of the raster.
 */
const BOXES = new WeakMap();   // label plane -> its label boxes, computed once per plane
export function resolvePxSet(get, ref, dims) {
  const [address, key = null] = String(ref).split('#');
  const v = get(address);
  if (isPxSet(v)) return v;
  if (key !== null && /^(bright|dark):\d+$/.test(key)) {
    const [field, label] = key.split(':'), f = v[field];
    const boxes = BOXES.get(f.labels) ?? BOXES.set(f.labels, labelBoxes(f.mask.width, f.mask.height, f.labels)).get(f.labels);
    return pxLabel(f.mask.width, f.mask.height, f.labels, Number(label), boxes.get(Number(label)) ?? null);
  }
  if (key !== null && Array.isArray(v) && v[Number(key)]?.px) return pxList(dims().widthPx, dims().heightPx, v[Number(key)].px);
  throw new Error(`pxset: '${ref}' does not resolve to a PixelSet`);
}

/**
 * Per label of a component plane, against an ownership plane (ownerPlane), in one pass: its area, the px nobody owns
 * (the unowned remainder, as a list-backed set), and which owners it touches within touchPx (only owners for which
 * touches(k) holds). The general form of "bright components adjacent to known occluders".
 */
export function componentStats(W, H, labels, owner, { touchPx = 2, touches = () => true } = {}) {
  const area = new Map(), free = new Map(), touch = new Map();
  for (let i = 0; i < W * H; i++) {
    const l = labels[i]; if (!l) continue;
    area.set(l, (area.get(l) ?? 0) + 1);
    if (owner[i]) continue;
    if (!free.has(l)) free.set(l, []); free.get(l).push(i);
    const x = i % W, y = (i / W) | 0;
    for (let dy = -touchPx; dy <= touchPx; dy++) for (let dx = -touchPx; dx <= touchPx; dx++) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const k = owner[yy * W + xx];
      if (k && touches(k)) { if (!touch.has(l)) touch.set(l, new Set()); touch.get(l).add(k); }
    }
  }
  return [...free.keys()].map((l) => ({ label: l, areaPx: area.get(l), unowned: pxList(W, H, free.get(l)), touches: [...(touch.get(l) ?? [])] }));
}
