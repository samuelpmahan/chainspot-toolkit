import type { ABFeature, FeatureContext } from '../detectors/threeFactor/features/types';
import type { ExecBoard } from './board';
import { type CompiledExecutionPlan } from './compile';
import type { OperationSpec, Receipt, SlotRef } from './contract';
import { type CalculationBinding, type OperationArtifact, type OperationImpl, type OperationRuntime } from './gateway';
import type { ExecSink } from './sink';
export interface ABFeatureOperation {
    readonly spec: OperationSpec;
    readonly run: OperationImpl;
    /** Runtime bodies corresponding exactly to spec.calculations, for frozen fn.* testimony. */
    readonly calculationBindings?: readonly CalculationBinding[];
    readonly extractArtifacts?: (board: ExecBoard) => readonly OperationArtifact[];
}
/**
 * An executable operation owned by a set's composition boundary. Gate sets
 * express composition, not execution scheduling; `spec.features` remains the
 * honest list of every ABFeature the implementation reads.
 */
export interface ABFeatureSetOperation {
    readonly operation: ABFeatureOperation;
}
/**
 * A named piece of set-owned infrastructure. Services are intentionally
 * descriptors only: the set records semantic ownership, while the production
 * runtime owns construction/lifetime of any corresponding run-scoped object.
 * In particular, this is not an ABFeature and cannot become an execution
 * operation by appearing in a set.
 */
export interface ABFeatureSetServiceDescriptor {
    /** Stable inventory id (for example, `occlusion`). */
    readonly id: string;
    /** Human/tooling vocabulary for the service; never an execution stage id. */
    readonly kind: string;
    /** Services used by one detector run are explicitly marked run-scoped. */
    readonly scope?: 'run';
    readonly note?: string;
}
/** Short name for callers that do not need to spell out "descriptor". */
export type ABFeatureSetService = ABFeatureSetServiceDescriptor;
/** An ordered, executable composition. List order is execution intent. */
export interface ABFeatureSet {
    readonly id: string;
    readonly features: readonly ABFeature[];
    /** Set-owned infrastructure inventory; descriptors do not create runtime objects. */
    readonly services?: readonly ABFeatureSetServiceDescriptor[];
    /**
     * Feature ids read by this set's operations but owned by another set.
     * This is an explicit composition contract, distinct from execution order.
     */
    readonly imports?: readonly string[];
    /**
     * Owned features with no operation in this set. Their parameter/state may
     * be consumed by another set's operation, or await a future engine slot.
     * They remain visible in the compiled feature bindings.
     */
    readonly locallyOperationlessFeatureIds?: readonly string[];
    /**
     * Set-owned executable composition. This permits existing ABFeatures to
     * remain immutable declarations while their production operations are
     * grouped by an honest ownership boundary rather than a schedule.
     */
    readonly operations?: readonly ABFeatureSetOperation[];
    readonly seededSlots?: readonly SlotRef[];
    readonly note?: string;
}
export type ABFeatureOverrides = Readonly<Record<string, {
    readonly enabled?: boolean;
    readonly knobs?: Readonly<Record<string, unknown>>;
}>>;
export interface CompiledABFeatureSet {
    readonly definition: ABFeatureSet;
    readonly plan: CompiledExecutionPlan;
    readonly runtime: OperationRuntime;
    readonly enabledFeatureIds: readonly string[];
    /** Stable ids of infrastructure descriptors owned by this set. */
    readonly ownedServiceIds: readonly string[];
}
export interface ABFeatureSetManifest {
    readonly runId: string;
    readonly invocation: string;
    readonly setId: string;
    readonly planFingerprint: string;
    readonly ownedFeatureIds: readonly string[];
    /** Stable ids of set-owned infrastructure descriptors. */
    readonly ownedServiceIds: readonly string[];
    readonly enabledFeatureIds: readonly string[];
    readonly importedFeatureIds: readonly string[];
    readonly locallyOperationlessFeatureIds: readonly string[];
    readonly startedAtMs: number;
    readonly durationMs: number;
    readonly operations: readonly Receipt[];
    /** Deterministic semantic receipt hash; wall-clock fields are intentionally excluded. */
    readonly manifestHash: string;
}
export interface ABFeatureSetRun {
    readonly runId: string;
    readonly invocation: string;
}
export declare function compileABFeatureSet(definition: ABFeatureSet, overrides?: ABFeatureOverrides, paramsHash?: string): CompiledABFeatureSet;
export declare function executeABFeatureSet(compiled: CompiledABFeatureSet, board: ExecBoard, ctx: FeatureContext, run: ABFeatureSetRun, sink?: ExecSink): Promise<ABFeatureSetManifest>;
export declare function formatABFeatureSetManifestMarkdown(manifest: ABFeatureSetManifest): string;
