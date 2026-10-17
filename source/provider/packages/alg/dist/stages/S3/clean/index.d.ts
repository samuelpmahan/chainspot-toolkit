import type { CompositeResult } from '../../../g0/composite';
import type { PxC } from '../../../exec/board';
import type { CompiledExecutionPlan } from '../../../exec/compile';
import type { OperationSpec, TickTestimony } from '../../../exec/contract';
import { type Pcr } from '../../../exec/pcr';
import { Tee, type TeeFamily, type TeeRingSearch } from './Tee';
export { Tee, TeeFn, TeePxC, selectTeeFamily } from './Tee';
export declare const S3_DETECT_RINGS_TICK: OperationSpec;
export declare const S3_FIND_FAMILY_TICK: OperationSpec;
export declare const S3_FIND_PX_TICK: OperationSpec;
export interface S3Subtraction {
    readonly widthPx: number;
    readonly heightPx: number;
    readonly rgba: Uint8ClampedArray;
    readonly teePx: number;
    readonly overlapPx: number;
    readonly remainingOpaquePx: number;
}
export declare function materializeS3Subtraction(image: CompositeResult, tees: readonly Tee[]): S3Subtraction;
export interface S3VisibleTeesRun {
    readonly pxc: PxC;
    readonly image: CompositeResult;
    readonly rings: TeeRingSearch;
    readonly family: TeeFamily;
    readonly tees: readonly Tee[];
    readonly plan: CompiledExecutionPlan;
    readonly testimonies: readonly TickTestimony[];
    readonly pcr: Pcr;
}
export declare function executeS3VisibleTees(pxc: PxC): S3VisibleTeesRun;
