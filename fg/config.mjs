/**
 * Configs over a store's declared args (browser-safe). A Calculation or query that declares args (fg/store.mjs register
 * { args, needs }) has knobs; store.declaredArgs() lists them all, so the registry is the store itself (Sam, 2026-10-22: features
 * obeying PxC compose and are registered automatically). A config is a sparse map { fn: { knob: value } } over those knobs:
 *   resolveConfig(declared, sparse)  every knob filled (the config's value, else the default) and checked (unknown fn, unknown
 *                                    knob, bad value, a knob of a Calculation whose needs the config does not meet: errors);
 *                                    canonical = the resolved knobs of every ACTIVE Calculation (needs met), keys sorted;
 *                                    hash = sha256 of its canonical JSON; sparse = only the values that differ from the defaults.
 *                                    The resolved knobs are exactly the args the store resolves for each call (same defaults, same
 *                                    precedence), so a config's hash and the store's cache keys agree on what changed.
 *   expandGrid(declared, spec)       a sweep's configs: the cartesian product of the axes ({ knob: 'fn#knob', values } or
 *                                    { name, options: { label: sparse } }) over a base, optionally a seeded random subsample, then
 *                                    crossed with spec.cross; invalid combinations recorded, duplicates merged by hash.
 * A knob path is `fn#knob` (fn.q.trace.seqCells#neighbours): the fn address holds dots.
 */
import { canonicalJson, sha256Hex } from './canon.mjs';
import { knobError } from './store.mjs';

export const CONFIG_SCHEMA = 'pxc-config@1';
export const knobPath = (fn, knob) => `${fn}#${knob}`;
export function splitPath(path) { const i = String(path).lastIndexOf('#'); return i > 0 ? [path.slice(0, i), path.slice(i + 1)] : [null, null]; }

const holds = (resolved, needs) => Object.entries(needs ?? {}).every(([fn, knobs]) => resolved[fn] && Object.entries(knobs).every(([k, v]) => (Array.isArray(v) ? v.includes(resolved[fn][k]) : resolved[fn][k] === v)));
/** The Calculations whose needs hold, transitively (a Calculation needing an inactive one is inactive). */
function activeOf(declared, resolved) {
  const active = new Set(Object.keys(declared));
  for (let changed = true; changed;) {
    changed = false;
    for (const fn of [...active]) {
      const needs = declared[fn].needs;
      if (needs && (!Object.keys(needs).every((f) => active.has(f)) || !holds(resolved, needs))) { active.delete(fn); changed = true; }
    }
  }
  return active;
}

/** -> { ok, errors, warnings, resolved, canonical, sparse, hash, short }. lenient: knobs of an inactive Calculation are warnings. */
export function resolveConfig(declared, sparse = {}, { lenient = false } = {}) {
  const errors = [], warnings = [], resolved = {};
  if (sparse === null || typeof sparse !== 'object' || Array.isArray(sparse)) return { ok: false, errors: ['a config is { fn: { knob: value } }'], warnings };
  for (const [fn, d] of Object.entries(declared)) resolved[fn] = Object.fromEntries(Object.entries(d.args).map(([k, s]) => [k, s.default]));
  for (const [fn, knobs] of Object.entries(sparse)) {
    if (!declared[fn]) { errors.push(`'${fn}' declares no args (or is not registered)`); continue; }
    if (knobs === null || typeof knobs !== 'object') { errors.push(`'${fn}': knobs must be an object`); continue; }
    for (const [k, v] of Object.entries(knobs)) {
      const s = declared[fn].args[k];
      if (!s) { errors.push(`'${fn}' has no knob '${k}' (${Object.keys(declared[fn].args).join(', ')})`); continue; }
      const e = knobError(s, v);
      if (e) errors.push(`${knobPath(fn, k)} ${e}`); else resolved[fn][k] = v;
    }
  }
  const active = activeOf(declared, resolved);
  for (const fn of Object.keys(sparse)) {
    if (!declared[fn] || active.has(fn)) continue;
    const differs = Object.entries(sparse[fn] ?? {}).some(([k, v]) => declared[fn].args[k] && canonicalJson(v) !== canonicalJson(declared[fn].args[k].default));
    if (differs) (lenient ? warnings : errors).push(`'${fn}' acts only when ${canonicalJson(declared[fn].needs)}: its knobs have no effect in this config`);
  }
  if (errors.length) return { ok: false, errors, warnings };
  const canonical = Object.fromEntries([...active].sort().map((fn) => [fn, Object.fromEntries(Object.keys(resolved[fn]).sort().map((k) => [k, resolved[fn][k]]))]));
  const out = {};
  for (const fn of Object.keys(canonical)) {
    const diff = Object.fromEntries(Object.entries(canonical[fn]).filter(([k, v]) => canonicalJson(v) !== canonicalJson(declared[fn].args[k].default)));
    if (Object.keys(diff).length) out[fn] = diff;
  }
  const hash = sha256Hex(canonicalJson({ schema: CONFIG_SCHEMA, canonical }));
  return { ok: true, errors, warnings, resolved, canonical, sparse: out, hash, short: hash.slice(0, 12) };
}

/** A seeded PRNG (mulberry32): the same seed, the same subsample. */
export function prng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const mergeSparse = (a, b) => { const out = { ...a }; for (const [fn, k] of Object.entries(b ?? {})) out[fn] = { ...(out[fn] ?? {}), ...k }; return out; };
const fmt = (v) => (typeof v === 'number' ? +v.toFixed(4) : v);
function axisValues(declared, axis) {
  if (axis.knob) {
    const [fn, k] = splitPath(axis.knob), s = declared[fn]?.args?.[k];
    if (!s) throw new Error(`grid: no declared knob '${axis.knob}' (a path is fn#knob)`);
    const values = axis.values === undefined || axis.values === 'sweep' ? s.sweep ?? s.values ?? [] : axis.values;
    for (const v of values) { const e = knobError(s, v); if (e) throw new Error(`grid: ${axis.knob} value ${JSON.stringify(v)} ${e}`); }
    return values.map((v) => ({ label: `${k}=${fmt(v)}`, fragment: { [fn]: { [k]: v } } }));
  }
  if (axis.options) return Object.entries(axis.options).map(([label, fragment]) => ({ label: `${axis.name ?? 'option'}=${label}`, fragment }));
  throw new Error('grid: an axis is { knob: "fn#knob", values } or { name, options: { label: { fn: { knob: value } } } }');
}
/**
 * spec: { base?: sparse config, axes: [...], cross?: [...], sample?: { n, seed }, include?: { name: sparse config } }.
 * -> { product, sampled, configs: [{ hash, short, labels, names, sparse, canonical }], skipped: [{ labels, errors }], duplicates }
 */
export function expandGrid(declared, spec, { named = {} } = {}) {
  const base = spec.base ?? {};
  let combos = [[]];
  for (const vals of (spec.axes ?? []).map((a) => axisValues(declared, a))) combos = combos.flatMap((c) => vals.map((v) => [...c, v]));
  const cross = (spec.cross ?? []).map((a) => axisValues(declared, a)), product = combos.length * cross.reduce((n, v) => n * v.length, 1);
  if (spec.sample?.n && spec.sample.n < combos.length) {
    const rnd = prng(spec.sample.seed ?? 1), idx = combos.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    combos = idx.slice(0, spec.sample.n).sort((a, b) => a - b).map((i) => combos[i]);
  }
  for (const vals of cross) combos = combos.flatMap((c) => vals.map((v) => [...c, v]));
  const entries = [{ labels: ['base'], names: [], sparse: base }, ...Object.entries(spec.include ?? {}).map(([n, s]) => ({ labels: [`named ${n}`], names: [n], sparse: s })),
    ...combos.map((c) => ({ labels: c.map((v) => v.label), names: [], sparse: c.reduce((acc, v) => mergeSparse(acc, v.fragment), base) }))];
  const byHash = new Map(), skipped = [];
  let duplicates = 0;
  for (const e of entries) {
    const r = resolveConfig(declared, e.sparse, { lenient: true });
    if (!r.ok) { skipped.push({ labels: e.labels, errors: r.errors }); continue; }
    const had = byHash.get(r.hash);
    if (had) { duplicates++; had.labels.push(e.labels.join(' ')); had.names.push(...e.names); continue; }
    byHash.set(r.hash, { hash: r.hash, short: r.short, labels: [e.labels.join(' ')], names: [...e.names], sparse: r.sparse, canonical: r.canonical });
  }
  for (const [name, s] of Object.entries(named)) { const r = resolveConfig(declared, s); const c = r.ok ? byHash.get(r.hash) : null; if (c && !c.names.includes(name)) c.names.push(name); }
  return { product, sampled: combos.length, configs: [...byHash.values()], skipped, duplicates };
}

/** The declared knobs as rows (fn, knob, unit, default, values, sweep, assumption, note, needs): for `pxc sweep --registry`. */
export const declaredRows = (declared) => Object.entries(declared).flatMap(([fn, d]) => Object.entries(d.args).map(([k, s]) => ({ fn, knob: k, path: knobPath(fn, k), unit: s.unit, default: s.default, values: s.values ?? null, sweep: s.sweep ?? null, assumption: s.assumption ?? null, needs: d.needs ?? null, note: s.note })));
