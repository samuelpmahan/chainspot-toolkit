/**
 * Digit segmentation: splits a badge glyph mask (bright digit pixels inside
 * the badge interior, see build-manifest.ts) into per-digit masks.
 *
 * Browser-portable and dependency-free: only imports the existing
 * 8-connected component labeler (components.ts). No image decoding here —
 * callers hand this a Mask already produced from a glyph-mask PNG.
 *
 * Segmentation is LABEL-BLIND: it never looks at (or is passed) the ground
 * truth digit string. Its only job is to propose digit-shaped regions from
 * pixel geometry; scripts/nuthing/build-digit-dataset.ts is responsible for
 * comparing the digit *count* against the label length afterward.
 *
 * Algorithm, tuned on the REAL_GROUNDED (train-split) dev badges only:
 *
 *  1. extractComponents (8-connected) over the glyph mask.
 *  2. Drop noise components: area < MIN_COMPONENT_AREA (6px — antialiasing
 *     specks and single stray glyph pixels are well under this on every
 *     genuine digit stroke observed in the dev corpus), or bbox height <
 *     HEIGHT_RATIO_MIN (0.5) x the tallest surviving component's height
 *     (drops frame/border remnants and antialiasing slivers that survive
 *     the area cut but sit far shorter than the actual digit strokes on the
 *     same badge — badge interiors are small enough that every digit in one
 *     glyph mask is rendered at the same font size, so real digits cluster
 *     tightly in height and a sub-half-height blob is not a digit).
 *  3. Sort survivors left-to-right by centroid x -> digit candidates in
 *     reading order.
 *  4. Merged-digit handling: UDisc digits in this font are taller than
 *     wide, so a *single* connected component spanning two digits (rare in
 *     the dev corpus - most multi-digit badges segment cleanly by
 *     connected components alone, see docs/nuthing-p2/digit-segmentation.md
 *     for the measured cc-vs-valley-split split) reads as roughly square or
 *     wider. WIDE_RATIO (0.95) x its own height is the trigger: any surviving
 *     component wider than that is assumed to be two touching digits and is
 *     split at the deepest column-projection valley (minimum column pixel
 *     count) found within the middle 40% of its width (searching only the
 *     interior avoids picking a stroke's own left/right edge as the "valley"
 *     for narrow merges). If no valid two-sided split exists (e.g. too
 *     narrow to have an interior search window, or the valley sits at an
 *     extreme edge and would produce an empty half) the component is kept
 *     whole as a single 'cc' digit and a note is recorded instead of
 *     forcing a bad split.
 *
 * A lone narrow component (digit '1') is never at risk from the noise or
 * height filters in practice: area for the thinnest observed '1' strokes is
 * still well above MIN_COMPONENT_AREA, and its height matches its badge's
 * other digits, so it passes the height-ratio filter same as any digit. It
 * is also never mistaken for a merge candidate: width « height keeps it far
 * under WIDE_RATIO.
 */
import type { Mask } from '../raster';
export declare const MIN_COMPONENT_AREA = 6;
export declare const HEIGHT_RATIO_MIN = 0.5;
export declare const WIDE_RATIO = 0.95;
/** Fraction of a wide component's width defining the interior valley-search window. */
export declare const VALLEY_SEARCH_LO = 0.3;
export declare const VALLEY_SEARCH_HI = 0.7;
export interface DigitCandidate {
    /** [x, y, w, h] in glyph-mask pixel coordinates. */
    bbox: [number, number, number, number];
    /** Tight w*h crop, row-major, 0/1 per byte. */
    mask: Uint8Array;
    method: 'cc' | 'valley-split';
}
export interface SegmentResult {
    digits: DigitCandidate[];
    notes: string[];
}
export declare function segmentDigits(mask: Mask): SegmentResult;
