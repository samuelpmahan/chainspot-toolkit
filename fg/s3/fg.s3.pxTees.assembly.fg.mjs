/**
 * fg.s3.pxTees.assembly (stages/s3.json), the materialization guarantee of
 * the declared spec delta refine.s3.teeAssembly.interiorFirst. Lane
 * s3-tee-assembly, default OFF: with the lane off this FG is dormant and the
 * stage reproduces the pinned baseline exactly. With the lane on, a branch
 * from the S3 snapshot runs the toolkit-layer interior-first tee assembly
 * Calculation (ports/early/s3TeeAssembly.mjs) over the pinned S3 evidence
 * (the tee's findPx frame component ref materialized against the bright
 * label field; the interior derived from the bright mask as the enclosed
 * complement component and gated exactly against the ring's recorded
 * holeArea and bbox). The base board is never written. This delta is
 * additive, not a reproduction: the gates are that the frame reproduces the
 * baseline tee px element for element, the interior equals the ring record
 * exactly, and the overlap is zero.
 *
 * Gates against the RECORD of fg.s3.pxTees.materialize (claimed union),
 * which it requires. Inputs are Parts and registered Calculations only; the
 * branch op runs through fg/branchOp.mjs (site s3.teeAssembly).
 *
 * Ported from runEarly.mjs; artifact artifacts/s3assembly/px.tees.assembly.json,
 * record stages[S3].teeAssemblyMaterialization / materializations.S3TeeAssembly,
 * lane evidence experiments.branches.S3ASM.
 */
import { defineGuarantee } from '../guarantee.mjs';
import { BRANCH_CALLS, runBranchOp, tickEvidence } from '../branchOp.mjs';
import { computeTeeAssembly, rederiveTeeInterior, TEE_ASSEMBLY } from '../../ports/early/s3TeeAssembly.mjs';
import { legacyArtifact, legacyCanon, prettyJsonBytes } from '../legacy.mjs';

const ID = 'fg.s3.pxTees.assembly';
const MATERIALIZE = 'fg.s3.pxTees.materialize';
const LANE = 's3-tee-assembly';
const CONSUMES = ['px.tees', 'px.tees.rings', 'px.components'];
const CANONICAL = 'tk.stage.S0.canonicalRgbaSha256';
const SNAPSHOT_SHA = 'tk.stage.S3.snapshotSha256';
const RESTORE = 'fn.provider.restore.S3';
const SHA = 'fn.tk.sha256';
const samePx = (a, b) => legacyCanon([...a].sort((x, y) => x - y)) === legacyCanon([...b].sort((x, y) => x - y));
const rowsWhere = (rows, bad, say) => rows.filter(bad).map(say);

export default defineGuarantee({
  id: ID,
  guards: [TEE_ASSEMBLY.part],
  reads: [...CONSUMES, CANONICAL, SNAPSHOT_SHA],
  calls: [RESTORE, ...BRANCH_CALLS],
  requires: [MATERIALIZE],
  lane: LANE,
  run(ctx) {
    const baseline = ctx.records[MATERIALIZE].totals;
    const canonicalRgbaSha256 = ctx.get(CANONICAL);
    const sha256 = (bytes) => ctx.call(SHA, { bytes });
    const asmOp = {
      id: 'early.S3.teeAssembly', kind: 'measure', gate: 'shared', unit: 'early-s3-tee-assembly',
      consumes: CONSUMES,
      produces: [TEE_ASSEMBLY.part], calculations: [TEE_ASSEMBLY.assemblyCalculation], accessConformance: 'exact',
      note: 'Declared spec delta refine.s3.teeAssembly.interiorFirst: each baseline Tee Part is assembled whole from its evidence through the phase-1 assembly shape with the enclosed interior as the declared base and the frame component fused onto it, the ring center carried as the anchor, and window ownership accounted against the frame bbox. Branch from the S3 snapshot; base emissions unchanged.'
    };
    const runAssemblyBranch = () => runBranchOp(ctx, {
      restore: RESTORE, op: asmOp, site: 's3.teeAssembly', canonicalRgbaSha256,
      calculate: (tees, rings, fields) => computeTeeAssembly({ tees, rings, fields })
    });
    const branchA = runAssemblyBranch();
    const assemblyPart = branchA.branch.get(TEE_ASSEMBLY.part);
    if (!assemblyPart || !Array.isArray(assemblyPart.tees)) ctx.fail('branch did not produce px.tees.assembly');
    const baseTees = ctx.get('px.tees');
    if (assemblyPart.tees.length !== baseTees.length)
      ctx.fail(`assembly tee count ${assemblyPart.tees.length} != baseline px.tees count ${baseTees.length}`);
    const reproduction = assemblyPart.tees.map((rec, i) => {
      const baseSet = new Set(baseTees[i].px);
      const frameSet = new Set(rec.components[1].px);
      let frameDifferingPx = 0;
      for (const p of baseSet) if (!frameSet.has(p)) frameDifferingPx++;
      for (const p of frameSet) if (!baseSet.has(p)) frameDifferingPx++;
      return {
        index: i, label: rec.label,
        framePxCount: rec.components[1].pxCount, baselinePxCount: baseSet.size,
        interiorPxCount: rec.components[0].pxCount, holeArea: rec.ring.holeArea,
        fusedPxCount: rec.fusedPxCount,
        componentOverlapPx: rec.componentOverlapPx,
        residuePx: rec.residuePx,
        anchor: rec.anchor.value, frameCentroid: rec.anchor.frameCentroid,
        anchorDistancePx: rec.anchor.distanceToFrameCentroidPx,
        frameDifferingPx, interiorDifferingPx: Math.abs(rec.components[0].pxCount - rec.ring.holeArea),
        exact: frameDifferingPx === 0 && rec.components[1].pxCount === baseSet.size && rec.components[0].pxCount === rec.ring.holeArea
      };
    });
    const t = assemblyPart.totals;
    const checks = {
      allFramesReproducedExactly: ctx.check('allFramesReproducedExactly', reproduction.every((r) => r.frameDifferingPx === 0 && r.framePxCount === r.baselinePxCount),
        { inexact: rowsWhere(reproduction, (r) => r.frameDifferingPx !== 0 || r.framePxCount !== r.baselinePxCount, (r) => `tee ${r.label} frame differs by ${r.frameDifferingPx} px (assembly frame ${r.framePxCount} vs baseline ${r.baselinePxCount})`) }),
      interiorsMatchHoleArea: ctx.check('interiorsMatchHoleArea', reproduction.every((r) => r.interiorDifferingPx === 0),
        { inexact: rowsWhere(reproduction, (r) => r.interiorDifferingPx !== 0, (r) => `tee ${r.label} interior differs by ${r.interiorDifferingPx} px (derived ${r.interiorPxCount} vs ring holeArea ${r.holeArea})`) }),
      componentOverlapZero: ctx.check('componentOverlapZero', reproduction.every((r) => r.componentOverlapPx === 0),
        { overlapping: rowsWhere(reproduction, (r) => r.componentOverlapPx !== 0, (r) => `tee ${r.label} overlaps by ${r.componentOverlapPx} px`) }),
      fusedUnionArithmetic: ctx.check('fusedUnionArithmetic', t.frameUnionPx === baseline.claimedPx && t.fusedUnionPx === t.frameUnionPx + t.interiorUnionPx,
        { frameUnionPx: t.frameUnionPx, [`${MATERIALIZE}.claimedPx`]: baseline.claimedPx, fusedUnionPx: t.fusedUnionPx, interiorUnionPx: t.interiorUnionPx }),
      ownedOutsideWindowZero: ctx.check('ownedOutsideWindowZero', assemblyPart.tees.every((r) => r.ownership.ownedOutsideWindowPx === 0),
        { outside: rowsWhere(assemblyPart.tees, (r) => r.ownership.ownedOutsideWindowPx !== 0, (r) => `tee ${r.label} owns ${r.ownership.ownedOutsideWindowPx} px outside`) })
    };
    // Witness 1: deterministic re-execution on a second restored branch.
    const canonicalAsm = sha256(legacyCanon(assemblyPart));
    const reexecution = ctx.witness('reexecutionExact', () => {
      const second = sha256(legacyCanon(runAssemblyBranch().result));
      return second === canonicalAsm ? true : { ok: false, first: canonicalAsm, second };
    });
    // Witness 2: independent re-derivation of tee 1's interior from the
    // raster fields (the not-bright component containing the tee center;
    // never the findPx refs or the ring record).
    const witnessIndex = 0;
    const wRec = assemblyPart.tees[witnessIndex];
    let witness = null;
    const rederivation = ctx.witness('rederivationExact', () => {
      witness = rederiveTeeInterior({ tee: baseTees[witnessIndex], fields: ctx.get('px.components') });
      return samePx(witness.interior.px, wRec.components.find((c) => c.name === 'interior').px) ? true : { ok: false, disagrees: 'interior' };
    });
    const witnesses = {
      reexecution: { canonicalSha256: canonicalAsm, exact: reexecution.ok },
      rederivation: witness && { teeLabel: wRec.label, teeIndex: witnessIndex, interiorPx: witness.interior.px.length, holeArea: wRec.ring.holeArea, exact: rederivation.ok }
    };
    const assemblyArtifact = {
      schema: 'nctk-s3-tee-assembly-artifact@1', part: TEE_ASSEMBLY.part, producedBy: TEE_ASSEMBLY.assemblyCalculation,
      guarantee: ID, specDelta: TEE_ASSEMBLY.specDelta, calculation: TEE_ASSEMBLY.calculation,
      image: assemblyPart.image, totals: t, emits: assemblyPart.emits,
      reproduction, witnesses,
      tees: assemblyPart.tees
    };
    const entry = ctx.artifact('px.tees.assembly', 'tee-assembly-json', prettyJsonBytes(assemblyArtifact), undefined, { path: 's3assembly/px.tees.assembly.json' });
    checks.reexecutionExact = reexecution.ok;
    checks.rederivationExact = rederivation.ok;
    checks.artifactsRehashedAfterWrite = ctx.check('artifactsRehashedAfterWrite', entry.rehashed);
    const reread = JSON.parse(new TextDecoder().decode(ctx.sink.readArtifact(entry.id)));
    checks.artifactsReReadAndCompared = ctx.check('artifactsReReadAndCompared',
      legacyCanon(reread.tees) === legacyCanon(assemblyPart.tees) && legacyCanon(reread.totals) === legacyCanon(t));

    const exactTees = reproduction.filter((r) => r.exact).length;
    const { widthPx: width, heightPx: height } = assemblyPart.image;
    ctx.frame({
      title: `px.tees.assembly: ${exactTees}/${reproduction.length} tees assembled interior-first (+${t.interiorUnionPx} interior px)`, calculation: TEE_ASSEMBLY.assemblyCalculation, tick: asmOp.id,
      parts: [
        { address: `${TEE_ASSEMBLY.part}#interior`, kind: 'pxset', data: { width, height, px: assemblyPart.tees.flatMap((r) => r.components.find((c) => c.name === 'interior').px) } },
        { address: `${TEE_ASSEMBLY.part}#frame`, kind: 'pxset', data: { width, height, px: assemblyPart.tees.flatMap((r) => r.components.find((c) => c.name === 'frame').px) } },
        { address: `${TEE_ASSEMBLY.part}#anchor`, kind: 'points', data: { points: assemblyPart.tees.map((r) => [...r.anchor.value, r.label]) } },
        { address: TEE_ASSEMBLY.part, kind: 'ledger', artifact: entry, data: { rows: reproduction.map((r) => ({ ...r, anchor: r.anchor.map((v) => v.toFixed(2)).join(','), frameCentroid: Array.isArray(r.frameCentroid) ? r.frameCentroid.map((v) => v.toFixed(2)).join(',') : r.frameCentroid })) } }
      ],
      verdicts: reproduction.map((r) => ({ name: `tee ${r.label}: frame ${r.framePxCount}/${r.baselinePxCount}, interior ${r.interiorPxCount}/${r.holeArea}`, ok: r.exact && r.componentOverlapPx === 0 }))
    });

    const record = {
      guarantee: ID, specDelta: TEE_ASSEMBLY.specDelta,
      part: TEE_ASSEMBLY.part, producedBy: TEE_ASSEMBLY.assemblyCalculation,
      teeCount: t.teeCount, totals: t,
      reproduction: { exactTees, ofTees: reproduction.length, tees: reproduction },
      witnesses, checks,
      artifacts: [legacyArtifact(entry)]
    };
    ctx.publish('stages.S3.teeAssemblyMaterialization', record);
    ctx.publish('materializations.S3TeeAssembly', record);
    ctx.publish('experiments.branches.S3ASM', {
      mode: 'ON', status: 'SPEC_DELTA_ORACLE_UNKNOWN', lane: LANE,
      baseSnapshotSha256: ctx.get(SNAPSHOT_SHA),
      benefit: 'Every baseline Tee Part is assembled whole from its evidence (enclosed interior base, frame fused on, ring-center anchor, window-residue accounting), so the interior pixels the baseline Part never claimed are owned by the Part instead of living only as ring geometry on px.tees.rings, and the assembly structure crosses the toolkit seam as named Parts instead of a frame-only px array.',
      falsifier: 'A tee frame set differs from the accepted px.tees set, the frame union differs from 4,884, a tee interior size differs from its ring\'s recorded holeArea, or a tee component overlap is nonzero.',
      oracle: 'UNKNOWN', partAddress: TEE_ASSEMBLY.part,
      totals: t,
      delta: { frameOnlyBaselinePx: baseline.claimedPx, interiorAddedPx: t.interiorUnionPx, fusedUnionPx: t.fusedUnionPx },
      reproduction: { exactTees, ofTees: reproduction.length },
      canonicalRgbaSha256Off: canonicalRgbaSha256, canonicalRgbaSha256On: branchA.after,
      ticks: tickEvidence(asmOp, branchA.ticks)
    });
    return { totals: t, teeCount: t.teeCount, specDelta: TEE_ASSEMBLY.specDelta, exactTees };
  }
});
