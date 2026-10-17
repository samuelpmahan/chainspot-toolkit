import type { Detector, RgbaRaster } from '../detect';
export declare const LANDING_DROPLET_ALGO = "landing-droplet-mask";
export declare const LANDING_DROPLET_ALGO_VERSION = "1.0.0";
export interface DropletComponent {
    readonly tipXPx: number;
    readonly tipYPx: number;
    readonly boundsXPx: number;
    readonly boundsYPx: number;
    readonly boundsWidthPx: number;
    readonly boundsHeightPx: number;
    readonly areaPx: number;
}
/** Pure core: find droplet-shaped marker-blue components and their tips. */
export declare function findDroplets(image: RgbaRaster): DropletComponent[];
export declare const landingDropletDetector: Detector;
