import type { BadgeStageResult } from '../badgeStage';
import type { SpriteMatch } from '../endpoints';
import type { EngineUnit } from './types';
export interface CleanBasketFamilyKnobs {
    readonly bboxTolerancePx: number;
    readonly positionTolerancePx: number;
    readonly areaRatioMin: number;
    readonly areaRatioMax: number;
    readonly whiteCoverageMin: number;
    readonly shellRadiusPx: number;
    readonly darkShellMin: number;
    readonly darkCoherenceMin: number;
}
interface BasketTemplate {
    readonly width: number;
    readonly height: number;
    readonly rows: readonly string[];
}
export interface CleanBasketTestimony {
    readonly areaRatio: number;
    readonly whiteCoverage: number;
    readonly darkShell: number;
    readonly darkCoherence: number;
    readonly componentDx?: number;
    readonly componentDy?: number;
}
export interface CleanBasketDecision {
    readonly sprite: SpriteMatch;
    readonly accepted: boolean;
    readonly reason: string;
    readonly testimony: CleanBasketTestimony;
}
export interface CleanBasketFamilyResult {
    readonly sprites: readonly SpriteMatch[];
    readonly decisions: readonly CleanBasketDecision[];
}
export declare const cleanBasketFamilyFeature: {
    id: string;
    gate: "G2";
    kind: "deviation";
    defaultEnabled: false;
    note: string;
    knobs: {
        bboxTolerancePx: {
            default: number;
            note: string;
            validate: (value: unknown) => "bboxTolerancePx must be a non-negative integer" | null;
        };
        positionTolerancePx: {
            default: number;
            note: string;
            validate: (value: unknown) => "positionTolerancePx must be non-negative" | null;
        };
        areaRatioMin: {
            default: number;
            note: string;
            validate: (value: unknown) => "areaRatioMin must be non-negative" | null;
        };
        areaRatioMax: {
            default: number;
            note: string;
            validate: (value: unknown) => "areaRatioMax must be non-negative" | null;
        };
        whiteCoverageMin: {
            default: number;
            note: string;
            validate: (value: unknown) => string | null;
        };
        shellRadiusPx: {
            default: number;
            note: string;
            validate: (value: unknown) => "shellRadiusPx must be a positive integer" | null;
        };
        darkShellMin: {
            default: number;
            note: string;
            validate: (value: unknown) => string | null;
        };
        darkCoherenceMin: {
            default: number;
            note: string;
            validate: (value: unknown) => string | null;
        };
    };
};
/** Pure core: classify each baseline sprite as an intact basket-family member. */
export declare function selectCleanBasketFamily(stage: Pick<BadgeStageResult, 'brightMask' | 'darkMask' | 'brightLabels' | 'brightComponents'>, sprites: readonly SpriteMatch[], t: BasketTemplate, knobs: CleanBasketFamilyKnobs): CleanBasketFamilyResult;
export declare const cleanBasketFamilyUnit: EngineUnit;
export {};
