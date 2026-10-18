/**
 * Holes -> baskets, one to one, by the provider's exact sparse matcher (node-only: it loads the pinned provider's CJS
 * dist, as ports/late/behavior/assignment.mjs does). Sam (2026-10-18): "the ABFeature era paired all badge -> basket
 * endpoints and scored them and THAT'S how it was able to assume known endpoints + work backwards."
 *
 * maximumWeightTeeBadgeMatching(candidates, { badges, tees }) maximises the number of real edges first, then the total
 * score (Hungarian; a missing edge is never a zero-score edge). Here its "badge" side is the hole (a tee-badge pair, or
 * a badge with no tee) and its "tee" side is the basket candidate; the score of an edge is the straight segment's edge
 * step (lum/px) from the hole's start to the BasketPoint. Only scored segments are edges.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
export const MATCHER_PATH = fileURLToPath(new URL('../../source/provider/packages/alg/dist/detectors/threeFactor/features/g4.teeBadgeLockMath.js', import.meta.url));
const { maximumWeightTeeBadgeMatching } = require(MATCHER_PATH);

/** holes: [{ id, order, center }]; baskets: [{ index }]; edges: [{ hole, basket, score }] -> Map(hole id -> { basket, score, runnerUpMargin }). */
export function assignHolesToBaskets(holes, baskets, edges) {
  const kid = (k) => `K${String(k).padStart(4, '0')}`;
  const m = maximumWeightTeeBadgeMatching(edges.map((e) => ({ badgeId: e.hole, teeId: kid(e.basket), score: e.score })), {
    badges: holes.map((h) => ({ detId: h.id, label: h.label ?? '', cxPx: h.center[0], cyPx: h.center[1], order: h.order })),
    tees: baskets.map((k, i) => ({ detId: kid(k.index), order: i }))
  });
  return { locks: new Map(m.locks.map((l) => [l.badgeId, { basket: Number(l.teeId.slice(1)), score: l.score, runnerUpMargin: l.runnerUpMargin }])), unmatched: m.unmatchedBadgeIds, unusedBaskets: m.unusedTeeIds.map((t) => Number(t.slice(1))) };
}
