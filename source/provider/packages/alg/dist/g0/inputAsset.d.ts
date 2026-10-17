import type { RgbaRaster } from '../detect';
import type { GrayRaster } from '../raster';
export interface InputAsset extends RgbaRaster {
    /** Byte length of the original encoded file (PNG/JPEG), before decode. */
    readonly sourceByteLength: number;
}
/**
 * Derive a GrayRaster (crop/stitch's input shape) from an already-decoded
 * RGBA asset, integer Rec.601 luma — the same formula src/lib/raster.ts
 * uses browser-side. Exists so a Node/headless caller can decode a file
 * ONCE (via decodeNodeFile) and feed the same pixels to both RGBA-based
 * detectors and gray-based crop/stitch, rather than decoding twice.
 */
export declare function toGrayRaster(asset: Pick<RgbaRaster, 'widthPx' | 'heightPx' | 'rgba'>): GrayRaster;
