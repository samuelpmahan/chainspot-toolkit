import type { GrayRaster, CropInsets } from './raster';
/**
 * Propose shared insets for N >= 2 same-sized rasters.
 * Returns null when sizes differ or nothing crops.
 */
export declare function proposeSharedCrop(rasters: GrayRaster[]): CropInsets | null;
