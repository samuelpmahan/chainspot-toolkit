/**
 * Coverage whole-glyph matcher: the second reader beside the binary one
 * (badgeGlyphTemplateMath.ts), after Sam (2026-10-21): "the badge
 * anti-aliasing pixels could be used to fit more efficient digit recognition
 * since they still show the shape with far fewer px".
 *
 * The binary reader keeps a sample only when it is bright and neutral
 * (>= 150), so a glyph edge's anti-aliased pixels, whose grey level is the
 * glyph's sub-pixel coverage of that pixel, are thrown away. Here every
 * sample is a coverage in 0..1 instead:
 *
 *   coverage = (lum - plateLum) / (glyphLum - plateLum), clamped,
 *
 * with plateLum and glyphLum LOCAL, measured on each badge (two-means over
 * the native pixels inside the same inset the binary reader samples). The
 * geometry is the binary reader's: the same 48x36 grid and 14%/16% inset,
 * the tight box at half coverage (the glyph's own edge) widened by one cell
 * for the anti-aliased fringe, scaled to fit the same 24x18 canvas, and
 * area-resampled instead of nearest-neighbour so the fringe is kept.
 * Templates are scored by zero-mean normalized cross-correlation, best over
 * +/- maxShiftPx, and abstention is first-class with the binary reader's own
 * thresholds (a low top score, or a thin top-vs-runner-up margin).
 *
 * This USES anti-aliased pixels to read; it does not mute or reassign any
 * pixel (DOCTRINE: muting waits for a baseline through S7).
 */
import type { BadgeCropBody, RgbaBitmap } from './badgeGlyphTemplateMath';
export interface BadgeCoverageTemplateKnobs {
    /** Below this NCC the best template is rejected ('low-score'). Carried from the binary reader's minScore. */
    readonly minScore: number;
    /** Below this NCC gap between best and runner-up the read abstains ('ambiguous'). The binary reader's minMargin. */
    readonly minMargin: number;
    readonly normalizedWidthPx: number;
    readonly normalizedHeightPx: number;
    readonly maxShiftPx: number;
}
export declare const DEFAULT_BADGE_COVERAGE_TEMPLATE_KNOBS: BadgeCoverageTemplateKnobs;
export interface CoverageLevels {
    /** Mean RGB luminance of the dark plate and of the white glyph, measured on this badge. */
    readonly plateLum: number;
    readonly glyphLum: number;
}
export interface NormalizedCoverage {
    readonly widthPx: number;
    readonly heightPx: number;
    /** coverage 0..1 per canvas pixel, row-major */
    readonly data: Float64Array;
}
/** LOCAL plate and glyph levels: two-means (medians) over the native pixels inside the inset. */
export declare function coverageLevels(image: RgbaBitmap, badge: BadgeCropBody): CoverageLevels;
/** The badge's coverage on the binary reader's grid, tight-cropped and area-resampled to the canvas; null without glyph. */
export declare function normalizeBadgeCoverage(image: RgbaBitmap, badge: BadgeCropBody, knobs?: BadgeCoverageTemplateKnobs, levels?: CoverageLevels): NormalizedCoverage | null;
/** Zero-mean normalized cross-correlation after shifting `b` by (dx, dy); 0 when either is flat. */
export declare function shiftedNcc(a: NormalizedCoverage, b: NormalizedCoverage, dx: number, dy: number): number;
export declare function bestCoverageScore(a: NormalizedCoverage, b: NormalizedCoverage, maxShiftPx: number): number;
export interface BadgeCoverageTemplateEntry {
    readonly label: number;
    readonly coverage: NormalizedCoverage;
}
export interface BadgeCoverageClassification {
    readonly label?: number;
    readonly bestLabel?: number;
    readonly runnerUpLabel?: number;
    readonly bestScore: number;
    readonly runnerUpScore: number;
    readonly ambiguityMargin: number;
    readonly abstention: 'empty-glyph' | 'low-score' | 'ambiguous' | null;
    readonly levels?: CoverageLevels;
}
export declare function classifyNormalizedCoverage(candidate: NormalizedCoverage | null, templates: readonly BadgeCoverageTemplateEntry[], knobs?: BadgeCoverageTemplateKnobs): BadgeCoverageClassification;
export declare function classifyBadgeCoverageAgainstTemplates(image: RgbaBitmap, badge: BadgeCropBody, templates: readonly BadgeCoverageTemplateEntry[], knobs?: BadgeCoverageTemplateKnobs): BadgeCoverageClassification;
/** Asset rows: one 2-hex-digit byte (coverage x 255, rounded) per pixel. */
export declare function decodeCoverageRows(rows: readonly string[], widthPx: number, heightPx: number): NormalizedCoverage;
export declare function encodeCoverageRows(coverage: NormalizedCoverage): string[];
