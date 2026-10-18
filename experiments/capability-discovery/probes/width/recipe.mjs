// Experiment eligibility only. No numeric fallback is considered measured width.
export function assessLocalWidth({ estimate, evidence, policy } = {}) {
  const unknown = (...reasons) => ({ status: 'UNKNOWN', widthPx: null, reasons, promoted: false });
  if (!estimate || !Array.isArray(estimate.scores) || !estimate.scores.length) return unknown('no candidate score rows; legacy fallback is not evidence');
  if (!policy || !['minQualifiedSegments', 'minBilateralSamples', 'minVisibleSamples', 'minScoreSeparation'].every(k => Number.isFinite(policy[k]) && policy[k] > 0)) return unknown('explicit confidence policy required; no numerical defaults');
  if (!['minQualifiedSegments', 'minBilateralSamples', 'minVisibleSamples'].every(k => Number.isInteger(policy[k]))) return unknown('sample and segment count policy must use integers');
  if (!Number.isFinite(policy.minMeanScore) || !Number.isFinite(policy.maxRelativeWidthIqr) || policy.maxRelativeWidthIqr < 0) return unknown('finite mean-score and width-spread policy required');
  if (!evidence || evidence.frame !== 'same-canonical-image-pixels' || evidence.widthScope !== 'LOCAL' || evidence.segmentQualification !== 'straight-tee-to-badge-independent') return unknown('qualified straight segments and explicit LOCAL frame required');
  if (!['qualifiedSegments', 'bilateralSamples'].every(k => Number.isInteger(evidence[k]) && evidence[k] >= 0)) return unknown('finite nonnegative evidence counts required');
  if (!(evidence.qualifiedSegments >= policy.minQualifiedSegments) || !(evidence.bilateralSamples >= policy.minBilateralSamples)) return unknown('insufficient qualified segment/bilateral evidence');
  if (evidence.profileTouchesLateralBoundary !== false) return unknown('profile-boundary ambiguity');
  if (!Number.isFinite(evidence.relativeWidthIqr) || evidence.relativeWidthIqr < 0 || evidence.relativeWidthIqr > policy.maxRelativeWidthIqr) return unknown('width spread absent or outside declared confidence policy');
  if (evidence.heldOutCheck !== 'agreement-within-reported-fit-uncertainty') return unknown('held-out widths not independently checked');
  if (estimate.scores.some(r => !r || typeof r !== 'object' || Array.isArray(r) || !Number.isFinite(r.widthPx) || r.widthPx <= 0) || new Set(estimate.scores.map(r => r.widthPx)).size !== estimate.scores.length) return unknown('positive distinct unambiguous candidate widths required');
  // Unsupported rows stay in the receipt, but never become measured candidates.
  const rows = estimate.scores.filter(r => Number.isFinite(r.widthPx) && r.widthPx > 0 && Number.isFinite(r.meanScore) && Number.isInteger(r.visibleSamples) && r.visibleSamples >= policy.minVisibleSamples).sort((a, b) => b.meanScore - a.meanScore || a.widthPx - b.widthPx);
  if (rows.length < 2) return unknown('at least two supported candidate scores required to assess separation');
  const [best, rival] = rows, separation = best.meanScore - rival.meanScore;
  if (best.meanScore < policy.minMeanScore || separation < policy.minScoreSeparation) return unknown('weak or inseparable supported candidate scores');
  if (estimate.widthPx !== best.widthPx) return unknown('legacy selected width differs from supported winner');
  return { status: 'ELIGIBLE_FOR_COMPARISON', widthPx: best.widthPx, separation, promoted: false, reasons: ['synthetic/recipe eligibility only; no endpoint or real-image acceptance'] };
}

export function assessPairedRails(observation) {
  if (!observation || observation.railMode !== 'paired' || !Number.isFinite(observation.leftRail) || !Number.isFinite(observation.rightRail)) return { status: 'UNKNOWN', reason: 'two visible rails required for paired-width evidence', combinedScore: observation?.score ?? null };
  return { status: 'OBSERVED_CHANNELS', leftRail: observation.leftRail, rightRail: observation.rightRail, combinedScore: observation.score, positiveEvidenceClaimed: false };
}

// JSON must not silently collapse -Infinity (no evidence) to null.
export const preserveNonFinite = (_key, value) => typeof value === 'number' && !Number.isFinite(value) ? { numberKind: 'nonfinite', value: String(value) } : value;
