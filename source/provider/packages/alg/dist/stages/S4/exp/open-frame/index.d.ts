/** Challenger: compose disconnected bright border parts before measuring pose.
 * No fabricated pixels. Closed-ring discovery is NOT required. No truth input.
 */
import type { BrightDarkComponentFields } from '../../../../detectors/threeFactor/componentField';
import type { Tee } from '../../../S3/clean/Tee';
import type { Badge } from '../../../S1/clean/Badge';
import type { Basket } from '../../../S2/clean/Basket';
import { type ResolutionState } from '../axis-local';
export interface OpenFrame {
    readonly center: readonly [number, number];
    readonly angleRad: number;
    readonly bbox: readonly [number, number, number, number];
    readonly px: Uint32Array;
    readonly parts: readonly number[];
    readonly sideCoverage: readonly number[];
    readonly interiorFraction: number;
}
export declare const OpenFramePxC: {
    candidates: import("../../../../exec/board").PxKey<readonly OpenFrame[]>;
    measures: import("../../../../exec/board").PxKey<unknown>;
};
export declare function findOpenFrames(fields: BrightDarkComponentFields, badges: readonly Badge[], baskets: readonly Basket[], tees: readonly Tee[]): {
    candidates: OpenFrame[];
    tested: unknown[];
};
export declare function resolveOpenFrames(base: ResolutionState, candidates: readonly OpenFrame[], badges: readonly Badge[], baseTeeCount: number): ResolutionState;
