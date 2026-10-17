/**
 * Projections over a Δ stream (fg/delta, browser-safe). Every function here
 * takes (model, stream) and never branches on which model it is: that is
 * the reusability test. A model only has to group its entries by step and
 * fold one group into a scene, returning its own view of the change.
 *
 *   fold(model, stream, { until, drop, keep })     the fold every projection uses
 *   receipt(scene, layers)                          P1: receipt numbers from a folded scene
 *   frames(model, stream, { title })                P2: one flipbook Frame per step
 *   scrub(model, stream, { hash })                  P3: the UI scene at every step k
 *   ablate(model, stream, evidence, calc)           P4: drop one Calculation's Δ and refold
 *   conservation(scene)                             ownership closes; seams per part
 */
import { emptyScene, layer, seams, sceneSummary, sceneContent, partStats } from './scene.mjs';
import { objectSet, partSummary, splitKey, topOwner, ends } from './kinds.mjs';
import { fromRuns, countRuns } from './px.mjs';
import { teePose } from './contracts.mjs';
import { canonicalJson } from '../canon.mjs';

export function groups(model, stream) {
  const order = [];
  const by = new Map();
  for (const e of model.entriesOf(stream)) {
    const k = model.stepOf(e);
    if (!by.has(k)) { by.set(k, []); order.push(k); }
    by.get(k).push(e);
  }
  return order.map((step) => ({ step, entries: by.get(step) }));
}

/**
 * drop: a Calculation name; every entry the model attributes to it is
 * removed (a model that attributes coarsely drops more). Steps stay in
 * place (possibly empty) so step k means the same Tick in every refold.
 */
export function fold(model, stream, { until = Infinity, drop = null, keepScenes = false } = {}) {
  let scene = emptyScene(stream.frame);
  const steps = [];
  const all = [];
  groups(model, stream).forEach(({ step, entries }, k) => {
    if (k >= until) return;
    const kept = drop ? entries.filter((e) => !model.calcOf(e).includes(drop)) : entries;
    const before = scene;
    const r = model.applyGroup(scene, kept);
    scene = r.scene;
    const first = entries[0];
    steps.push({
      k, step, stage: first.stage, tick: first.tick, lane: first.lane ?? null, dropped: entries.length - kept.length,
      by: [...new Set(entries.flatMap((e) => model.calcOf(e)))], view: r.view, verdicts: r.verdicts ?? [], violations: r.violations,
      ...(keepScenes ? { before, after: scene } : {})
    });
    all.push(...r.violations.map((v) => ({ ...v, step })));
  });
  return { scene, steps, violations: all };
}

/** Layers at stage boundaries: after the last step of each stage (lanes included), and after main S3. */
export function stageLayers(model, stream, opts = {}) {
  const r = fold(model, stream, { ...opts, keepScenes: true });
  const lastOf = (pred) => { let s = null; for (const st of r.steps) if (pred(st)) s = st; return s?.after ?? null; };
  const L = (scene) => (scene ? layer(scene) : null);
  return {
    fold: r,
    layers: {
      afterS0: L(lastOf((s) => s.stage === 'S0')),
      afterS1: L(lastOf((s) => s.stage === 'S0' || s.stage === 'S1')),
      afterS2: L(lastOf((s) => s.stage !== 'S3')),
      afterS3main: L(lastOf((s) => s.stage !== 'S3' || !s.lane)),
      afterS3: L(r.scene)
    }
  };
}

// ------------------------------------------------------------------ P1
const pxOf = (part, role) => {
  const out = new Set();
  for (const [k, runs] of Object.entries(part?.value.px ?? {})) if (!role || splitKey(k).role === role) for (const p of fromRuns(runs)) out.add(p);
  return out;
};
const roleCount = (part, role) => Object.entries(part?.value.px ?? {}).reduce((n, [k, r]) => n + (splitKey(k).role === role ? countRuns(r) : 0), 0);
const n = (o) => (o ? Object.keys(o).length : 0);
const owners = (part, role, pred = () => true) => Object.keys(part?.value.px ?? {}).filter((k) => splitKey(k).role === role && pred(k));
const camel = (s) => String(s).replace(/-([a-z])/g, (_, c) => c.toUpperCase());

export function receipt(scene, layers) {
  const P = scene.parts;
  const out = {};
  const put = (k, v) => { if (v !== undefined && v !== null) out[k] = v; };
  const badges = P['px.badges'];
  if (badges) {
    const own = pxOf(badges, 'own'), mute = pxOf(badges, 'mute');
    put('S1.badgeCount', n(badges.value.objects));
    put('S1.totals.badgePx', own.size);
    put('S1.totals.mutedPx', own.size + mute.size);
    put('S1.totals.addedMutePx', mute.size);
    put('S1.totals.whitePx', Object.values(badges.value.objects).reduce((s, o) => s + (o.whitePx ?? 0), 0));
    put('S1.totals.blackPx', Object.values(badges.value.objects).reduce((s, o) => s + (o.blackPx ?? 0), 0));
    const digits = P['px.badges.digits'];
    if (digits) {
      const counters = pxOf(digits, 'own');
      put('S1Digits.totals.digitCount', n(digits.value.objects));
      put('S1Digits.totals.counterComponentCount', owners(digits, 'own').length);
      put('S1Digits.totals.counterBadgeCount', new Set(owners(digits, 'own').map(topOwner)).size);
      put('S1Digits.totals.counterPx', counters.size);
      put('S1Digits.totals.specDelta.badgeOwnedUnionAfterPx', new Set([...own, ...counters]).size);
      put('S1Digits.totals.specDelta.mutedUnionAfterPx', [...own, ...mute].filter((p) => !counters.has(p)).length);
      put('S1Digits.totals.specDelta.movedFromMuteToDigitOwnedPx', [...counters].filter((p) => mute.has(p)).length);
    }
  }
  const glyph = P.badgeGlyphTemplate;
  if (glyph) for (const row of Object.values(glyph.value.ledger ?? {})) { const k = `S1BadgeGlyphTemplate.counts.${camel(row.agreement)}`; out[k] = (out[k] ?? 0) + 1; }
  const asm = P['px.badges.assembly'];
  if (asm) {
    const isCounter = (k) => /\/d\d+\/c\d+\|/.test(k);
    const fused = new Set(), counters = new Set();
    for (const [k, runs] of Object.entries(asm.value.px ?? {})) for (const p of fromRuns(runs)) (isCounter(k) ? counters : fused).add(p);
    put('S1BadgeAssembly.totals.badgeCount', n(asm.value.objects));
    put('S1BadgeAssembly.totals.fusedUnionPx', fused.size);
    put('S1BadgeAssembly.totals.counterPx', counters.size);
    put('S1BadgeAssembly.totals.counterComponentCount', owners(asm, 'own', isCounter).length);
    put('S1BadgeAssembly.totals.ownedWithCountersPx', new Set([...fused, ...counters]).size);
  }
  const baskets = P['px.baskets'];
  if (baskets) {
    put('S2.basketCount', n(baskets.value.objects));
    put('S2.totals.claimedPx', roleCount(baskets, 'own'));
    put('S2.layerIntegrity.remainingEnteringPx', layers.afterS1?.remainingPx);
    put('S2.layerIntegrity.remainingLeavingPx', layers.afterS2?.remainingPx);
    const s1 = new Set([...pxOf(badges, 'own'), ...pxOf(badges, 'mute')]);
    put('S2.layerIntegrity.intersections.vsS1Muted', [...pxOf(baskets, 'own')].filter((p) => s1.has(p)).length);
  }
  const rings = P['px.tees.rings'], fam = P['px.tees.family'];
  if (rings) {
    const why = (part, w) => Object.values(part?.value.elim ?? {}).filter((o) => o.why === w).length;
    put('S3RingsFamily.counts.enclosed', n(rings.value.objects) + n(rings.value.elim));
    put('S3RingsFamily.counts.elongated', n(rings.value.objects) + why(rings, 'excluded-by-badge'));
    put('S3RingsFamily.counts.excludedByBadge', why(rings, 'excluded-by-badge'));
    put('S3RingsFamily.counts.candidates', n(rings.value.objects));
    if (fam) {
      put('S3RingsFamily.counts.measured', n(fam.value.objects) + why(fam, 'not-member'));
      put('S3RingsFamily.counts.unframed', why(fam, 'unframed'));
      put('S3RingsFamily.counts.members', n(fam.value.objects));
    }
  }
  const tees = P['px.tees'];
  if (tees) {
    put('S3.teeCount', n(tees.value.objects));
    put('S3.totals.claimedPx', roleCount(tees, 'own'));
    put('S3.layerIntegrity.remainingEnteringPx', layers.afterS2?.remainingPx);
    put('S3.layerIntegrity.remainingLeavingPx', layers.afterS3main?.remainingPx);
  }
  const fr = P['px.tees.familyRefined'], refined = P['px.tees.refined'];
  if (fr) {
    const objs = Object.values(fr.value.objects ?? {}), elim = Object.values(fr.value.elim ?? {});
    put('S3FamilyFix.counts.candidates', objs.length + elim.length);
    put('S3FamilyFix.counts.admitted', objs.filter((o) => o.verdict === 'ADMITTED').length);
    put('S3FamilyFix.counts.excused', objs.filter((o) => o.verdict === 'EXCUSED').length);
    put('S3FamilyFix.counts.eliminated', elim.length);
    put('S3FamilyFix.counts.unframed', elim.filter((o) => (o.failedTests ?? []).includes('frame-present')).length);
    put('S3FamilyFix.counts.anchors', Object.values(fr.value.ledger ?? {}).filter((r) => r.anchor).length);
    put('S3FamilyFix.eliminatedPx', roleCount(fr, 'elim'));
  }
  if (refined) {
    put('S3FamilyFix.counts.correctedMembers', n(refined.value.objects));
    put('S3FamilyFix.refinedClaimedPx', roleCount(refined, 'own'));
    if (tees) {
      // which baseline tees the refinement eliminated: a geometric join, the same Δ machinery
      const { delta } = objectSet.diff(tees.value.objects, refined.value.objects, { contract: teePose });
      put('S3FamilyFix.delta.eliminatedBaselineLabels', delta.removed.map(({ id }) => tees.value.objects[id].label).sort((a, b) => a - b));
      put('S3FamilyFix.delta.correctedTeeCount', n(refined.value.objects));
    }
    put('S3FamilyFix.remainingLeavingPx', layers.afterS3?.remainingPx);
  }
  return out;
}

/** The numbers the real receipt states, under the same names receipt() derives. */
export function receiptTargets(R, RA = null) {
  const m = R.materializations;
  const g = (o, path) => path.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
  const t = {};
  const names = [
    'S1.badgeCount', 'S1.totals.badgePx', 'S1.totals.mutedPx', 'S1.totals.addedMutePx', 'S1.totals.whitePx', 'S1.totals.blackPx',
    'S1Digits.totals.digitCount', 'S1Digits.totals.counterComponentCount', 'S1Digits.totals.counterBadgeCount', 'S1Digits.totals.counterPx',
    'S1Digits.totals.specDelta.badgeOwnedUnionAfterPx', 'S1Digits.totals.specDelta.mutedUnionAfterPx', 'S1Digits.totals.specDelta.movedFromMuteToDigitOwnedPx',
    'S1BadgeGlyphTemplate.counts.agree', 'S1BadgeGlyphTemplate.counts.templateAbstained',
    'S2.basketCount', 'S2.totals.claimedPx', 'S2.layerIntegrity.remainingEnteringPx', 'S2.layerIntegrity.remainingLeavingPx', 'S2.layerIntegrity.intersections.vsS1Muted',
    'S3RingsFamily.counts.enclosed', 'S3RingsFamily.counts.elongated', 'S3RingsFamily.counts.excludedByBadge', 'S3RingsFamily.counts.candidates',
    'S3RingsFamily.counts.measured', 'S3RingsFamily.counts.unframed', 'S3RingsFamily.counts.members',
    'S3.teeCount', 'S3.totals.claimedPx', 'S3.layerIntegrity.remainingEnteringPx', 'S3.layerIntegrity.remainingLeavingPx',
    'S3FamilyFix.counts.candidates', 'S3FamilyFix.counts.admitted', 'S3FamilyFix.counts.excused', 'S3FamilyFix.counts.eliminated',
    'S3FamilyFix.counts.unframed', 'S3FamilyFix.counts.anchors', 'S3FamilyFix.counts.correctedMembers'
  ];
  for (const k of names) { const [head, ...rest] = k.split('.'); const v = g(m[head], rest.join('.')); if (v !== undefined) t[k] = v; }
  const fix = R.experiments?.branches?.S3FIX;
  if (fix) {
    t['S3FamilyFix.delta.eliminatedBaselineLabels'] = fix.delta.eliminatedBaselineMembers.map((x) => x.baselineLabel);
    t['S3FamilyFix.delta.correctedTeeCount'] = fix.delta.correctedTeeCount;
  }
  if (RA?.materializations?.S1BadgeAssembly) {
    const a = RA.materializations.S1BadgeAssembly.totals;
    for (const k of ['badgeCount', 'fusedUnionPx', 'counterPx', 'counterComponentCount', 'ownedWithCountersPx']) t[`S1BadgeAssembly.totals.${k}`] = a[k];
  }
  return t;
}

export function compareReceipt(derived, targets) {
  const rows = Object.keys(targets).sort().map((k) => ({ name: k, expected: targets[k], derived: derived[k] ?? null, ok: canonicalJson(targets[k]) === canonicalJson(derived[k] ?? null) }));
  return { matched: rows.filter((r) => r.ok).length, of: rows.length, rows };
}

// ------------------------------------------------------------------ conservation
export function conservation(scene) {
  const l = layer(scene);
  const s = seams(scene);
  const bySeam = Object.fromEntries(Object.entries(s).map(([a, v]) => [a, { owners: v.owners, min: v.min, median: v.median, max: v.max, total: v.total }]));
  return { closes: l.conflictPx === 0 && l.outOfFramePx === 0 && l.alphaOverPx === 0, layer: l, enclosedUnowned: bySeam };
}

// ------------------------------------------------------------------ P3
export function scrub(model, stream, { hash = null } = {}) {
  const r = fold(model, stream, { keepScenes: true });
  return r.steps.map((s) => ({ k: s.k, step: s.step, summary: sceneSummary(s.after), ...(hash ? { contentSha256: hash(sceneContent(s.after)) } : {}) }));
}
export const sceneAt = (model, stream, k) => fold(model, stream, { until: k + 1 }).scene;

// ------------------------------------------------------------------ P4
/** Address-level taint from Tick testimony: every step downstream of what `calc` wrote. */
export function taint(evidence, calc) {
  const written = new Set();
  const tainted = [];
  for (const s of evidence.steps) {
    const writes = s.calculations.includes(calc) || s.outs.some((o) => Object.values(o.roleCalc ?? {}).includes(calc));
    if (writes) { for (const o of s.outs) written.add(o.address); continue; }
    const reads = new Set([...(s.consumes ?? []), ...s.outs.map((o) => o.base).filter(Boolean)]);
    if ([...reads].some((a) => written.has(a))) { tainted.push(s.key); for (const o of s.outs) written.add(o.address); }
  }
  return tainted;
}

function metrics(res) {
  const out = {};
  for (const [name, l] of Object.entries(res.layers)) if (l) { out[`${name}.consumedPx`] = l.consumedPx; out[`${name}.ownedPx`] = l.ownedPx; out[`${name}.conflictPx`] = l.conflictPx; out[`${name}.reownedFromMutePx`] = l.reownedFromMutePx; out[`${name}.dupAgreePx`] = l.dupAgreePx; }
  for (const [addr, p] of Object.entries(res.fold.scene.parts)) {
    const st = partStats(p.value);
    if (st.objects !== undefined) out[`${addr}.objects`] = st.objects;
    if (st.elim !== undefined) out[`${addr}.elim`] = st.elim;
    for (const [role, v] of Object.entries(st.px ?? {})) out[`${addr}.px.${role}`] = v;
  }
  return out;
}

export function ablate(model, stream, evidence, calc, baseline = null) {
  const base = baseline ?? stageLayers(model, stream);
  const abl = stageLayers(model, stream, { drop: calc });
  const mb = metrics(base), ma = metrics(abl);
  const changed = [...new Set([...Object.keys(mb), ...Object.keys(ma)])].sort().filter((k) => mb[k] !== ma[k]).map((k) => ({ metric: k, from: mb[k] ?? null, to: ma[k] ?? null }));
  const dropped = abl.fold.steps.reduce((s, x) => s + x.dropped, 0);
  const kinds = {};
  for (const v of abl.fold.violations) kinds[v.kind] = (kinds[v.kind] ?? 0) + (v.count ?? 1);
  const failedSteps = [...new Set(abl.fold.violations.map((v) => v.step))];
  return { calc, droppedEntries: dropped, changed, preconditionFailures: kinds, failedSteps, taintedSteps: taint(evidence, calc), droppedTicks: [...new Set(abl.fold.steps.filter((s) => s.dropped).map((s) => s.step))] };
}

// ------------------------------------------------------------------ narration
/** One line per changed Part: what a human or agent reads first. */
export function narrate(view) {
  return view.map((v) => {
    const f = v.delta?.facets ?? {};
    const bits = [];
    const o = f.objects;
    if (o) {
      if (o.replace) bits.push(`objects replaced (${o.replaced})`);
      const renamed = (o.changed ?? []).filter((c) => c.from !== undefined).length;
      const edited = (o.changed ?? []).length - renamed;
      if (o.added?.length) bits.push(`+${o.added.length} objects`);
      if (o.removed?.length) bits.push(`-${o.removed.length} objects (${o.removed.map((r) => r.id).join(',')})`);
      if (renamed) bits.push(`${renamed} matched+renamed`);
      if (edited) bits.push(`${edited} edited (${[...new Set((o.changed ?? []).flatMap((c) => [...Object.keys(c.set ?? {}), ...(c.unset ?? []).map((u) => `-${u}`)]))].slice(0, 6).join(' ')})`);
      if (o.kept) bits.push(`${o.kept} unchanged`);
    }
    if (f.elim) bits.push(`elim ${f.elim.replace ? `replaced: ${f.elim.added.length}` : `+${f.elim.added?.length ?? 0} ~${f.elim.changed?.length ?? 0} -${f.elim.removed?.length ?? 0}`}`);
    if (f.px) {
      const byRole = (o2) => Object.entries(o2 ?? {}).reduce((m, [k, r]) => { const role = splitKey(k).role; m[role] = (m[role] ?? 0) + countRuns(r); return m; }, {});
      for (const [role, n2] of Object.entries(byRole(f.px.added))) bits.push(`+${n2} px ${role}`);
      for (const [role, n2] of Object.entries(byRole(f.px.removed))) bits.push(`-${n2} px ${role}`);
      const re = {};
      for (const r of f.px.reowned ?? []) {
        const [a, b] = [splitKey(r.from), splitKey(r.to)];
        const k = a.role === b.role && topOwner(r.from) === topOwner(r.to) ? `${a.role} split into sub-parts` : `${a.role}->${b.role}`;
        re[k] = (re[k] ?? 0) + countRuns(r.px);
      }
      for (const [k, n2] of Object.entries(re)) bits.push(`${n2} px re-owned ${k}`);
    }
    if (f.scalars) bits.push(Object.entries(f.scalars.set ?? {}).slice(0, 4).map(([k, s]) => `${k}${s.diff !== undefined ? ` ${s.diff > 0 ? '+' : ''}${s.diff}` : `=${typeof s.to === 'string' && s.to.length > 16 ? `${s.to.slice(0, 8)}...` : canonicalJson(s.to)}`}`).join(' ') + ((f.scalars.unset ?? []).length ? ` -${f.scalars.unset.join(' -')}` : ''));
    if (f.ledger) bits.push(`ledger +${f.ledger.added?.length ?? 0} ~${f.ledger.changed?.length ?? 0} -${f.ledger.removed?.length ?? 0}`);
    if (v.delta?.drop?.length) bits.push(`dropped ${v.delta.drop.join(',')}`);
    return `${v.address}${v.base ? ` vs ${v.base}` : ' vs empty'} [${v.by.join(', ')}]: ${bits.filter(Boolean).join('; ') || 'no change'}`;
  });
}

// ------------------------------------------------------------------ P2
const SLOTS = ['Δ summary', '+own px', '+objects', '+mute px', '~objects changed (center)', 'state before (consumed px near Δ)', '−px released', '−objects / eliminated', '+evidence px (cand / elim)', 're-owned px'];

function geomOf(obj) {
  if (!obj) return null;
  if (obj.bbox) return { box: obj.bbox };
  if (obj.center) return { point: obj.center };
  return null;
}

export function pageFor(step, before, after, { width }) {
  const add = { own: [], mute: [], ev: [] }, removed = [], reowned = [];
  const boxes = { added: [], removed: [] }, points = [];
  const summary = [], detail = [], scalarRows = [];
  for (const v of step.view) {
    const src = v.base ? before.parts[v.base]?.value : before.parts[v.address]?.value;
    const row = { address: v.address, base: v.base ?? '(empty)', by: v.by.join(', '), ...partSummary(v.delta ?? { facets: {} }) };
    summary.push(row);
    const facets = v.delta?.facets ?? {};
    for (const [facet, fd] of Object.entries(facets)) {
      if (facet === 'px') {
        for (const [k, runs] of Object.entries(fd.added ?? {})) { const role = splitKey(k).role; (role === 'own' ? add.own : role === 'mute' ? add.mute : add.ev).push(...fromRuns(runs)); }
        for (const runs of Object.values(fd.removed ?? {})) removed.push(...fromRuns(runs));
        for (const r of fd.reowned ?? []) { reowned.push(...fromRuns(r.px)); detail.push({ address: v.address, change: 're-owned', id: `${r.from} -> ${r.to}`, px: countRuns(r.px) }); }
      } else if (facet === 'objects' || facet === 'elim') {
        const label = (o, id) => [id, o?.label ?? o?.why ?? ''].filter(Boolean).join(' ');
        for (const { id, obj } of fd.added ?? []) {
          const g = geomOf(obj);
          const into = facet === 'elim' ? boxes.removed : boxes.added;
          if (g?.box) into.push([...g.box, label(obj, id)]); else if (g?.point) points.push([...g.point, id]);
          if (facet === 'elim') detail.push({ address: v.address, change: 'eliminated (recorded)', id, why: obj.why ?? null, failedTests: obj.failedTests ?? null });
        }
        if (facet === 'elim') for (const c of fd.changed ?? []) detail.push({ address: v.address, change: 'eliminated (re-tested)', id: ends(c).to, why: c.set?.why ?? null, failedTests: c.set?.failedTests ?? null });
        if (facet === 'objects') {
          for (const { id } of fd.removed ?? []) {
            const obj = src?.objects?.[id];
            const g = geomOf(obj);
            if (g?.box) boxes.removed.push([...g.box, label(obj, id)]);
            const elimNow = after.parts[v.address]?.value.elim;
            const why = Object.values(elimNow ?? {}).find((o) => obj?.center && o.center && Math.hypot(o.center[0] - obj.center[0], o.center[1] - obj.center[1]) < 2);
            detail.push({ address: v.address, change: 'removed', id, failedTests: why?.failedTests ?? why?.why ?? null });
          }
          for (const c of fd.changed ?? []) {
            const { from, to } = ends(c);
            const obj = { ...(src?.objects?.[from] ?? {}), ...(c.set ?? {}) };
            if (obj.center) points.push([...obj.center, to]);
            else if (obj.bbox) points.push([obj.bbox[0] + obj.bbox[2] / 2, obj.bbox[1] + obj.bbox[3] / 2, to]);
            detail.push({ address: v.address, change: from === to ? 'changed' : 'matched+renamed', id: from === to ? from : `${from} -> ${to}`, fields: Object.keys(c.set ?? {}).concat((c.unset ?? []).map((u) => `-${u}`)).join(' '), pose: c.pose ?? null });
          }
        }
      } else if (facet === 'scalars') {
        for (const [name, s] of Object.entries(fd.set ?? {})) scalarRows.push({ address: v.address, name, from: s.from, to: s.to, diff: s.diff ?? null });
        for (const name of fd.unset ?? []) scalarRows.push({ address: v.address, name, from: '(set)', to: '(unset)' });
      } else if (facet === 'ledger') {
        detail.push({ address: v.address, change: 'ledger', id: `+${(fd.added ?? []).length} rows, ~${(fd.changed ?? []).length}, -${(fd.removed ?? []).length}` });
      }
    }
    for (const f of v.delta?.drop ?? []) detail.push({ address: v.address, change: 'facet dropped', id: f });
  }
  // context: what was already consumed near the Δ (the state the Δ is drawn over)
  const drawnPx = [...add.own, ...add.mute, ...add.ev, ...removed, ...reowned];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (x, y, w = 1, h = 1) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h); };
  for (const p of drawnPx) grow(p % width, Math.floor(p / width));
  for (const b of [...boxes.added, ...boxes.removed]) grow(b[0], b[1], b[2], b[3]);
  for (const p of points) grow(p[0], p[1]);
  const context = [];
  if (x0 !== Infinity) {
    const pad = 24;
    for (const part of Object.values(before.parts)) {
      for (const [k, runs] of Object.entries(part.value.px ?? {})) {
        const role = splitKey(k).role;
        if (role !== 'own' && role !== 'mute') continue;
        for (const p of fromRuns(runs)) { const x = p % width, y = Math.floor(p / width); if (x >= x0 - pad && x <= x1 + pad && y >= y0 - pad && y <= y1 + pad) context.push(p); }
      }
    }
  }
  const px = (list) => ({ width, px: list });
  const parts = [
    { address: SLOTS[0], kind: 'ledger', data: { rows: summary } },
    { address: SLOTS[1], kind: 'pxset', data: px(add.own) },
    { address: SLOTS[2], kind: 'bbox', data: { boxes: boxes.added } },
    { address: SLOTS[3], kind: 'pxset', data: px(add.mute) },
    { address: SLOTS[4], kind: 'points', data: { points } },
    { address: SLOTS[5], kind: 'pxset', data: px(context) },
    { address: SLOTS[6], kind: 'pxset', data: px(removed) },
    { address: SLOTS[7], kind: 'bbox', data: { boxes: boxes.removed } },
    { address: SLOTS[8], kind: 'pxset', data: px(add.ev) },
    { address: SLOTS[9], kind: 'pxset', data: px(reowned) },
    { address: 'Δ detail', kind: 'ledger', data: { rows: detail.slice(0, 80) } },
    ...(scalarRows.length ? [{ address: 'Δ scalars', kind: 'ledger', data: { rows: scalarRows } }] : []),
    { address: 'scene after this step (P3)', kind: 'ledger', data: { rows: sceneRows(after) } }
  ];
  return parts;
}

function sceneRows(scene) {
  const s = sceneSummary(scene);
  const rows = Object.entries(s.parts).map(([address, st]) => ({ address, objects: st.objects ?? '', elim: st.elim ?? '', px: st.px ? Object.entries(st.px).map(([r, v]) => `${r} ${v}`).join(', ') : '', scalars: st.scalars ?? '', rows: st.rows ?? '' }));
  rows.push({ address: '(ownership layer)', objects: '', elim: '', px: `owned ${s.layer.ownedPx}, muted-only ${s.layer.mutedOnlyPx}, remaining ${s.layer.remainingPx}, conflict ${s.layer.conflictPx}, dup-agree ${s.layer.dupAgreePx}, re-owned-from-mute ${s.layer.reownedFromMutePx}`, scalars: '', rows: '' });
  return rows;
}

export function frames(model, stream, { fg = 'fg.delta' } = {}) {
  const r = fold(model, stream, { keepScenes: true });
  return r.steps.map((s, i) => {
    const parts = pageFor(s, s.before, s.after, { width: stream.frame.width });
    const lines = narrate(s.view);
    // slot 0 is a ledger so the drawn slots keep their colours: narration first, counts at the end
    parts.push({ ...parts[0] });
    parts[0] = { address: 'Δ narration', kind: 'ledger', data: { rows: lines.map((line) => ({ line })) } };
    const headline = lines.length ? lines.join(' | ') : 'no state change';
    return {
      fg, branch: `${model.id} ${model.title}`, seq: i, tick: s.step, calculation: s.by.join(', '),
      title: `${s.k}. ${s.tick}${s.lane ? ` [lane ${s.lane}]` : ''}: ${headline}`,
      parts, verdicts: [...s.verdicts, ...s.violations.map((v) => ({ name: `violation ${v.kind}`, ok: false, detail: v }))],
      receipt: { step: s.step, stage: s.stage, by: s.by, entries: s.view.length }
    };
  });
}
