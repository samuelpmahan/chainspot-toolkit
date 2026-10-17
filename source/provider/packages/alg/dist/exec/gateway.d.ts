import type { CompiledExecutionPlan } from './compile';
import type { ExecBoard } from './board';
import type { ExecSink } from './sink';
import type { Receipt } from './contract';
import type { FeatureContext } from '../detectors/threeFactor/features/types';
export type OperationImpl = (board: ExecBoard, ctx: FeatureContext) => void | Promise<void>;
/** Runtime-only binding. Receipts retain its fn.* address and body hash, never the function. */
export interface CalculationBinding {
    readonly address: `fn.${string}`;
    readonly calculate: (...args: never[]) => unknown;
}
export interface OperationArtifact {
    readonly kind: Parameters<ExecSink['putArtifact']>[0];
    readonly id: string;
    readonly bytes: Uint8Array;
    readonly dims?: Parameters<ExecSink['putArtifact']>[3];
}
export interface OperationRuntime {
    readonly implementations: ReadonlyMap<string, OperationImpl>;
    readonly calculationBindings?: ReadonlyMap<string, readonly CalculationBinding[]>;
    readonly artifactExtractors?: Readonly<Record<string, (board: ExecBoard) => readonly OperationArtifact[]>>;
}
export declare function executeCompiledPlan(plan: CompiledExecutionPlan, board: ExecBoard, ctx: FeatureContext, sink?: ExecSink, runtime?: OperationRuntime): readonly Receipt[];
/** Browser/LAB counterpart: same gateway contract, but awaits asynchronous operations in list order. */
export declare function executeCompiledPlanAsync(plan: CompiledExecutionPlan, board: ExecBoard, ctx: FeatureContext, sink?: ExecSink, runtime?: OperationRuntime): Promise<readonly Receipt[]>;
