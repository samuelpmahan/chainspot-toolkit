/**
 * fn.Hole.straight / segmentVerify: the graduated s7main straight-hole test (docs/evidence/s7main/s3first.py step 2,
 * `seg_fit`; Sam's order: tee -> badge -> 0-bend holes by the 3-point test -> verified as one segment). A pair the
 * 3-point test calls STRAIGHT is verified as the single segment tee cap -> BasketPoint, read on unmasked stations only:
 *   S = tee centre + u * FRONT * L   (the ribbon's round cap, FRONT = 10.6 / 25.02 pad lengths ahead of the pad centre,
 *                                     u = the pad axis toward its badge, L = the course pad length: the S3 family model's
 *                                     major median, s3first.py's C.L; the association template L flips lenard 2 and 4,
 *                                     knife-edge short holes, so the recorded verdicts need this one)
 *   K = the BasketPoint the 3-point test names
 *   the best edge pair (fn.q.path.edgePair = track.py edge_pair) on stations 0.6 W .. |K - S| - 2 px with the ribbon
 *   width W (tk.s6.hallway, teebadge.py: learned on this image's tee -> badge segments), width within 1.5 px of W and
 *   centre within 1.5 px of the line; verified when its edge step score >= 6 lum/px.
 * Verified -> straight (that basket); not verified, or not STRAIGHT by the 3-point test -> bent (sent to pathfinding).
 * The math is agent B's (ports/s6straight/pathSpace.mjs fn.q.path.*); nothing is re-derived here.
 */
import { verdictRow, SEGMENT_VERIFY, capOf, segmentArgs } from '../../ports/s6straight/holeStraight.mjs';

export const reads = ['tk.s6.holePairs', 'tk.s6.baskets', 'tk.s6.hallway', 'tk.s6.padLength'];
export const calls = ['fn.q.hole.straight3', 'fn.q.path.edgePair'];

export { SEGMENT_VERIFY };   // s3first.py seg_fit as called in step 2 (s3first.py lines 64-74): ports/s6straight/holeStraight.mjs
const r2 = (v) => Math.round(v * 100) / 100;

export default function segmentVerify(parts) {
  const pairs = parts.get('tk.s6.holePairs'), baskets = parts.get('tk.s6.baskets'), hallway = parts.get('tk.s6.hallway'), L = parts.get('tk.s6.padLength')?.lengthPx ?? null;
  const W = hallway?.widthPx ?? null, V = SEGMENT_VERIFY;
  const verdicts = pairs.map((p, i) => {
    const s = parts.call('fn.q.hole.straight3', { pair: i }).value;
    if (s.condition) return verdictRow(p, 'unknown', { condition: s.condition, evidence: { test: 'segment verify' } });
    if (s.verdict !== 'STRAIGHT') return verdictRow(p, 'bent', { evidence: { test: 'segment verify', step: '3-point test not STRAIGHT: nothing to verify', tlsMaxPx: s.tlsMaxPx } });
    if (!W) return verdictRow(p, 'unknown', { condition: `no hallway width (tk.s6.hallway: ${hallway?.condition ?? 'absent'})`, evidence: { test: 'segment verify' } });
    if (!L) return verdictRow(p, 'unknown', { condition: 'no pad length (tk.s6.padLength: the S3 family model)', evidence: { test: 'segment verify' } });
    const basket = baskets[s.basket], S = capOf(p, L), { lengthPx: Lg, args } = segmentArgs(S, basket.point, W);
    const e = parts.call('fn.q.path.edgePair', args).value;
    const evidence = { test: 'segment verify', capPx: S.map(r2), segmentLengthPx: r2(Lg), hallwayWidthPx: r2(W), tlsMaxPx: s.tlsMaxPx,
      edgeWidthPx: e?.wPx != null ? r2(e.wPx) : null, edgeCentrePx: e?.cPx != null ? r2(e.cPx) : null, edgeScoreLumPerPx: e?.score != null ? r2(e.score) : null, edgeCondition: e?.condition ?? null };
    return e?.score != null && e.score >= V.minScoreLumPerPx ? verdictRow(p, 'straight', { basket, evidence })
      : verdictRow(p, 'bent', { evidence: { ...evidence, step: `3-point STRAIGHT, segment not verified (${e?.score != null ? `edge score ${r2(e.score)} < ${V.minScoreLumPerPx} lum/px` : e?.condition ?? 'no edge pair'})` } });
  });
  return { rule: 'the 3-point STRAIGHT pairs verified as one segment tee cap -> BasketPoint on unmasked stations (s3first.py seg_fit: W +- 1.5 px, centre +- 1.5 px, edge step >= 6 lum/px)', verdicts, laneNotRun: false };
}
