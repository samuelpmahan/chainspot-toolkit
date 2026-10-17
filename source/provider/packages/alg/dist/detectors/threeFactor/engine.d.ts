import { type ResolvedConfig } from './config';
import type { OperationSpec } from '../../exec/contract';
import { type EngineUnit, type FeatureContext, type RunTrace } from './features/types';
import type { RecoveredTeeInput, RgbaImage, ThreeFactorAssignment, ThreeFactorMeasurement, ThreeFactorParams } from './types';
export declare const ENGINE_UNITS: readonly EngineUnit[];
export declare const DEFAULT_EXECUTION: readonly string[];
/** Slots the engine seeds before any unit runs. */
export declare const SEEDED_SLOTS: readonly string[];
export declare function createTraceContext(resolved: ResolvedConfig, paramsHash: string, operations?: readonly OperationSpec[], metadata?: Pick<RunTrace, 'runId' | 'imageId' | 'traceHash' | 'canonicalFrame'>): {
    ctx: FeatureContext;
    trace: RunTrace;
};
/**
 * Resolve every config feature whose values ride the legacy
 * ThreeFactorParams/CorridorParams seed. All execution front doors must call
 * this before seedBoard so the config hash and the executed parameters cannot
 * disagree. Caller-explicit numeric/routing params retain precedence over
 * baseline knobs. An enabled zfit ABFeature remains authoritative over the
 * legacy boolean flag, preserving the existing config behavior.
 */
export declare function resolveConfiguredParams(params: ThreeFactorParams | undefined, resolved?: ResolvedConfig): ThreeFactorParams | undefined;
export interface EngineResult {
    readonly measurement: ThreeFactorMeasurement;
    readonly assignment: ThreeFactorAssignment;
    readonly trace?: RunTrace;
}
/**
 * Run the engine: seed the board, validate the execution order against unit
 * declarations, execute in the config's order. `resolved` carries the
 * feature states and the order; omit for frozen defaults with no trace.
 */
export declare function runEngine(image: RgbaImage, params: ThreeFactorParams | undefined, recoveredTees: readonly RecoveredTeeInput[], resolved?: ResolvedConfig, paramsHash?: string): EngineResult;
