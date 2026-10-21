/**
 * Whole-glyph Dice-coefficient template matcher — a pure-TS port of the
 * PRE-REBUILD classifier (`old-stuff/src/lib/autoAnnotation/
 * badgeGlyphClassifier.ts`, `classifyKnownBadgeBodiesPureTs` +
 * `normalizeBadgeGlyphMask` + `shiftedDice`), resurrected per docs/
 * CLAIMS-LEDGER.md row 23 (UPHELD): on the full Dev6 corpus this mechanism
 * formed an exact 1..18 bijection and was correct on every disputed badge
 * the per-digit segmentation reader misread, because the vocabulary here is
 * STRUCTURAL — the classifier can only ever say "this looks most like one
 * of these 18 known shapes, or I abstain" — rather than concatenating
 * independently-classified digits into an unbounded string.
 *
 * This module is the badgeGlyphTemplate ABFeature's math only: given a
 * badge's on-image bounding box and the raw RGBA raster it was detected in
 * (the SAME `localImage` slot and the SAME badge bbox the current per-digit
 * reader consumes — see g1.badgeGlyphTemplate.ts), it samples a coarse
 * bright/dark mask, normalizes it to a small canonical canvas, and scores it
 * against pre-normalized canonical hole-number templates (one per label of
 * digits/holeLabels.ts) by a
 * translation-tolerant (shifted) Dice coefficient. Abstention is
 * first-class: a low top score or a thin top-vs-runner-up margin refuses to
 * label rather than guessing (house rule: loud UNKNOWN over silent
 * smoothing).
 *
 * Every threshold below is the OLD system's own empirical value, carried as
 * verbatim as this port allows (house rule: an imported numeric constant
 * needs a per-image or empirical justification comment; these are the old
 * classifier's own values, proven on this exact corpus by the ledger row 23
 * head-to-head, so the justification IS that empirical record, not a fresh
 * derivation here).
 */
export interface RgbaBitmap {
    readonly width: number;
    readonly height: number;
    /** RGBA, row-major, 4 bytes per pixel. Alpha is ignored. */
    readonly data: Uint8Array | Uint8ClampedArray;
}
/** Center + size of the badge region to sample, in the same image-pixel
 * frame as `RgbaBitmap` — identical shape to the current reader's
 * `ComponentStats.bboxX/Y/W/H`-derived crop, just center-based like the old
 * classifier's own `KnownBadgeBody`. */
export interface BadgeCropBody {
    readonly xPx: number;
    readonly yPx: number;
    readonly widthPx: number;
    readonly heightPx: number;
}
export interface NormalizedGlyphMask {
    readonly widthPx: number;
    readonly heightPx: number;
    /** one byte per pixel, 0/1, row-major */
    readonly data: Uint8Array;
}
export interface BadgeGlyphTemplateKnobs {
    /** Dice score below this is an outright reject, never a guess (old
     * system's empirical `minScore`, badgeGlyphClassifier.ts DEFAULTS). */
    readonly minScore: number;
    /** Gap between the best and second-best template score required before
     * accepting the best one (old system's empirical `minMargin`). */
    readonly minMargin: number;
    /** Max grayscale channel value at/above which a sampled pixel counts as
     * "bright" foreground (old system's empirical `foregroundThreshold`,
     * paired with a <=90 max-min channel spread test for neutral/white). */
    readonly foregroundThreshold: number;
    /** Canonical normalized canvas size the old classifier trained/tested
     * its templates at (old system's empirical `normalizedWidthPx/HeightPx`). */
    readonly normalizedWidthPx: number;
    readonly normalizedHeightPx: number;
    /** +/- integer pixel search window for the best translation alignment
     * before scoring Dice (old system's empirical `maxShiftPx`). */
    readonly maxShiftPx: number;
}
export declare const DEFAULT_BADGE_GLYPH_TEMPLATE_KNOBS: BadgeGlyphTemplateKnobs;
export declare function brightNeutral(r: number, g: number, b: number, threshold: number): boolean;
/**
 * Sample a badge crop's foreground, tight-crop it, and re-draw it centered
 * on the canonical normalized canvas (nearest-neighbor, preserving aspect
 * ratio). Returns null when the badge has no bright foreground at all
 * (empty-glyph — the caller must abstain, not guess).
 */
export declare function normalizeBadgeGlyphMask(image: RgbaBitmap, badge: BadgeCropBody, knobs?: BadgeGlyphTemplateKnobs): NormalizedGlyphMask | null;
/** Dice coefficient (2|A∩B| / (|A|+|B|)) between two same-size masks after
 * shifting `b` by (dx, dy) — 0 when either mask is empty. */
export declare function shiftedDice(a: NormalizedGlyphMask, b: NormalizedGlyphMask, dx: number, dy: number): number;
/** Best Dice score over every integer translation within +/- maxShiftPx —
 * tolerates the old classifier's small alignment jitter between a live
 * badge crop and a canonical template. */
export declare function bestMaskScore(a: NormalizedGlyphMask, b: NormalizedGlyphMask, maxShiftPx: number): number;
export interface BadgeGlyphTemplateEntry {
    readonly label: number;
    readonly mask: NormalizedGlyphMask;
}
export type BadgeGlyphTemplateAbstention = 'empty-glyph' | 'low-score' | 'ambiguous';
export interface BadgeGlyphTemplateClassification {
    /** Accepted label, or undefined when abstained. */
    readonly label?: number;
    /** The top-scoring label regardless of abstention, for receipts (mirrors
     * BadgeEvidence.bestLabel's "what it would have said" contract). Absent
     * only when there was no glyph to score at all. */
    readonly bestLabel?: number;
    readonly bestScore: number;
    readonly runnerUpScore: number;
    readonly ambiguityMargin: number;
    readonly abstention: BadgeGlyphTemplateAbstention | null;
}
/**
 * Rank an already-normalized candidate mask against the vocabulary and
 * decide accept/abstain. Split out from `classifyBadgeGlyphAgainstTemplates`
 * so the classifier's OWN self-test contract (old-stuff/tests/unit/
 * badgeGlyphClassifier.test.ts: "every canonical template classifies as
 * itself") can be exercised directly on the baked template masks
 * (assets/badge-glyph-templates.json), with no raw-pixel re-sampling
 * round-trip through a synthesized image — see
 * tests/unit/badgeGlyphTemplateMath.test.ts.
 */
export declare function classifyNormalizedGlyph(candidate: NormalizedGlyphMask | null, templates: readonly BadgeGlyphTemplateEntry[], knobs?: BadgeGlyphTemplateKnobs): BadgeGlyphTemplateClassification;
/**
 * Classify one badge crop against the template vocabulary. Structurally
 * incapable of emitting a label outside `templates` — the vocabulary
 * constraint the ledger's row 22/23 forensics found the per-digit reader
 * lacks.
 */
export declare function classifyBadgeGlyphAgainstTemplates(image: RgbaBitmap, badge: BadgeCropBody, templates: readonly BadgeGlyphTemplateEntry[], knobs?: BadgeGlyphTemplateKnobs): BadgeGlyphTemplateClassification;
