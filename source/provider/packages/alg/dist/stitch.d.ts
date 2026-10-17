import type { GrayRaster } from './raster';
export interface StitchOffset {
    /** Position of raster B's origin relative to raster A's origin, in A's pixels. */
    readonly dx: number;
    readonly dy: number;
    /** Mean absolute luma difference over the overlap (0 = identical). */
    readonly score: number;
}
export declare function downsample(r: GrayRaster, factor: number): GrayRaster;
/** Find the best translation placing B relative to A. Null when no offset overlaps enough. */
export declare function findBestTranslation(a: GrayRaster, b: GrayRaster): StitchOffset | null;
