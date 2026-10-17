/**
 * fg.s3.teeFamily.materialize (stages/s3.json; lane s3-findfamily-forkjoin,
 * default OFF): on a fork-join branch, the member set an implementation of
 * fn.Tee.findFamily admitted leaves as an inspectable artifact with every
 * member's pose (ring center, frame angle, frame bbox), and the set is
 * checked to be a set of the S3 candidates: every member's ring is one of
 * px.tees.rings' candidate rings (an implementation chooses among
 * candidates; it never invents a ring), no ring is admitted twice, and every
 * pose is finite with its center inside its frame bbox.
 *
 * The same FG runs on every branch, so the member records of competing
 * implementations have the same shape and the comparison is in the Parts.
 */
import { guarantee, pipe, read, step } from '../compose.mjs';
import { framed, lane, materialized, unitful } from '../mixins.mjs';
import { TEE_FAMILY_SLOT } from './teeFamily.mjs';

const { part: PART, slot: SLOT } = TEE_FAMILY_SLOT;
const ringKey = (r) => [r.cx, r.cy, ...r.bbox].join(',');
const UNITS = { holeArea: 'px', frameLabel: 'component label id', evidence: 'implementation-defined (impl/fn.Tee.findFamily/<name>.mjs)', badPose: 'ordinal (member index)', notCandidate: 'ordinal (member index)', members: 'count', candidates: 'count' };

const members = step('members are poses of candidates', (env, s) => {
  const value = s.parts[PART];
  if (!value || !Array.isArray(value.members)) env.fail(`${PART} is not { implementation, members: [...] }`);
  const list = value.members;
  const candidates = s.parts['px.tees.rings'].candidates;
  const candidateKeys = new Set(candidates.map((r) => ringKey({ cx: r.cx, cy: r.cy, bbox: [r.bboxX, r.bboxY, r.bboxW, r.bboxH] })));
  const finite = (...v) => v.every(Number.isFinite);
  const badPose = list.map((m, i) => {
    const ok = Array.isArray(m.center) && Array.isArray(m.bbox) && m.bbox.length === 4 && finite(...m.center, m.angleRad, ...m.bbox)
      && m.bbox[2] > 0 && m.bbox[3] > 0
      && m.center[0] >= m.bbox[0] && m.center[0] <= m.bbox[0] + m.bbox[2] && m.center[1] >= m.bbox[1] && m.center[1] <= m.bbox[1] + m.bbox[3];
    return ok ? null : i;
  }).filter((i) => i !== null);
  env.check('posesFinite', badPose.length === 0, { badPose });
  const notCandidate = list.map((m, i) => (m.ring && candidateKeys.has(ringKey(m.ring)) ? null : i)).filter((i) => i !== null);
  env.check('membersAreCandidates', notCandidate.length === 0, { notCandidate, candidatesCount: candidates.length });
  const keys = list.map((m) => (m.ring ? ringKey(m.ring) : null));
  const twice = keys.filter((k, i) => k !== null && keys.indexOf(k) !== i);
  env.check('noRingTwice', twice.length === 0, { twice });
  const rows = list.map((m, index) => ({
    index, center: m.center, angleRad: m.angleRad, bbox: m.bbox, frameLabel: m.frameLabel ?? null,
    holeArea: m.ring?.holeArea ?? null, evidence: m.evidence ?? null
  }));
  return { implementation: value.implementation, list, candidates, rows, totals: { members: list.length, candidates: candidates.length } };
});

export default guarantee({
  id: TEE_FAMILY_SLOT.materialize, guards: [PART], site: 'forkjoin', audit: [unitful({ units: UNITS })],
  result: (s) => ({ totals: s.totals, implementation: s.implementation, members: s.rows })
}, pipe(read(PART, 'px.tees.rings'),
  lane(TEE_FAMILY_SLOT.lane),
  members,
  materialized({ artifacts: (s) => [{ id: 'members', kind: 'tee-family-members-json', path: 'members.json', canonical: {
    schema: 'nctk-s3-tee-family-members@1', slot: SLOT, part: PART, implementation: s.implementation,
    guarantee: TEE_FAMILY_SLOT.materialize, candidateCount: s.candidates.length, memberCount: s.list.length, members: s.rows
  } }] }),
  framed((s) => [{
    title: `${s.implementation}: ${s.list.length} of ${s.candidates.length} candidates admitted`, calculation: SLOT,
    parts: [
      { address: PART, kind: 'bbox', data: { boxes: s.list.map((m, i) => [...m.bbox, `#${i}`]) } },
      { address: `${PART}#centers`, kind: 'points', data: { points: s.list.map((m, i) => [...m.center, `#${i}`]) } },
      { address: `${PART}#ledger`, kind: 'ledger', data: { rows: s.rows.map(({ evidence, ...r }) => ({ ...r, evidence: evidence ? JSON.stringify(evidence) : null })) } },
      { address: `${PART}#artifact`, kind: 'scalar', artifact: s.entries.members, data: { value: s.list.length, unit: 'members' } }
    ]
  }])));
