/**
 * fn.Tee.pairBadge / pinned: the current pinned S5 output, unchanged. The pinned S5 (ports/late runLate.mjs, --until 5)
 * measures every tee axis against every badge (late/s5-pairs.json: unowned measurements) and, with lane
 * s5.globalAssignment ON, resolves the two-ray plate hits into one-to-one pairs (late/s5-global-assignment.json
 * assignment.selected; unused tee hypotheses and unmatched badges explicit). The runner carries both as the Part
 * tk.s5.latePinned, already in the canonical frame (source y - S0 upperRowsRemoved), each badge by its holeRead.
 *
 * The pairs are the pinned S5's; only the residual is re-measured here, by the same store query the toolkit variant
 * uses (fn.q.pair.axisResidual against tk.s4.badgePlates), so the variants' records compare. The pinned S5's own
 * measures (angle residual, signed perpendicular to its own badge centroid) ride along as evidence.
 * When the attempt has no pinned S5 (lane not run) that is the recorded result: no pairs, laneNotRun says why.
 */
import { PAIR_CALLS, PAIR_UNITS } from '../../fg/queries/pair.mjs';
import { nameCandidates } from '../../fg/names.mjs';

export const reads = ['tk.s5.latePinned', 'tk.s4.badgePlates'];
export const calls = [...PAIR_CALLS];

const r3 = (v) => Math.round(v * 1000) / 1000;

export default function pinned(parts) {
  const late = parts.get('tk.s5.latePinned'), plates = parts.get('tk.s4.badgePlates');
  if (late.laneNotRun) return { rule: 'pinned S5 output', laneNotRun: late.laneNotRun, notes: [], units: PAIR_UNITS, pairs: [] };
  const plateOf = new Map(plates.map((b) => [String(b.label), b.plateCenter]));
  const selected = new Map(late.selected.map((s) => [s.teeId, s]));
  const visible = late.axes.filter((a) => a.kind === 'visible'), recovered = late.axes.filter((a) => a.kind === 'recovered');
  const vNames = nameCandidates('Tee', visible, (a) => a.center), rNames = nameCandidates('Tee', recovered, (a) => a.center).map((n) => `S4 ${n}`);
  const pairOf = (a, name, i) => {
    const s = selected.get(a.detId) ?? null, badge = s?.holeRead != null ? String(s.holeRead) : null, target = badge != null ? plateOf.get(badge) ?? null : null;
    const m = badge == null ? { angleResidualDeg: null, signedPerpPx: null, alongPx: null, distancePx: null }
      : target ? parts.call('fn.q.pair.axisResidual', { center: a.center, angleRad: a.angleRad, target }).value
        : { unavailable: `Badge ${badge} has no plate in tk.s4.badgePlates`, angleResidualDeg: null, signedPerpPx: null, alongPx: null, distancePx: null };
    return { tee: name, origin: a.kind === 'visible' ? 'S3 observed' : 'S4 recovered', teeIndex: i, center: a.center, angleRad: a.angleRad, angleDeg: r3(a.angleRad * 180 / Math.PI),
      badge, plateCenter: target, ...m,
      rule: s ? `pinned S5 global assignment (${late.assignmentStatus}): ${s.hitId}` : late.unusedTeeIds.includes(a.detId) ? 'pinned S5: unused tee hypothesis' : 'pinned S5: no pair',
      evidence: { detId: a.detId, geometrySource: a.geometrySource ?? null, pinnedAngleResidualDeg: s?.angleResidualDeg ?? null, pinnedSignedPerpPx: s?.signedPerpPx ?? null, pinnedBadgeId: s?.badgeId ?? null } };
  };
  return {
    rule: 'pinned S5 output (late/s5-global-assignment.json selected pairs), residual re-measured by fn.q.pair.axisResidual',
    laneNotRun: null, notes: late.notes ?? [], units: PAIR_UNITS,
    unmatchedBadgeIds: late.unmatchedBadgeIds, unusedTeeIds: late.unusedTeeIds,
    pairs: [...visible.map((a, i) => pairOf(a, vNames[i], i)), ...recovered.map((a, i) => pairOf(a, rNames[i], i))]
  };
}
