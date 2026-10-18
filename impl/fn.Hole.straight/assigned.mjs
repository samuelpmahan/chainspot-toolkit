/**
 * fn.Hole.straight / assigned: Sam (2026-10-18): "the ABFeature era paired all badge -> basket endpoints and scored them
 * and THAT'S how it was able to assume known endpoints + work backwards." A MATCHING RULE over tk.s6.pairFeatures
 * (ports/s6straight/matching.mjs): every hole's straight segment is scored to EVERY basket candidate (the table has the edge step of
 * each hole x basket row, from its tee cap or, for a badge with no tee, the badge centre); the provider's exact matcher
 * (maximumWeightTeeBadgeMatching: cardinality first, then score; ports/s6straight/assign.mjs) assigns one basket per hole; a pair whose
 * assigned basket passes the segment verify (score >= 6 lum/px) is straight with that basket, else bent. The s7edge rule
 * "two straight holes on one BasketPoint: the one whose ribbon caps there keeps it" is this assignment in miniature.
 */
import { assignedRule } from '../../ports/s6straight/matching.mjs';
import { assignHolesToBaskets } from '../../ports/s6straight/assign.mjs';

export const reads = ['tk.s6.pairFeatures'];
export const calls = [];

export default function assigned(parts) { return assignedRule(parts.get('tk.s6.pairFeatures'), { assign: assignHolesToBaskets }); }
