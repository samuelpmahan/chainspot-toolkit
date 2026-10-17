import type { Detector, OnDetectorEmission, RgbaRaster } from '../../detect';
import type { ChainOfCustodyLedger } from './custody';
import type { ObjectGraph } from './objects';
import type { ResolvedConfig } from './config';
import type { RunTrace } from './features/types';
import { type RecoveredTeeInput, type ThreeFactorAssignment, type ThreeFactorMeasurement, type ThreeFactorParams } from './types';
export { THREE_FACTOR_ALGO, THREE_FACTOR_ALGO_VERSION } from './types';
export { objectGraph, occlude } from './objects';
export type { Badge, Basket, Tee, CourseObject, ObjectGraph, Occlusion, RasterOwnership } from './objects';
export { CHAIN_OF_CUSTODY_SCHEMA, buildChainOfCustody, findTeeCustody } from './custody';
export type { ChainOfCustodyLedger, TeeCustodyAssignmentEvent, TeeCustodyEvent, TeeCustodyOriginKind, TeeCustodyPhysicalSnapshot, TeeCustodyRecord, TeeCustodyTraceEvent } from './custody';
export type { AssignmentEvidence, BadgeEvidence, BasketEvidence, RecoveredTeeInput, TeeEvidence, ThreeFactorAssignment, ThreeFactorMeasurement, ThreeFactorParams } from './types';
export interface ThreeFactorDetectorParams extends ThreeFactorParams {
    readonly recoveredTees?: readonly RecoveredTeeInput[];
    /** resolved engine config; omit for frozen defaults (no trace collected) */
    readonly config?: ResolvedConfig;
    /** sha256 of the resolved config's canonical JSON — caller-computed */
    readonly paramsHash?: string;
}
export interface ThreeFactorRun {
    readonly imageId: string;
    readonly measurement: ThreeFactorMeasurement;
    readonly assignment: ThreeFactorAssignment;
    /** Root objects + explicit relations derived without mutating measurement evidence. */
    readonly objects: ObjectGraph;
    /**
     * Derived, read-only chain of custody for the final tee inventory.  This is
     * observability only: it joins retained TeeEvidence + sealed trace testimony
     * + the final ownership decision and cannot change detector behavior.
     */
    readonly custody: ChainOfCustodyLedger;
    readonly trace?: RunTrace;
    readonly paramsHash?: string;
}
/** Raw stage output. It preserves every primitive measurement for parity/debugging. */
export declare function measureThreeFactor(image: RgbaRaster, params?: ThreeFactorParams): ThreeFactorMeasurement;
/** Explicit assignment seam: recovered/manual tees are inserted before pairing. */
export declare function insertRecoveredEndpoints(measurement: ThreeFactorMeasurement, recoveredTees?: readonly RecoveredTeeInput[]): ThreeFactorAssignment;
export declare const assignMeasuredThreeFactor: typeof insertRecoveredEndpoints;
export declare function runThreeFactor(image: RgbaRaster, params?: ThreeFactorDetectorParams): ThreeFactorRun;
export { DEFAULT_EXECUTION, ENGINE_UNITS } from './engine';
export { parseConfig, resolveConfig, validateExecution, type ResolvedConfig, type ThreeFactorConfig } from './config';
export { canonicalJson, sha256Hex } from './hash';
export type { RunTrace, Drawable, UnitTrace } from './features/types';
export * from './gate-sets';
export declare function emitThreeFactorRun(image: RgbaRaster, run: ThreeFactorRun, emit: OnDetectorEmission): void;
export declare function createThreeFactorDetector(params?: ThreeFactorDetectorParams): Detector;
export declare const threeFactorDetector: Detector;
export default threeFactorDetector;
