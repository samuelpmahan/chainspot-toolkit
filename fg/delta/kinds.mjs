/**
 * Per-Part-kind delta types (fg/delta layer, browser-safe).
 *
 * A Part value is a record of typed FACETS; each facet kind has one value
 * shape and one delta shape, with empty / diff / apply / summary:
 *
 *   pxset     value { "<owner>|<role>": runs }   one claim per pixel per Part
 *             delta { rename?, added: {key: runs}, removed: {key: runs},
 *                     reowned: [{ from, to, px: runs }] }
 *             roles: own (owned), mute (consumed, not owned), cand (candidate
 *             evidence, not a claim), elim (eliminated evidence, not a claim).
 *             A role change (cand -> own, mute -> own) is a re-own.
 *   objectSet value { [id]: obj }  obj: { center?, angleRad?, bbox?, ...attrs }
 *             delta { replace?, kept, changed: [{ from, to, set?, unset?, pose? }],
 *                     removed: [{ id, why? }], added: [{ id, obj }] }
 *             joined by GEOMETRIC identity when a Contract is given
 *             (fg/identity.mjs geometricJoin), else by id; unmentioned objects
 *             are kept unchanged.
 *   scalars   value { [name]: json }  delta { set: { name: { from, to, diff? } }, unset: [name] }
 *   ledger    value { [rowKey]: row } delta: the objectSet delta, joined by key
 *
 * Facet names map to kinds through FACETS. apply never throws on stale
 * input: it returns { value, violations } so a refold after an ablation can
 * report every precondition the dropped Δ broke.
 */
import { geometricJoin } from '../identity.mjs';
import { canonicalJson } from '../canon.mjs';
import { toRuns, fromRuns, countRuns } from './px.mjs';

export const FACETS = { objects: 'objectSet', elim: 'objectSet', px: 'pxset', scalars: 'scalars', ledger: 'ledger' };
export const FACET_ORDER = ['scalars', 'objects', 'elim', 'px', 'ledger'];

const same = (a, b) => canonicalJson(a ?? null) === canonicalJson(b ?? null);
const topOwner = (key) => key.split('|')[0].split('/')[0];
const renameKey = (key, rename) => {
  if (!rename) return key;
  const [owner, role] = key.split('|');
  const segs = owner.split('/');
  if (rename[segs[0]] === undefined) return key;
  segs[0] = rename[segs[0]];
  return `${segs.join('/')}|${role}`;
};
export const claimKey = (owner, role) => `${owner}|${role}`;
export const splitKey = (key) => { const [owner, role] = key.split('|'); return { owner, role }; };

// ---------------------------------------------------------------- pxset
function pxMap(value, rename, violations, where) {
  const map = new Map();
  for (const [key0, runs] of Object.entries(value ?? {})) {
    const key = renameKey(key0, rename);
    for (const p of fromRuns(runs)) {
      if (map.has(p) && violations) violations.push({ kind: 'pxDupInPart', where, px: p, keys: [map.get(p), key] });
      map.set(p, key);
    }
  }
  return map;
}
function groupRuns(entries) {
  const by = new Map();
  for (const [k, p] of entries) { if (!by.has(k)) by.set(k, []); by.get(k).push(p); }
  return Object.fromEntries([...by.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, ps]) => [k, toRuns(ps)]));
}
function mapToValue(map) { return groupRuns([...map.entries()].map(([p, k]) => [k, p])); }

export const pxset = {
  empty: () => ({}),
  diff(a, b, { rename = null } = {}) {
    const am = pxMap(a, rename), bm = pxMap(b, null);
    const added = [], removed = [], moved = [];
    for (const [p, k] of bm) { const ak = am.get(p); if (ak === undefined) added.push([k, p]); else if (ak !== k) moved.push([`${ak}=>${k}`, p]); }
    for (const [p, k] of am) if (!bm.has(p)) removed.push([k, p]);
    const reowned = Object.entries(groupRuns(moved)).map(([fk, px]) => { const [from, to] = fk.split('=>'); return { from, to, px }; });
    const delta = { added: groupRuns(added), removed: groupRuns(removed), reowned };
    if (rename && Object.keys(rename).length) delta.rename = rename;
    return delta;
  },
  apply(a, d, where = '') {
    const violations = [];
    const map = pxMap(a, d.rename ?? null, violations, where);
    for (const [key, runs] of Object.entries(d.removed ?? {}))
      for (const p of fromRuns(runs)) { if (map.get(p) !== key) violations.push({ kind: 'pxRemoveAbsent', where, key, px: p }); else map.delete(p); }
    for (const { from, to, px } of d.reowned ?? [])
      for (const p of fromRuns(px)) { if (map.get(p) !== from) violations.push({ kind: 'pxReownAbsent', where, from, to, px: p }); map.set(p, to); }
    for (const [key, runs] of Object.entries(d.added ?? {}))
      for (const p of fromRuns(runs)) { if (map.has(p) && map.get(p) !== key) violations.push({ kind: 'pxAddPresent', where, key, held: map.get(p), px: p }); map.set(p, key); }
    return { value: mapToValue(map), violations: compact(violations) };
  },
  summary(d) {
    const sum = (o) => Object.values(o ?? {}).reduce((n, r) => n + countRuns(r), 0);
    return { addedPx: sum(d.added), removedPx: sum(d.removed), reownedPx: (d.reowned ?? []).reduce((n, r) => n + countRuns(r.px), 0) };
  },
  isEmpty: (d) => !Object.keys(d.added ?? {}).length && !Object.keys(d.removed ?? {}).length && !(d.reowned ?? []).length && !d.rename
};

// one violation per (kind, where, key) with a pixel count, not one per pixel
function compact(violations) {
  const by = new Map();
  for (const v of violations) {
    if (v.px === undefined) { by.set(Symbol(), v); continue; }
    const k = `${v.kind}|${v.where}|${v.key ?? v.from ?? ''}|${v.to ?? ''}`;
    if (!by.has(k)) { const { px, ...rest } = v; by.set(k, { ...rest, count: 0, firstPx: px }); }
    by.get(k).count++;
  }
  return [...by.values()];
}

// ---------------------------------------------------------------- objectSet
/** a changed entry is { id, ... } when the join kept the id, { from, to, ... } when it renamed */
export const ends = (c) => ({ from: c.from ?? c.id, to: c.to ?? c.id });
const POSE_FIELDS = ['center', 'angleRad', 'bbox'];
function poseDelta(a, b) {
  const out = {};
  if (a.center && b.center) out.dCenterPx = Math.round(Math.hypot(b.center[0] - a.center[0], b.center[1] - a.center[1]) * 1e4) / 1e4;
  if (typeof a.angleRad === 'number' && typeof b.angleRad === 'number') {
    let d = Math.abs(b.angleRad - a.angleRad) % Math.PI; if (d > Math.PI / 2) d = Math.PI - d;
    out.dAngleDeg = Math.round(d * 180 / Math.PI * 1e4) / 1e4;
  }
  if (a.bbox && b.bbox) out.dBbox = b.bbox.map((v, i) => v - a.bbox[i]);
  return out;
}

export const objectSet = {
  empty: () => ({}),
  /** returns the delta and the id rename map (base id -> out id) the join implies */
  diff(a = {}, b = {}, { contract = null } = {}) {
    const aIds = Object.keys(a).sort(), bIds = Object.keys(b).sort();
    let pairs = [], onlyA = [], onlyB = [], notes = null;
    if (contract && aIds.length && bIds.length) {
      const join = geometricJoin({ sets: { a: aIds.map((id) => a[id]), b: bIds.map((id) => b[id]) }, contract });
      for (const identity of join.identities) {
        const ia = identity.members.a, ib = identity.members.b;
        if (ia !== null && ib !== null) pairs.push([aIds[ia], bIds[ib]]);
        else if (ia !== null) onlyA.push(aIds[ia]);
        else onlyB.push(bIds[ib]);
      }
      if (join.ambiguous.length || join.collisions.length) notes = { contract: contract.address, ambiguous: join.ambiguous.length, collisions: join.collisions.length };
    } else {
      const bs = new Set(bIds);
      for (const id of aIds) (bs.has(id) ? pairs : onlyA).push(bs.has(id) ? [id, id] : id);
      const as = new Set(aIds);
      onlyB = bIds.filter((id) => !as.has(id));
    }
    const changed = [];
    let kept = 0;
    const rename = {};
    for (const [ia, ib] of pairs.sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))) {
      const oa = a[ia], ob = b[ib];
      const set = {}, unset = [];
      for (const k of Object.keys(ob)) if (!same(oa[k], ob[k])) set[k] = ob[k];
      for (const k of Object.keys(oa)) if (!(k in ob)) unset.push(k);
      if (ia !== ib) rename[ia] = ib;
      if (ia === ib && !Object.keys(set).length && !unset.length) { kept++; continue; }
      const entry = ia === ib ? { id: ia } : { from: ia, to: ib };
      if (Object.keys(set).length) entry.set = set;
      if (unset.length) entry.unset = unset.sort();
      if (POSE_FIELDS.some((k) => k in set)) entry.pose = poseDelta(oa, ob);
      changed.push(entry);
    }
    const added = onlyB.sort().map((id) => ({ id, obj: b[id] }));
    // a facet that shares nothing with its base is a replacement, not an edit
    const delta = aIds.length && !pairs.length
      ? { replace: true, replaced: aIds.length, kept: 0, changed: [], removed: [], added }
      : { kept, changed, removed: onlyA.sort().map((id) => ({ id })), added };
    if (notes) delta.notes = notes;
    return { delta, rename };
  },
  apply(a = {}, d, where = '') {
    const violations = [];
    const out = d.replace ? {} : { ...a };
    if (!d.replace) {
      for (const { id } of d.removed ?? []) { if (!(id in out)) violations.push({ kind: 'objRemoveAbsent', where, id }); delete out[id]; }
      const moved = [];
      for (const c of d.changed ?? []) {
        const { from, to } = ends(c);
        if (!(from in a)) { violations.push({ kind: 'objChangeAbsent', where, id: from }); continue; }
        const next = { ...a[from], ...(c.set ?? {}) };
        for (const k of c.unset ?? []) delete next[k];
        delete out[from];
        moved.push([to, next]);
      }
      for (const [id, obj] of moved) out[id] = obj;
    }
    for (const { id, obj } of d.added ?? []) { if (id in out) violations.push({ kind: 'objAddPresent', where, id }); out[id] = obj; }
    return { value: out, violations };
  },
  summary: (d) => ({ addedObj: (d.added ?? []).length, removedObj: (d.removed ?? []).length, changedObj: (d.changed ?? []).length, keptObj: d.kept ?? 0, replace: Boolean(d.replace) }),
  isEmpty: (d) => !(d.added ?? []).length && !(d.removed ?? []).length && !(d.changed ?? []).length && !d.replace
};

// ---------------------------------------------------------------- scalars
export const scalars = {
  empty: () => ({}),
  diff(a = {}, b = {}) {
    const set = {}, unset = [];
    for (const [k, v] of Object.entries(b)) if (!same(a[k], v)) {
      const entry = { from: a[k] ?? null, to: v };
      if (typeof a[k] === 'number' && typeof v === 'number') entry.diff = v - a[k];
      set[k] = entry;
    }
    for (const k of Object.keys(a)) if (!(k in b)) unset.push(k);
    return { set, unset: unset.sort() };
  },
  apply(a = {}, d, where = '') {
    const violations = [];
    const out = { ...a };
    for (const [k, { from, to }] of Object.entries(d.set ?? {})) {
      if (!same(out[k] ?? null, from)) violations.push({ kind: 'scalarStale', where, name: k, expected: from, held: out[k] ?? null });
      out[k] = to;
    }
    for (const k of d.unset ?? []) delete out[k];
    return { value: out, violations };
  },
  summary: (d) => ({ scalarsSet: Object.keys(d.set ?? {}).length, scalarsUnset: (d.unset ?? []).length }),
  isEmpty: (d) => !Object.keys(d.set ?? {}).length && !(d.unset ?? []).length
};

// ---------------------------------------------------------------- ledger (an objectSet keyed by row key)
export const ledger = {
  empty: () => ({}),
  diff: (a, b) => objectSet.diff(a, b, {}).delta,
  apply: (a, d, where) => objectSet.apply(a, d, where),
  summary: (d) => ({ rowsAdded: (d.added ?? []).length, rowsRemoved: (d.removed ?? []).length, rowsChanged: (d.changed ?? []).length }),
  isEmpty: (d) => objectSet.isEmpty(d)
};

export const KINDS = { pxset, objectSet, scalars, ledger };
export const kindOf = (facet) => { const k = FACETS[facet]; if (!k) throw new Error(`fg/delta: unknown facet ${facet}`); return KINDS[k]; };

// ---------------------------------------------------------------- Parts
/**
 * partDiff(a, b, { contract }) -> { facets: { name: delta }, drop: [names] }
 * The objects-facet join decides the id rename applied to px owners, so a
 * tee relabelled T10 -> R9 by a refinement is a rename, not 254 px re-owned.
 */
export function partDiff(a = {}, b = {}, { contract = null } = {}) {
  const facets = {};
  let rename = null;
  if (a.objects || b.objects) {
    const { delta, rename: r } = objectSet.diff(a.objects ?? {}, b.objects ?? {}, { contract });
    rename = Object.keys(r).length ? r : null;
    if (!objectSet.isEmpty(delta)) facets.objects = delta;
  }
  for (const name of FACET_ORDER) {
    if (name === 'objects' || !(name in b)) continue;
    const kind = kindOf(name);
    let d;
    if (name === 'px') d = pxset.diff(a.px ?? {}, b.px, { rename });
    else if (name === 'elim') d = objectSet.diff(a.elim ?? {}, b.elim, { contract }).delta;
    else d = kind.diff(a[name] ?? {}, b[name]);
    if (!kind.isEmpty(d)) facets[name] = d;
  }
  if (rename && !facets.px && a.px) facets.px = { added: {}, removed: {}, reowned: [], rename };
  const drop = Object.keys(a).filter((n) => !(n in b)).sort();
  return drop.length ? { facets, drop } : { facets };
}

export function partApply(a = {}, d, where = '') {
  const out = { ...a };
  const violations = [];
  for (const name of d.drop ?? []) delete out[name];
  for (const name of FACET_ORDER) {
    if (!d.facets?.[name]) continue;
    const r = kindOf(name).apply(out[name] ?? {}, d.facets[name], `${where}.${name}`);
    out[name] = r.value;
    violations.push(...r.violations);
  }
  return { value: out, violations };
}

export function partSummary(d) {
  const out = {};
  for (const [name, fd] of Object.entries(d.facets ?? {})) Object.assign(out, Object.fromEntries(Object.entries(kindOf(name).summary(fd)).map(([k, v]) => [`${name}.${k}`, v])));
  if (d.drop?.length) out.drop = d.drop;
  return out;
}

export const partIsEmpty = (d) => !Object.keys(d.facets ?? {}).length && !(d.drop ?? []).length;
export { topOwner };
