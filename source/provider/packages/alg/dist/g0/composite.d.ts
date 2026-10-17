import type { CropInsets } from '../raster';
import type { Placement } from './types';
export interface CompositeTile {
    /** ORIGINAL (uncropped) RGBA pixels, row-major, 4 bytes/px. */
    readonly rgba: Uint8ClampedArray;
    /** ORIGINAL (uncropped) dimensions — must match `insets` against the same crop proposal used everywhere else in the pipeline. */
    readonly widthPx: number;
    readonly heightPx: number;
    /** This tile's placement (top-left of its CROPPED region) in composite-space, pre-bbox-normalization — same units as g0/stitchSolve's Placement output. */
    readonly placement: Placement;
}
export interface CompositeResult {
    readonly imageId: string;
    readonly widthPx: number;
    readonly heightPx: number;
    readonly rgba: Uint8ClampedArray;
}
export declare function compositeIdBytes(widthPx: number, heightPx: number, rgba: Uint8ClampedArray): Uint8Array;
export declare function materializeComposite(tiles: readonly CompositeTile[], insets?: CropInsets | null): Promise<CompositeResult>;
