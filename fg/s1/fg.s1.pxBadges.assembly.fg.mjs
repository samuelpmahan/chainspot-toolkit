/**
 * fg.s1.pxBadges.assembly (stages/s1.json), the materialization guarantee
 * of the declared spec delta refine.s1.badgeAssembly.plateFirst. Lane
 * s1-badge-assembly, default OFF: with the lane off this FG is dormant
 * (the registry never calls run) and the stage reproduces the pinned
 * baseline exactly. With the lane on, a branch from the S1 snapshot runs
 * the toolkit-layer plate-first badge assembly Calculation
 * (ports/early/s1BadgeAssembly.mjs) over the pinned per-badge component
 * evidence (Badge.findPx component refs plus the component label fields),
 * never over the finished px.badges set. The base board is never written;
 * the assembly Part lives only on the branch and in its artifact.
 *
 * The gates are exact reproduction gates, not a recorded delta: plate-first
 * assembly must not change a single pixel. They gate against the RECORDS of
 * fg.s1.pxBadges.materialize (owned union, white/black totals) and
 * fg.s1.pxDigits.materialize (counter attribution), which the registry runs
 * first because this FG requires them.
 *
 * Inputs are Parts and registered Calculations only: the consumed board
 * Parts, tk.stage.S0.canonicalRgbaSha256 and tk.stage.S1.snapshotSha256;
 * branches come from fn.provider.restore.S1 and the op runs through
 * fg/branchOp.mjs (restore, one-op plan fingerprinted by
 * fn.provider.sha256Text, fn.provider.executeCompiledPlan auto-instrumented
 * at site s1.badgeAssembly, pixel invariance), the same mechanism the S2/S3
 * spec-delta FGs use; byte/text hashes are fn.tk.sha256. The restored
 * branch is the value fn.provider.restore.S1 returns, read directly by
 * this FG.
 *
 * Ported from runEarly.mjs with a byte-identical artifact
 * (artifacts/s1assembly/px.badges.assembly.json), stage record
 * (stages[S1].badgeAssemblyMaterialization, materializations.S1BadgeAssembly)
 * and lane branch evidence (experiments.branches.S1ASM).
 */
import { defineGuarantee } from '../guarantee.mjs';
import { BRANCH_CALLS, runBranchOp, tickEvidence } from '../branchOp.mjs';
import { computeBadgeAssembly, rederiveBadgeComponents, BADGE_ASSEMBLY } from '../../ports/early/s1BadgeAssembly.mjs';
import { legacyArtifact, legacyCanon, prettyJsonBytes } from '../legacy.mjs';

const ID = 'fg.s1.pxBadges.assembly';
const MATERIALIZE = 'fg.s1.pxBadges.materialize';
const DIGITS = 'fg.s1.pxDigits.materialize';
const LANE = 's1-badge-assembly';
const CONSUMES = ['px.badges', 'badges', 'px.components'];
const CANONICAL = 'tk.stage.S0.canonicalRgbaSha256';
const SNAPSHOT_SHA = 'tk.stage.S1.snapshotSha256';
const RESTORE = 'fn.provider.restore.S1';
const SHA = 'fn.tk.sha256';
const samePx = (a, b) => legacyCanon([...a].sort((x, y) => x - y)) === legacyCanon([...b].sort((x, y) => x - y));

export default defineGuarantee({
  id: ID,
  guards: [BADGE_ASSEMBLY.part],
  reads: [...CONSUMES, CANONICAL, SNAPSHOT_SHA],
  calls: [RESTORE, ...BRANCH_CALLS],
  requires: [MATERIALIZE, DIGITS],
  lane: LANE,
  run(ctx) {
    const baseline = ctx.records[MATERIALIZE].totals;
    const digits = ctx.records[DIGITS].totals;
    const canonicalRgbaSha256 = ctx.get(CANONICAL);
    const sha256 = (bytes) => ctx.call(SHA, { bytes });
    const asmOp = {
      id: 'early.S1.badgeAssembly', kind: 'measure', gate: 'shared', unit: 'early-s1-badge-assembly',
      consumes: CONSUMES,
      produces: [BADGE_ASSEMBLY.part], calculations: [BADGE_ASSEMBLY.assemblyCalculation], accessConformance: 'exact',
      note: 'Declared spec delta refine.s1.badgeAssembly.plateFirst: each Badge Part is re-assembled from its component evidence through the phase-1 assembly shape with the plate as the declared base, the white frame/ribbon and the per-digit glyph components fused onto it, and digit counters carried as digit-owned sub-structure. Branch from the S1 snapshot; base emissions unchanged.'
    };
    const runAssemblyBranch = () => {
      const { branch, ticks, result, after } = runBranchOp(ctx, {
        restore: RESTORE, op: asmOp, site: 's1.badgeAssembly', canonicalRgbaSha256,
        calculate: (badges, reads, fields) => computeBadgeAssembly({ badges, reads, fields })
      });
      return { branch, ticks, asmPart: result, after };
    };
    const branchA = runAssemblyBranch();
    const assemblyPart = branchA.branch.get(BADGE_ASSEMBLY.part);
    if (!assemblyPart || !Array.isArray(assemblyPart.badges)) ctx.fail('branch did not produce px.badges.assembly');
    // Exact reproduction gates against the accepted baseline on this same
    // live board (the objects fg.s1.pxBadges.materialize serialized).
    const baseBadges = ctx.get('px.badges');
    if (assemblyPart.badges.length !== baseBadges.length)
      ctx.fail(`assembly badge count ${assemblyPart.badges.length} != baseline px.badges count ${baseBadges.length}`);
    const reproduction = assemblyPart.badges.map((rec, i) => {
      const baseSet = new Set(baseBadges[i].px);
      const fusedSet = new Set(rec.fusedPx);
      let differingPx = 0;
      for (const p of baseSet) if (!fusedSet.has(p)) differingPx++;
      for (const p of fusedSet) if (!baseSet.has(p)) differingPx++;
      return {
        index: i, label: rec.label,
        fusedPxCount: rec.fusedPxCount, baselinePxCount: baseSet.size,
        differingPx, exact: differingPx === 0 && rec.fusedPxCount === baseSet.size
      };
    });
    const t = assemblyPart.totals;
    const inexact = reproduction.filter((r) => !r.exact);
    const checks = {
      allBadgesReproducedExactly: ctx.check('allBadgesReproducedExactly', !inexact.length,
        { inexact: inexact.map((r) => `badge ${r.label} differs by ${r.differingPx} px (fused ${r.fusedPxCount} vs baseline ${r.baselinePxCount})`) }),
      fusedUnionMatchesBaseline: ctx.check('fusedUnionMatchesBaseline', t.fusedUnionPx === baseline.badgePx, { fusedUnionPx: t.fusedUnionPx, [`${MATERIALIZE}.badgePx`]: baseline.badgePx }),
      whiteBlackTotalsMatchBaseline: ctx.check('whiteBlackTotalsMatchBaseline', t.whitePx === baseline.whitePx && t.blackPx === baseline.blackPx,
        { assembly: [t.whitePx, t.blackPx], [MATERIALIZE]: [baseline.whitePx, baseline.blackPx] }),
      countersReconcileWithDigitsGuarantee: ctx.check('countersReconcileWithDigitsGuarantee', t.counterComponentCount === digits.counterComponentCount && t.counterPx === digits.counterPx,
        { assembly: [t.counterComponentCount, t.counterPx], [DIGITS]: [digits.counterComponentCount, digits.counterPx] }),
      ownedLedgerBalances: ctx.check('ownedLedgerBalances', t.ownedWithCountersPx === t.fusedUnionPx + t.counterPx,
        { ownedWithCountersPx: t.ownedWithCountersPx, fusedUnionPx: t.fusedUnionPx, counterPx: t.counterPx })
    };
    // Witness 1: deterministic re-execution of the assembly Calculation on a
    // second restored branch must reproduce the assembly Part exactly.
    const canonicalAsm = sha256(legacyCanon(assemblyPart));
    const reexecution = ctx.witness('reexecutionExact', () => {
      const branchB = runAssemblyBranch();
      const second = sha256(legacyCanon(branchB.asmPart));
      return second === canonicalAsm ? true : { ok: false, first: canonicalAsm, second };
    });
    // Witness 2: independent re-derivation of badge 10's components from the
    // raster component fields by a separate code path that never reads the
    // findPx component refs; every role set must match the assembly.
    const fields = ctx.get('px.components');
    const reads = ctx.get('badges');
    const witnessIndex = assemblyPart.badges.findIndex((r) => r.label === '10');
    if (witnessIndex < 0) ctx.fail('badge 10 is absent from the assembly; the independent witness has no subject');
    let witness = null;
    const rederivation = ctx.witness('rederivationExact', () => {
      witness = rederiveBadgeComponents({ badge: baseBadges[witnessIndex], read: reads[witnessIndex], fields });
      const wRec = assemblyPart.badges[witnessIndex];
      const wPlate = wRec.components.find((c) => c.name === 'plate');
      const wFrame = wRec.components.find((c) => c.name === 'frame');
      if (!samePx(witness.plate.px, wPlate.px)) return { ok: false, disagrees: 'plate' };
      if (!witness.frame || !wFrame || !samePx(witness.frame.px, wFrame.px)) return { ok: false, disagrees: 'frame' };
      for (const wd of witness.digits) {
        const recDigit = wRec.components.find((c) => c.name === `digit-${wd.digitIndex}`);
        if (!recDigit || !samePx(wd.glyphs.flatMap((g) => g.px), recDigit.px)) return { ok: false, disagrees: `digit-${wd.digitIndex} glyph set` };
        const recGlyphLabels = (wRec.digits[wd.digitIndex]?.glyphComponents ?? []).map((g) => g.label).sort((a, b) => a - b);
        const witGlyphLabels = wd.glyphs.map((g) => g.ref.label).sort((a, b) => a - b);
        if (legacyCanon(recGlyphLabels) !== legacyCanon(witGlyphLabels)) return { ok: false, disagrees: `digit-${wd.digitIndex} glyph components` };
      }
      if (!samePx(witness.counters.flatMap((c) => c.px), wRec.counters.flatMap((c) => c.px))) return { ok: false, disagrees: 'counter set' };
      if (witness.counters.length !== wRec.counters.length) return { ok: false, disagrees: `counter count ${witness.counters.length} vs ${wRec.counters.length}` };
      return true;
    });
    const witnessRecord = witness && {
      badgeLabel: '10', badgeIndex: witnessIndex,
      platePx: witness.plate.px.length, framePx: witness.frame ? witness.frame.px.length : 0,
      digitGlyphPx: witness.digits.map((d) => d.glyphs.reduce((n, g) => n + g.px.length, 0)),
      counterComponents: witness.counters.length, counterPx: witness.counters.reduce((n, c) => n + c.pxCount, 0),
      exact: rederivation.ok
    };
    const witnesses = {
      reexecution: { canonicalSha256: canonicalAsm, exact: reexecution.ok },
      rederivation: witnessRecord
    };
    const assemblyArtifact = {
      schema: 'nctk-s1-badge-assembly-artifact@1', part: BADGE_ASSEMBLY.part, producedBy: BADGE_ASSEMBLY.assemblyCalculation,
      guarantee: ID, specDelta: BADGE_ASSEMBLY.specDelta, calculation: BADGE_ASSEMBLY.calculation,
      image: assemblyPart.image, totals: assemblyPart.totals, emits: assemblyPart.emits,
      reproduction,
      witnesses,
      badges: assemblyPart.badges
    };
    const entry = ctx.artifact('px.badges.assembly', 'badge-assembly-json', prettyJsonBytes(assemblyArtifact), undefined, { path: 's1assembly/px.badges.assembly.json' });
    checks.reexecutionExact = reexecution.ok;
    checks.rederivationExact = rederivation.ok;
    checks.artifactsRehashedAfterWrite = ctx.check('artifactsRehashedAfterWrite', entry.rehashed);
    const reread = JSON.parse(new TextDecoder().decode(ctx.sink.readArtifact(entry.id)));
    checks.artifactsReReadAndCompared = ctx.check('artifactsReReadAndCompared',
      legacyCanon(reread.badges) === legacyCanon(assemblyPart.badges) && legacyCanon(reread.totals) === legacyCanon(assemblyPart.totals));

    const exactBadges = reproduction.filter((r) => r.exact).length;
    ctx.frame({
      title: `px.badges.assembly: ${exactBadges}/${reproduction.length} badges reproduced plate-first`, calculation: BADGE_ASSEMBLY.assemblyCalculation, tick: asmOp.id,
      parts: [
        { address: BADGE_ASSEMBLY.part, kind: 'pxset', artifact: entry },
        { address: `${BADGE_ASSEMBLY.part}#components`, kind: 'ledger', data: { rows: assemblyPart.badges.map((rec, i) => ({
          index: i, label: rec.label,
          components: rec.components.map((c) => `${c.name}:${c.px.length}`).join(' '),
          counters: rec.counters.map((c) => c.pxCount ?? c.px.length),
          fusedPxCount: rec.fusedPxCount, differingPx: reproduction[i].differingPx
        })) } },
        { address: `${BADGE_ASSEMBLY.part}#totals`, kind: 'ledger', data: { rows: [assemblyPart.totals] } }
      ],
      verdicts: reproduction.map((r) => ({ name: `badge ${r.label}: fused ${r.fusedPxCount} vs baseline ${r.baselinePxCount}`, ok: r.exact }))
    });
    if (witnessRecord) ctx.frame({
      title: `independent re-derivation of badge 10 (index ${witnessIndex})`, calculation: 'rederiveBadgeComponents',
      parts: [{ address: `${BADGE_ASSEMBLY.part}#witness10`, kind: 'ledger', data: { rows: [witnessRecord] } }]
    });

    const record = {
      guarantee: ID, specDelta: BADGE_ASSEMBLY.specDelta,
      part: BADGE_ASSEMBLY.part, producedBy: BADGE_ASSEMBLY.assemblyCalculation,
      badgeCount: assemblyPart.totals.badgeCount, totals: assemblyPart.totals,
      reproduction: { exactBadges, ofBadges: reproduction.length, badges: reproduction },
      witnesses,
      checks,
      artifacts: [legacyArtifact(entry)]
    };
    ctx.publish('stages.S1.badgeAssemblyMaterialization', record);
    ctx.publish('materializations.S1BadgeAssembly', record);
    ctx.publish('experiments.branches.S1ASM', {
      mode: 'ON', status: 'SPEC_DELTA_ORACLE_UNKNOWN', lane: LANE,
      baseSnapshotSha256: ctx.get(SNAPSHOT_SHA),
      benefit: 'Every Badge Part is re-derived plate-first from its component evidence, so the assembly structure (plate base, fused frame and digit components, digit-owned counters, anchor, window residue) crosses the toolkit seam as named Parts instead of a flat px array with two counts.',
      falsifier: 'A badge fused set differs from the accepted px.badges set, the fused union differs from 37,002, the counters differ from the accepted attribution, or the owned total differs from 37,295.',
      oracle: 'UNKNOWN', partAddress: BADGE_ASSEMBLY.part,
      totals: assemblyPart.totals,
      reproduction: { exactBadges, ofBadges: reproduction.length },
      canonicalRgbaSha256Off: canonicalRgbaSha256, canonicalRgbaSha256On: branchA.after,
      ticks: tickEvidence(asmOp, branchA.ticks)
    });
    return { totals: assemblyPart.totals, badgeCount: assemblyPart.totals.badgeCount, specDelta: BADGE_ASSEMBLY.specDelta, exactBadges };
  }
});
