/**
 * fn.Hole.straight / straight3: Sam's 3-point straight test, per tee-badge pair after S4. A hole is straight when the
 * tee centre, the badge centre and a BasketPoint are collinear (TLS max residual <= ASSOC_BOUNDS.straight3TlsPx); the
 * basket is the first one the line reaches. The math is ports/s3assoc/associate.mjs straight3Test, asked through
 * fn.q.hole.straight3; nothing is rewritten here. The test cannot tell a bent hole from a straight one whose basket no
 * stage found: that case is recorded as bent with its evidence (sent to pathfinding, the safe side).
 */
import { verdictRow } from '../../ports/s6straight/holeStraight.mjs';

export const reads = ['tk.s6.holePairs', 'tk.s6.baskets'];
export const calls = ['fn.q.hole.straight3'];

export default function straight3(parts) {
  const pairs = parts.get('tk.s6.holePairs'), baskets = parts.get('tk.s6.baskets');
  const verdicts = pairs.map((p, i) => {
    const s = parts.call('fn.q.hole.straight3', { pair: i }).value;
    if (s.condition) return verdictRow(p, 'unknown', { condition: s.condition, evidence: { test: '3-point' } });
    const evidence = { test: '3-point', tlsMaxPx: s.tlsMaxPx, tlsBoundPx: s.tlsBoundPx, latPx: s.latPx, alongPx: s.alongPx, nextTlsMaxPx: s.nextTlsMaxPx, nearestBasket: s.basketName };
    return s.verdict === 'STRAIGHT' ? verdictRow(p, 'straight', { basket: baskets[s.basket], evidence })
      : verdictRow(p, 'bent', { evidence: { ...evidence, note: 'no BasketPoint within the bound: bent, or its basket unseen' } });
  });
  return { rule: 'tee centre, badge centre, BasketPoint collinear (TLS max <= 1.5 px); first basket on the line', verdicts, laneNotRun: false };
}
