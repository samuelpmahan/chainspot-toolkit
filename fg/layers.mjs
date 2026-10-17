/**
 * The layer ledger shared by every materialization FG whose layer claims
 * pixels on top of earlier layers (browser-safe; not an FG file).
 *
 * S2 (baskets over the S1 badges) and S3 (tees over S1 badges + S2 baskets)
 * each used to carry their own inline copy of this arithmetic; it is one
 * rule over a stack:
 *
 *   entering = frame - (S1 owned ∪ S1 muted ∪ every prior claimed layer)
 *   leaving  = entering - claimed
 *
 * computed from sets and recounted on the canonical raster (zero every
 * consumed layer's alpha, count; zero the claimed set, count again).
 *
 * The mute-overlap finding (AlexClark, S2: 3 px): a layer's object may
 * share a few px with a badge's 2-px mute fringe (a badge drawn over a
 * basket's edge). Those px were already consumed by S1, so the set
 * arithmetic (entering - claimed) under-counts what is left by exactly
 * that overlap. That is geometry, not a broken ledger: when the claimed
 * set touches no prior OWNED set (S1 owned, any prior claimed layer) and
 * the leaving recount exceeds the set figure by exactly the claimed px
 * that fall in the mute fringe (S1 muted minus S1 owned), the ledger
 * records explainedByMuteOverlap: true, keeps the set figure as
 * setArithmeticLeavingPx, and carries the raster-recounted figure as
 * remainingLeavingPx (what the next layer will actually find entering).
 * Any other disagreement is not explained and the FG fails.
 *
 * layerLedger({ width, height, rgba, s1: { owned, muted }, priors, claimed, claimedVisits })
 *   priors   [{ name: 'S2Claimed', set }] in stack order (S2 passes [])
 *   -> { ledger, remainingRgba }
 * Ledger field names are the inline blocks' (vsS1Owned, vsS1Muted,
 * vs<prior>, vsPriorConsumed, s2ClaimedPx, priorConsumedUnionPx, ...);
 * muteFringeOverlapPx is new (the overlap the explanation is about).
 */
import { intersectCount, unionOf } from './legacy.mjs';

const lowerFirst = (s) => s[0].toLowerCase() + s.slice(1);

export function layerLedger({ width, height, rgba, s1, priors = [], claimed, claimedVisits }) {
  const framePx = width * height;
  const s1Consumed = unionOf([s1.owned, s1.muted]);
  const priorConsumed = priors.length ? unionOf([s1Consumed, ...priors.map((p) => p.set)]) : s1Consumed;
  const remainingEntering = framePx - priorConsumed.size;
  const remainingLeaving = remainingEntering - claimed.size;
  const intersections = { vsS1Owned: intersectCount(claimed, s1.owned), vsS1Muted: intersectCount(claimed, s1.muted) };
  for (const p of priors) intersections[`vs${p.name}`] = intersectCount(claimed, p.set);
  if (priors.length) intersections.vsPriorConsumed = intersectCount(claimed, priorConsumed);
  const ledger = {
    framePx,
    s1OwnedPx: s1.owned.size, s1MutedPx: s1.muted.size, s1OwnedSubsetOfMuted: intersectCount(s1.owned, s1.muted) === s1.owned.size,
    s1ConsumedUnionPx: s1Consumed.size,
    ...Object.fromEntries(priors.map((p) => [`${lowerFirst(p.name)}Px`, p.set.size])),
    ...(priors.length ? { priorConsumedUnionPx: priorConsumed.size } : {}),
    remainingEnteringPx: remainingEntering,
    claimedPx: claimed.size, claimedVisits, overlapWithinLayerPx: claimedVisits - claimed.size,
    intersections,
    remainingLeavingPx: remainingLeaving,
    balanceHolds: remainingEntering === claimed.size + remainingLeaving
  };
  // Raster recount of the stack arithmetic.
  const remainingRgba = new Uint8ClampedArray(rgba);
  for (const pixel of priorConsumed) remainingRgba[pixel * 4 + 3] = 0;
  let opaqueEntering = 0;
  for (let pixel = 0; pixel < framePx; pixel++) if (remainingRgba[pixel * 4 + 3] !== 0) opaqueEntering++;
  for (const pixel of claimed) remainingRgba[pixel * 4 + 3] = 0;
  let opaqueLeaving = 0;
  for (let pixel = 0; pixel < framePx; pixel++) if (remainingRgba[pixel * 4 + 3] !== 0) opaqueLeaving++;
  ledger.rasterRecount = { remainingEnteringPx: opaqueEntering, remainingLeavingPx: opaqueLeaving };
  ledger.rasterRecountHolds = opaqueEntering === remainingEntering && opaqueLeaving === remainingLeaving;
  let fringe = 0;
  for (const pixel of claimed) if (s1.muted.has(pixel) && !s1.owned.has(pixel)) fringe++;
  ledger.muteFringeOverlapPx = fringe;
  const touchesOwned = intersections.vsS1Owned !== 0 || priors.some((p) => intersections[`vs${p.name}`] !== 0);
  ledger.explainedByMuteOverlap = !ledger.rasterRecountHolds && opaqueEntering === remainingEntering
    && !touchesOwned && opaqueLeaving - remainingLeaving === fringe;
  if (ledger.explainedByMuteOverlap) { ledger.setArithmeticLeavingPx = remainingLeaving; ledger.remainingLeavingPx = opaqueLeaving; }
  return { ledger, remainingRgba, s1Consumed };
}

/** S1's owned and muted sets from the live px.badges Part. */
export const s1Sets = (badges) => ({ owned: unionOf(badges.map((b) => b.px)), muted: unionOf(badges.map((b) => b.has.mute.px)) });
