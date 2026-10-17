import type { CropInsets, GrayRaster } from '../raster';
export declare const DEFAULT_STRIP_CHROME_MARGIN_PX = 2;
export interface StripChromeResult {
    readonly insets: CropInsets | null;
    readonly source: 'single-phone-entropy' | 'shared-chrome-consensus' | 'none';
}
/** Required G0 sanitation. Null means the input already presents no defensible chrome band. */
export declare function stripChromeProposal(rasters: readonly GrayRaster[]): StripChromeResult;
