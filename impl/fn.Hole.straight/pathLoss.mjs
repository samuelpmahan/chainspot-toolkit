/**
 * fn.Hole.straight / pathLoss: DOCTRINE S6 "objective path loss along tee to basket", alpha-informed. The fifth variant,
 * included by default and judged like the others. Same order as segmentVerify (Sam: tee -> badge -> 0-bend holes by the
 * 3-point test -> verified as one segment), with the alpha overlay fraction in place of the edge test:
 *   a pair the 3-point test calls STRAIGHT is read as the single segment tee cap -> its BasketPoint
 *     S = capOf(pair, L)  (the ribbon's round cap, L = tk.s6.padLength, exactly segmentVerify's S)
 *     stations 0.6 W .. |K - S| - 2 px, step 1 px, W = tk.s6.hallway widthPx (segmentVerify's stations)
 *   fn.q.path.loss (ports/s6straight/pathSpace.mjs, the lane's measurement half) gives per visible station the overlay
 *   fraction of the fitted path colour (tk.s7.alphaProfile overlays.path, contracts/alpha.profile@1 overlayFraction);
 *   a station carries the path when its fraction >= the threshold, half the fitted path alpha (S6-B's design:
 *   ports/s6straight/pathLoss.mjs THRESHOLD_OF_LEVEL, the midpoint of no ribbon and full ribbon);
 *   straight when the median station carries it (overlay passFrac >= 0.5, the same midpoint along the segment), else
 *   bent; not STRAIGHT by the 3-point test -> bent (nothing to read: sent to pathfinding).
 * Without a fitted path class the variant records why (`no alpha profile`, the alpha Calculation's own condition) and is
 * excluded from acceptance (laneNotRun). The math is asked of the store; nothing is re-derived here.
 */
import { ALPHA_PROFILE_PART, hasOverlay } from '../../contracts/alpha.profile@1.mjs';
import { verdictRow, capOf, segmentArgs, LANE_NOT_RUN } from '../../ports/s6straight/holeStraight.mjs';
import { THRESHOLD_OF_LEVEL } from '../../ports/s6straight/pathLoss.mjs';

export const reads = ['tk.s6.holePairs', 'tk.s6.baskets', 'tk.s6.hallway', 'tk.s6.padLength', ALPHA_PROFILE_PART];
export const calls = ['fn.q.hole.straight3', 'fn.q.path.loss'];
/** The pair rule: the fraction of visible stations that must carry the path (>= the station threshold) for straight. */
export const MIN_PASS_FRAC = 0.5;

const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
const r3 = (v) => (v == null ? null : Math.round(v * 1000) / 1000);

export default function pathLoss(parts) {
  const pairs = parts.get('tk.s6.holePairs'), baskets = parts.get('tk.s6.baskets'), hallway = parts.get('tk.s6.hallway'), L = parts.get('tk.s6.padLength')?.lengthPx ?? null;
  const profile = parts.has(ALPHA_PROFILE_PART) ? parts.get(ALPHA_PROFILE_PART) : null, W = hallway?.widthPx ?? null;
  const rule = `the 3-point STRAIGHT pairs read as one segment tee cap -> BasketPoint (segmentVerify's stations); a station carries the path when its overlay fraction >= ${THRESHOLD_OF_LEVEL} x the fitted path alpha (tk.s7.alphaProfile); straight when >= ${MIN_PASS_FRAC} of the visible stations carry it`;
  if (!hasOverlay(profile, 'path')) {
    const why = profile?.overlays?.path?.reason ?? profile?.reason ?? 'tk.s7.alphaProfile has no path class';
    const condition = `${LANE_NOT_RUN}: no alpha profile (path ${profile?.overlays?.path?.status ?? profile?.status ?? 'absent'}: ${why})`;
    return { rule, verdicts: pairs.map((p) => verdictRow(p, 'unknown', { condition, evidence: { test: 'path loss' } })), laneNotRun: pairs.length > 0 };
  }
  const path = profile.overlays.path, threshold = { frac: r3(THRESHOLD_OF_LEVEL * path.alpha), rule: `${THRESHOLD_OF_LEVEL} x the profile's path alpha ${path.alpha} (tk.s7.alphaProfile, fitted on ${path.fitOn})` };
  const verdicts = pairs.map((p, i) => {
    const s = parts.call('fn.q.hole.straight3', { pair: i }).value;
    if (s.condition) return verdictRow(p, 'unknown', { condition: s.condition, evidence: { test: 'path loss' } });
    if (s.verdict !== 'STRAIGHT') return verdictRow(p, 'bent', { evidence: { test: 'path loss', step: '3-point test not STRAIGHT: nothing to read', tlsMaxPx: s.tlsMaxPx } });
    if (!W) return verdictRow(p, 'unknown', { condition: `no hallway width (tk.s6.hallway: ${hallway?.condition ?? 'absent'})`, evidence: { test: 'path loss' } });
    if (!L) return verdictRow(p, 'unknown', { condition: 'no pad length (tk.s6.padLength: the S3 family model)', evidence: { test: 'path loss' } });
    const basket = baskets[s.basket], S = capOf(p, L), { lengthPx: Lg, args } = segmentArgs(S, basket.point, W);
    const { tolPx, latLimPx, ...stations } = args;   // the edge pair's tolerances are not the loss query's
    const l = parts.call('fn.q.path.loss', { ...stations, stepPx: 1, profile: ALPHA_PROFILE_PART, threshold }).value, o = l.overlay;
    const evidence = { test: 'path loss', capPx: S.map(r2), segmentLengthPx: r2(Lg), hallwayWidthPx: r2(W), tlsMaxPx: s.tlsMaxPx, pathAlphaFrac: path.alpha, thresholdFrac: threshold.frac,
      stationsCount: l.stationsCount ?? 0, overlayVisibleCount: o?.visibleCount ?? 0, overlayPassFrac: o?.passFrac ?? null, medianOverlayFrac: o?.medianOverlayFrac ?? null, meanOverlayFrac: o?.meanOverlayFrac ?? null,
      overlayLongestGapPx: o?.longestGapPx ?? null, edgePassFrac: l.edge?.passFrac ?? null };
    if (l.condition) return verdictRow(p, 'unknown', { condition: `fn.q.path.loss: ${l.condition}`, evidence });
    if (!o?.visibleCount) return verdictRow(p, 'unknown', { condition: 'no station with a visible background on the segment (all masked)', evidence });
    return o.passFrac >= MIN_PASS_FRAC ? verdictRow(p, 'straight', { basket, evidence })
      : verdictRow(p, 'bent', { evidence: { ...evidence, step: `3-point STRAIGHT, path lost: ${o.passFrac} of ${o.visibleCount} visible stations carry >= ${threshold.frac} overlay (< ${MIN_PASS_FRAC})` } });
  });
  return { rule, threshold, verdicts, laneNotRun: false };
}
