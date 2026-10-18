/**
 * fn.Hole.straight / pinned: the pinned late S6 (ports/late/runLate.mjs, --until 6): both tee axis rays are cast through
 * the badge plates and on to every basket's predicted template top; a row whose top lies on the ray is a
 * TWO_RAY_ZERO_BEND_GEOMETRY_CANDIDATE. Per pair (same badge, late tee within the tee match rule of the pair's tee) a
 * candidate row reads straight, rows without one read bent, no row reads unknown. Its basket is the S2/S4 basket whose
 * BasketPoint lies within the basket match rule of the template top's. An attempt run short of --until 6 has no rows:
 * every pair records 'lane not run' and the variant is excluded from acceptance.
 */
import { verdictRow, LANE_NOT_RUN } from '../../ports/s6straight/holeStraight.mjs';

export const reads = ['tk.s6.holePairs', 'tk.s6.baskets'];
export const calls = ['fn.q.hole.pinned'];

export default function pinned(parts) {
  const pairs = parts.get('tk.s6.holePairs'), baskets = parts.get('tk.s6.baskets');
  const verdicts = pairs.map((p, i) => {
    const r = parts.call('fn.q.hole.pinned', { pair: i }).value;
    if (r.condition) return verdictRow(p, 'unknown', { condition: r.condition, evidence: { test: 'pinned two-ray', rows: r.rows ?? null } });
    const evidence = { test: 'pinned two-ray', row: r.row, status: r.status, reasons: r.reasons.join('+'), rows: r.rows, candidates: r.candidates, topSignedPerpPx: r.topSignedPerpPx, badgeSignedPerpPx: r.badgeSignedPerpPx, teeErrorPx: r.teeErrorPx, pinnedBasket: r.pinnedBasket };
    if (!r.candidates) return verdictRow(p, 'bent', { evidence });
    if (!r.basket) return verdictRow(p, 'unknown', { evidence, condition: `pinned ${r.pinnedBasket} matches no S2/S4 basket within 12 px` });
    return verdictRow(p, 'straight', { basket: baskets[r.basket.index], evidence: { ...evidence, basketErrorPx: r.basket.errorPx } });
  });
  const laneNotRun = verdicts.length > 0 && verdicts.every((v) => v.condition?.startsWith(LANE_NOT_RUN));
  return { rule: 'pinned late S6 two-ray rows: a zero-bend candidate row for the pair reads straight', verdicts, laneNotRun };
}
