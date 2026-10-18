/**
 * fg.s1.pxBadges.assembly (stages/s1.json), the materialization guarantee
 * of the declared spec delta refine.s1.badgeAssembly.plateFirst. Lane
 * s1-badge-assembly, default OFF (dormant; the stage reproduces the pinned
 * baseline exactly). With the lane on, the toolkit plate-first badge
 * assembly Calculation (ports/early/s1BadgeAssembly.mjs) runs on a branch
 * restored from the S1 snapshot over the pinned per-badge component
 * evidence, never over the finished px.badges set; the base board is never
 * written.
 *
 * Exact reproduction, not a recorded delta: the M1 base-delta of every
 * fused badge vs its px.badges object must be empty (delta:px.badges); the
 * totals gate against the RECORDS of fg.s1.pxBadges.materialize (owned
 * union, white/black) and fg.s1.pxDigits.materialize (counter attribution);
 * a second branch must reproduce the Part (witnessed:branch); badge 10's
 * components are re-derived from the raster fields by a path that never
 * reads the findPx refs (witnessed:rederiveBadgeComponents).
 *
 * Artifact artifacts/s1assembly/px.badges.assembly.json (bytes unchanged),
 * record stages[S1].badgeAssemblyMaterialization /
 * materializations.S1BadgeAssembly, lane evidence experiments.branches.S1ASM.
 */
import { sameCanon, witnessed } from '../mixins.mjs';
import { assemblyGuarantee } from '../skeletons.mjs';
import { computeBadgeAssembly, rederiveBadgeComponents, BADGE_ASSEMBLY } from '../../ports/early/s1BadgeAssembly.mjs';
import { legacyCanon } from '../legacy.mjs';

const MATERIALIZE = 'fg.s1.pxBadges.materialize';
const DIGITS = 'fg.s1.pxDigits.materialize';
const PART = BADGE_ASSEMBLY.part;
const sortedPx = (px) => [...px].sort((a, b) => a - b);
const samePx = (a, b) => sameCanon(sortedPx(a), sortedPx(b));

const reproduction = (env, s) => {
  const rows = s.assembly.badges.map((rec, i) => {
    const d = s.delta.perObject[`#${i}`];
    return { index: i, label: rec.label, fusedPxCount: rec.fusedPxCount, baselinePxCount: d.basePx, differingPx: d.differingPx, exact: d.differingPx === 0 && rec.fusedPxCount === d.basePx };
  });
  const t = s.totals;
  env.check('ownedLedgerBalances', t.ownedWithCountersPx === t.fusedUnionPx + t.counterPx, { ownedWithCountersPx: t.ownedWithCountersPx, fusedUnionPx: t.fusedUnionPx, counterPx: t.counterPx });
  return rows;
};

// Badge 10's components from the raster component fields, never the findPx component refs.
const rederived = witnessed.path('rederiveBadgeComponents', {
  name: 'rederivationExact', as: 'rederivation', reads: ['badges', 'px.components'],
  run: (s, env) => {
    const index = s.assembly.badges.findIndex((r) => r.label === '10');
    if (index < 0) env.fail('badge 10 is absent from the assembly; the independent witness has no subject');
    const w = rederiveBadgeComponents({ badge: s.base[index], read: env.get('badges')[index], fields: env.get('px.components') });
    const rec = s.assembly.badges[index];
    const summary = {
      badgeLabel: '10', badgeIndex: index,
      platePx: w.plate.px.length, framePx: w.frame ? w.frame.px.length : 0,
      digitGlyphPx: w.digits.map((d) => d.glyphs.reduce((n, g) => n + g.px.length, 0)),
      counterComponents: w.counters.length, counterPx: w.counters.reduce((n, c) => n + c.pxCount, 0)
    };
    const no = (disagrees) => ({ ok: false, disagrees, summary });
    const plate = rec.components.find((c) => c.name === 'plate'), frame = rec.components.find((c) => c.name === 'frame');
    if (!samePx(w.plate.px, plate.px)) return no('plate');
    if (!w.frame || !frame || !samePx(w.frame.px, frame.px)) return no('frame');
    for (const wd of w.digits) {
      const recDigit = rec.components.find((c) => c.name === `digit-${wd.digitIndex}`);
      if (!recDigit || !samePx(wd.glyphs.flatMap((g) => g.px), recDigit.px)) return no(`digit-${wd.digitIndex} glyph set`);
      const recLabels = (rec.digits[wd.digitIndex]?.glyphComponents ?? []).map((g) => g.label).sort((a, b) => a - b);
      if (legacyCanon(recLabels) !== legacyCanon(wd.glyphs.map((g) => g.ref.label).sort((a, b) => a - b))) return no(`digit-${wd.digitIndex} glyph components`);
    }
    if (!samePx(w.counters.flatMap((c) => c.px), rec.counters.flatMap((c) => c.px))) return no('counter set');
    if (w.counters.length !== rec.counters.length) return no(`counter count ${w.counters.length} vs ${rec.counters.length}`);
    return { ok: true, summary };
  }
});

const frames = (s, { op }) => {
  const w = s.receiptWitnesses.rederivation;
  return [{
    title: `px.badges.assembly: ${s.exactBadges}/${s.reproduction.length} badges reproduced plate-first`, calculation: BADGE_ASSEMBLY.assemblyCalculation, tick: op.id,
    parts: [
      { address: PART, kind: 'pxset', artifact: s.entries[PART] },
      { address: `${PART}#components`, kind: 'ledger', data: { rows: s.assembly.badges.map((rec, i) => ({
        index: i, label: rec.label,
        components: rec.components.map((c) => `${c.name}:${c.px.length}`).join(' '),
        counters: rec.counters.map((c) => c.pxCount ?? c.px.length),
        fusedPxCount: rec.fusedPxCount, differingPx: s.reproduction[i].differingPx
      })) } },
      { address: `${PART}#totals`, kind: 'ledger', data: { rows: [s.totals] } }
    ],
    verdicts: s.reproduction.map((r) => ({ name: `badge ${r.label}: fused ${r.fusedPxCount} vs baseline ${r.baselinePxCount}`, ok: r.exact }))
  }, w && {
    title: `independent re-derivation of badge 10 (index ${w.badgeIndex})`, calculation: 'rederiveBadgeComponents',
    parts: [{ address: `${PART}#witness10`, kind: 'ledger', data: { rows: [w] } }]
  }];
};

export default assemblyGuarantee({
  stage: 'S1', noun: { one: 'badge', many: 'badges' }, spec: BADGE_ASSEMBLY,
  consumes: ['px.badges', 'badges', 'px.components'],
  calculate: (badges, reads, fields) => computeBadgeAssembly({ badges, reads, fields }),
  note: 'Declared spec delta refine.s1.badgeAssembly.plateFirst: each Badge Part is re-assembled from its component evidence through the phase-1 assembly shape with the plate as the declared base, the white frame/ribbon and the per-digit glyph components fused onto it, and digit counters carried as digit-owned sub-structure. Branch from the S1 snapshot; base emissions unchanged.',
  units: { digitGlyphPx: 'px', counters: 'px (per counter part)', exactBadges: 'count (badges)', ofBadges: 'count (badges)', counterComponents: 'count (components)' },
  gates: [
    [MATERIALIZE, [
      { name: 'fusedUnionMatchesBaseline', mine: (s) => s.totals.fusedUnionPx, theirs: (r) => r.totals.badgePx },
      { name: 'whiteBlackTotalsMatchBaseline', mine: (s) => [s.totals.whitePx, s.totals.blackPx], theirs: (r) => [r.totals.whitePx, r.totals.blackPx] }
    ]],
    [DIGITS, [
      { name: 'countersReconcileWithDigitsGuarantee', mine: (s) => [s.totals.counterComponentCount, s.totals.counterPx], theirs: (r) => [r.totals.counterComponentCount, r.totals.counterPx] }
    ]]
  ],
  reproduction, rederived, frames,
  branch: {
    benefit: 'Every Badge Part is re-derived plate-first from its component evidence, so the assembly structure (plate base, fused frame and digit components, digit-owned counters, anchor, window residue) crosses the toolkit seam as named Parts instead of a flat px array with two counts.',
    falsifier: 'A badge fused set differs from the accepted px.badges set, the fused union differs from 37,002, the counters differ from the accepted attribution, or the owned total differs from 37,295.'
  }
});
