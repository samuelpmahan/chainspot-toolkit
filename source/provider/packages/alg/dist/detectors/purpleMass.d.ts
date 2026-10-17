import type { Detector, RgbaRaster } from '../detect';
export declare const PURPLE_MASS_ALGO = "purple-path-mass";
export declare const PURPLE_MASS_ALGO_VERSION = "1.0.0";
export declare const PURPLE_MASS_MATH: {
    readonly hueMinDeg: 245;
    readonly hueMaxDeg: 275;
    readonly saturationMin: 0.35;
    readonly valueMin: 0.35;
    readonly thrownFractionMin: 0.004;
    readonly mapFractionMax: 0.0005;
    readonly targetSampleCount: 20000;
};
export declare function describePurpleMassMath(): string;
export type PurpleMassIntent = 'likely-thrown' | 'likely-map' | 'uncertain';
export interface PurpleMassMeasurement {
    readonly intent: PurpleMassIntent;
    readonly fraction: number;
    readonly sampledPixels: number;
    readonly purplePixels: number;
    readonly centroidXPx: number | null;
    readonly centroidYPx: number | null;
    readonly confidence: number;
}
export declare function isPurplePixel(r: number, g: number, b: number): boolean;
export declare function measurePurpleMass(image: RgbaRaster): PurpleMassMeasurement;
/** Emits one comparable image-level score on every valid image. */
export declare function purpleMassBounds(widthPx: number, heightPx: number, rgba: ArrayLike<number>): {
    leftPx: number;
    topPx: number;
    rightPx: number;
    bottomPx: number;
} | null;
export declare const purpleMassDetector: Detector;
