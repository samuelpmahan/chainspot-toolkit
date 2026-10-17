import type { OperationSpec, SlotRef } from './contract';
import type { ResolvedConfig } from '../detectors/threeFactor/config';
/** Slots the caller seeds onto the board before any operation runs — mirrors engine.ts's SEEDED_SLOTS at operation granularity. */
export declare const SEEDED_SLOTS: readonly SlotRef[];
export interface CompiledExecutionPlan {
    readonly ops: readonly OperationSpec[];
    /** sha256(resolved config + op universe) */
    readonly planFingerprint: string;
    /** featureId -> resolved {enabled, knobs}, for receipts/debugging */
    readonly bindings: Readonly<Record<string, {
        enabled: boolean;
        knobs: Record<string, unknown>;
    }>>;
    /** C4's image/params hash; carried through untouched, never derived here */
    readonly paramsHash?: string;
}
export declare function validateOperationOrder(ops: readonly OperationSpec[], seededSlots?: readonly SlotRef[], errorPrefix?: string): void;
export declare function compileExecutionPlan(resolved: ResolvedConfig, paramsHash?: string): CompiledExecutionPlan;
