/**
 * fg.s3.pxTeesFamilyFix.materialize (stages/s3.json), the materialization
 * guarantee of the declared spec delta refine.s3.findFamily.structural.
 * Lane s3-findfamily-structural-fix, default OFF: with the lane off this FG
 * is dormant and the stage reproduces the pinned baseline exactly. With the
 * lane on, a branch from the S3 snapshot runs the toolkit-layer structural
 * refinement of fn.Tee.findFamily (ports/early/s3FamilyFix.mjs: anchored
 * pad model, band-fill and interior-tone class tests, occlusion excuses
 * only by named prior-layer Parts) over the pinned rings/family Parts. The
 * base board is never written; the corrected family and tee set live only
 * on the branch and in the artifacts. The delta against the baseline is
 * RECORDED, not gated: the guarantee certifies the materialization is
 * faithful, and a delta other than the declared specimen expectation is a
 * finding.
 *
 * Inputs are Parts and registered Calculations only. The baseline tee
 * tuples and the witness's ringsPlain/familyPlain are serialized from the
 * board Parts with the same serializers the materialize FGs wrote to
 * artifacts/s3/ (fg/s3/serialize.mjs); this FG requires both materialize
 * records to have held. A corrected member the baseline never materialized
 * gets its provider Tee from fn.provider.S3.makeTee; the branch op runs
 * through fg/branchOp.mjs (site s3.findFamilyStructuralFix).
 *
 * Ported from runEarly.mjs; artifacts artifacts/s3fix/px.tees.family-refined.json,
 * px.tees.refined.json, refinedPx.rgba.bin, px.tees.eliminated.json,
 * eliminatedPx.rgba.bin; record stages[S3].familyFixMaterialization /
 * materializations.S3FamilyFix; lane evidence experiments.branches.S3FIX.
 */
import { defineGuarantee } from '../guarantee.mjs';
import { BRANCH_CALLS, runBranchOp, tickEvidence } from '../branchOp.mjs';
import { computeFamilyFix, rederiveFamilyFixVerdicts, FAMILY_FIX, FIX_BOUNDS, ringKeyOf } from '../../ports/early/s3FamilyFix.mjs';
import { legacyArtifact, legacyCanon, prettyJsonBytes, unionOf, viewBytes, zeroAlphaCount } from '../legacy.mjs';
import { serializeFamily, serializeRings, serializeTee, teeTuple } from './serialize.mjs';

const ID = 'fg.s3.pxTeesFamilyFix.materialize';
const TEES = 'fg.s3.pxTees.materialize';
const RINGS_FAMILY = 'fg.s3.pxTeesRingsFamily.materialize';
const LANE = 's3-findfamily-structural-fix';
const CONSUMES = ['px.tees.rings', 'px.tees.family', 'px.components', 'px.image.cropped', 'px.badges', 'px.baskets', 'px.tees'];
const CAPTURED = 'tk.stage.S3.captured';
const CANONICAL = 'tk.stage.S0.canonicalRgbaSha256';
const SNAPSHOT_SHA = 'tk.stage.S3.snapshotSha256';
const RESTORE = 'fn.provider.restore.S3';
const MAKE_TEE = 'fn.provider.S3.makeTee';
const SHA = 'fn.tk.sha256';

export default defineGuarantee({
  id: ID,
  guards: [FAMILY_FIX.familyPart, FAMILY_FIX.teesPart],
  reads: [...CONSUMES, CAPTURED, CANONICAL, SNAPSHOT_SHA],
  calls: [RESTORE, MAKE_TEE, ...BRANCH_CALLS],
  requires: [TEES, RINGS_FAMILY],
  lane: LANE,
  run(ctx) {
    const canonicalRgbaSha256 = ctx.get(CANONICAL);
    const captured = ctx.get(CAPTURED);
    const planFingerprint = captured.plan.planFingerprint;
    const pxSha = (px) => ctx.call(SHA, { bytes: viewBytes(px) });
    const fixOp = {
      id: 'early.S3.findFamilyStructuralFix', kind: 'measure', gate: 'shared', unit: 'early-s3-findfamily-fix',
      consumes: CONSUMES,
      produces: [FAMILY_FIX.familyPart, FAMILY_FIX.teesPart], calculations: [FAMILY_FIX.refinedCalculation], accessConformance: 'exact',
      note: 'Declared spec delta refine.s3.findFamily.structural: membership in px.tees.family becomes structural (anchored pad model, fitted-size / border / band / interior / whiteness tests, occlusion excuses only by named prior-layer Parts) instead of resemblance-based. Branch from the S3 snapshot; base emissions unchanged.'
    };
    const runFixBranch = () => runBranchOp(ctx, {
      restore: RESTORE, op: fixOp, site: 's3.findFamilyStructuralFix', canonicalRgbaSha256,
      calculate: (rings, family, fields, image, badges, baskets, baseTees) => {
        const byRing = new Map(baseTees.map((t) => [ringKeyOf(t.has.detectRings.hole), t]));
        const makeTee = (member) => byRing.get(ringKeyOf(member.ring)) ?? ctx.call(MAKE_TEE, { member, fields });
        return computeFamilyFix({ rings, family, fields, image, badges, baskets, makeTee });
      },
      outputs: (fix) => ({ [FAMILY_FIX.familyPart]: fix.familyPart, [FAMILY_FIX.teesPart]: fix.tees })
    });
    const branchA = runFixBranch();
    const familyPart = branchA.branch.get(FAMILY_FIX.familyPart);
    const refinedTees = branchA.branch.get(FAMILY_FIX.teesPart);
    if (!familyPart || !Array.isArray(refinedTees)) ctx.fail('branch did not produce px.tees.familyRefined / px.tees.refined');
    const rowsByRingKey = new Map(branchA.result.rows.map((r) => [ringKeyOf(r.ring), r]));
    const serializedRefinedTees = refinedTees.map((tee, index) => {
      const row = rowsByRingKey.get(ringKeyOf(tee.has.detectRings.hole));
      return serializeTee(tee, index, pxSha, {
        findFamilyFn: FAMILY_FIX.refinedCalculation,
        extra: {
          baselineIndex: row?.baselineMember ? row.baselineMember - 1 : null,
          baselineLabel: row?.baselineMember ? String(row.baselineMember) : null,
          verdict: row?.verdict ?? null
        }
      });
    });
    // The witnessed baseline serializations (what fg.s3.pxTees.materialize
    // and fg.s3.pxTeesRingsFamily.materialize wrote to artifacts/s3/).
    const serializedTees = ctx.get('px.tees').map((tee, index) => serializeTee(tee, index, pxSha));
    const serializedRings = serializeRings(ctx.get('px.tees.rings'));
    const serializedFamily = serializeFamily(ctx.get('px.tees.family'));
    const fields = ctx.get('px.components');
    const { widthPx, heightPx } = { widthPx: fields.bright.mask.width, heightPx: fields.bright.mask.height };
    const framePx = widthPx * heightPx;

    // Witness 1: deterministic re-execution on a second restored branch must
    // reproduce the family Part and the corrected tee tuples exactly.
    const canonicalA = ctx.call(SHA, { bytes: legacyCanon({ part: familyPart, tees: serializedRefinedTees.map(teeTuple) }) });
    const reexecution = ctx.witness('reexecutionExact', () => {
      const b = runFixBranch();
      const teesB = b.branch.get(FAMILY_FIX.teesPart).map((tee) => ({
        center: [...tee.center], bbox: [...tee.bbox], innerBbox: [...tee.innerBbox], angleRad: tee.angleRad, pxCount: tee.px.length, pxSha256: pxSha(tee.px)
      }));
      const canonicalB = ctx.call(SHA, { bytes: legacyCanon({ part: b.branch.get(FAMILY_FIX.familyPart), tees: teesB.map(teeTuple) }) });
      return canonicalA === canonicalB ? true : { ok: false, first: canonicalA, second: canonicalB };
    });
    // Witness 2: independent re-derivation of every verdict from the
    // serialized baseline rings/family Parts and the board rasters (a
    // separate code path that never sees the branch result).
    let witnessRows = 0;
    const rederivation = ctx.witness('serializerMatchesRederivation', () => {
      const w = rederiveFamilyFixVerdicts({ ringsPlain: serializedRings, familyPlain: serializedFamily, fields, image: captured.image, badges: ctx.get('px.badges'), baskets: ctx.get('px.baskets') });
      witnessRows = w.rows.length;
      if (familyPart.candidates.length !== w.rows.length) return { ok: false, serializedRows: familyPart.candidates.length, witnessRows: w.rows.length };
      if (legacyCanon(familyPart.model) !== legacyCanon(w.model)) return { ok: false, disagrees: 'pad model', serialized: familyPart.model, witness: w.model };
      for (let i = 0; i < w.rows.length; i++) {
        const s = familyPart.candidates[i], r = w.rows[i];
        if (s.index !== r.index || s.baselineMember !== r.baselineMember || s.anchor !== r.anchor || s.verdict !== r.verdict
          || legacyCanon(s.failedTests) !== legacyCanon(r.failedTests) || legacyCanon(s.tests) !== legacyCanon(r.tests)
          || legacyCanon(s.measurements) !== legacyCanon(r.measurements))
          return { ok: false, row: i, serialized: [s.verdict, s.failedTests], witness: [r.verdict, r.failedTests] };
        if (ringKeyOf(s.ring) !== r.ringKey) return { ok: false, row: i, disagrees: 'ring' };
      }
      return true;
    });
    // Partition closure: every candidate in exactly one pile, the corrected
    // family exactly admitted + excused.
    const pileIndices = [...familyPart.piles.admitted, ...familyPart.piles.excused, ...familyPart.piles.eliminated].sort((a, b) => a - b);
    const partitionClosed = ctx.check('partitionClosed',
      familyPart.candidates.length === serializedRings.candidates.length && legacyCanon(pileIndices) === legacyCanon(familyPart.candidates.map((c) => c.index)),
      { verdictRows: familyPart.candidates.length, baselineCandidates: serializedRings.candidates.length });
    const correctedKeys = familyPart.correctedFamily.members.map((m) => ringKeyOf(m.ring)).sort();
    const pileKeys = familyPart.candidates.filter((c) => c.verdict !== 'ELIMINATED').map((c) => ringKeyOf(c.ring)).sort();
    const correctedMembersAreAdmittedPlusExcused = ctx.check('correctedMembersAreAdmittedPlusExcused',
      legacyCanon([...new Set(correctedKeys)]) === legacyCanon([...new Set(pileKeys)]) && serializedRefinedTees.length === familyPart.correctedFamily.members.length,
      { refinedTees: serializedRefinedTees.length, correctedMembers: familyPart.correctedFamily.members.length });
    // Carried-over baseline members keep their baseline tee identity.
    const changedTuples = serializedRefinedTees.filter((t) => t.baselineIndex !== null && legacyCanon(teeTuple(t)) !== legacyCanon(teeTuple(serializedTees[t.baselineIndex])))
      .map((t) => `refined tee ${t.index} (baseline tee ${t.baselineLabel})`);
    const baselineTuplesPreserved = ctx.check('baselineTuplesPreserved', changedTuples.length === 0, { changedTuples });

    // The delta against the pinned baseline, recorded as data.
    const c = familyPart.candidates;
    const delta = {
      baselineTeeCount: serializedTees.length, correctedTeeCount: serializedRefinedTees.length,
      eliminatedBaselineMembers: c.filter((x) => x.baselineMember && x.verdict === 'ELIMINATED')
        .map((x) => ({ baselineLabel: String(x.baselineMember), center: [x.ring.cx, x.ring.cy], failedTests: x.failedTests })),
      excusedBaselineMembers: c.filter((x) => x.baselineMember && x.verdict === 'EXCUSED')
        .map((x) => ({ baselineLabel: String(x.baselineMember), center: [x.ring.cx, x.ring.cy], failedTests: x.failedTests, occluders: x.measurements.missingEvidence?.byOccluder ?? null })),
      admittedBaselineMembers: c.filter((x) => x.baselineMember && x.verdict === 'ADMITTED').map((x) => String(x.baselineMember)),
      admittedNonMembers: c.filter((x) => !x.baselineMember && x.verdict === 'ADMITTED').map((x) => ({ center: [x.ring.cx, x.ring.cy], framed: x.framed })),
      excusedNonMembers: c.filter((x) => !x.baselineMember && x.verdict === 'EXCUSED').map((x) => ({ center: [x.ring.cx, x.ring.cy], framed: x.framed, failedTests: x.failedTests })),
      eliminatedNonMembers: c.filter((x) => !x.baselineMember && x.verdict === 'ELIMINATED').map((x) => ({ center: [x.ring.cx, x.ring.cy], framed: x.framed, failedTests: x.failedTests })),
      declaredSpecimenExpectation: { eliminatedBaselineLabels: ['16', '17', '18'], admittedNonMembers: 0, excusedBaselineMembers: 0 },
      matchesDeclaredSpecimenExpectation: null
    };
    delta.matchesDeclaredSpecimenExpectation =
      legacyCanon(delta.eliminatedBaselineMembers.map((x) => x.baselineLabel)) === legacyCanon(delta.declaredSpecimenExpectation.eliminatedBaselineLabels)
      && delta.admittedNonMembers.length === 0 && delta.excusedBaselineMembers.length === 0
      && delta.admittedBaselineMembers.length === delta.baselineTeeCount - 3;

    // Renderer-binding rasters: canonical RGB with alpha zeroed on exactly
    // the set each artifact claims (corrected tee union; eliminated framed
    // candidates' frame-component px), recounted.
    const refinedUnion = unionOf(serializedRefinedTees.map((t) => t.px));
    const refinedRgba = new Uint8ClampedArray(captured.image.rgba);
    for (const pixel of refinedUnion) refinedRgba[pixel * 4 + 3] = 0;
    const eliminatedFramed = c.filter((x) => x.verdict === 'ELIMINATED' && x.framed);
    let elimSeq = 0;
    const serializedEliminated = eliminatedFramed.map((x) => {
      const px = [];
      for (let i = 0; i < fields.bright.labels.length; i++) if (fields.bright.labels[i] === x.frame.label) px.push(i);
      return {
        label: x.baselineMember ? String(x.baselineMember) : `X${++elimSeq}`,
        baselineLabel: x.baselineMember ? String(x.baselineMember) : null,
        center: [x.ring.cx, x.ring.cy], bbox: [x.frame.bboxX, x.frame.bboxY, x.frame.bboxW, x.frame.bboxH],
        ringBbox: [x.ring.bboxX, x.ring.bboxY, x.ring.bboxW, x.ring.bboxH],
        failedTests: x.failedTests, px, pxCount: px.length,
        pxSha256: pxSha(Uint32Array.from(px))
      };
    });
    const eliminatedUnion = unionOf(serializedEliminated.map((t) => t.px));
    const eliminatedRgba = new Uint8ClampedArray(captured.image.rgba);
    for (const pixel of eliminatedUnion) eliminatedRgba[pixel * 4 + 3] = 0;
    const refinedZeroed = zeroAlphaCount(refinedRgba), eliminatedZeroed = zeroAlphaCount(eliminatedRgba);
    const rastersRecounted = ctx.check('rastersRecounted', refinedZeroed === refinedUnion.size && eliminatedZeroed === eliminatedUnion.size,
      { refined: [refinedZeroed, refinedUnion.size], eliminated: [eliminatedZeroed, eliminatedUnion.size] });
    const serializerMatchesBranchPart = ctx.check('serializerMatchesBranchPart',
      refinedTees.every((tee, i) => legacyCanon(serializedRefinedTees[i].px) === legacyCanon([...tee.px])));

    const witnesses = {
      reexecution: { canonicalSha256: canonicalA, exact: reexecution.ok },
      rederivation: { rowsChecked: witnessRows, exact: rederivation.ok }
    };
    const image = { widthPx, heightPx };
    const familyRefinedArtifact = {
      schema: 'nctk-s3-family-refined-artifact@1', parts: [FAMILY_FIX.familyPart, FAMILY_FIX.teesPart],
      guarantee: ID, specDelta: FAMILY_FIX.specDelta,
      calculation: FAMILY_FIX.calculation, refinedCalculation: FAMILY_FIX.refinedCalculation,
      planFingerprint, image, boundsRule: FIX_BOUNDS,
      model: familyPart.model, counts: familyPart.counts,
      candidates: familyPart.candidates, correctedFamily: familyPart.correctedFamily, piles: familyPart.piles,
      witnesses, delta
    };
    const refinedSetArtifact = {
      schema: 'nctk-s3-tees-refined-artifact@1', part: FAMILY_FIX.teesPart, producedBy: FAMILY_FIX.refinedCalculation,
      guarantee: ID, teeCount: serializedRefinedTees.length,
      note: 'Corrected tee set under the declared spec delta. Labels are the corrected order; baselineLabel records the baseline tee identity for members carried over unchanged.',
      planFingerprint, image,
      totals: { claimedPx: refinedUnion.size, claimedVisits: serializedRefinedTees.reduce((n, t) => n + t.pxCount, 0) },
      tees: serializedRefinedTees
    };
    const eliminatedSetArtifact = {
      schema: 'nctk-s3-tees-eliminated-artifact@1', part: 'px.tees.eliminated', producedBy: FAMILY_FIX.refinedCalculation,
      guarantee: ID, teeCount: serializedEliminated.length,
      note: 'Eliminated FRAMED candidates only: the set is each candidate frame component px. Eliminated unframed candidates have no frame pixel set and live in the verdict ledger (px.tees.family-refined.json) only.',
      planFingerprint, image,
      totals: { claimedPx: eliminatedUnion.size },
      tees: serializedEliminated
    };
    const dims = { width: widthPx, height: heightPx };
    const entries = [
      ctx.artifact('px.tees.familyRefined', 'family-refined-json', prettyJsonBytes(familyRefinedArtifact), undefined, { path: 's3fix/px.tees.family-refined.json' }),
      ctx.artifact('px.tees.refined', 'tee-set-json', prettyJsonBytes(refinedSetArtifact), undefined, { path: 's3fix/px.tees.refined.json' }),
      ctx.artifact('s3fix.refinedPx.rgba', 'rgba', refinedRgba, dims, { path: 's3fix/refinedPx.rgba.bin' }),
      ctx.artifact('px.tees.eliminated', 'eliminated-set-json', prettyJsonBytes(eliminatedSetArtifact), undefined, { path: 's3fix/px.tees.eliminated.json' }),
      ctx.artifact('s3fix.eliminatedPx.rgba', 'rgba', eliminatedRgba, dims, { path: 's3fix/eliminatedPx.rgba.bin' })
    ];
    const artifactsRehashedAfterWrite = ctx.check('artifactsRehashedAfterWrite', entries.every((e) => e.rehashed));
    const reread = (i) => JSON.parse(new TextDecoder().decode(ctx.sink.readArtifact(entries[i].id)));
    const rf = reread(0), rr = reread(1);
    const artifactsReReadAndCompared = ctx.check('artifactsReReadAndCompared',
      legacyCanon(rf.candidates) === legacyCanon(familyPart.candidates) && legacyCanon(rf.model) === legacyCanon(familyPart.model)
      && legacyCanon(rf.counts) === legacyCanon(familyPart.counts) && legacyCanon(rf.delta) === legacyCanon(delta)
      && rr.teeCount === serializedRefinedTees.length && legacyCanon(rr.tees.map((t) => t.px)) === legacyCanon(serializedRefinedTees.map((t) => t.px)));

    // Flipbook: every candidate's frame (or ring) box, one part per verdict pile.
    const box = (x) => (x.frame ? [x.frame.bboxX, x.frame.bboxY, x.frame.bboxW, x.frame.bboxH] : [x.ring.bboxX, x.ring.bboxY, x.ring.bboxW, x.ring.bboxH]);
    const nameOf = (x) => (x.baselineMember ? `#${x.baselineMember}` : `c${x.index}`);
    const pile = (verdict) => c.filter((x) => x.verdict === verdict).map((x) => [...box(x), nameOf(x)]);
    ctx.frame({
      title: `findFamily structural: ${familyPart.piles.admitted.length} admitted, ${familyPart.piles.excused.length} excused, ${familyPart.piles.eliminated.length} eliminated of ${c.length} candidates`,
      calculation: FAMILY_FIX.refinedCalculation, tick: fixOp.id,
      parts: [
        // palette order: eliminated red, admitted green, excused blue
        { address: `${FAMILY_FIX.familyPart}#eliminated`, kind: 'bbox', data: { boxes: pile('ELIMINATED') } },
        { address: `${FAMILY_FIX.familyPart}#admitted`, kind: 'bbox', data: { boxes: pile('ADMITTED') } },
        { address: `${FAMILY_FIX.familyPart}#excused`, kind: 'bbox', data: { boxes: pile('EXCUSED') } },
        { address: 'px.tees.eliminated', kind: 'pxset', artifact: entries[3], data: { width: widthPx, height: heightPx, px: [...eliminatedUnion] } },
        { address: `${FAMILY_FIX.familyPart}#model`, kind: 'ledger', data: { rows: [familyPart.model] } },
        { address: `${FAMILY_FIX.familyPart}#ledger`, kind: 'ledger', artifact: entries[0], data: { rows: c.map((x) => ({
          index: x.index, baselineMember: x.baselineMember ?? null, anchor: x.anchor, framed: x.framed, verdict: x.verdict,
          failedTests: x.failedTests.join(' '), center: `${x.ring.cx.toFixed(1)},${x.ring.cy.toFixed(1)}`,
          bandFill: x.measurements.frame?.bandFill ?? null,
          interiorTone: Array.isArray(x.measurements.interior?.tone) ? x.measurements.interior.tone.join(',') : null,
          interiorToneDistance: x.measurements.interior?.toneDistance ?? null,
          bandCoverage: x.measurements.bandCoverage ?? null
        })) } }
      ],
      verdicts: c.map((x) => ({ name: `candidate ${nameOf(x)}: ${x.verdict}${x.failedTests.length ? ` (${x.failedTests.join(', ')})` : ''}`, ok: x.verdict !== 'ELIMINATED' }))
    });
    ctx.frame({
      title: `px.tees.refined: ${serializedRefinedTees.length} corrected tees (baseline ${serializedTees.length}); expectation ${delta.matchesDeclaredSpecimenExpectation ? 'matched' : 'NOT matched (a finding)'}`,
      calculation: FAMILY_FIX.refinedCalculation,
      parts: [
        { address: FAMILY_FIX.teesPart, kind: 'pxset', artifact: entries[1], data: { width: widthPx, height: heightPx, px: [...refinedUnion] } },
        { address: `${FAMILY_FIX.teesPart}#bbox`, kind: 'bbox', data: { boxes: serializedRefinedTees.map((t) => [...t.bbox, t.baselineLabel ?? `new${t.index}`]) } },
        { address: `${FAMILY_FIX.teesPart}#delta`, kind: 'ledger', data: { rows: [{
          baselineTeeCount: delta.baselineTeeCount, correctedTeeCount: delta.correctedTeeCount,
          eliminatedBaselineMembers: delta.eliminatedBaselineMembers.map((x) => x.baselineLabel).join(','),
          excusedBaselineMembers: delta.excusedBaselineMembers.map((x) => x.baselineLabel).join(','),
          admittedNonMembers: delta.admittedNonMembers.length, excusedNonMembers: delta.excusedNonMembers.length, eliminatedNonMembers: delta.eliminatedNonMembers.length,
          matchesDeclaredSpecimenExpectation: delta.matchesDeclaredSpecimenExpectation
        }] } }
      ]
    });

    const checks = {
      partitionClosed, serializerMatchesRederivation: rederivation.ok, reexecutionExact: reexecution.ok,
      correctedMembersAreAdmittedPlusExcused, baselineTuplesPreserved,
      serializerMatchesBranchPart, rastersRecounted,
      artifactsRehashedAfterWrite, artifactsReReadAndCompared
    };
    const record = {
      guarantee: ID, specDelta: FAMILY_FIX.specDelta,
      parts: [FAMILY_FIX.familyPart, FAMILY_FIX.teesPart], producedBy: FAMILY_FIX.refinedCalculation,
      planFingerprint,
      counts: familyPart.counts, model: familyPart.model, delta,
      witnesses, checks,
      artifacts: [legacyArtifact(entries[0]), legacyArtifact(entries[1]), legacyArtifact(entries[2], dims), legacyArtifact(entries[3]), legacyArtifact(entries[4], dims)]
    };
    ctx.publish('stages.S3.familyFixMaterialization', record);
    ctx.publish('materializations.S3FamilyFix', record);
    ctx.publish('experiments.branches.S3FIX', {
      mode: 'ON', status: 'SPEC_DELTA_ORACLE_UNKNOWN', lane: LANE,
      baseSnapshotSha256: ctx.get(SNAPSHOT_SHA),
      benefit: 'Membership in the tee family becomes a structural verdict per candidate, so same-scale map chrome is eliminated at S3 with named failed tests instead of surviving to S4 attrition.',
      falsifier: 'A genuine pad is eliminated or excused, a chrome candidate is admitted, or an admitted tee tuple differs from the pinned baseline tuple.',
      oracle: 'UNKNOWN', partAddress: FAMILY_FIX.familyPart, teesPartAddress: FAMILY_FIX.teesPart,
      counts: familyPart.counts, delta,
      canonicalRgbaSha256Off: canonicalRgbaSha256, canonicalRgbaSha256On: branchA.after,
      ticks: tickEvidence(fixOp, branchA.ticks)
    });
    return { totals: familyPart.counts, delta, specDelta: FAMILY_FIX.specDelta };
  }
});
