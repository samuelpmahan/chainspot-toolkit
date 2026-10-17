/**
 * G1 badgeGlyphTemplate — default-OFF whole-glyph Dice-template classifier,
 * run alongside (never replacing) the current per-digit segmentation reader.
 *
 * Mission (owner, near-verbatim): "put the thing in an ABFeature and test
 * it -- isn't that the entire point of ABF?" The "thing" is the pre-rebuild
 * whole-glyph badge classifier docs/CLAIMS-LEDGER.md row 23 (UPHELD)
 * resurrected as a standalone harness (scripts/chainspot-lab/
 * legacyBadgeClassifier/, now deleted -- its evidence lives in the ledger,
 * not in a lab surface) and, per the ledger's standing docket, given a
 * permanent lane here as a real ABFeature.
 *
 * When OFF (the default): this unit is not even present in a default
 * execution list (see configs/default.json vs configs/
 * badge-glyph-template-on.json) -- zero behavior change, by absence, exactly
 * like teeMinAreaPose/teeBadgeLock.
 *
 * When ON: for every badge the current reader already produced
 * (`board.get('badges')`), this feature independently classifies the SAME
 * on-image badge bbox against the SAME `localImage` raster the current
 * reader's `extractBadgeGlyph`/`readBadge` pipeline consumes (measure.ts's
 * `makeBadges` -> `readCourseBadges` -> `readBadge`), using the ported
 * whole-glyph template matcher (`../digits/badgeGlyphTemplateMath.ts`). It
 * NEVER writes back into `badges` or `BadgeEvidence.label` -- the current
 * reader's read stands unmodified. It publishes, per badge: the template's
 * own label (or abstention), its best-guess label, its Dice score and
 * ambiguity margin, and an explicit agreement verdict against the current
 * reader's read. A disagreement is `verdict: 'rejected'` (loud), an
 * agreement is `verdict: 'accepted'`, and any abstention on either side is
 * `verdict: 'info'` with the abstaining side named -- never silently folded
 * into agreement or disagreement.
 */
import type { BadgeEvidence } from '../types';
import { type BadgeGlyphTemplateClassification, type BadgeGlyphTemplateEntry, type BadgeGlyphTemplateKnobs, type RgbaBitmap } from '../digits/badgeGlyphTemplateMath';
import type { EngineUnit } from './types';
/** Parsed once at import time: the baked rows (0/1 char strings) decoded to
 * Uint8Array masks, in template-label order. */
export declare const BADGE_GLYPH_TEMPLATES: readonly BadgeGlyphTemplateEntry[];
export declare const badgeGlyphTemplateFeature: {
    id: string;
    gate: "G1";
    kind: "deviation";
    defaultEnabled: false;
    resolveOnlyWhenConfigured: true;
    note: string;
    render: import("./types").FeatureRender;
    knobs: {
        minScore: {
            default: number;
            note: string;
        };
        minMargin: {
            default: number;
            note: string;
        };
        foregroundThreshold: {
            default: number;
            note: string;
        };
        maxShiftPx: {
            default: number;
            note: string;
        };
    };
};
export interface BadgeGlyphTemplateVerdict {
    readonly badgeId: string;
    /** Current per-digit reader's accepted label (null when UNREAD/abstained/collision). */
    readonly currentLabel: string | null;
    /** Template classifier's accepted label (null when it abstained). */
    readonly templateLabel: string | null;
    /** Template classifier's top candidate regardless of its own abstention. */
    readonly templateBestLabel: string | null;
    readonly templateScore: number;
    readonly templateMargin: number;
    readonly templateAbstention: BadgeGlyphTemplateClassification['abstention'];
    /** Current reader's classifier margin (BadgeEvidence.confidence), or Infinity
     * when no digits were scored (in which case readerFillFraction exists instead). */
    readonly readerConfidence: number;
    /** Current reader's geometric fill fraction (BadgeEvidence.fillFraction) when
     * readerConfidence is Infinity; undefined otherwise. */
    readonly readerFillFraction?: number;
    /**
     * 'agree'      both sides emitted the same label.
     * 'disagree'   both sides emitted a label and they differ -- loud finding.
     * 'templateAbstained'  reader has a label, template abstained.
     * 'readerAbstained'    template has a label, reader abstained/UNREAD.
     * 'bothAbstained'      neither side emitted a label.
     */
    readonly agreement: 'agree' | 'disagree' | 'templateAbstained' | 'readerAbstained' | 'bothAbstained';
}
/** Runtime entry point shared by the EngineUnit below and unit tests: pure
 * function over one badge + the raster it was detected in. */
export declare function classifyBadgeAgainstTemplates(image: RgbaBitmap, badge: BadgeEvidence, viewportTopPx?: number, knobs?: BadgeGlyphTemplateKnobs): BadgeGlyphTemplateVerdict;
/** Default-OFF G1 deviation: independent evidence alongside the current
 * reader, never a replacement. Absent from a config's `execution` list, this
 * unit does not run at all (same "absence, not merely disabled" contract as
 * teeMinAreaPose/teeBadgeLock). */
export declare const badgeGlyphTemplateUnit: EngineUnit;
