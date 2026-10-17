/**
 * fg.s3.pxTeesRingsFamily.materialize (stages/s3.json): the producing Parts
 * of px.tees, px.tees.rings and px.tees.family, leave every run as an
 * inspectable artifact, witnessed by re-executing the provider's pure
 * detectTeeRings over the board's bright mask and its pure selectTeeFamily
 * over the board's measured pairs (the provider ships no rings/family
 * materializer), with partition closure checked exactly and every tee's
 * ring linked to a family member ring.
 *
 * Inputs are Parts and registered Calculations only: px.tees.rings,
 * px.tees.family, px.tees from the provider board, tk.stage.S3.captured
 * (the captured run's rings/family counts and plan fingerprint), and the
 * witnesses fn.provider.S3.detectTeeRings (inParts px.components) and
 * fn.provider.S3.selectTeeFamily.
 *
 * Ported from runEarly.mjs; artifact artifacts/s3/px.tees.rings-family.json,
 * record stages[S3].ringsFamilyMaterialization / materializations.S3RingsFamily.
 */
import { defineGuarantee } from '../guarantee.mjs';
import { legacyArtifact, prettyJsonBytes } from '../legacy.mjs';
import { serializeFamily, serializeRings } from './serialize.mjs';
import { ringKeyOf, ringTupleOf } from '../../ports/early/s3FamilyFix.mjs';

const ID = 'fg.s3.pxTeesRingsFamily.materialize';
const PARTS = ['px.tees.rings', 'px.tees.family'];
const PRODUCED_BY = 'Tee.detectRings + Tee.findFamily';
const CAPTURED = 'tk.stage.S3.captured';
const DETECT = 'fn.provider.S3.detectTeeRings';
const SELECT = 'fn.provider.S3.selectTeeFamily';

const multiset = (tuples) => { const map = new Map(); for (const t of tuples) { const k = JSON.stringify(t); map.set(k, (map.get(k) ?? 0) + 1); } return map; };
const multisetEqual = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);

export default defineGuarantee({
  id: ID,
  guards: PARTS,
  reads: [...PARTS, 'px.tees', CAPTURED],
  calls: [DETECT, SELECT],
  run(ctx) {
    const rings = ctx.get('px.tees.rings');
    const family = ctx.get('px.tees.family');
    const captured = ctx.get(CAPTURED);
    if (!rings || !family) ctx.fail('px.tees.rings or px.tees.family is missing on the board after S3');
    if (!captured?.rings || captured.rings.candidates.length !== rings.candidates.length) ctx.fail('captured S3 rings disagree with the board px.tees.rings');
    if (!captured?.family || captured.family.members.length !== family.members.length) ctx.fail('captured S3 family disagrees with the board px.tees.family');
    const serializedRings = serializeRings(rings);
    const serializedFamily = serializeFamily(family);
    const tuples = (list) => list.map(ringTupleOf);

    // Witness 1: enclosed holes re-derived from the board's bright mask.
    const witnessEnclosed = ctx.call(DETECT);
    const enclosedMatchesWitness = ctx.check('enclosedMatchesWitness', multisetEqual(multiset(tuples(serializedRings.enclosed)), multiset(tuples(witnessEnclosed))),
      { serialized: serializedRings.enclosed.length, detectTeeRings: witnessEnclosed.length });
    // Partition closure: elongated subset of enclosed; candidates and
    // excludedByBadge partition the elongated set exactly; measured rings
    // plus unframed rings reproduce the candidates.
    const enclosed = multiset(tuples(serializedRings.enclosed));
    const elongatedInEnclosed = tuples(serializedRings.elongated).every((t) => enclosed.get(JSON.stringify(t)));
    const candidatesPartitionElongated = multisetEqual(multiset([...tuples(serializedRings.candidates), ...tuples(serializedRings.excludedByBadge)]), multiset(tuples(serializedRings.elongated)));
    const framedReproducesCandidates = multisetEqual(multiset([...serializedFamily.measured.map((m) => ringTupleOf(m.ring)), ...tuples(serializedFamily.unframed)]), multiset(tuples(serializedRings.candidates)));
    const partitionClosed = ctx.check('partitionClosed', elongatedInEnclosed && candidatesPartitionElongated && framedReproducesCandidates,
      { elongatedInEnclosed, candidatesPartitionElongated, framedReproducesCandidates });
    // Witness 2: family selection re-run over the board's measured pairs.
    const witnessFamily = ctx.call(SELECT, { measured: family.measured });
    const witnessMembers = witnessFamily.members.map((m) => ringTupleOf(m.ring));
    const serializedMembers = serializedFamily.members.map((m) => ringTupleOf(m.ring));
    const membersMatch = multisetEqual(multiset(witnessMembers), multiset(serializedMembers));
    const anchorMatch = JSON.stringify(witnessFamily.anchor ? ringTupleOf(witnessFamily.anchor.ring) : null) === JSON.stringify(serializedFamily.anchor ? ringTupleOf(serializedFamily.anchor.ring) : null);
    const familyMatchesWitness = ctx.check('familyMatchesWitness', membersMatch && anchorMatch,
      { serializedMembers: serializedMembers.length, selectTeeFamilyMembers: witnessMembers.length, anchorMatch });
    // Tee linkage: every tee's ring is a family member ring, counts agree.
    const tees = ctx.get('px.tees');
    const memberKeys = new Set(serializedFamily.members.map((m) => ringKeyOf(m.ring)));
    const unlinked = tees.map((t, i) => (memberKeys.has(ringKeyOf(t.has.detectRings.hole)) ? null : i)).filter((i) => i !== null);
    const teeLinkage = ctx.check('teeLinkage', tees.length === serializedFamily.members.length && unlinked.length === 0,
      { teeCount: tees.length, memberCount: serializedFamily.members.length, unlinked });

    const planFingerprint = captured.plan.planFingerprint;
    const image = captured.image;
    const counts = {
      enclosed: serializedRings.enclosed.length, elongated: serializedRings.elongated.length,
      excludedByBadge: serializedRings.excludedByBadge.length, candidates: serializedRings.candidates.length,
      measured: serializedFamily.measured.length, unframed: serializedFamily.unframed.length,
      members: serializedFamily.members.length
    };
    const witnesses = {
      detectTeeRings: { enclosedCount: witnessEnclosed.length, exact: enclosedMatchesWitness },
      selectTeeFamily: { memberCount: witnessMembers.length, anchorExact: anchorMatch }
    };
    const artifactValue = {
      schema: 'nctk-s3-rings-family-artifact@1', parts: PARTS, producedBy: PRODUCED_BY,
      guarantee: ID, planFingerprint,
      image: { widthPx: image.widthPx, heightPx: image.heightPx },
      counts, witnesses,
      rings: serializedRings,
      family: serializedFamily
    };
    const entry = ctx.artifact('px.tees.rings-family', 'rings-family-json', prettyJsonBytes(artifactValue), undefined, { path: 's3/px.tees.rings-family.json' });
    const artifactsRehashedAfterWrite = ctx.check('artifactsRehashedAfterWrite', entry.rehashed);

    const ringBox = (r, label) => [r.bboxX, r.bboxY, r.bboxW, r.bboxH, label];
    ctx.frame({
      title: `px.tees.rings: ${counts.enclosed} enclosed, ${counts.elongated} elongated, ${counts.candidates} candidates (${counts.excludedByBadge} excluded by badge)`, calculation: 'Tee.detectRings',
      parts: [
        { address: 'px.tees.rings#candidates', kind: 'bbox', data: { boxes: serializedRings.candidates.map((r, i) => ringBox(r, `c${i}`)) } },
        { address: 'px.tees.rings#excludedByBadge', kind: 'bbox', data: { boxes: serializedRings.excludedByBadge.map((r, i) => ringBox(r, `x${i}`)) } },
        { address: 'px.tees.rings#enclosed', kind: 'points', data: { points: serializedRings.enclosed.map((r) => [r.cx, r.cy]) } },
        { address: 'px.tees.rings#counts', kind: 'ledger', data: { rows: [counts] } }
      ],
      verdicts: [{ name: 'detectTeeRings re-execution reproduces the enclosed rings', ok: enclosedMatchesWitness }, { name: 'partition closed', ok: partitionClosed }]
    });
    ctx.frame({
      title: `px.tees.family: ${counts.members} members of ${counts.measured} measured (${counts.unframed} unframed)`, calculation: 'Tee.findFamily',
      parts: [
        { address: 'px.tees.family#members', kind: 'bbox', data: { boxes: serializedFamily.members.map((m, i) => [m.frame.bboxX, m.frame.bboxY, m.frame.bboxW, m.frame.bboxH, `m${i + 1}`]) } },
        { address: 'px.tees.family#nonMembers', kind: 'bbox', data: { boxes: serializedFamily.measured.filter((m) => !memberKeys.has(ringKeyOf(m.ring))).map((m, i) => [m.frame.bboxX, m.frame.bboxY, m.frame.bboxW, m.frame.bboxH, `n${i + 1}`]) } },
        { address: 'px.tees.family#unframed', kind: 'points', data: { points: serializedFamily.unframed.map((r, i) => [r.cx, r.cy, `u${i + 1}`]) } },
        { address: 'px.tees.family#anchor', kind: 'points', data: { points: serializedFamily.anchor ? [[serializedFamily.anchor.ring.cx, serializedFamily.anchor.ring.cy, 'anchor']] : [] } }
      ],
      verdicts: [{ name: 'selectTeeFamily re-run reproduces members and anchor', ok: familyMatchesWitness }, { name: 'every tee ring is a member ring', ok: teeLinkage }]
    });

    const record = {
      guarantee: ID, parts: PARTS, producedBy: PRODUCED_BY,
      counts, witnesses,
      checks: { enclosedMatchesWitness, partitionClosed, familyMatchesWitness, teeLinkage, artifactsRehashedAfterWrite },
      artifacts: [legacyArtifact(entry)]
    };
    ctx.publish('stages.S3.ringsFamilyMaterialization', record);
    ctx.publish('materializations.S3RingsFamily', record);
    return { totals: counts, producedBy: PRODUCED_BY };
  }
});
