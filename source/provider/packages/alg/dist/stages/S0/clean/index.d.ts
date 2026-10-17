import { type CompositeResult } from '../../../g0/composite';
import type { InputAsset } from '../../../g0/inputAsset';
import { type StripChromeResult } from '../../../g0/stripChrome';
import { type PxC } from '../../../exec/board';
import type { CompiledExecutionPlan } from '../../../exec/compile';
import type { OperationSpec, TickTestimony } from '../../../exec/contract';
import { type Pcr } from '../../../exec/pcr';
export declare const S0_SELECTED_INPUT_ADDRESS: "px.source.selectedInput";
export declare const S0_FULL_IMAGE_ADDRESS: "px.source.fullImage";
export declare const S0_CROPPED_IMAGE_ADDRESS: "px.course.canonicalPixels";
export declare const S0_DECODE_TICK: OperationSpec;
export declare const S0_CROP_TICK: OperationSpec;
export declare const S0_CACHE_TICK: OperationSpec;
export interface S0FullImageCache {
    write(fullImage: InputAsset): void | Promise<void>;
}
export interface MemoryS0FullImageCache extends S0FullImageCache {
    get(imageId: string): InputAsset | undefined;
    has(imageId: string): boolean;
}
export declare function createMemoryS0FullImageCache(): MemoryS0FullImageCache;
export interface S0Stage {
    readonly pxc: PxC;
    readonly fullImageCache: S0FullImageCache;
}
/** Create S0's live world. Browser callers do this on page load. */
export declare function createS0Stage(pxc?: PxC, fullImageCache?: S0FullImageCache): S0Stage;
export interface S0CropReceipt {
    readonly originalPx: {
        readonly width: number;
        readonly height: number;
    };
    readonly cropMethod: StripChromeResult['source'];
    readonly upperRowsRemoved: number;
    readonly lowerRowsRemoved: number;
    readonly croppedPx: {
        readonly width: number;
        readonly height: number;
    };
    readonly totalPxRemoved: number;
    readonly pctPxRemoved: number;
}
export interface S0CropRun {
    readonly pxc: PxC;
    readonly fullImage: InputAsset;
    readonly croppedImage: CompositeResult;
    readonly crop: StripChromeResult;
    readonly cropReceipt: S0CropReceipt;
    readonly plan: CompiledExecutionPlan;
    readonly testimonies: readonly TickTestimony[];
    readonly decodeTestimony: TickTestimony;
    readonly testimony: TickTestimony;
    readonly cacheTestimony: TickTestimony;
    readonly pcr: Pcr;
}
export interface S0ReceiptTextContext {
    readonly inputLabel: string;
    readonly progression?: string;
}
export interface ExecuteS0Args<Source> {
    readonly stage: S0Stage;
    readonly source: Source;
    readonly decode: (source: Source) => Promise<InputAsset>;
}
/** Human replay of S0 in execution order. */
export declare function formatS0ReceiptText(run: S0CropRun, context: S0ReceiptTextContext): string;
/** Run S0 inside the PxC created for it on page load; cache FullImage only after crop. */
export declare function executeS0<Source>(args: ExecuteS0Args<Source>): Promise<S0CropRun>;
