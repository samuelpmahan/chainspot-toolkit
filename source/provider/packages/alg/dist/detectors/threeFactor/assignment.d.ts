import type { BasketEvidence, RawPairEvidence, RecoveredTeeInput, ScoredPairEvidence, TeeEvidence, ThreeFactorAssignment, ThreeFactorMeasurement } from './types';
import { type RoutingKnobs } from './routing';
import { type RibbonKnobs } from './ribbon';
import { type ScoringKnobs, type ZfitKnobs } from './scoring';
export interface SearchKnobs {
    readonly assignTopRows: number;
    readonly exchangeTopK: number;
    readonly maxAssignPasses: number;
    readonly recoveredTeeDedupeDistance: number;
}
export declare const DEFAULT_SEARCH_KNOBS: SearchKnobs;
export declare function recoveredTee(input: RecoveredTeeInput, index: number, baskets: readonly BasketEvidence[], knobs: ScoringKnobs): TeeEvidence;
export declare function rerouteRawPairs(measurement: ThreeFactorMeasurement, tees: readonly TeeEvidence[], ribbonKnobs: RibbonKnobs, routingKnobs: RoutingKnobs, scoringKnobs: ScoringKnobs): RawPairEvidence[];
export declare function scoreRawPairs(measurement: ThreeFactorMeasurement, tees: readonly TeeEvidence[], rawPairs: readonly RawPairEvidence[], zfitKnobs?: ZfitKnobs, scoringKnobs?: ScoringKnobs): ScoredPairEvidence[];
export declare function rankPairsByBadge(scoredPairs: readonly ScoredPairEvidence[]): Map<string, ScoredPairEvidence[]>;
export declare function rankScoredPairs(scoredPairs: readonly ScoredPairEvidence[]): ScoredPairEvidence[];
export declare function selectAssignments(rescoredByBadge: ReadonlyMap<string, readonly ScoredPairEvidence[]>, knobs?: SearchKnobs): Map<string, ScoredPairEvidence | null>;
export declare function assignThreeFactor(measurement: ThreeFactorMeasurement, recoveredTees?: readonly RecoveredTeeInput[], zfitKnobs?: ZfitKnobs, scoringKnobs?: ScoringKnobs, searchKnobs?: SearchKnobs, ribbonKnobs?: RibbonKnobs, routingKnobs?: RoutingKnobs): ThreeFactorAssignment;
