import type { Drawable, FeatureRender, FeatureRenderPlan, RunTrace, UnitTrace } from './types';
export declare const BADGE_GLYPH_TEMPLATE_FEATURE_ID: "badgeGlyphTemplate";
declare const UNKNOWN: "UNKNOWN";
export type BadgeGlyphTemplateReceiptValue = number | typeof UNKNOWN;
export type BadgeGlyphTemplateReceiptText = string | typeof UNKNOWN;
export interface BadgeGlyphTemplateReceiptRow {
    readonly badgeId: BadgeGlyphTemplateReceiptText;
    readonly currentLabel: BadgeGlyphTemplateReceiptText;
    readonly currentConfidence: BadgeGlyphTemplateReceiptText;
    readonly templateLabel: BadgeGlyphTemplateReceiptText;
    readonly templateBestLabel: BadgeGlyphTemplateReceiptText;
    readonly templateScore: BadgeGlyphTemplateReceiptValue;
    readonly templateMargin: BadgeGlyphTemplateReceiptValue;
    readonly templateAbstention: BadgeGlyphTemplateReceiptText;
    readonly agreement: BadgeGlyphTemplateReceiptText;
    readonly verdict: Drawable['verdict'];
    readonly reason: string;
}
export interface BadgeGlyphTemplateReceiptCounts {
    readonly badges: BadgeGlyphTemplateReceiptValue;
    readonly agree: BadgeGlyphTemplateReceiptValue;
    readonly disagree: BadgeGlyphTemplateReceiptValue;
    readonly templateAbstained: BadgeGlyphTemplateReceiptValue;
    readonly readerAbstained: BadgeGlyphTemplateReceiptValue;
    readonly bothAbstained: BadgeGlyphTemplateReceiptValue;
}
export interface BadgeGlyphTemplateReceipt {
    readonly plan: FeatureRenderPlan;
    readonly rows: readonly BadgeGlyphTemplateReceiptRow[];
    readonly disagreementRows: readonly BadgeGlyphTemplateReceiptRow[];
    readonly counts: BadgeGlyphTemplateReceiptCounts;
    readonly cliText: string;
}
/** Build the CLI/visual receipt pair from one badgeGlyphTemplate UnitTrace. */
export declare function buildBadgeGlyphTemplateReceipt(unit: UnitTrace, run: RunTrace): BadgeGlyphTemplateReceipt;
/** FeatureRender seam: producer drawables are forwarded unchanged. */
export declare const badgeGlyphTemplateRender: FeatureRender;
export {};
