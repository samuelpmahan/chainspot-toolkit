import type { CompositeResult } from '../../../g0/composite';
import type { PxC } from '../../../exec/board';
import type { CompiledExecutionPlan } from '../../../exec/compile';
import type { OperationSpec, TickTestimony } from '../../../exec/contract';
import { type Pcr } from '../../../exec/pcr';
import { Basket, type BasketFamily, type BasketShellFamily, type BasketShellShape } from './Basket';
export { Basket, BasketFn, BasketPxC } from './Basket';
export declare const S2_DETECT_FAMILY_TICK: OperationSpec;
export declare const S2_LEARN_SHELL_SHAPE_TICK: OperationSpec;
export declare const S2_FIND_SHELL_FAMILY_TICK: OperationSpec;
export declare const S2_FIND_PX_TICK: OperationSpec;
export interface S2Subtraction {
    readonly widthPx: number;
    readonly heightPx: number;
    readonly rgba: Uint8ClampedArray;
    readonly basketPx: number;
    readonly overlapPx: number;
    readonly remainingOpaquePx: number;
}
export declare function materializeS2Subtraction(image: CompositeResult, baskets: readonly Basket[]): S2Subtraction;
export interface S2BasketsCandidateRun {
    readonly pxc: PxC;
    readonly image: CompositeResult;
    readonly family: BasketFamily;
    readonly shellShape: BasketShellShape;
    readonly shellFamily: BasketShellFamily;
    readonly baskets: readonly Basket[];
    readonly plan: CompiledExecutionPlan;
    readonly testimonies: readonly TickTestimony[];
    readonly pcr: Pcr;
}
export declare function executeS2BasketsCandidate(pxc: PxC): S2BasketsCandidateRun;
