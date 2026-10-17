/**
 * fg.s3.pxTeesRingsFamily.materialize (stages/s3.json): the producing Parts
 * of px.tees, px.tees.rings and px.tees.family, leave every run as an
 * inspectable artifact, witnessed by re-executing the provider's pure
 * detectTeeRings over the board's bright mask and its pure selectTeeFamily
 * over the board's measured pairs (the provider ships no rings/family
 * materializer), with partition closure checked exactly and every tee's
 * ring linked to a family member ring.
 *
 * Artifact artifacts/s3/px.tees.rings-family.json (bytes unchanged); record
 * stages[S3].ringsFamilyMaterialization / materializations.S3RingsFamily.
 */
import { guarantee, pipe, read, step } from '../compose.mjs';
import { framed, materialized, published, unitful, witnessed } from '../mixins.mjs';
import { serializeFamily, serializeRings } from './serialize.mjs';
import { ringKeyOf, ringTupleOf } from '../../ports/early/s3FamilyFix.mjs';

const ID = 'fg.s3.pxTeesRingsFamily.materialize';
const PARTS = ['px.tees.rings', 'px.tees.family'];
const PRODUCED_BY = 'Tee.detectRings + Tee.findFamily';
const CAPTURED = 'tk.stage.S3.captured';
const RINGS = 'count (rings)';
const UNITS = { counts: RINGS, enclosedCount: RINGS, memberCount: 'count (members)', enclosed: RINGS, elongated: RINGS, excludedByBadge: RINGS, candidates: RINGS, measured: 'count (ring+frame pairs)', unframed: RINGS, members: 'count (members)' };

const multiset = (tuples) => { const map = new Map(); for (const t of tuples) { const k = JSON.stringify(t); map.set(k, (map.get(k) ?? 0) + 1); } return map; };
const multisetEqual = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);
const tuples = (list) => list.map(ringTupleOf);

const serialize = step('serialize rings and family', (env, s) => {
  const rings = s.parts['px.tees.rings'], family = s.parts['px.tees.family'], captured = s.parts[CAPTURED];
  if (!rings || !family) env.fail('px.tees.rings or px.tees.family is missing on the board after S3');
  if (!captured?.rings || captured.rings.candidates.length !== rings.candidates.length) env.fail('captured S3 rings disagree with the board px.tees.rings');
  if (!captured?.family || captured.family.members.length !== family.members.length) env.fail('captured S3 family disagrees with the board px.tees.family');
  return { rings: serializeRings(rings), family: serializeFamily(family) };
});

// Enclosed holes re-derived from the board's bright mask.
const detect = witnessed.provider('fn.provider.S3.detectTeeRings', {
  name: 'enclosedMatchesWitness', as: 'detectTeeRings',
  run: (call, s) => {
    const enclosed = call();
    return { ok: multisetEqual(multiset(tuples(s.rings.enclosed)), multiset(tuples(enclosed))), serialized: s.rings.enclosed.length, detectTeeRings: enclosed.length };
  }
});

// Partition closure: elongated within enclosed; candidates + excludedByBadge partition elongated; measured + unframed reproduce candidates.
const partition = step('partition closure', (env, s) => {
  const enclosed = multiset(tuples(s.rings.enclosed));
  const elongatedInEnclosed = tuples(s.rings.elongated).every((t) => enclosed.get(JSON.stringify(t)));
  const candidatesPartitionElongated = multisetEqual(multiset([...tuples(s.rings.candidates), ...tuples(s.rings.excludedByBadge)]), multiset(tuples(s.rings.elongated)));
  const framedReproducesCandidates = multisetEqual(multiset([...s.family.measured.map((m) => ringTupleOf(m.ring)), ...tuples(s.family.unframed)]), multiset(tuples(s.rings.candidates)));
  env.check('partitionClosed', elongatedInEnclosed && candidatesPartitionElongated && framedReproducesCandidates, { elongatedInEnclosed, candidatesPartitionElongated, framedReproducesCandidates });
});

// Family selection re-run over the board's measured pairs.
const select = witnessed.provider('fn.provider.S3.selectTeeFamily', {
  name: 'familyMatchesWitness', as: 'selectTeeFamily',
  run: (call, s) => {
    const w = call({ measured: s.parts['px.tees.family'].measured });
    const witnessMembers = w.members.map((m) => ringTupleOf(m.ring));
    const serializedMembers = s.family.members.map((m) => ringTupleOf(m.ring));
    const anchorMatch = JSON.stringify(w.anchor ? ringTupleOf(w.anchor.ring) : null) === JSON.stringify(s.family.anchor ? ringTupleOf(s.family.anchor.ring) : null);
    return { ok: multisetEqual(multiset(witnessMembers), multiset(serializedMembers)) && anchorMatch, serializedMembers: serializedMembers.length, selectTeeFamilyMembers: witnessMembers.length, anchorMatch };
  }
});

const assemble = step('tee linkage and the artifact', (env, s) => {
  const tees = env.get('px.tees');
  const memberKeys = new Set(s.family.members.map((m) => ringKeyOf(m.ring)));
  const unlinked = tees.map((t, i) => (memberKeys.has(ringKeyOf(t.has.detectRings.hole)) ? null : i)).filter((i) => i !== null);
  env.check('teeLinkage', tees.length === s.family.members.length && unlinked.length === 0, { teeCount: tees.length, memberCount: s.family.members.length, unlinked });
  const captured = s.parts[CAPTURED];
  const counts = {
    enclosed: s.rings.enclosed.length, elongated: s.rings.elongated.length,
    excludedByBadge: s.rings.excludedByBadge.length, candidates: s.rings.candidates.length,
    measured: s.family.measured.length, unframed: s.family.unframed.length,
    members: s.family.members.length
  };
  const witnesses = {
    detectTeeRings: { enclosedCount: s.provided.detectTeeRings.length, exact: s.witnesses.detectTeeRings.ok },
    selectTeeFamily: { memberCount: s.provided.selectTeeFamily.members.length, anchorExact: s.witnesses.selectTeeFamily.detail?.anchorMatch ?? false }
  };
  return {
    counts, witnessSummary: witnesses, memberKeys,
    artifact: {
      schema: 'nctk-s3-rings-family-artifact@1', parts: PARTS, producedBy: PRODUCED_BY,
      guarantee: ID, planFingerprint: captured.plan.planFingerprint,
      image: { widthPx: captured.image.widthPx, heightPx: captured.image.heightPx },
      counts, witnesses,
      rings: s.rings,
      family: s.family
    }
  };
}, { reads: ['px.tees'] });

const ringBox = (r, label) => [r.bboxX, r.bboxY, r.bboxW, r.bboxH, label];
const held = (env, name) => env.verdicts.find((v) => v.name === name)?.ok === true;
const frames = framed((s, env) => {
  const { counts, rings, family, memberKeys } = s;
  return [{
    title: `px.tees.rings: ${counts.enclosed} enclosed, ${counts.elongated} elongated, ${counts.candidates} candidates (${counts.excludedByBadge} excluded by badge)`, calculation: 'Tee.detectRings',
    parts: [
      { address: 'px.tees.rings#candidates', kind: 'bbox', data: { boxes: rings.candidates.map((r, i) => ringBox(r, `c${i}`)) } },
      { address: 'px.tees.rings#excludedByBadge', kind: 'bbox', data: { boxes: rings.excludedByBadge.map((r, i) => ringBox(r, `x${i}`)) } },
      { address: 'px.tees.rings#enclosed', kind: 'points', data: { points: rings.enclosed.map((r) => [r.cx, r.cy]) } },
      { address: 'px.tees.rings#counts', kind: 'ledger', data: { rows: [counts] } }
    ],
    verdicts: [{ name: 'detectTeeRings re-execution reproduces the enclosed rings', ok: s.witnesses.detectTeeRings.ok }, { name: 'partition closed', ok: held(env, 'partitionClosed') }]
  }, {
    title: `px.tees.family: ${counts.members} members of ${counts.measured} measured (${counts.unframed} unframed)`, calculation: 'Tee.findFamily',
    parts: [
      { address: 'px.tees.family#members', kind: 'bbox', data: { boxes: family.members.map((m, i) => [m.frame.bboxX, m.frame.bboxY, m.frame.bboxW, m.frame.bboxH, `m${i + 1}`]) } },
      { address: 'px.tees.family#nonMembers', kind: 'bbox', data: { boxes: family.measured.filter((m) => !memberKeys.has(ringKeyOf(m.ring))).map((m, i) => [m.frame.bboxX, m.frame.bboxY, m.frame.bboxW, m.frame.bboxH, `n${i + 1}`]) } },
      { address: 'px.tees.family#unframed', kind: 'points', data: { points: family.unframed.map((r, i) => [r.cx, r.cy, `u${i + 1}`]) } },
      { address: 'px.tees.family#anchor', kind: 'points', data: { points: family.anchor ? [[family.anchor.ring.cx, family.anchor.ring.cy, 'anchor']] : [] } }
    ],
    verdicts: [{ name: 'selectTeeFamily re-run reproduces members and anchor', ok: s.witnesses.selectTeeFamily.ok }, { name: 'every tee ring is a member ring', ok: held(env, 'teeLinkage') }]
  }];
});

export default guarantee({
  id: ID, guards: PARTS, audit: [unitful({ units: UNITS })],
  result: (s) => ({ totals: s.counts, producedBy: PRODUCED_BY })
}, pipe(read(...PARTS, CAPTURED),
  serialize, detect, partition, select, assemble,
  materialized({ artifacts: (s) => [{ id: 'px.tees.rings-family', kind: 'rings-family-json', path: 's3/px.tees.rings-family.json', json: s.artifact }] }),
  frames,
  published({
    stage: 'S3', key: 'ringsFamilyMaterialization', materialization: 'S3RingsFamily',
    header: () => ({ parts: PARTS, producedBy: PRODUCED_BY }),
    body: (s) => ({ counts: s.counts, witnesses: s.witnessSummary })
  })));
