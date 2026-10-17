import type { Mask } from './raster';
export interface SmartBasketTemplate {
    width: number;
    height: number;
    rows: string[];
}
export interface BasketBadgeLike {
    cx: number;
    cy: number;
    bboxX: number;
    bboxY: number;
    bboxW: number;
    bboxH: number;
}
export type SmartBasketTier = 'clean-family' | 'occlusion-recovery';
export type SmartBasketConfidence = 'high' | 'medium' | 'low';
export interface SmartBasketEvidence {
    /** Detector-local bright component bounds. These do not bound the sprite. */
    x: number;
    y: number;
    cx: number;
    cy: number;
    tipX: number;
    tipY: number;
    bboxW: number;
    bboxH: number;
    /** Full rendered sprite perimeter learned from white + associated black support. */
    semanticBbox: readonly [number, number, number, number];
    tier: SmartBasketTier;
    confidence: SmartBasketConfidence;
    identity: number;
    effectiveVisibility: number;
    whiteCoverage: number;
    blackBorderSupport: number;
    darkCoherence: number;
    source: string;
}
export interface SmartBasketDecision {
    readonly x: number;
    readonly y: number;
    readonly bboxW: number;
    readonly bboxH: number;
    /** Full rendered sprite perimeter; never the bright-component search window. */
    readonly semanticBbox: readonly [number, number, number, number];
    readonly tier: SmartBasketTier;
    readonly accepted: boolean;
    readonly reason: string;
    readonly source: string;
    readonly areaRatio: number;
    readonly identity: number;
    readonly effectiveVisibility: number;
    readonly whiteCoverage: number;
    readonly blackBorderSupport: number;
    readonly darkCoherence: number;
}
export interface SmartBasketOptions {
    bboxTolerancePx?: number;
    areaRatioMin?: number;
    areaRatioMax?: number;
    cleanWhiteCoverageMin?: number;
    cleanDarkShellMin?: number;
    cleanDarkCoherenceMin?: number;
    shellRadiusPx?: number;
    blackConsensusFraction?: number;
    blackConsensusMarginPx?: number;
    recoveryIdentityMin?: number;
    recoveryWhiteCoverageMin?: number;
    recoveryBlackSupportMin?: number;
    recoveryVisibilityMin?: number;
    highVisibilityMin?: number;
    dedupeRadiusPx?: number;
    semanticTipOffsetPx?: number;
    maxChildrenPerSeed?: number;
}
export declare const DEFAULT_SMART_BASKET_OPTIONS: Required<SmartBasketOptions>;
export declare function matchBasketSpritesSmart(bright: Mask, dark: Mask, badges: readonly BasketBadgeLike[], template: SmartBasketTemplate, options?: SmartBasketOptions, decisions?: SmartBasketDecision[]): SmartBasketEvidence[];
