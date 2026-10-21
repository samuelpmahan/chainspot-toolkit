/**
 * Coverage DIGIT reader (Sam, 2026-10-21: "You could do anti-aliasing digit by digit as well and improve"): the B+W
 * digit reader's cells (badgeDigitCells: one cell, or two split at the gap measured on this badge) applied to the
 * badge's coverage instead of its binary mask, each cell matched against coverage digit templates by NCC.
 *
 *  - The cells come from the B+W reader's own binarized grid (its LOCAL midway threshold), so both digit readers split
 *    a badge the same way.
 *  - The values are coverage = (lum - plate) / (glyph - plate), clamped, with the coverage reader's LOCAL levels
 *    (coverageLevels), sampled bilinearly on the same grid.
 *  - A cell's tight box is its half-coverage extent widened by one sample for the fringe; it is scaled by the badge's
 *    full ink height (as the B+W reader does) onto the 16 x 24 digit canvas and area-resampled, so the fringe is kept.
 *  - Scores are zero-mean NCC (badgeCoverageTemplateMath bestCoverageScore), best over +/- maxShiftPx.
 * It returns every cell's best NCC per digit (the table the learned confidence reads) and the read: per cell its best
 * digit, in the layout with the better mean. Confidence is the learned P (badgeReaderCalibration.ts), not a gate.
 */
import type { BadgeCropBody, RgbaBitmap } from './badgeGlyphTemplateMath';
import { type NormalizedCoverage } from './badgeCoverageTemplateMath';
export interface CoverageDigitTemplateEntry {
    readonly digit: number;
    readonly from: string;
    readonly coverage: NormalizedCoverage;
}
/** The coverage digit cells of a badge: one-cell and two-cell layouts (null when the glyph does not form them). */
export declare function badgeCoverageDigitCells(image: RgbaBitmap, badge: BadgeCropBody): {
    one: NormalizedCoverage[] | null;
    two: NormalizedCoverage[] | null;
};
/** Best NCC per digit 0..9 in every cell of both layouts. */
export declare function badgeCoverageDigitScoreTable(image: RgbaBitmap, badge: BadgeCropBody, templates: readonly CoverageDigitTemplateEntry[], maxShiftPx?: number): {
    one: number[][] | null;
    two: number[][] | null;
};
/** The read: each cell's best digit, in the layout whose mean best NCC is higher (null without glyph). */
export declare function readCoverageDigits(table: {
    one: number[][] | null;
    two: number[][] | null;
}): string | null;
/**
 * Digit templates from a super-resolved glyph (fn.q.sprite.overlap's mean coverage, `factor` cells per px), made the
 * way each reader makes its cells, so a template and a cell differ only by the glyph:
 *  - coverage: the half-coverage box widened by one sample of the badge grid (samplePx = [x, y] px per sample), scaled
 *    by the ink height plus those two samples onto the digit canvas, area-averaged (badgeCoverageDigitCells);
 *  - mask (B+W): the half-coverage box with no fringe, scaled by the ink height, nearest sample of coverage >= 0.5
 *    (badgeDigitTemplateMath cellMask).
 */
export declare function digitTemplateFromFine(mean: ArrayLike<number>, fineWidth: number, fineHeight: number, factor: number, samplePx: readonly [number, number]): {
    coverage: NormalizedCoverage;
    mask: {
        widthPx: number;
        heightPx: number;
        data: Uint8Array;
    };
} | null;
/** Where a badge's digit cells lie in image px (columns of the readers' sampling grid mapped back to the raster). */
export declare function badgeDigitCellSpans(image: RgbaBitmap, badge: BadgeCropBody): {
    one: [number, number][];
    two: [number, number][] | null;
    rows: [number, number];
} | null;
