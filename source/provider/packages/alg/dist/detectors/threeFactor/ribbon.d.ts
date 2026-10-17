import type { BadgeEvidence, CorridorParams, SupportFieldEvidence } from './types';
import type { RgbaImage } from './types';
/**
 * g5.ribbon knobs, threaded down as plain parameters from the resolving
 * unit(s). fieldScale/supportTau are NOT here: they already flow as
 * ThreeFactorParams -> CorridorParams (measure.ts's makeParameters), so the
 * engine bridges the resolved knob values in at that existing site (see
 * engine.ts's ribbonState handling) instead of re-plumbing them through
 * ribbon.ts's functions. They're still registered on g5RibbonFeature so
 * config deviations and the resolved-config hash see them.
 */
export interface RibbonKnobs {
    readonly gaussianSigma: number;
    readonly blurRadiusSigmas: number;
    readonly gradientDeltaMultiplier: number;
    readonly normalizationPercentile: number;
    readonly supportGamma: number;
    readonly costMultiplier: number;
    readonly haloSupportThreshold: number;
    readonly patchReachMargin: number;
    readonly sampleOffsetPx: number;
    readonly patchOrientations: number;
    readonly centerOuterGrayMargin: number;
    readonly liftThreshold: number;
    readonly patchAcceptanceThreshold: number;
    readonly patchedCellSupportCap: number;
    readonly haloBboxMargin: number;
    readonly insideBadgeMargin: number;
}
export declare const DEFAULT_RIBBON_KNOBS: RibbonKnobs;
export declare function computeRibbonSupport(image: RgbaImage, parameters: CorridorParams, knobs?: RibbonKnobs): SupportFieldEvidence;
export declare function buildSupportCost(field: SupportFieldEvidence, knobs?: RibbonKnobs): Float32Array;
export declare function patchBadgeOcclusion(field: SupportFieldEvidence, image: RgbaImage, badges: readonly BadgeEvidence[], widthPx: number, knobs?: RibbonKnobs): {
    haloCells: number;
    patchedCells: number;
};
