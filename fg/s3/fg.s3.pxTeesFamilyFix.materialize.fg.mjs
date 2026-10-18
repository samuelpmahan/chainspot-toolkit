/**
 * fg.s3.pxTeesFamilyFix.materialize (stages/s3.json), the materialization
 * guarantee of the declared spec delta refine.s3.findFamily.structural.
 * Lane s3-findfamily-structural-fix, default OFF (dormant; the stage
 * reproduces the pinned baseline exactly). With the lane on, the toolkit
 * structural refinement of fn.Tee.findFamily (ports/early/s3FamilyFix.mjs:
 * anchored pad model, band-fill and interior-tone class tests, occlusion
 * excuses only by named prior-layer Parts) runs on a branch restored from
 * the S3 snapshot; the base board is never written. The delta against the
 * baseline is RECORDED, not gated: the guarantee certifies the
 * materialization is faithful (a second branch reproduces it; every verdict
 * is re-derived from the serialized baseline Parts by a separate path; the
 * piles partition the candidates; carried-over members keep their baseline
 * tuple; the rasters recount their sets), the M1 base-delta of the
 * corrected tees vs px.tees is recorded, and agreement with the declared
 * specimen expectation is judged (a finding, never a failure). FIX_BOUNDS
 * carries a unit for every number (unitful params).
 *
 * Requires both S3 materialize records to have held. Artifacts
 * artifacts/s3fix/{px.tees.family-refined.json, px.tees.refined.json,
 * refinedPx.rgba.bin, px.tees.eliminated.json, eliminatedPx.rgba.bin}
 * (bytes unchanged); record stages[S3].familyFixMaterialization /
 * materializations.S3FamilyFix; lane evidence experiments.branches.S3FIX.
 */
import { branchRun, guarantee, pipe, step } from '../compose.mjs';
import { conserved, delta, framed, gated, judged, lane, materialized, published, sameCanon, unitful, witnessed } from '../mixins.mjs';
import { computeFamilyFix, rederiveFamilyFixVerdicts, FAMILY_FIX, FIX_BOUNDS, FIX_BOUNDS_UNITS, ringKeyOf } from '../../ports/early/s3FamilyFix.mjs';
import { legacyCanon, unionOf, viewBytes } from '../legacy.mjs';
import { serializeFamily, serializeRings, serializeTee, teeTuple } from './serialize.mjs';

const ID = 'fg.s3.pxTeesFamilyFix.materialize';
const CONSUMES = ['px.tees.rings', 'px.tees.family', 'px.components', 'px.image.cropped', 'px.badges', 'px.baskets', 'px.tees'];
const CAPTURED = 'tk.stage.S3.captured';
const MAKE_TEE = 'fn.provider.S3.makeTee';
const { familyPart: FAMILY, teesPart: TEES } = FAMILY_FIX;
const CANDIDATES = 'count (candidates)';
const UNITS = {
  // the fitted pad model (ports/early/s3FamilyFix.mjs fitModel) and its bounds
  major: 'px (oriented outer extent)', minor: 'px (oriented outer extent)', area: 'px (pixel count)', holeArea: 'px (pixel count)',
  bandT: 'px (band thickness)', meanMargin: 'px (mean border thickness)', anchorBandCoverageMin: 'fraction of band', bandCoverage: 'fraction of band',
  bandFill: 'fraction of band area (frame px / (major*minor - holeArea)); in the model {median, min, max}: the same fraction, of: count (margin-passing candidates)', interiorTone: 'RGB level per channel', interiorToneDistance: 'RGB level (max channel distance)',
  // verdict counts and the recorded delta
  admitted: CANDIDATES, anchors: CANDIDATES, candidates: CANDIDATES, correctedMembers: CANDIDATES, eliminated: CANDIDATES, excused: CANDIDATES, framed: CANDIDATES, unframed: CANDIDATES,
  admittedNonMembers: CANDIDATES, excusedNonMembers: CANDIDATES, eliminatedNonMembers: CANDIDATES, excusedBaselineMembers: CANDIDATES,
  baselineMember: 'ordinal (baseline tee label)', rowsChecked: 'count (verdict rows)'
};

const OP = {
  id: 'early.S3.findFamilyStructuralFix', kind: 'measure', gate: 'shared', unit: 'early-s3-findfamily-fix',
  consumes: CONSUMES,
  produces: [FAMILY, TEES], calculations: [FAMILY_FIX.refinedCalculation], accessConformance: 'exact',
  note: 'Declared spec delta refine.s3.findFamily.structural: membership in px.tees.family becomes structural (anchored pad model, fitted-size / border / band / interior / whiteness tests, occlusion excuses only by named prior-layer Parts) instead of resemblance-based. Branch from the S3 snapshot; base emissions unchanged.'
};
const pxShaOf = (env) => (px) => env.call('fn.tk.sha256', { bytes: viewBytes(px) });

const subject = step('read and serialize the branch Parts', (env, s) => {
  const familyPart = s.branch.branch.get(FAMILY);
  const refinedTees = s.branch.branch.get(TEES);
  if (!familyPart || !Array.isArray(refinedTees)) env.fail('branch did not produce px.tees.familyRefined / px.tees.refined');
  const pxSha = pxShaOf(env);
  const rowsByRingKey = new Map(s.branch.result.rows.map((r) => [ringKeyOf(r.ring), r]));
  const refined = refinedTees.map((tee, index) => {
    const row = rowsByRingKey.get(ringKeyOf(tee.has.detectRings.hole));
    return serializeTee(tee, index, pxSha, { findFamilyFn: FAMILY_FIX.refinedCalculation, extra: {
      baselineIndex: row?.baselineMember ? row.baselineMember - 1 : null,
      baselineLabel: row?.baselineMember ? String(row.baselineMember) : null,
      verdict: row?.verdict ?? null
    } });
  });
  // The witnessed baseline serializations (what the two S3 materialize FGs wrote to artifacts/s3/).
  const fields = env.get('px.components');
  return {
    familyPart, refinedTees, refined, fields,
    baseTees: env.get('px.tees').map((tee, index) => serializeTee(tee, index, pxSha)),
    baseRings: serializeRings(env.get('px.tees.rings')), baseFamily: serializeFamily(env.get('px.tees.family')),
    image: { widthPx: fields.bright.mask.width, heightPx: fields.bright.mask.height },
    captured: env.get(CAPTURED)
  };
}, { reads: [...CONSUMES, CAPTURED], calls: ['fn.tk.sha256'] });

// Every verdict re-derived from the serialized baseline Parts and the board rasters, never the branch result.
const rederived = witnessed.path('rederiveFamilyFixVerdicts', {
  name: 'serializerMatchesRederivation', as: 'rederivation', reads: ['px.badges', 'px.baskets'],
  run: (s, env) => {
    const w = rederiveFamilyFixVerdicts({ ringsPlain: s.baseRings, familyPlain: s.baseFamily, fields: s.fields, image: s.captured.image, badges: env.get('px.badges'), baskets: env.get('px.baskets') });
    const fp = s.familyPart;
    if (fp.candidates.length !== w.rows.length) return { ok: false, serializedRows: fp.candidates.length, witnessRows: w.rows.length, rowsChecked: w.rows.length };
    if (legacyCanon(fp.model) !== legacyCanon(w.model)) return { ok: false, disagrees: 'pad model', serialized: fp.model, witness: w.model, rowsChecked: w.rows.length };
    for (let i = 0; i < w.rows.length; i++) {
      const a = fp.candidates[i], r = w.rows[i];
      if (a.index !== r.index || a.baselineMember !== r.baselineMember || a.anchor !== r.anchor || a.verdict !== r.verdict
        || legacyCanon(a.failedTests) !== legacyCanon(r.failedTests) || legacyCanon(a.tests) !== legacyCanon(r.tests) || legacyCanon(a.measurements) !== legacyCanon(r.measurements))
        return { ok: false, row: i, serialized: [a.verdict, a.failedTests], witness: [r.verdict, r.failedTests], rowsChecked: w.rows.length };
      if (ringKeyOf(a.ring) !== r.ringKey) return { ok: false, row: i, disagrees: 'ring', rowsChecked: w.rows.length };
    }
    return { ok: true, rowsChecked: w.rows.length };
  }
});

const piles = step('partition and identity', (env, s) => {
  const fp = s.familyPart;
  const pileIndices = [...fp.piles.admitted, ...fp.piles.excused, ...fp.piles.eliminated].sort((a, b) => a - b);
  env.check('partitionClosed', fp.candidates.length === s.baseRings.candidates.length && legacyCanon(pileIndices) === legacyCanon(fp.candidates.map((c) => c.index)),
    { verdictRows: fp.candidates.length, baselineCandidates: s.baseRings.candidates.length });
  const correctedKeys = fp.correctedFamily.members.map((m) => ringKeyOf(m.ring)).sort();
  const pileKeys = fp.candidates.filter((c) => c.verdict !== 'ELIMINATED').map((c) => ringKeyOf(c.ring)).sort();
  env.check('correctedMembersAreAdmittedPlusExcused', legacyCanon([...new Set(correctedKeys)]) === legacyCanon([...new Set(pileKeys)]) && s.refined.length === fp.correctedFamily.members.length,
    { refinedTees: s.refined.length, correctedMembers: fp.correctedFamily.members.length });
  const changedTuples = s.refined.filter((t) => t.baselineIndex !== null && legacyCanon(teeTuple(t)) !== legacyCanon(teeTuple(s.baseTees[t.baselineIndex]))).map((t) => `refined tee ${t.index} (baseline tee ${t.baselineLabel})`);
  env.check('baselineTuplesPreserved', changedTuples.length === 0, { changedTuples });
  // The delta against the pinned baseline, recorded as data.
  const c = fp.candidates;
  return {
    verdictDelta: {
      baselineTeeCount: s.baseTees.length, correctedTeeCount: s.refined.length,
      eliminatedBaselineMembers: c.filter((x) => x.baselineMember && x.verdict === 'ELIMINATED').map((x) => ({ baselineLabel: String(x.baselineMember), center: [x.ring.cx, x.ring.cy], failedTests: x.failedTests })),
      excusedBaselineMembers: c.filter((x) => x.baselineMember && x.verdict === 'EXCUSED').map((x) => ({ baselineLabel: String(x.baselineMember), center: [x.ring.cx, x.ring.cy], failedTests: x.failedTests, occluders: x.measurements.missingEvidence?.byOccluder ?? null })),
      admittedBaselineMembers: c.filter((x) => x.baselineMember && x.verdict === 'ADMITTED').map((x) => String(x.baselineMember)),
      admittedNonMembers: c.filter((x) => !x.baselineMember && x.verdict === 'ADMITTED').map((x) => ({ center: [x.ring.cx, x.ring.cy], framed: x.framed })),
      excusedNonMembers: c.filter((x) => !x.baselineMember && x.verdict === 'EXCUSED').map((x) => ({ center: [x.ring.cx, x.ring.cy], framed: x.framed, failedTests: x.failedTests })),
      eliminatedNonMembers: c.filter((x) => !x.baselineMember && x.verdict === 'ELIMINATED').map((x) => ({ center: [x.ring.cx, x.ring.cy], framed: x.framed, failedTests: x.failedTests })),
      declaredSpecimenExpectation: { eliminatedBaselineLabels: ['16', '17', '18'], admittedNonMembers: 0, excusedBaselineMembers: 0 },
      matchesDeclaredSpecimenExpectation: null
    }
  };
});

const expectation = judged('specimenExpectation', {
  judge: (s) => {
    const d = s.verdictDelta;
    return { matches: legacyCanon(d.eliminatedBaselineMembers.map((x) => x.baselineLabel)) === legacyCanon(d.declaredSpecimenExpectation.eliminatedBaselineLabels)
      && d.admittedNonMembers.length === 0 && d.excusedBaselineMembers.length === 0 && d.admittedBaselineMembers.length === d.baselineTeeCount - 3 };
  }
});

// Renderer-binding rasters: canonical RGB with alpha zeroed on exactly the set each artifact claims.
const rasters = step('refined and eliminated rasters', (env, s) => {
  const pxSha = pxShaOf(env);
  const refinedUnion = unionOf(s.refined.map((t) => t.px));
  const refinedRgba = new Uint8ClampedArray(s.captured.image.rgba);
  for (const p of refinedUnion) refinedRgba[p * 4 + 3] = 0;
  let seq = 0;
  const eliminated = s.familyPart.candidates.filter((x) => x.verdict === 'ELIMINATED' && x.framed).map((x) => {
    const px = [];
    for (let i = 0; i < s.fields.bright.labels.length; i++) if (s.fields.bright.labels[i] === x.frame.label) px.push(i);
    return {
      label: x.baselineMember ? String(x.baselineMember) : `X${++seq}`, baselineLabel: x.baselineMember ? String(x.baselineMember) : null,
      center: [x.ring.cx, x.ring.cy], bbox: [x.frame.bboxX, x.frame.bboxY, x.frame.bboxW, x.frame.bboxH], ringBbox: [x.ring.bboxX, x.ring.bboxY, x.ring.bboxW, x.ring.bboxH],
      failedTests: x.failedTests, px, pxCount: px.length, pxSha256: pxSha(Uint32Array.from(px))
    };
  });
  const eliminatedUnion = unionOf(eliminated.map((t) => t.px));
  const eliminatedRgba = new Uint8ClampedArray(s.captured.image.rgba);
  for (const p of eliminatedUnion) eliminatedRgba[p * 4 + 3] = 0;
  env.check('serializerMatchesBranchPart', s.refinedTees.every((tee, i) => legacyCanon(s.refined[i].px) === legacyCanon([...tee.px])));
  return { refinedUnion, refinedRgba, eliminated, eliminatedUnion, eliminatedRgba };
}, { calls: ['fn.tk.sha256'] });

const assemble = step('assemble the s3fix artifacts', (env, s) => {
  const fp = s.familyPart;
  const planFingerprint = s.captured.plan.planFingerprint;
  const verdictDelta = { ...s.verdictDelta, matchesDeclaredSpecimenExpectation: s.judged.specimenExpectation.matches };
  const witnesses = { reexecution: s.witnesses.reexecution, rederivation: { rowsChecked: s.witnessReturns.rederivation?.rowsChecked ?? 0, exact: s.witnesses.rederivation.ok } };
  return {
    verdictDelta, receiptWitnesses: witnesses, planFingerprint,
    familyArtifact: {
      schema: 'nctk-s3-family-refined-artifact@1', parts: [FAMILY, TEES],
      guarantee: ID, specDelta: FAMILY_FIX.specDelta,
      calculation: FAMILY_FIX.calculation, refinedCalculation: FAMILY_FIX.refinedCalculation,
      planFingerprint, image: s.image, boundsRule: FIX_BOUNDS,
      model: fp.model, counts: fp.counts,
      candidates: fp.candidates, correctedFamily: fp.correctedFamily, piles: fp.piles,
      witnesses, delta: verdictDelta
    },
    refinedArtifact: {
      schema: 'nctk-s3-tees-refined-artifact@1', part: TEES, producedBy: FAMILY_FIX.refinedCalculation,
      guarantee: ID, teeCount: s.refined.length,
      note: 'Corrected tee set under the declared spec delta. Labels are the corrected order; baselineLabel records the baseline tee identity for members carried over unchanged.',
      planFingerprint, image: s.image,
      totals: { claimedPx: s.refinedUnion.size, claimedVisits: s.refined.reduce((n, t) => n + t.pxCount, 0) },
      tees: s.refined
    },
    eliminatedArtifact: {
      schema: 'nctk-s3-tees-eliminated-artifact@1', part: 'px.tees.eliminated', producedBy: FAMILY_FIX.refinedCalculation,
      guarantee: ID, teeCount: s.eliminated.length,
      note: 'Eliminated FRAMED candidates only: the set is each candidate frame component px. Eliminated unframed candidates have no frame pixel set and live in the verdict ledger (px.tees.family-refined.json) only.',
      planFingerprint, image: s.image,
      totals: { claimedPx: s.eliminatedUnion.size },
      tees: s.eliminated
    },
    dims: { width: s.image.widthPx, height: s.image.heightPx }
  };
});

const box = (x) => (x.frame ? [x.frame.bboxX, x.frame.bboxY, x.frame.bboxW, x.frame.bboxH] : [x.ring.bboxX, x.ring.bboxY, x.ring.bboxW, x.ring.bboxH]);
const nameOf = (x) => (x.baselineMember ? `#${x.baselineMember}` : `c${x.index}`);
const frames = framed((s) => {
  const fp = s.familyPart, c = fp.candidates, d = s.verdictDelta;
  const { widthPx, heightPx } = s.image;
  const pile = (verdict) => c.filter((x) => x.verdict === verdict).map((x) => [...box(x), nameOf(x)]);
  return [{
    title: `findFamily structural: ${fp.piles.admitted.length} admitted, ${fp.piles.excused.length} excused, ${fp.piles.eliminated.length} eliminated of ${c.length} candidates`,
    calculation: FAMILY_FIX.refinedCalculation, tick: OP.id,
    parts: [
      // palette order: eliminated red, admitted green, excused blue
      { address: `${FAMILY}#eliminated`, kind: 'bbox', data: { boxes: pile('ELIMINATED') } },
      { address: `${FAMILY}#admitted`, kind: 'bbox', data: { boxes: pile('ADMITTED') } },
      { address: `${FAMILY}#excused`, kind: 'bbox', data: { boxes: pile('EXCUSED') } },
      { address: 'px.tees.eliminated', kind: 'pxset', artifact: s.entries['px.tees.eliminated'], data: { width: widthPx, height: heightPx, px: [...s.eliminatedUnion] } },
      { address: `${FAMILY}#model`, kind: 'ledger', data: { rows: [fp.model] } },
      { address: `${FAMILY}#ledger`, kind: 'ledger', artifact: s.entries[FAMILY], data: { rows: c.map((x) => ({
        index: x.index, baselineMember: x.baselineMember ?? null, anchor: x.anchor, framed: x.framed, verdict: x.verdict,
        failedTests: x.failedTests.join(' '), center: `${x.ring.cx.toFixed(1)},${x.ring.cy.toFixed(1)}`,
        bandFill: x.measurements.frame?.bandFill ?? null,
        interiorTone: Array.isArray(x.measurements.interior?.tone) ? x.measurements.interior.tone.join(',') : null,
        interiorToneDistance: x.measurements.interior?.toneDistance ?? null,
        bandCoverage: x.measurements.bandCoverage ?? null
      })) } }
    ],
    verdicts: c.map((x) => ({ name: `candidate ${nameOf(x)}: ${x.verdict}${x.failedTests.length ? ` (${x.failedTests.join(', ')})` : ''}`, ok: x.verdict !== 'ELIMINATED' }))
  }, {
    title: `px.tees.refined: ${s.refined.length} corrected tees (baseline ${s.baseTees.length}); expectation ${d.matchesDeclaredSpecimenExpectation ? 'matched' : 'NOT matched (a finding)'}`,
    calculation: FAMILY_FIX.refinedCalculation,
    parts: [
      { address: TEES, kind: 'pxset', artifact: s.entries[TEES], data: { width: widthPx, height: heightPx, px: [...s.refinedUnion] } },
      { address: `${TEES}#bbox`, kind: 'bbox', data: { boxes: s.refined.map((t) => [...t.bbox, t.baselineLabel ?? `new${t.index}`]) } },
      { address: `${TEES}#delta`, kind: 'ledger', data: { rows: [{
        baselineTeeCount: d.baselineTeeCount, correctedTeeCount: d.correctedTeeCount,
        eliminatedBaselineMembers: d.eliminatedBaselineMembers.map((x) => x.baselineLabel).join(','),
        excusedBaselineMembers: d.excusedBaselineMembers.map((x) => x.baselineLabel).join(','),
        admittedNonMembers: d.admittedNonMembers.length, excusedNonMembers: d.excusedNonMembers.length, eliminatedNonMembers: d.eliminatedNonMembers.length,
        matchesDeclaredSpecimenExpectation: d.matchesDeclaredSpecimenExpectation
      }] } }
    ]
  }];
});

export default guarantee({
  id: ID, guards: [FAMILY, TEES], audit: [unitful({ units: UNITS, params: { FIX_BOUNDS: [FIX_BOUNDS, FIX_BOUNDS_UNITS] } })],
  result: (s) => ({ totals: s.familyPart.counts, delta: s.verdictDelta, specDelta: FAMILY_FIX.specDelta })
}, pipe(
  branchRun({
    restore: 'fn.provider.restore.S3', op: OP, site: 's3.findFamilyStructuralFix', calls: [MAKE_TEE],
    calculateWith: (env) => (rings, family, fields, image, badges, baskets, baseTees) => {
      const byRing = new Map(baseTees.map((t) => [ringKeyOf(t.has.detectRings.hole), t]));
      const makeTee = (member) => byRing.get(ringKeyOf(member.ring)) ?? env.call(MAKE_TEE, { member, fields });
      return computeFamilyFix({ rings, family, fields, image, badges, baskets, makeTee });
    },
    outputs: (fix) => ({ [FAMILY]: fix.familyPart, [TEES]: fix.tees })
  }),
  lane('s3-findfamily-structural-fix'),
  gated('fg.s3.pxTees.materialize'), gated('fg.s3.pxTeesRingsFamily.materialize'),
  subject,
  witnessed.branch({ canonical: (s, run, env) => legacyCanon({ part: run.branch.get(FAMILY), tees: run.branch.get(TEES).map((tee) => teeTuple({
    center: [...tee.center], bbox: [...tee.bbox], innerBbox: [...tee.innerBbox], angleRad: tee.angleRad, pxCount: tee.px.length, pxSha256: pxShaOf(env)(tee.px)
  })) }) }),
  rederived, piles,
  delta({ out: TEES, base: 'px.tees', by: FAMILY_FIX.refinedCalculation,
    outPx: (s) => s.refined.map((t) => [t.baselineIndex !== null ? `#${t.baselineIndex}` : `new${t.index}`, t.px]), basePx: (s) => s.baseTees.map((t, i) => [`#${i}`, t.px]) }),
  expectation, rasters,
  conserved.raster({ name: 'rastersRecounted', rasters: (s) => [{ rgba: s.refinedRgba, px: s.refinedUnion.size }, { rgba: s.eliminatedRgba, px: s.eliminatedUnion.size }] }),
  assemble,
  materialized({
    artifacts: (s) => [
      { id: FAMILY, kind: 'family-refined-json', path: 's3fix/px.tees.family-refined.json', json: s.familyArtifact },
      { id: TEES, kind: 'tee-set-json', path: 's3fix/px.tees.refined.json', json: s.refinedArtifact },
      { id: 's3fix.refinedPx.rgba', kind: 'rgba', path: 's3fix/refinedPx.rgba.bin', bytes: s.refinedRgba, dims: s.dims },
      { id: 'px.tees.eliminated', kind: 'eliminated-set-json', path: 's3fix/px.tees.eliminated.json', json: s.eliminatedArtifact },
      { id: 's3fix.eliminatedPx.rgba', kind: 'rgba', path: 's3fix/eliminatedPx.rgba.bin', bytes: s.eliminatedRgba, dims: s.dims }
    ],
    reread: (s, read) => {
      const rf = read(FAMILY), rr = read(TEES), fp = s.familyPart;
      return sameCanon(rf.candidates, fp.candidates) && sameCanon(rf.model, fp.model) && sameCanon(rf.counts, fp.counts) && sameCanon(rf.delta, s.verdictDelta)
        && rr.teeCount === s.refined.length && sameCanon(rr.tees.map((t) => t.px), s.refined.map((t) => t.px));
    }
  }),
  frames,
  published({
    stage: 'S3', key: 'familyFixMaterialization', materialization: 'S3FamilyFix',
    header: () => ({ specDelta: FAMILY_FIX.specDelta, parts: [FAMILY, TEES], producedBy: FAMILY_FIX.refinedCalculation }),
    body: (s) => ({ planFingerprint: s.planFingerprint, counts: s.familyPart.counts, model: s.familyPart.model, delta: s.verdictDelta, witnesses: s.receiptWitnesses }),
    branch: {
      key: 'S3FIX',
      benefit: 'Membership in the tee family becomes a structural verdict per candidate, so same-scale map chrome is eliminated at S3 with named failed tests instead of surviving to S4 attrition.',
      falsifier: 'A genuine pad is eliminated or excused, a chrome candidate is admitted, or an admitted tee tuple differs from the pinned baseline tuple.',
      body: (s) => ({ partAddress: FAMILY, teesPartAddress: TEES, counts: s.familyPart.counts, delta: s.verdictDelta })
    }
  })));
