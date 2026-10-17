export interface GrayRaster {
    readonly widthPx: number;
    readonly heightPx: number;
    /** Row-major luma, one byte per pixel: gray[y * widthPx + x]. */
    readonly gray: Uint8Array;
}
export interface CropInsets {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
}
/** Pure raster crop (no DOM) — feed autoCrop-confirmed insets to stitch. */
export declare function cropRaster(r: GrayRaster, insets: CropInsets): GrayRaster;
