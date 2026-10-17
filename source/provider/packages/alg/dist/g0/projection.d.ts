import type { CropInsets } from '../raster';
import type { Placement } from './types';
export interface PixelPoint {
    readonly xPx: number;
    readonly yPx: number;
}
/**
 * Project a point measured in the ORIGINAL (uncropped) tile's pixels into
 * composite-space: undo the crop inset, then add the tile's placement.
 * Pass `placement: {x:0,y:0}` (or omit it) to get crop-adjusted
 * tile-local coordinates instead of full composite coordinates.
 */
export declare function projectToComposite(point: PixelPoint, insets: CropInsets | null, placement?: Placement): PixelPoint;
