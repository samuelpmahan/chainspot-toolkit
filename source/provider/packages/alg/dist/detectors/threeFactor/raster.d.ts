/**
 * NuThing P1 raster layer: RGBA input contract plus the exact OpenCV
 * bright/dark thresholding used by scripts/nuthing-p1-canonical.py.
 *
 * The Python baseline computes HSV via cv2.cvtColor(..., COLOR_RGB2HSV) on
 * uint8 data. OpenCV's 8-bit path is fixed point: V = max(R,G,B) and
 * S = ((V - min) * sdiv[V] + 2^11) >> 12 with sdiv[v] = cvRound((255<<12)/v).
 * We reproduce that table exactly (cvRound = round half to even) so borderline
 * pixels land on the same side of the S threshold as the baseline.
 */
export interface RgbaImage {
    width: number;
    height: number;
    /** RGBA, row-major, 4 bytes per pixel. Alpha is ignored by the pipeline. */
    data: Uint8Array | Uint8ClampedArray;
}
/** Binary mask stored one byte per pixel (0/1), row-major. */
export interface Mask {
    width: number;
    height: number;
    data: Uint8Array;
}
/**
 * shared.hsv knobs, threaded down as plain parameters. This feeds the
 * bright/dark pixel masks that EVERY downstream gate consumes (badges,
 * baskets, tees, screen chrome...) — built once in badgeStage.ts's
 * runBadgeStage (the only call site of computeBrightDarkMasks), so
 * threading here alone reaches the whole pipeline; there is no second
 * mask-building call site to miss.
 *
 * brightSMax (S, saturation — how colorful a pixel is) and darkVMax (V,
 * brightness/value — how bright a pixel is) are different HSV axes,
 * coincidentally both 45, separate knobs. HSV_SHIFT (12, bit-shift
 * precision for the fixed-point OpenCV-identical saturation table) stays a
 * literal per knob-inventory merge note 3 — it's not an experiment
 * dimension, it's the fixed-point radix the reference algorithm requires.
 */
export interface HsvKnobs {
    readonly brightVMin: number;
    readonly brightSMax: number;
    readonly darkVMax: number;
}
export declare const DEFAULT_HSV_KNOBS: HsvKnobs;
/** OpenCV 8-bit HSV saturation for one pixel. */
export declare function opencvSaturation(r: number, g: number, b: number): number;
export interface BrightDarkMasks {
    bright: Mask;
    dark: Mask;
}
/**
 * bright = (V >= 210) & (S <= 45); dark = (V <= 45), matching the baseline's
 * BRIGHT_V_MIN / BRIGHT_S_MAX / DARK_V_MAX exactly.
 */
export declare function computeBrightDarkMasks(image: RgbaImage, knobs?: HsvKnobs): BrightDarkMasks;
