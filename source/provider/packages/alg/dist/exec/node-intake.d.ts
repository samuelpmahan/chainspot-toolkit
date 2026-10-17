import type { CompositeResult } from '../g0/composite';
import type { OperationSpec } from './contract';
import { type S0CropRun, type S0FullImageCache } from '../stages/S0/clean';
/** Compatibility export retained for existing Storybook evidence callers. */
export declare const NODE_CANONICAL_INPUT_TICK: OperationSpec;
export interface NodeCanonicalInputTickResult extends S0CropRun {
    /** The cropped pixels handed to S1. */
    readonly input: CompositeResult;
}
/** Decode outside PxC, sanitize, then make the cropped pixels PxC's first image value. */
export declare function executeNodeCanonicalInputTick(filePath: string, fullImageCache?: S0FullImageCache): Promise<NodeCanonicalInputTickResult>;
