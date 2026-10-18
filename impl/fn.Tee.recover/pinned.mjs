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
import { SLOT_READS, createRecoveryContext, recoveryInputs, evaluatePose, recoveredTee } from '../../ports/s4recover/teeRecover.mjs';

export const reads = [...SLOT_READS, 'tk.s4.lateGeometry'];

export default function pinned(parts) {
  const geometry = parts.get('tk.s4.lateGeometry');
  const ctx = createRecoveryContext(recoveryInputs(parts.get));
  const unplaced = [];
  const recovered = (ctx.tpl ? geometry.recovered : []).flatMap((r) => {
    const bi = ctx.badges.findIndex((b) => b.label === r.holeRead);
    if (bi < 0) { unplaced.push({ detId: r.detId, holeRead: r.holeRead, reason: 'names a hole no S1 badge carries' }); return []; }
    const e = evaluatePose(ctx, r.center[0], r.center[1], r.angleRad, { collect: true });
    const tee = recoveredTee(ctx, bi, e, { rule: 'pinned S4 broadRecovery (refinedAxes.recovered)', s4: { detId: r.detId, resultRef: r.resultRef, observedPixelCount: r.observedPixelCount, sizePx: r.sizePx, geometrySource: r.geometrySource } });
    return [{ ...tee, sizePx: r.sizePx, accepted: true }];
  });
  const got = new Set(recovered.map((t) => t.badgeIndex));
  const assigned = new Set(ctx.assignment.map((a) => a.badge));
  return {
    rule: 'pinned S4 output, re-measured evidence only',
    template: ctx.tpl, assignment: ctx.assignment,
    need: Math.max(0, ctx.badges.length - ctx.tees.length),
    recovered, unplaced,
    missed: ctx.badges.map((b, i) => i).filter((i) => !assigned.has(i) && !got.has(i)).map((i) => ({ badgeIndex: i, hole: ctx.badges[i].label, reason: ctx.tpl ? 'pinned S4 recovered no tee for this badge' : `no pad template: ${ctx.unavailable}` }))
  };
}
