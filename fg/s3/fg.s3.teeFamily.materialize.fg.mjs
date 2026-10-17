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
import { defineGuarantee } from '../guarantee.mjs';
import { TEE_FAMILY_SLOT } from './teeFamily.mjs';

const { part: PART, slot: SLOT } = TEE_FAMILY_SLOT;
const ringKey = (r) => [r.cx, r.cy, ...r.bbox].join(',');

export default defineGuarantee({
  id: TEE_FAMILY_SLOT.materialize,
  guards: [PART],
  reads: [PART, 'px.tees.rings'],
  lane: TEE_FAMILY_SLOT.lane,
  run(ctx) {
    const value = ctx.get(PART);
    if (!value || !Array.isArray(value.members)) ctx.fail(`${PART} is not { implementation, members: [...] }`);
    const members = value.members;
    const candidates = ctx.get('px.tees.rings').candidates;
    const candidateKeys = new Set(candidates.map((r) => ringKey({ cx: r.cx, cy: r.cy, bbox: [r.bboxX, r.bboxY, r.bboxW, r.bboxH] })));
    const finite = (...v) => v.every(Number.isFinite);
    const badPose = members.map((m, i) => {
      const ok = Array.isArray(m.center) && Array.isArray(m.bbox) && m.bbox.length === 4 && finite(...m.center, m.angleRad, ...m.bbox)
        && m.bbox[2] > 0 && m.bbox[3] > 0
        && m.center[0] >= m.bbox[0] && m.center[0] <= m.bbox[0] + m.bbox[2] && m.center[1] >= m.bbox[1] && m.center[1] <= m.bbox[1] + m.bbox[3];
      return ok ? null : i;
    }).filter((i) => i !== null);
    ctx.check('posesFinite', badPose.length === 0, { badPose });
    const notCandidate = members.map((m, i) => (m.ring && candidateKeys.has(ringKey(m.ring)) ? null : i)).filter((i) => i !== null);
    ctx.check('membersAreCandidates', notCandidate.length === 0, { notCandidate, candidates: candidates.length });
    const keys = members.map((m) => (m.ring ? ringKey(m.ring) : null));
    const twice = keys.filter((k, i) => k !== null && keys.indexOf(k) !== i);
    ctx.check('noRingTwice', twice.length === 0, { twice });

    const rows = members.map((m, index) => ({
      index, center: m.center, angleRad: m.angleRad, bbox: m.bbox, frameLabel: m.frameLabel ?? null,
      holeArea: m.ring?.holeArea ?? null, evidence: m.evidence ?? null
    }));
    const artifact = ctx.artifact('members', 'tee-family-members-json', {
      schema: 'nctk-s3-tee-family-members@1', slot: SLOT, part: PART, implementation: value.implementation,
      guarantee: TEE_FAMILY_SLOT.materialize, candidateCount: candidates.length, memberCount: members.length, members: rows
    }, undefined, { path: 'members.json' });
    ctx.frame({
      title: `${value.implementation}: ${members.length} of ${candidates.length} candidates admitted`, calculation: SLOT,
      parts: [
        { address: PART, kind: 'bbox', data: { boxes: members.map((m, i) => [...m.bbox, `#${i}`]) } },
        { address: `${PART}#centers`, kind: 'points', data: { points: members.map((m, i) => [...m.center, `#${i}`]) } },
        { address: `${PART}#ledger`, kind: 'ledger', data: { rows: rows.map(({ evidence, ...r }) => ({ ...r, evidence: evidence ? JSON.stringify(evidence) : null })) } },
        { address: `${PART}#artifact`, kind: 'scalar', artifact, data: { value: members.length, unit: 'members' } }
      ]
    });
    return { totals: { members: members.length, candidates: candidates.length }, implementation: value.implementation, members: rows };
  }
});
