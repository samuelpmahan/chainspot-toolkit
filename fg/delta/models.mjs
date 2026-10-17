/**
 * Three competing Δ models over the same Evidence (fg/delta, browser-safe).
 *
 * Every model is { id, title, build(evidence) -> stream, entriesOf(stream),
 * stepOf(entry), calcOf(entry) -> [calc], applyGroup(scene, entries) ->
 * { scene, violations, view } }. view is the model's OWN account of what
 * changed, as per-kind deltas: [{ address, base, by: [calc], delta }], which
 * is the one thing the projections draw and count, so a projection never
 * knows which model it is reading.
 *
 *   M1 base-transform: one entry per Calculation; Δ = out vs the Part the
 *      Calculation declares it transforms (its inPart), or vs empty for a
 *      new kind (with the consumed addresses as evidence).
 *   M2 edition: one entry per (Tick, address); Δ = vs the previous edition
 *      of the same address, first write = vs empty.
 *   M3 events: a typed event log (pxOwned/pxMuted/pxNoted/pxReleased/
 *      pxReowned, objectAdmitted/objectEliminated/objectUpdated, paramSet,
 *      rowSet, verdict ...), no editions; Parts are folds. With
 *      { lineage: true } the log also carries partForked{part, from}, the
 *      one M1 notion it needs to say "-3 tees" instead of "+15 tees".
 */
import { partDiff, partApply, objectSet, pxset, scalars, ledger, FACETS, FACET_ORDER, ends } from './kinds.mjs';
import { CONTRACTS } from './contracts.mjs';
import { cloneScene } from './scene.mjs';

const contractOf = (name) => (name ? CONTRACTS[name] ?? null : null);

/**
 * Split one Out into per-Calculation pieces: the first Calculation of the
 * Tick writes everything except px claims whose role another Calculation
 * owns (roleCalc), then each role-owner adds its claims in place.
 */
export function pieces(step, out) {
  const primary = step.calculations[0];
  const roleCalc = out.roleCalc ?? {};
  const roles = Object.keys(roleCalc);
  if (!roles.length || !out.value.px) return [{ calc: primary, value: out.value }];
  const without = (value, drop) => ({ ...value, px: Object.fromEntries(Object.entries(value.px).filter(([k]) => !drop.includes(k.split('|')[1]))) });
  const list = [{ calc: primary, value: without(out.value, roles) }];
  roles.forEach((role, i) => list.push({ calc: roleCalc[role], value: without(out.value, roles.slice(i + 1)) }));
  return list;
}

const metaFor = (step, by, base, supersedes) => ({ stage: step.stage, lane: step.lane, by, base: base ?? null, supersedes: supersedes ?? [] });

// ============================================================ M1
export const M1 = {
  id: 'M1', title: 'base-transform Δ',
  build(ev) {
    const values = {};
    const entries = [];
    for (const step of ev.steps) {
      if (!step.outs.length) entries.push({ step: step.key, stage: step.stage, tick: step.tick, lane: step.lane, calculation: step.calculations[0], out: null, base: null, consumes: step.consumes, verdicts: step.verdicts, delta: null });
      step.outs.forEach((out) => {
        pieces(step, out).forEach((piece, i) => {
          const base = i === 0 ? out.base : out.address;
          const delta = partDiff(base ? values[base] ?? {} : {}, piece.value, { contract: contractOf(out.contract) });
          entries.push({ step: step.key, stage: step.stage, tick: step.tick, lane: step.lane, calculation: piece.calc, out: out.address, base, consumes: base ? undefined : step.consumes, supersedes: out.supersedes.length ? out.supersedes : undefined, verdicts: i === 0 && out === step.outs[0] ? step.verdicts : undefined, delta });
          values[out.address] = piece.value;
        });
      });
    }
    return { model: 'M1', frame: ev.frame, entries };
  },
  entriesOf: (s) => s.entries,
  stepOf: (e) => e.step,
  calcOf: (e) => [e.calculation],
  applyGroup(scene0, entries) {
    const scene = cloneScene(scene0);
    const violations = [], view = [];
    for (const e of entries) {
      if (!e.out) continue;
      const base = e.base ? scene.parts[e.base] : null;
      if (e.base && !base) violations.push({ kind: 'baseMissing', where: e.out, base: e.base, calc: e.calculation });
      const r = partApply(base?.value ?? {}, e.delta, e.out);
      violations.push(...r.violations.map((v) => ({ ...v, calc: e.calculation })));
      const prev = scene.parts[e.out];
      const by = e.base === e.out && prev ? [...prev.meta.by, e.calculation] : [e.calculation];
      scene.parts[e.out] = { value: r.value, meta: metaFor({ stage: e.stage, lane: e.lane }, by, e.base === e.out ? prev?.meta.base : e.base, e.supersedes ?? (e.base === e.out ? prev?.meta.supersedes : [])) };
      view.push({ address: e.out, base: e.base, by: [e.calculation], delta: e.delta });
    }
    return { scene, violations, view, verdicts: entries.flatMap((e) => e.verdicts ?? []) };
  }
};

// ============================================================ M2
export const M2 = {
  id: 'M2', title: 'edition Δ',
  build(ev) {
    const values = {}, editions = {};
    const entries = [];
    for (const step of ev.steps) {
      if (!step.outs.length) entries.push({ step: step.key, stage: step.stage, tick: step.tick, lane: step.lane, calculations: step.calculations, address: null, edition: 0, verdicts: step.verdicts, delta: null });
      step.outs.forEach((out, i) => {
        const edition = (editions[out.address] ?? 0) + 1;
        editions[out.address] = edition;
        const delta = partDiff(values[out.address] ?? {}, out.value, { contract: contractOf(out.contract) });
        entries.push({ step: step.key, stage: step.stage, tick: step.tick, lane: step.lane, calculations: step.calculations, address: out.address, edition, verdicts: i === 0 ? step.verdicts : undefined, delta });
        values[out.address] = out.value;
      });
    }
    return { model: 'M2', frame: ev.frame, entries };
  },
  entriesOf: (s) => s.entries,
  stepOf: (e) => e.step,
  calcOf: (e) => e.calculations,
  applyGroup(scene0, entries) {
    const scene = cloneScene(scene0);
    const violations = [], view = [];
    for (const e of entries) {
      if (!e.address) continue;
      const prev = scene.parts[e.address];
      if (e.edition > 1 && !prev) violations.push({ kind: 'editionGap', where: e.address, edition: e.edition });
      const r = partApply(prev?.value ?? {}, e.delta, e.address);
      violations.push(...r.violations);
      scene.parts[e.address] = { value: r.value, meta: { ...metaFor({ stage: e.stage, lane: e.lane }, e.calculations, null, []), edition: e.edition } };
      view.push({ address: e.address, base: e.edition > 1 ? e.address : null, by: e.calculations, delta: e.delta });
    }
    return { scene, violations, view, verdicts: entries.flatMap((e) => e.verdicts ?? []) };
  }
};

// ============================================================ M3
const PX_TYPE = { own: 'pxOwned', mute: 'pxMuted', cand: 'pxNoted', elim: 'pxNoted' };

/** A part delta as fine-grained events (one per object / owner / scalar / row). */
export function deltaToEvents(part, d) {
  const ev = [];
  for (const facet of d.drop ?? []) ev.push({ type: 'facetDropped', part, facet });
  for (const facet of FACET_ORDER) {
    const fd = d.facets?.[facet];
    if (!fd) continue;
    if (FACETS[facet] === 'scalars') {
      for (const [name, { from, to }] of Object.entries(fd.set ?? {})) ev.push({ type: 'paramSet', part, name, from, to });
      for (const name of fd.unset ?? []) ev.push({ type: 'paramUnset', part, name });
    } else if (FACETS[facet] === 'pxset') {
      if (fd.rename) ev.push({ type: 'ownersRenamed', part, rename: fd.rename });
      for (const [key, px] of Object.entries(fd.removed ?? {})) ev.push({ type: 'pxReleased', part, key, px });
      for (const { from, to, px } of fd.reowned ?? []) ev.push({ type: 'pxReowned', part, from, to, px });
      for (const [key, px] of Object.entries(fd.added ?? {})) ev.push({ type: PX_TYPE[key.split('|')[1]] ?? 'pxNoted', part, key, px, alpha: 1 });
    } else {
      const row = FACETS[facet] === 'ledger';
      if (fd.replace) ev.push({ type: 'facetDropped', part, facet });
      for (const { id, why } of fd.removed ?? []) ev.push({ type: row ? 'rowDeleted' : 'objectEliminated', part, facet, id, ...(why ? { why } : {}) });
      for (const c of fd.changed ?? []) ev.push({ type: row ? 'rowUpdated' : 'objectUpdated', part, facet, id: ends(c).from, ...(ends(c).to !== ends(c).from ? { renameTo: ends(c).to } : {}), ...(c.set ? { set: c.set } : {}), ...(c.unset ? { unset: c.unset } : {}), ...(c.pose ? { pose: c.pose } : {}) });
      for (const { id, obj } of fd.added ?? []) ev.push({ type: row ? 'rowSet' : 'objectAdmitted', part, facet, id, obj });
    }
  }
  return ev;
}

/** One event as a one-facet part delta (the inverse of deltaToEvents, per event). */
export function eventToDelta(e) {
  switch (e.type) {
    case 'facetDropped': return { facets: {}, drop: [e.facet] };
    case 'paramSet': return { facets: { scalars: { set: { [e.name]: { from: e.from, to: e.to } }, unset: [] } } };
    case 'paramUnset': return { facets: { scalars: { set: {}, unset: [e.name] } } };
    case 'ownersRenamed': return { facets: { px: { added: {}, removed: {}, reowned: [], rename: e.rename } } };
    case 'pxReleased': return { facets: { px: { added: {}, removed: { [e.key]: e.px }, reowned: [] } } };
    case 'pxReowned': return { facets: { px: { added: {}, removed: {}, reowned: [{ from: e.from, to: e.to, px: e.px }] } } };
    case 'pxOwned': case 'pxMuted': case 'pxNoted': return { facets: { px: { added: { [e.key]: e.px }, removed: {}, reowned: [] } } };
    case 'objectEliminated': case 'rowDeleted': return { facets: { [e.facet]: { kept: 0, changed: [], removed: [{ id: e.id, ...(e.why ? { why: e.why } : {}) }], added: [] } } };
    case 'objectUpdated': case 'rowUpdated': return { facets: { [e.facet]: { kept: 0, changed: [{ ...(e.renameTo ? { from: e.id, to: e.renameTo } : { id: e.id }), ...(e.set ? { set: e.set } : {}), ...(e.unset ? { unset: e.unset } : {}), ...(e.pose ? { pose: e.pose } : {}) }], removed: [], added: [] } } };
    case 'objectAdmitted': case 'rowSet': return { facets: { [e.facet]: { kept: 0, changed: [], removed: [], added: [{ id: e.id, obj: e.obj }] } } };
    default: return null;
  }
}

/** Merge consecutive one-facet deltas of one part back into a per-kind delta (for the view). */
export function mergeDeltas(list) {
  const out = { facets: {} };
  const drop = new Set();
  for (const d of list) {
    for (const f of d.drop ?? []) { drop.add(f); delete out.facets[f]; }
    for (const [f, fd] of Object.entries(d.facets)) {
      const cur = out.facets[f];
      if (!cur) { out.facets[f] = structuredClone(fd); continue; }
      if (FACETS[f] === 'pxset') {
        Object.assign(cur.added, fd.added); Object.assign(cur.removed, fd.removed); cur.reowned.push(...fd.reowned);
        if (fd.rename) cur.rename = { ...(cur.rename ?? {}), ...fd.rename };
      } else if (FACETS[f] === 'scalars') { Object.assign(cur.set, fd.set); cur.unset.push(...fd.unset); }
      else { cur.changed.push(...fd.changed); cur.removed.push(...fd.removed); cur.added.push(...fd.added); }
    }
  }
  if (drop.size) out.drop = [...drop].sort();
  return out;
}

export function makeM3({ lineage = false } = {}) {
  const id = lineage ? 'M3L' : 'M3';
  return {
    id, title: lineage ? 'fine-grained events + partForked lineage' : 'fine-grained events',
    build(ev) {
      const values = {};
      const events = [];
      let seq = 0;
      const push = (step, calc, e) => events.push({ seq: seq++, step: step.key, stage: step.stage, tick: step.tick, lane: step.lane, calc, ...e });
      for (const step of ev.steps) {
        for (const v of step.verdicts) push(step, step.calculations[0], { type: 'verdict', check: v.name, ok: v.ok });
        if (!step.outs.length) push(step, step.calculations[0], { type: 'tickRan' });
        for (const out of step.outs) {
          pieces(step, out).forEach((piece, i) => {
            let before = values[out.address] ?? {};
            if (i === 0 && lineage && out.base) {
              push(step, piece.calc, { type: 'partForked', part: out.address, from: out.base, supersedes: out.supersedes.includes(out.base) });
              before = values[out.base] ?? {};
            }
            const d = partDiff(before, piece.value, { contract: contractOf(out.contract) });
            for (const e of deltaToEvents(out.address, d)) push(step, piece.calc, e);
            if (!d.facets || (!Object.keys(d.facets).length && !(d.drop ?? []).length)) push(step, piece.calc, { type: 'partTouched', part: out.address });
            values[out.address] = piece.value;
          });
        }
      }
      return { model: id, frame: ev.frame, events };
    },
    entriesOf: (s) => s.events,
    stepOf: (e) => e.step,
    calcOf: (e) => [e.calc],
    applyGroup(scene0, events) {
      const scene = cloneScene(scene0);
      const violations = [];
      const perPart = new Map();
      const verdicts = [];
      for (const e of events) {
        if (e.type === 'verdict') { verdicts.push({ name: e.check, ok: e.ok }); continue; }
        if (e.type === 'tickRan') continue;
        if (!perPart.has(e.part)) perPart.set(e.part, { base: null, by: new Set(), deltas: [] });
        const acc = perPart.get(e.part);
        acc.by.add(e.calc);
        const prev = scene.parts[e.part];
        if (e.type === 'partTouched') { if (!prev) scene.parts[e.part] = { value: {}, meta: metaFor(e, [e.calc], null, []) }; continue; }
        if (e.type === 'partForked') {
          const from = scene.parts[e.from];
          if (!from) violations.push({ kind: 'baseMissing', where: e.part, base: e.from, calc: e.calc });
          scene.parts[e.part] = { value: { ...(from?.value ?? {}) }, meta: metaFor(e, [e.calc], e.from, e.supersedes ? [e.from] : []) };
          acc.base = e.from;
          continue;
        }
        const d = eventToDelta(e);
        const r = partApply(prev?.value ?? {}, d, e.part);
        violations.push(...r.violations.map((v) => ({ ...v, calc: e.calc })));
        const by = prev ? [...new Set([...prev.meta.by, e.calc])] : [e.calc];
        scene.parts[e.part] = { value: r.value, meta: prev ? { ...prev.meta, by } : metaFor(e, by, null, []) };
        acc.deltas.push(d);
      }
      const view = [...perPart.entries()].map(([address, acc]) => ({ address, base: acc.base, by: [...acc.by], delta: mergeDeltas(acc.deltas) }));
      return { scene, violations, view, verdicts };
    }
  };
}

export const M3 = makeM3();
export const M3L = makeM3({ lineage: true });
export const MODELS = [M1, M2, M3, M3L];
export { objectSet, pxset, scalars, ledger };
