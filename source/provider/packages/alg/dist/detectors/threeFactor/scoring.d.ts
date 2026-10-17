import type { BadgeEvidence, BasketEvidence, CorridorParams, LegEvidence, RawPairEvidence, ScoredPairEvidence, SupportFieldEvidence, TeeEvidence } from './types';
/** g4.scoring knobs, threaded down as plain parameters from the resolving unit. */
export interface ScoringKnobs {
    readonly fallbackTeeBboxOffset: number;
    readonly fallbackTeeBboxSize: number;
    readonly ringDistance: number;
    readonly ringTolerance: number;
    readonly zoneFactorDistance: number;
    readonly secondaryRingDistance: number;
    readonly secondaryRingTolerance: number;
    readonly radialTolerance: number;
    readonly teeOrientationSigma: number;
    readonly badgeFractionTarget: number;
    readonly badgeFractionTolerance: number;
    readonly badgeFractionSigma: number;
    readonly collinearityWeight: number;
    readonly collinearitySigma: number;
    readonly basketIdentityFloor: number;
    readonly basketScoreOffset: number;
    readonly basketScoreScale: number;
    readonly endpointSupportSampleCount: number;
    readonly badgeOverlapWaiverRadius: number;
    readonly recoveredTeePrior: number;
    readonly minWindowCells: number;
}
export declare const DEFAULT_SCORING_KNOBS: ScoringKnobs;
/**
 * g5.zfit knobs. topK/alignedWorstCeiling are the original retrofit knobs
 * (assignment.ts salvage gate); the rest are the zfitFactor search internals
 * added here per knob-inventory merge note 5 (same feature, no new file).
 *
 * NOTE on the 0.28 early-return in zfitFactor (`if (current >= ...) return
 * 1`): this is the SAME quantity and SAME threshold as the salvage gate in
 * assignment.ts's scoreRawPairs (`alignedWorst >= zfitKnobs.alignedWorstCeiling`),
 * not a distinct "eligibility" concept. scorePair's allowZfit=true path is
 * only ever reached from that one gated salvage loop, and the `alignedWorst`
 * it recomputes internally is a pure function of inputs zfitFactor's guard
 * never sees `params.zfit` change (zoneFactor/alignedSamples don't read it),
 * so it is byte-identical to the value the outer gate already checked. It
 * therefore reuses `alignedWorstCeiling` rather than adding a second knob
 * that could silently diverge from a gate that already forecloses it.
 */
export interface ZfitKnobs {
    readonly topK: number;
    readonly alignedWorstCeiling: number;
    readonly distanceStartOffset: number;
    readonly distanceStepPx: number;
    readonly maxChordFraction: number;
    readonly maxAdditionalDistance: number;
    readonly bendAngles: readonly number[];
    readonly bendLengthShort: number;
    readonly bendLengthMedium: number;
    readonly bendLengthLong: number;
    readonly maxPathOvershootFraction: number;
    readonly bendFactorWithSegment: number;
    readonly bendFactorWithoutSegment: number;
    readonly scoreMultiplier: number;
}
export declare const DEFAULT_ZFIT_KNOBS: ZfitKnobs;
export declare function makeRawPairEvidence(field: SupportFieldEvidence, badge: BadgeEvidence, tee: TeeEvidence, basket: BasketEvidence, teeLeg: LegEvidence, basketLeg: LegEvidence, params: CorridorParams, yOffsetPx: number, knobs?: ScoringKnobs): RawPairEvidence;
export declare function scorePair(raw: RawPairEvidence, field: SupportFieldEvidence, badge: BadgeEvidence, tee: TeeEvidence, basket: BasketEvidence, baskets: readonly BasketEvidence[], params: CorridorParams, yOffsetPx: number, allowZfit?: boolean, knobs?: ScoringKnobs, zfitKnobs?: ZfitKnobs): ScoredPairEvidence;
