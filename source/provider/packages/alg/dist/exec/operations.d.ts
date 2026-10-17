import type { OperationSpec, ArtifactKind } from './contract';
import type { ExecBoard } from './board';
import type { CalculationBinding, OperationImpl } from './gateway';
import type { AssignmentEvidence, BadgeEvidence } from '../detectors/threeFactor/types';
interface OperationDef {
    readonly spec: OperationSpec;
    readonly run: OperationImpl;
    readonly calculationBindings?: readonly CalculationBinding[];
}
/**
 * Unit id -> its fixed-order operation id list. Config `execution` arrays
 * are still authored at unit granularity (R3: no schema bump); compile.ts
 * expands each unit id through this table to build the op-level plan.
 * Intra-unit order is NOT configurable — it is the unit's own internal
 * dependency chain, fixed at registration time. Map insertion order below
 * is also the canonical (default.json) unit order, used only to make
 * OPERATION_UNIVERSE's iteration order readable — compile.ts's actual
 * scheduling always follows the RESOLVED config's execution list, never
 * this map's key order.
 */
export declare const UNIT_OPERATIONS: ReadonlyMap<string, readonly string[]>;
export declare const OPERATION_DEFS: readonly OperationDef[];
export declare const OPERATION_UNIVERSE: readonly OperationSpec[];
export declare const operationImpls: ReadonlyMap<string, OperationImpl>;
/**
 * Runtime function bindings for the fn.* addresses declared by each real
 * operation.  This map is testimony only; operationImpls remains the sole
 * execution authority.
 */
export declare const operationCalculationBindings: ReadonlyMap<string, readonly CalculationBinding[]>;
/** The unit ids compile.ts's inherited validateExecution already understands (unchanged, unit-granularity legality check). */
export declare const KNOWN_UNIT_IDS: readonly string[];
/** A `badge-N` id is a detector ordinal, not a hole number -- it carries no
 * meaning a human can read on sight. Every assignment/measurement table row
 * that names a badgeId also carries the G1-read hole label (BadgeEvidence's
 * `label`, e.g. "14") and the confidence that read earned, so the row is
 * legible without cross-referencing the badges artifact. `badgeId` is kept
 * for traceability; `hole` is the human-facing field. A badge whose digit
 * read failed prints the loud `UNREAD`, never a guess. */
export interface HoleLabeledAssignment extends AssignmentEvidence {
    readonly hole: string;
    readonly holeConfidence: number | null;
}
export declare function withHoleLabels(assignments: readonly AssignmentEvidence[], badges: readonly BadgeEvidence[]): readonly HoleLabeledAssignment[];
export interface ArtifactExtraction {
    readonly kind: ArtifactKind;
    readonly id: string;
    readonly bytes: Uint8Array;
    /** Shape for raster kinds. maskBytes()/floatBytes() drop width+height from
     * the payload, so the extractor -- the only place that still has them --
     * forwards them here. See rendererContract.ts GAP note. */
    readonly dims?: {
        readonly width: number;
        readonly height: number;
    };
}
export declare const ARTIFACT_EXTRACTORS: Readonly<Record<string, (board: ExecBoard) => ArtifactExtraction[]>>;
export {};
