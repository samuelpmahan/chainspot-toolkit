/**
 * Attention regions: where one step of a Δ stream changed something you
 * can SEE (fg/attention layer, browser-safe, model-agnostic).
 *
 * Input is one folded step of any fg/delta model: { view, before, after }
 * where view is the model's own account of the change ([{ address, base,
 * by, delta }], per-kind deltas from fg/delta/kinds.mjs). Output is a small
 * set of crop windows, each holding the typed changes inside it.
 *
 *   changesOf(step, frame)   -> { px: Map<flat index, [PxChange]>, objects: [ObjChange], nonGeometric: [...] }
 *   clusterPx(pxMap, width)  -> [{ kind: 'px', bbox, px: [index], counts: { cls: n } }]   8-connected
 *   mergeWindows(items, opts)-> [{ bbox, items }]   padded boxes merged while they overlap
 *   regionsForStep(step, frame, opts) -> { regions, nonGeometric, changedPx, offFrame }
 *
 * PxChange  { address, cls, key, from? }   cls: '+own' '+mute' '+cand' '+elim' '-own' ...,
 *           'mute->own' (re-own across roles), 'own:reassigned' (same role, other top owner),
 *           'split' (same role, same top owner: a refinement into sub-parts)
 * ObjChange { address, facet, op, id, bbox, prevBbox?, obj, why?, failedTests?, verdict?, prev?, fields? }
 *   op: added | removed (dropped from the set) | eliminated (removed, and the
 *   after-Part records why) | refit (removed and re-added under the SAME id:
 *   the identity Contract said "different", the id says "same") | verdict |
 *   relabel | moved | renamed | edited | elimRecorded | elimRetested |
 *   elimDropped | row (a ledger row resolved to an object's geometry)
 *
 * Geometry only: a change with no pixels and no box (a scalar, a digest, a
 * ledger row whose key names no object) is listed in nonGeometric and never
 * becomes a region. Unchanged pixels and objects never appear.
 */
import { fromRuns } from '../delta/px.mjs';
import { splitKey, topOwner, ends } from '../delta/kinds.mjs';

export const SUBJECTS = [
  [/^px\.badges\.digits/, 'digit-counter'], [/^px\.badges\.assembly/, 'badge'], [/^px\.badges/, 'badge'], [/^badges$/, 'badge'],
  [/^badgeGlyphTemplate/, 'badge'], [/^px\.baskets/, 'basket'], [/^px\.tees\.rings/, 'tee-ring'], [/^px\.tees/, 'tee'],
  [/^cmp\.fn\.Tee/, 'tee'], [/^px\.components/, 'component'], [/^px\.course/, 'chrome']
];
export const subjectOf = (address) => SUBJECTS.find(([re]) => re.test(address))?.[1] ?? 'part';

export function pxClass(fromKey, toKey) {
  const a = splitKey(fromKey), b = splitKey(toKey);
  if (a.role !== b.role) return `${a.role}->${b.role}`;
  return topOwner(fromKey) === topOwner(toKey) ? 'split' : `${a.role}:reassigned`;
}

const isBox = (b) => Array.isArray(b) && b.length === 4 && b.every((v) => typeof v === 'number');
export function bboxOf(obj) {
  if (!obj) return null;
  if (isBox(obj.bbox)) return obj.bbox.slice();
  if (Array.isArray(obj.center) && obj.center.length === 2) return [Math.floor(obj.center[0]) - 3, Math.floor(obj.center[1]) - 3, 7, 7];
  return null;
}
export const centerOf = (obj) => (Array.isArray(obj?.center) ? obj.center : isBox(obj?.bbox) ? [obj.bbox[0] + obj.bbox[2] / 2, obj.bbox[1] + obj.bbox[3] / 2] : null);
export function clipBox([x, y, w, h], { width, height }) {
  const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(width, x + w), y1 = Math.min(height, y + h);
  return x1 > x0 && y1 > y0 ? [x0, y0, x1 - x0, y1 - y0] : null;
}
export const unionBox = (a, b) => {
  if (!a) return b; if (!b) return a;
  const x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]);
  return [x0, y0, Math.max(a[0] + a[2], b[0] + b[2]) - x0, Math.max(a[1] + a[3], b[1] + b[3]) - y0];
};
export const padBox = ([x, y, w, h], p) => [x - p, y - p, w + 2 * p, h + 2 * p];
export const overlaps = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];

// ------------------------------------------------------------------ changes
const VERDICT_FIELDS = ['verdict'];
const LABEL_FIELDS = ['label', 'predicted'];

/** Find an object with this id in a Part value, then anywhere in the scene (ledger rows name objects by id). */
function resolveId(id, value, scene) {
  const own = value?.objects?.[id] ?? value?.elim?.[id];
  if (own) return own;
  for (const addr of Object.keys(scene?.parts ?? {}).sort()) {
    const v = scene.parts[addr].value;
    const o = v.objects?.[id] ?? v.elim?.[id];
    if (o && bboxOf(o)) return o;
  }
  return null;
}

export function changesOf(step) {
  const px = new Map();
  const objects = [], nonGeometric = [];
  const addPx = (p, c) => { const l = px.get(p); if (l) l.push(c); else px.set(p, [c]); };
  for (const v of step.view ?? []) {
    const f = v.delta?.facets ?? {};
    const baseAddr = v.base ?? v.address;
    const baseVal = step.before?.parts?.[baseAddr]?.value ?? (v.base ? step.after?.parts?.[v.base]?.value : null) ?? {};
    const afterVal = step.after?.parts?.[v.address]?.value ?? {};
    const A = v.address;
    if (f.px) {
      for (const [key, runs] of Object.entries(f.px.added ?? {})) { const cls = `+${splitKey(key).role}`; for (const p of fromRuns(runs)) addPx(p, { address: A, cls, key }); }
      for (const [key, runs] of Object.entries(f.px.removed ?? {})) { const cls = `-${splitKey(key).role}`; for (const p of fromRuns(runs)) addPx(p, { address: A, cls, key }); }
      for (const r of f.px.reowned ?? []) { const cls = pxClass(r.from, r.to); for (const p of fromRuns(r.px)) addPx(p, { address: A, cls, key: r.to, from: r.from }); }
    }
    for (const facet of ['objects', 'elim']) {
      const d = f[facet];
      if (!d) continue;
      const baseSet = baseVal[facet] ?? {};
      const removed = d.replace ? Object.keys(baseSet).map((id) => ({ id })) : d.removed ?? [];
      const addedIds = new Set((d.added ?? []).map((a) => a.id));
      const removedIds = new Set(removed.map((r) => r.id));
      const push = (c) => { const bb = c.bbox ?? null; if (bb) objects.push({ address: A, facet, ...c }); else nonGeometric.push({ address: A, facet, op: c.op, id: c.id, note: 'no geometry' }); };
      for (const { id } of removed) {
        const obj = baseSet[id];
        if (facet === 'objects' && addedIds.has(id)) continue; // a refit, reported from the added side
        if (facet === 'elim') { push({ op: 'elimDropped', id, bbox: bboxOf(obj), obj, why: obj?.why ?? null, note: d.replace ? 'elim facet replaced' : undefined }); continue; }
        const c = centerOf(obj);
        const elimAfter = afterVal.elim?.[id] ?? Object.values(afterVal.elim ?? {}).find((o) => c && centerOf(o) && Math.hypot(centerOf(o)[0] - c[0], centerOf(o)[1] - c[1]) < 2);
        push({ op: elimAfter ? 'eliminated' : 'removed', id, bbox: bboxOf(obj), obj, why: elimAfter?.why ?? null, failedTests: elimAfter?.failedTests ?? null });
      }
      for (const { id, obj } of d.added ?? []) {
        if (facet === 'elim') { push({ op: 'elimRecorded', id, bbox: bboxOf(obj), obj, why: obj.why ?? null, failedTests: obj.failedTests ?? null }); continue; }
        if (removedIds.has(id)) {
          const prev = baseSet[id];
          push({ op: 'refit', id, bbox: unionBox(bboxOf(prev), bboxOf(obj)), prevBbox: bboxOf(prev), obj, prev });
        } else push({ op: 'added', id, bbox: bboxOf(obj), obj, verdict: obj.verdict ?? null });
      }
      for (const c of d.changed ?? []) {
        const { from, to } = ends(c);
        const prev = baseSet[from] ?? {};
        const obj = { ...prev, ...(c.set ?? {}) };
        for (const k of c.unset ?? []) delete obj[k];
        const fields = [...Object.keys(c.set ?? {}), ...(c.unset ?? []).map((u) => `-${u}`)];
        if (facet === 'elim') { push({ op: 'elimRetested', id: to, bbox: bboxOf(obj), obj, why: obj.why ?? null, failedTests: obj.failedTests ?? null, fields }); continue; }
        const vf = VERDICT_FIELDS.find((k) => k in (c.set ?? {}));
        const lf = LABEL_FIELDS.find((k) => k in (c.set ?? {}) && prev[k] !== undefined && prev[k] !== c.set[k]);
        const moved = c.pose && ((c.pose.dCenterPx ?? 0) > 1 || (c.pose.dAngleDeg ?? 0) > 5);
        const op = vf ? 'verdict' : lf ? 'relabel' : moved ? 'moved' : from !== to && !fields.filter((k) => !['label', 'baselineLabel'].includes(k)).length ? 'renamed' : 'edited';
        const pb = bboxOf(prev), nb = bboxOf(obj);
        push({
          op, id: to, from: from !== to ? from : undefined, bbox: moved ? unionBox(pb, nb) : nb ?? pb, prevBbox: moved ? pb : undefined, obj, fields,
          verdict: vf ? obj.verdict : undefined, prev: vf ? (prev.verdict ?? null) : lf ? prev[lf] : undefined, labelField: lf || undefined, pose: c.pose
        });
      }
    }
    if (f.ledger) {
      for (const r of [...(f.ledger.added ?? []).map((a) => ({ id: a.id, row: a.obj, how: 'added' })), ...(f.ledger.changed ?? []).map((c) => ({ id: ends(c).to, row: { ...(baseVal.ledger?.[ends(c).from] ?? {}), ...(c.set ?? {}) }, how: 'changed' }))]) {
        const target = resolveId(r.id, afterVal, step.after);
        const bb = bboxOf(target);
        if (bb) objects.push({ address: A, facet: 'ledger', op: 'row', id: r.id, bbox: bb, obj: target, row: r.row });
        else nonGeometric.push({ address: A, facet: 'ledger', op: r.how, id: r.id, note: 'row key names no object with geometry' });
      }
      for (const r of f.ledger.removed ?? []) nonGeometric.push({ address: A, facet: 'ledger', op: 'removed', id: r.id });
    }
    if (f.scalars) for (const [name, s] of Object.entries(f.scalars.set ?? {})) nonGeometric.push({ address: A, facet: 'scalars', op: 'set', id: name, from: s.from, to: s.to });
    if (f.px?.rename && !Object.keys(f.px.added ?? {}).length && !Object.keys(f.px.removed ?? {}).length && !(f.px.reowned ?? []).length) nonGeometric.push({ address: A, facet: 'px', op: 'rename', id: Object.keys(f.px.rename).length + ' owners' });
    for (const d of v.delta?.drop ?? []) nonGeometric.push({ address: A, facet: d, op: 'dropped' });
  }
  return { px, objects, nonGeometric };
}

// ------------------------------------------------------------------ clustering
/** 8-connected components over the changed pixels; counts per change class. */
export function clusterPx(pxMap, width) {
  const seen = new Set();
  const out = [];
  const keys = [...pxMap.keys()].sort((a, b) => a - b);
  for (const start of keys) {
    if (seen.has(start)) continue;
    seen.add(start);
    const stack = [start], px = [];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    while (stack.length) {
      const p = stack.pop();
      px.push(p);
      const x = p % width, y = (p - x) / width;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        if (nx < 0 || nx >= width) continue;
        const n = p + dy * width + dx;
        if (n < 0 || seen.has(n) || !pxMap.has(n)) continue;
        seen.add(n);
        stack.push(n);
      }
    }
    const counts = {};
    for (const p of px) for (const c of pxMap.get(p)) { const k = `${c.address}\u0000${c.cls}`; counts[k] = (counts[k] ?? 0) + 1; }
    out.push({ kind: 'px', bbox: [x0, y0, x1 - x0 + 1, y1 - y0 + 1], px: px.sort((a, b) => a - b), counts });
  }
  return out;
}

/**
 * Merge items whose PADDED boxes overlap, as long as the merged box stays
 * within maxSide on both axes (an item already larger than that stays alone).
 * Deterministic: items are visited in (y, x) order and merging repeats to a fixpoint.
 */
export function mergeWindows(items, { pad = 6, maxSide = 96 } = {}) {
  let wins = items.map((it) => ({ bbox: it.bbox.slice(), items: [it] })).sort((a, b) => a.bbox[1] - b.bbox[1] || a.bbox[0] - b.bbox[0]);
  for (let changed = true; changed;) {
    changed = false;
    outer: for (let i = 0; i < wins.length; i++) for (let j = i + 1; j < wins.length; j++) {
      if (!overlaps(padBox(wins[i].bbox, pad), padBox(wins[j].bbox, pad))) continue;
      const u = unionBox(wins[i].bbox, wins[j].bbox);
      if (u[2] > maxSide || u[3] > maxSide) continue;
      wins[i] = { bbox: u, items: [...wins[i].items, ...wins[j].items] };
      wins.splice(j, 1);
      changed = true;
      break outer;
    }
  }
  return wins.sort((a, b) => a.bbox[1] - b.bbox[1] || a.bbox[0] - b.bbox[0]);
}

/** The crop window for a merged box: padded, at least minSide, clipped to the frame. */
export function cropBox(bbox, { pad = 6, minSide = 24, width, height }) {
  let [x, y, w, h] = padBox(bbox, pad);
  if (w < minSide) { x -= Math.floor((minSide - w) / 2); w = minSide; }
  if (h < minSide) { y -= Math.floor((minSide - h) / 2); h = minSide; }
  return clipBox([x, y, w, h], { width, height });
}

export function regionsForStep(step, frame, { pad = 6, maxSide = 96, minSide = 24 } = {}) {
  const ch = changesOf(step);
  const items = clusterPx(ch.px, frame.width);
  let offFrame = 0;
  for (const o of ch.objects) {
    const bb = clipBox(o.bbox, frame);
    if (!bb) { offFrame++; ch.nonGeometric.push({ address: o.address, facet: o.facet, op: o.op, id: o.id, note: 'geometry outside the canonical frame' }); continue; }
    items.push({ kind: 'obj', bbox: bb, change: o });
  }
  const wins = mergeWindows(items, { pad, maxSide });
  const regions = wins.map((w) => {
    const counts = {};
    const pxItems = w.items.filter((i) => i.kind === 'px');
    for (const it of pxItems) for (const [k, n] of Object.entries(it.counts)) counts[k] = (counts[k] ?? 0) + n;
    const px = [];
    for (const it of pxItems) for (const p of it.px) px.push(p);
    const byClass = {};
    for (const [k, n] of Object.entries(counts)) { const [address, cls] = k.split('\u0000'); (byClass[address] ??= {})[cls] = n; }
    const owners = {};
    for (const p of px) for (const c of ch.px.get(p)) { const key = `${c.address}\u0000${c.cls}`; (owners[key] ??= new Set()).add(c.from ? `${c.from}→${c.key}` : c.key); }
    return {
      bbox: w.bbox, window: cropBox(w.bbox, { pad, minSide, ...frame }),
      changedPx: px.length, px: px.sort((a, b) => a - b), pxByAddress: byClass,
      owners: Object.fromEntries(Object.entries(owners).map(([k, s]) => [k, [...s].sort()])),
      objects: w.items.filter((i) => i.kind === 'obj').map((i) => i.change)
    };
  });
  return { regions, nonGeometric: ch.nonGeometric, changedPx: ch.px.size, offFrame, pxMap: ch.px };
}
