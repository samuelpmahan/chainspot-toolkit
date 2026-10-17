import { type SmartBasketOptions } from '../smartBasket';
import type { FeatureRender } from './types';
export interface SmartSpriteKnobs extends Required<SmartBasketOptions> {
    readonly spriteWidth: number;
    readonly spriteHeight: number;
}
/** The sprite feature owns this plan. LAB only rasterizes its traced geometry. */
export declare const G2_SPRITE_RENDER: FeatureRender;
export declare const g2SpriteFeature: {
    id: string;
    gate: "G2";
    kind: "baseline";
    defaultEnabled: true;
    note: string;
    render: FeatureRender;
    knobs: {
        bboxTolerancePx: {
            default: number;
            note: string;
            validate: (value: unknown) => "bboxTolerancePx must be a non-negative integer" | null;
        };
        areaRatioMin: {
            default: number;
            validate: (value: unknown) => string | null;
        };
        areaRatioMax: {
            default: number;
            validate: (value: unknown) => string | null;
        };
        cleanWhiteCoverageMin: {
            default: number;
            validate: (value: unknown) => string | null;
        };
        cleanDarkShellMin: {
            default: number;
            validate: (value: unknown) => string | null;
        };
        cleanDarkCoherenceMin: {
            default: number;
            validate: (value: unknown) => string | null;
        };
        shellRadiusPx: {
            default: number;
            validate: (value: unknown) => "shellRadiusPx must be a positive integer" | null;
        };
        blackConsensusFraction: {
            default: number;
            validate: (value: unknown) => string | null;
        };
        blackConsensusMarginPx: {
            default: number;
            validate: (value: unknown) => string | null;
        };
        recoveryIdentityMin: {
            default: number;
            validate: (value: unknown) => string | null;
        };
        recoveryWhiteCoverageMin: {
            default: number;
            validate: (value: unknown) => string | null;
        };
        recoveryBlackSupportMin: {
            default: number;
            validate: (value: unknown) => string | null;
        };
        recoveryVisibilityMin: {
            default: number;
            validate: (value: unknown) => string | null;
        };
        highVisibilityMin: {
            default: number;
            validate: (value: unknown) => string | null;
        };
        dedupeRadiusPx: {
            default: number;
            validate: (value: unknown) => string | null;
        };
        semanticTipOffsetPx: {
            default: number;
            note: string;
            validate: (value: unknown) => string | null;
        };
        maxChildrenPerSeed: {
            default: number;
            validate: (value: unknown) => "maxChildrenPerSeed must be a positive integer" | null;
        };
        spriteWidth: {
            default: number;
            validate: (value: unknown) => string | null;
        };
        spriteHeight: {
            default: number;
            validate: (value: unknown) => string | null;
        };
    };
};
