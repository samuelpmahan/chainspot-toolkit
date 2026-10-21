/**
 * Black-and-white DIGIT reader (Sam, 2026-10-21: "Can you adapt B+W into a
 * better reader?" ... "it can and should read by digit"): a third badge
 * reader beside the binary whole-number reader (badgeGlyphTemplateMath.ts,
 * the recorded baseline) and the coverage reader
 * (badgeCoverageTemplateMath.ts).
 *
 * Why the binary whole-number reader abstains: on the 108 dev badges all 32
 * of its abstentions are 'ambiguous' (thin margin), none 'low-score'. A dev
 * badge scores only 0.76-0.87 Dice against its own template, because the
 * templates come from older rasters binarized at a fixed level (strokes and
 * proportions differ from today's sprites), so near-identical numbers (15/16,
 * 16/18, 5/8, 13/18) tie. Templates made from dev sprites through the same
 * binarization lift that to near 1 and are the main lever; a LOCAL threshold
 * is the second.
 *
 * The reader:
 *  1. binarizes the badge on the binary reader's inset (14% / 16% of the
 *     bbox) at LOCAL level: luminance >= midway between this badge's plate
 *     and glyph levels (coverageLevels, the coverage reader's own measure);
 *  2. forms two layouts: one cell over the whole ink, and two cells split at
 *     the inter-digit gap (the widest run of ink-free columns inside the ink,
 *     or the emptiest interior column when the digits touch). Gap and cell
 *     widths are measured on each badge, in sample cells, never fixed px;
 *  3. normalizes each cell to a 16x24 digit canvas scaled by the badge's
 *     full ink height (digits share a cap height, so a "1" stays narrow);
 *  4. scores each cell against digit templates 0-9 (best shifted Dice over a
 *     digit's templates) and takes the layout with the better mean digit
 *     score;
 *  5. abstains on the layout when one-cell vs two-cell is close, per digit on
 *     a low score or a thin margin over the next digit, and on a leading
 *     zero. Only then does the vocabulary bound the result: a number outside
 *     1..HOLE_LABEL_MAX or above the course's badge count is reported as
 *     such ('out-of-vocabulary', 'above-badge-count'), never bent to a
 *     nearby allowed number.
 *
 * It differs from the per-digit segmentation reader (measure.ts, readBadges):
 * that one takes connected components of S1's bright mask (fixed HSV
 * thresholds), gates and valley-splits them, classifies each with a trained
 * logistic model on a 24x32 canvas, and then picks the best label by the
 * product of digit posteriors over the vocabulary. This one thresholds
 * per badge, decides one-vs-two digits as competing layouts scored jointly,
 * matches templates cut from the dev sprites, and applies the vocabulary only
 * afterwards.
 *
 * Fixed quantities: badges are screen-fixed sprites (DOCTRINE: GLOBAL, size
 * by label, not map-scaled). Nothing here is in absolute px anyway: the inset
 * is a fraction of the bbox, the sampling grid and canvases are resolutions,
 * and the gap is measured per badge.
 */
import type { BadgeCropBody, NormalizedGlyphMask, RgbaBitmap } from './badgeGlyphTemplateMath';
export interface BadgeDigitTemplateKnobs {
    /** Dice below this rejects a digit ('low-score'): the binary reader's minScore, carried. */
    readonly minScore: number;
    /** Dice gap to the next digit below this abstains ('ambiguous-digit'): the binary reader's minMargin. */
    readonly minMargin: number;
    /** Gap between the one-cell and two-cell mean digit scores below this abstains ('ambiguous-layout'). */
    readonly minLayoutMargin: number;
    readonly maxShiftPx: number;
    readonly digitWidthPx: number;
    readonly digitHeightPx: number;
}
export declare const DEFAULT_BADGE_DIGIT_TEMPLATE_KNOBS: BadgeDigitTemplateKnobs;
export interface BadgeDigitTemplateEntry {
    readonly digit: number;
    /** Which dev sprite and position it was cut from, e.g. "14 right". */
    readonly from: string;
    readonly mask: NormalizedGlyphMask;
}
export interface DigitRead {
    readonly digit: number;
    readonly score: number;
    readonly runnerUp: number;
    readonly margin: number;
}
export type BadgeDigitAbstention = 'empty-glyph' | 'ambiguous-layout' | 'low-score' | 'ambiguous-digit' | 'leading-zero' | 'out-of-vocabulary' | 'above-badge-count';
export interface BadgeDigitClassification {
    /** The number the digits spell, whatever the abstention (null only without glyph). */
    readonly number: string | null;
    /** The accepted label, or null. */
    readonly label: string | null;
    readonly abstention: BadgeDigitAbstention | null;
    readonly layout: 1 | 2 | null;
    readonly layoutMargin: number;
    /** min over digits of the digit margin. */
    readonly digitMargin: number;
    /** min(layoutMargin, digitMargin): how close the read came to abstaining. */
    readonly margin: number;
    readonly digits: readonly DigitRead[];
    /** The measured inter-digit gap and ink span, in sample columns (1/96 of the bbox width each). */
    readonly gapColumns: number;
    readonly inkColumns: number;
}
/** The badge's glyph, binarized at the midway level between its own plate and glyph. */
export declare function sampleBadgeDigits(image: RgbaBitmap, badge: BadgeCropBody): Uint8Array;
export interface BadgeDigitLayouts {
    readonly one: readonly NormalizedGlyphMask[];
    readonly two: readonly NormalizedGlyphMask[] | null;
    readonly gapColumns: number;
    readonly inkColumns: number;
}
/** The one-cell and two-cell layouts of a sampled glyph (null without ink). */
export declare function badgeDigitLayouts(grid: Uint8Array, knobs?: BadgeDigitTemplateKnobs): BadgeDigitLayouts | null;
export declare function classifyBadgeDigitsAgainstTemplates(image: RgbaBitmap, badge: BadgeCropBody, templates: readonly BadgeDigitTemplateEntry[], badgeCount?: number | null, knobs?: BadgeDigitTemplateKnobs): BadgeDigitClassification;
/** Asset rows: one 0/1 char per pixel, as the binary templates. */
export declare function decodeDigitRows(rows: readonly string[], widthPx: number, heightPx: number): NormalizedGlyphMask;
/** Best Dice per digit 0..9 in every cell of both layouts: the table the learned abstention reads its features from
 * (badgeReaderCalibration.ts digitLabelFeatures). Null layouts when the glyph does not form them. */
export declare function badgeDigitScoreTable(image: RgbaBitmap, badge: BadgeCropBody, templates: readonly BadgeDigitTemplateEntry[], knobs?: BadgeDigitTemplateKnobs): {
    one: number[][] | null;
    two: number[][] | null;
};
