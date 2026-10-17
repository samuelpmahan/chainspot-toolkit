/** Experimental S4: local Tee→Badge resolution. No global Basket assignment. */
import type { Tee } from '../../../S3/clean/Tee';
import type { Badge } from '../../../S1/clean/Badge';
export declare const AXIS_WINDOW_DEG = 5;
export interface PairMeasure {
    readonly tee: number;
    readonly hole: number;
    readonly badgeCenter: readonly [number, number];
    readonly distancePx: number;
    readonly angleDeg: number;
    readonly perpendicularPx: number;
}
export interface Resolution extends PairMeasure {
    readonly center: readonly [number, number];
    readonly visibility: 'VISIBLE' | 'PARTIALLY_OBSERVED_RECOVERED';
    readonly ownedPx: Uint32Array;
    readonly state: 'RESOLVED_BY_NAIVE_GATE';
}
export interface ResolutionState {
    readonly resolutions: readonly Resolution[];
    readonly unresolvedHoles: readonly number[];
    readonly unresolvedTees: readonly number[];
    readonly assumption: string;
    readonly recovery: 'NOT_RUN' | 'OPEN_FRAME_ONLY';
}
export declare const S4PxC: {
    pairs: import("../../../../exec/board").PxKey<readonly PairMeasure[]>;
    state: import("../../../../exec/board").PxKey<ResolutionState>;
    pcr: import("../../../../exec/board").PxKey<unknown>;
};
/** Bidirectional major axis: the eigenvector's sign is not semantic direction. */
export declare function measurePairs(tees: readonly Pick<Tee, 'center' | 'angleRad'>[], badges: readonly Badge[]): PairMeasure[];
/** Non-executing Gate: judgment over already-computed pair measurements.
 * Reciprocal nearest within the axis window is deliberately falsifiable.
 * Do not free conflicting candidates and rerun until the cardinality is 18.
 */
export declare function judgePairs(pairs: readonly PairMeasure[], tees: readonly Pick<Tee, 'center' | 'px'>[]): ResolutionState;
