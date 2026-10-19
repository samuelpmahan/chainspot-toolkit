/**
 * fn.Hole.straight / pathLoss: DOCTRINE S6 "objective path loss along tee to basket", alpha-informed. The fifth variant,
 * included by default and judged like the others. A MATCHING RULE over tk.s6.pairFeatures (ports/s6straight/matching.mjs): a pair the
 * 3-point rule calls STRAIGHT is read as the single segment tee cap -> its BasketPoint (segmentVerify's stations); the
 * scoring half (tk.s6.feature.overlay) wrote the overlay fraction of the fitted path colour (tk.s7.alphaProfile) per
 * station; a station carries the path when its fraction >= half the fitted path alpha; straight when the median station
 * carries it (overlay passFrac >= 0.5, fn.q.path.overlayPass), else bent; not STRAIGHT by the 3-point test -> bent.
 * Without a fitted path class the variant records why (`no alpha profile`) and is excluded from acceptance (laneNotRun).
 */
import { pathLossRule, MIN_PASS_FRAC } from '../../ports/s6straight/matching.mjs';

export const reads = ['tk.s6.pairFeatures'];
export const calls = ['fn.q.path.overlayPass'];
export { MIN_PASS_FRAC };

export default function pathLoss(parts) {
  return pathLossRule(parts.get('tk.s6.pairFeatures'), { pass: (overlayFrac, thresholdFrac) => parts.call('fn.q.path.overlayPass', { overlayFrac, thresholdFrac, stepPx: 1 }).value });
}
