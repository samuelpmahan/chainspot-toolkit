import type { CropInsets, GrayRaster } from '../raster';
import type { Placement } from './types';
export interface CropApplyResult {
    /** null when no crop was proposed (or skipped) — rasters/placements pass through unchanged. */
    readonly insets: CropInsets | null;
    readonly rasters: readonly GrayRaster[];
    readonly placements: readonly Placement[];
}
export declare function applyCrop(rasters: readonly GrayRaster[], placements: readonly Placement[], options?: {
    readonly skip?: boolean;
}): CropApplyResult;
