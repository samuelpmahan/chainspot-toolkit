/**
 * fg.s2.pxBaskets.assembly (stages/s2.json), the materialization guarantee
 * of the declared spec delta refine.s2.basketAssembly.bodyFirst. Lane
 * s2-basket-assembly, default OFF: with the lane off this FG is dormant and
 * the stage reproduces the pinned baseline exactly. With the lane on, a
 * branch from the S2 snapshot runs the toolkit-layer body-first basket
 * assembly Calculation (ports/early/s2BasketAssembly.mjs) over the pinned
 * component evidence (the Basket.findPx body component ref materialized
 * against the bright label field, and the findShellFamily blackPx set
 * cross-checked against the shellFamily Part member), never over the
 * finished px.baskets set. The base board is never written; the assembly
 * Part lives only on the branch and in its artifact.
 *
 * The gates are exact reproduction gates, not a recorded delta: body-first
 * assembly must not change a single pixel. They gate against the RECORD of
 * fg.s2.pxBaskets.materialize (claimed union), which the registry runs
 * first because this FG requires it.
 *
 * Inputs are Parts and registered Calculations only: the consumed board
 * Parts, tk.stage.S0.canonicalRgbaSha256 and tk.stage.S2.snapshotSha256;
 * the branch comes from fn.provider.restore.S2 and the op runs through
 * fg/branchOp.mjs (fn.provider.executeCompiledPlan, site s2.basketAssembly).
 *
 * Ported from runEarly.mjs; artifact artifacts/s2assembly/px.baskets.assembly.json,
 * stage record stages[S2].basketAssemblyMaterialization /
 * materializations.S2BasketAssembly, lane evidence experiments.branches.S2ASM.
 */
import { defineGuarantee } from '../guarantee.mjs';
import { BRANCH_CALLS, runBranchOp, tickEvidence } from '../branchOp.mjs';
import { computeBasketAssembly, rederiveBasketDecomposition, BASKET_ASSEMBLY } from '../../ports/early/s2BasketAssembly.mjs';
import { legacyArtifact, legacyCanon, prettyJsonBytes } from '../legacy.mjs';

const ID = 'fg.s2.pxBaskets.assembly';
const MATERIALIZE = 'fg.s2.pxBaskets.materialize';
const LANE = 's2-basket-assembly';
const CONSUMES = ['px.baskets', 'px.baskets.shellFamily', 'px.components'];
const CANONICAL = 'tk.stage.S0.canonicalRgbaSha256';
const SNAPSHOT_SHA = 'tk.stage.S2.snapshotSha256';
const RESTORE = 'fn.provider.restore.S2';
const SHA = 'fn.tk.sha256';
const samePx = (a, b) => legacyCanon([...a].sort((x, y) => x - y)) === legacyCanon([...b].sort((x, y) => x - y));
const rowsWhere = (rows, bad, say) => rows.filter(bad).map(say);

export default defineGuarantee({
  id: ID,
  guards: [BASKET_ASSEMBLY.part],
  reads: [...CONSUMES, CANONICAL, SNAPSHOT_SHA],
  calls: [RESTORE, ...BRANCH_CALLS],
  requires: [MATERIALIZE],
  lane: LANE,
  run(ctx) {
    const baseline = ctx.records[MATERIALIZE].totals;
    const canonicalRgbaSha256 = ctx.get(CANONICAL);
    const sha256 = (bytes) => ctx.call(SHA, { bytes });
    const asmOp = {
      id: 'early.S2.basketAssembly', kind: 'measure', gate: 'shared', unit: 'early-s2-basket-assembly',
      consumes: CONSUMES,
      produces: [BASKET_ASSEMBLY.part], calculations: [BASKET_ASSEMBLY.assemblyCalculation], accessConformance: 'exact',
      note: 'Declared spec delta refine.s2.basketAssembly.bodyFirst: each Basket Part is re-assembled from its component evidence through the phase-1 assembly shape with the bright body as the declared base and the shell fused onto it, the tip carried as the anchor, and window ownership accounted against the semantic bbox. Branch from the S2 snapshot; base emissions unchanged.'
    };
    const runAssemblyBranch = () => runBranchOp(ctx, {
      restore: RESTORE, op: asmOp, site: 's2.basketAssembly', canonicalRgbaSha256,
      calculate: (baskets, shellFamily, fields) => computeBasketAssembly({ baskets, shellFamily, fields })
    });
    const branchA = runAssemblyBranch();
    const assemblyPart = branchA.branch.get(BASKET_ASSEMBLY.part);
    if (!assemblyPart || !Array.isArray(assemblyPart.baskets)) ctx.fail('branch did not produce px.baskets.assembly');
    const baseBaskets = ctx.get('px.baskets');
    if (assemblyPart.baskets.length !== baseBaskets.length)
      ctx.fail(`assembly basket count ${assemblyPart.baskets.length} != baseline px.baskets count ${baseBaskets.length}`);
    const reproduction = assemblyPart.baskets.map((rec, i) => {
      const baseSet = new Set(baseBaskets[i].px);
      const fusedSet = new Set(rec.fusedPx);
      let differingPx = 0;
      for (const p of baseSet) if (!fusedSet.has(p)) differingPx++;
      for (const p of fusedSet) if (!baseSet.has(p)) differingPx++;
      return {
        index: i, label: rec.label,
        bodyPxCount: rec.components[0].pxCount, shellPxCount: rec.components[1].pxCount,
        fusedPxCount: rec.fusedPxCount, baselinePxCount: baseSet.size,
        componentOverlapPx: rec.componentOverlapPx,
        residuePx: rec.residuePx,
        differingPx, exact: differingPx === 0 && rec.fusedPxCount === baseSet.size
      };
    });
    const t = assemblyPart.totals;
    const [residueLo, residueHi] = BASKET_ASSEMBLY.expectedResidueBandPx;
    const baselineBodyPx = baseBaskets.reduce((n, b) => n + b.whitePx, 0);
    const baselineShellPx = baseBaskets.reduce((n, b) => n + b.blackPx, 0);
    const checks = {
      allBasketsReproducedExactly: ctx.check('allBasketsReproducedExactly', reproduction.every((r) => r.exact),
        { inexact: rowsWhere(reproduction, (r) => !r.exact, (r) => `basket ${r.label} differs by ${r.differingPx} px (fused ${r.fusedPxCount} vs baseline ${r.baselinePxCount})`) }),
      fusedUnionMatchesBaseline: ctx.check('fusedUnionMatchesBaseline', t.fusedUnionPx === baseline.claimedPx, { fusedUnionPx: t.fusedUnionPx, [`${MATERIALIZE}.claimedPx`]: baseline.claimedPx }),
      bodyShellTotalsMatchBaseline: ctx.check('bodyShellTotalsMatchBaseline', t.bodyPx === baselineBodyPx && t.shellPx === baselineShellPx,
        { assembly: [t.bodyPx, t.shellPx], baselineWhiteBlack: [baselineBodyPx, baselineShellPx] }),
      componentOverlapZero: ctx.check('componentOverlapZero', reproduction.every((r) => r.componentOverlapPx === 0),
        { overlapping: rowsWhere(reproduction, (r) => r.componentOverlapPx !== 0, (r) => `basket ${r.label} overlaps by ${r.componentOverlapPx} px`) }),
      residueWithinPhase1Band: ctx.check('residueWithinPhase1Band', reproduction.every((r) => r.residuePx >= residueLo && r.residuePx <= residueHi),
        { band: [residueLo, residueHi], outOfBand: rowsWhere(reproduction, (r) => r.residuePx < residueLo || r.residuePx > residueHi, (r) => `basket ${r.label} residue ${r.residuePx} px`) }),
      ownedOutsideWindowZero: ctx.check('ownedOutsideWindowZero', assemblyPart.baskets.every((r) => r.ownership.ownedOutsideWindowPx === 0),
        { outside: rowsWhere(assemblyPart.baskets, (r) => r.ownership.ownedOutsideWindowPx !== 0, (r) => `basket ${r.label} owns ${r.ownership.ownedOutsideWindowPx} px outside`) })
    };
    // Witness 1: deterministic re-execution on a second restored branch.
    const canonicalAsm = sha256(legacyCanon(assemblyPart));
    const reexecution = ctx.witness('reexecutionExact', () => {
      const second = sha256(legacyCanon(runAssemblyBranch().result));
      return second === canonicalAsm ? true : { ok: false, first: canonicalAsm, second };
    });
    // Witness 2: independent re-derivation of basket 1's body and shell from
    // the raster fields by a separate code path that never reads the
    // basket's recorded findPx body ref or findShellFamily blackPx.
    const witnessIndex = 0;
    const wRec = assemblyPart.baskets[witnessIndex];
    let witness = null;
    const rederivation = ctx.witness('rederivationExact', () => {
      witness = rederiveBasketDecomposition({ basket: baseBaskets[witnessIndex], shellFamily: ctx.get('px.baskets.shellFamily'), fields: ctx.get('px.components') });
      if (!samePx(witness.body.px, wRec.components.find((c) => c.name === 'body').px)) return { ok: false, disagrees: 'body' };
      if (!samePx(witness.shell.px, wRec.components.find((c) => c.name === 'shell').px)) return { ok: false, disagrees: 'shell' };
      return true;
    });
    const witnesses = {
      reexecution: { canonicalSha256: canonicalAsm, exact: reexecution.ok },
      rederivation: witness && { basketLabel: wRec.label, basketIndex: witnessIndex, bodyPx: witness.body.px.length, shellPx: witness.shell.px.length, exact: rederivation.ok }
    };
    const assemblyArtifact = {
      schema: 'nctk-s2-basket-assembly-artifact@1', part: BASKET_ASSEMBLY.part, producedBy: BASKET_ASSEMBLY.assemblyCalculation,
      guarantee: ID, specDelta: BASKET_ASSEMBLY.specDelta, calculation: BASKET_ASSEMBLY.calculation,
      image: assemblyPart.image, totals: assemblyPart.totals, emits: assemblyPart.emits,
      reproduction, witnesses,
      baskets: assemblyPart.baskets
    };
    const entry = ctx.artifact('px.baskets.assembly', 'basket-assembly-json', prettyJsonBytes(assemblyArtifact), undefined, { path: 's2assembly/px.baskets.assembly.json' });
    checks.reexecutionExact = reexecution.ok;
    checks.rederivationExact = rederivation.ok;
    checks.artifactsRehashedAfterWrite = ctx.check('artifactsRehashedAfterWrite', entry.rehashed);
    const reread = JSON.parse(new TextDecoder().decode(ctx.sink.readArtifact(entry.id)));
    checks.artifactsReReadAndCompared = ctx.check('artifactsReReadAndCompared',
      legacyCanon(reread.baskets) === legacyCanon(assemblyPart.baskets) && legacyCanon(reread.totals) === legacyCanon(assemblyPart.totals));

    const exactBaskets = reproduction.filter((r) => r.exact).length;
    const { widthPx: width, heightPx: height } = assemblyPart.image;
    ctx.frame({
      title: `px.baskets.assembly: ${exactBaskets}/${reproduction.length} baskets reproduced body-first`, calculation: BASKET_ASSEMBLY.assemblyCalculation, tick: asmOp.id,
      parts: [
        { address: `${BASKET_ASSEMBLY.part}#body`, kind: 'pxset', data: { width, height, px: assemblyPart.baskets.flatMap((r) => r.components.find((c) => c.name === 'body').px) } },
        { address: `${BASKET_ASSEMBLY.part}#shell`, kind: 'pxset', data: { width, height, px: assemblyPart.baskets.flatMap((r) => r.components.find((c) => c.name === 'shell').px) } },
        { address: `${BASKET_ASSEMBLY.part}#anchor`, kind: 'points', data: { points: assemblyPart.baskets.filter((r) => Array.isArray(r.anchor?.value)).map((r) => [...r.anchor.value, r.label]) } },
        { address: BASKET_ASSEMBLY.part, kind: 'ledger', artifact: entry, data: { rows: reproduction } }
      ],
      verdicts: reproduction.map((r) => ({ name: `basket ${r.label}: fused ${r.fusedPxCount} vs baseline ${r.baselinePxCount}, residue ${r.residuePx}`, ok: r.exact && r.componentOverlapPx === 0 }))
    });

    const record = {
      guarantee: ID, specDelta: BASKET_ASSEMBLY.specDelta,
      part: BASKET_ASSEMBLY.part, producedBy: BASKET_ASSEMBLY.assemblyCalculation,
      basketCount: t.basketCount, totals: t,
      reproduction: { exactBaskets, ofBaskets: reproduction.length, baskets: reproduction },
      witnesses, checks,
      artifacts: [legacyArtifact(entry)]
    };
    ctx.publish('stages.S2.basketAssemblyMaterialization', record);
    ctx.publish('materializations.S2BasketAssembly', record);
    ctx.publish('experiments.branches.S2ASM', {
      mode: 'ON', status: 'SPEC_DELTA_ORACLE_UNKNOWN', lane: LANE,
      baseSnapshotSha256: ctx.get(SNAPSHOT_SHA),
      benefit: 'Every Basket Part is re-derived body-first from its component evidence, so the assembly structure (body base, fused shell, tip anchor, window residue) crosses the toolkit seam as named Parts instead of a flat px array with two counts.',
      falsifier: 'A basket fused set differs from the accepted px.baskets set, the fused union differs from 36,362, a basket component overlap is nonzero, or a basket window residue falls outside the phase-1 band of 1,172 to 1,177 px.',
      oracle: 'UNKNOWN', partAddress: BASKET_ASSEMBLY.part,
      totals: t,
      reproduction: { exactBaskets, ofBaskets: reproduction.length },
      canonicalRgbaSha256Off: canonicalRgbaSha256, canonicalRgbaSha256On: branchA.after,
      ticks: tickEvidence(asmOp, branchA.ticks)
    });
    return { totals: t, basketCount: t.basketCount, specDelta: BASKET_ASSEMBLY.specDelta, exactBaskets };
  }
});
