/**
 * fn.Hole.straight / assigned: Sam (2026-10-18): "the ABFeature era paired all badge -> basket endpoints and scored them
 * and THAT'S how it was able to assume known endpoints + work backwards." Every hole's straight segment is scored to
 * EVERY basket candidate (S2 + S4 recovered BasketPoints), not only the one on its axis: from its tee's cap (a tee-badge
 * pair; capOf) or, for a badge with no tee, from the badge centre. The score is the segment's edge step (lum/px) from
 * fn.q.path.edgePair with segmentVerify's arguments (s3first.py seg_fit); a segment with no edge pair is no edge. The
 * provider's exact matcher (maximumWeightTeeBadgeMatching: cardinality first, then score) assigns one basket per hole;
 * a pair whose assigned basket passes the segment verify (score >= 6 lum/px) is straight with that basket, else bent.
 * The s7edge rule "two straight holes on one BasketPoint: the one whose ribbon caps there keeps it" is this assignment
 * in miniature.
 */
import { verdictRow, SEGMENT_VERIFY, capOf, segmentArgs } from '../../ports/s6straight/holeStraight.mjs';
import { assignHolesToBaskets } from '../../ports/s6straight/assign.mjs';

export const reads = ['tk.s6.holePairs', 'tk.s6.baskets', 'tk.s6.badgeCenters', 'tk.s6.hallway', 'tk.s6.padLength'];
export const calls = ['fn.q.path.edgePair'];
const r2 = (v) => Math.round(v * 100) / 100;

export default function assigned(parts) {
  const pairs = parts.get('tk.s6.holePairs'), baskets = parts.get('tk.s6.baskets'), badges = parts.get('tk.s6.badgeCenters');
  const W = parts.get('tk.s6.hallway')?.widthPx ?? null, L = parts.get('tk.s6.padLength')?.lengthPx ?? null, V = SEGMENT_VERIFY;
  if (!W || !L) {
    const condition = !W ? 'no hallway width (tk.s6.hallway)' : 'no pad length (tk.s6.padLength)';
    return { rule: 'assigned', verdicts: pairs.map((p) => verdictRow(p, 'unknown', { condition, evidence: { test: 'assigned' } })), laneNotRun: false };
  }
  const withTee = new Set(pairs.map((p) => p.hole));
  // the holes: every tee-badge pair from its cap, every badge with no tee from its centre (it competes for its basket too)
  const holes = [...pairs.map((p, i) => ({ id: p.id, label: p.hole, order: i, center: p.tee.center, start: capOf(p, L), pair: p })),
    ...badges.filter((b) => !withTee.has(b.label)).map((b, i) => ({ id: `B${b.label}`, label: b.label, order: pairs.length + i, center: b.center, start: b.center, pair: null }))];
  const edges = [], scored = new Map();
  for (const h of holes) for (const k of baskets) {
    const { lengthPx, args } = segmentArgs(h.start, k.point, W);
    if (!(lengthPx - V.trim1Px > W * V.trim0OfWidth)) continue;   // no stations
    const e = parts.call('fn.q.path.edgePair', args).value;
    if (e?.score == null) continue;
    edges.push({ hole: h.id, basket: k.index, score: e.score });
    scored.set(`${h.id} ${k.index}`, { e, lengthPx });
  }
  const { locks } = assignHolesToBaskets(holes, baskets, edges);
  const verdicts = pairs.map((p) => {
    const lock = locks.get(p.id), own = edges.filter((x) => x.hole === p.id).sort((a, b) => b.score - a.score);
    const best = own[0] ? { basket: baskets[own[0].basket].name, scoreLumPerPx: r2(own[0].score) } : null;
    if (!lock) return verdictRow(p, 'bent', { evidence: { test: 'assigned', step: 'no basket assigned (no scored segment left for this hole)', edges: own.length, bestBasket: best?.basket ?? null, bestScoreLumPerPx: best?.scoreLumPerPx ?? null } });
    const basket = baskets[lock.basket], { e, lengthPx } = scored.get(`${p.id} ${lock.basket}`);
    const evidence = { test: 'assigned', assignedBasket: basket.name, edgeScoreLumPerPx: r2(e.score), edgeWidthPx: r2(e.wPx), edgeCentrePx: r2(e.cPx), segmentLengthPx: r2(lengthPx),
      runnerUpMarginLumPerPx: lock.runnerUpMargin != null ? r2(lock.runnerUpMargin) : null, edges: own.length, bestBasket: best?.basket ?? null, bestScoreLumPerPx: best?.scoreLumPerPx ?? null };
    return e.score >= V.minScoreLumPerPx ? verdictRow(p, 'straight', { basket, evidence })
      : verdictRow(p, 'bent', { evidence: { ...evidence, step: `assigned ${basket.name}, segment not verified (edge score ${r2(e.score)} < ${V.minScoreLumPerPx} lum/px)` } });
  });
  return { rule: 'every hole scored to every BasketPoint (segment edge step), one to one by the provider matcher (cardinality, then score); straight when the assigned segment verifies (>= 6 lum/px)', verdicts, laneNotRun: false,
    assignment: holes.map((h) => ({ hole: h.id, label: h.label, from: h.pair ? 'tee cap' : 'badge (no tee)', basket: locks.has(h.id) ? baskets[locks.get(h.id).basket].name : null, scoreLumPerPx: locks.has(h.id) ? r2(locks.get(h.id).score) : null })), edgesCount: edges.length };
}
