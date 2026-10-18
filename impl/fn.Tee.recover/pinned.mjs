/**
 * fn.Tee.recover / pinned: the current S4 output, unchanged. The pinned S4
 * (ports/late, broadRecovery) writes its recovered tees to
 * stage-output/late/geometry.json refinedAxes.recovered in SOURCE px; the
 * runner carries them as the Part tk.s4.lateGeometry already converted to
 * the canonical frame (y - S0 upperRowsRemoved) with each one's badge read
 * from its resultRef ('tee-shard-badge-<plate index>-...' -> badgePlates
 * [index].holeRead).
 *
 * The pose is S4's; only the EVIDENCE fields are re-measured here, by the
 * same occlusion-aware template evaluator the greedy implementations use
 * (ports/s4recover/teeRecover.mjs evaluatePose), so the three branches'
 * records are comparable. S4's own observed px count is kept beside it.
 */
import { SLOT_CALLS } from '../../ports/s4recover/teeRecover.mjs';
import { storeQueries } from '../../ports/s4recover/poseSpace.mjs';

export const reads = ['tk.s4.lateGeometry'];
export const calls = [...SLOT_CALLS];

export default function pinned(parts) {
  const geometry = parts.get('tk.s4.lateGeometry');
  const q = storeQueries(parts.call), ov = q('overview', {});
  const unplaced = [];
  const recovered = (ov.template ? geometry.recovered : []).flatMap((r) => {
    const bi = ov.badges.findIndex((b) => b.label === r.holeRead);
    if (bi < 0) { unplaced.push({ detId: r.detId, holeRead: r.holeRead, reason: 'names a hole no S1 badge carries' }); return []; }
    const tee = q('describe', { badge: bi, center: r.center, angleRad: r.angleRad, extra: { rule: 'pinned S4 broadRecovery (refinedAxes.recovered)', s4: { detId: r.detId, resultRef: r.resultRef, observedPixelCount: r.observedPixelCount, sizePx: r.sizePx, geometrySource: r.geometrySource } } });
    return [{ ...tee, sizePx: r.sizePx, accepted: true }];
  });
  const got = new Set(recovered.map((t) => t.badgeIndex));
  const assigned = new Set(ov.assignment.map((a) => a.badge));
  return {
    rule: 'pinned S4 output, re-measured evidence only',
    template: ov.template, assignment: ov.assignment,
    need: ov.need,
    recovered, unplaced,
    missed: ov.badges.filter((b) => !assigned.has(b.index) && !got.has(b.index)).map((b) => ({ badgeIndex: b.index, hole: b.label, reason: ov.template ? 'pinned S4 recovered no tee for this badge' : `no pad template: ${ov.unavailable}` }))
  };
}
