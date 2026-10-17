/**
 * Fast badge-only localization stage (experimental speed path).
 *
 * Runs exactly P1's mask -> components -> badge-family stages and stops:
 * the projected-border tee scoring (the dominant P1 cost) is skipped
 * because middle-out ribbon endpoint discovery (./ribbon.ts) replaces the
 * tee template ranking in the P1.5 pipeline. Badge semantics are identical
 * to runNuThingP1 — same masks, same components, same anchored family.
 */
import type { RgbaImage, Mask } from './raster';
import type { ComponentStats } from './components';
export interface BadgeStageResult {
    width: number;
    height: number;
    brightMask: Mask;
    darkMask: Mask;
    brightLabels: Int32Array;
    brightComponents: ComponentStats[];
    badges: ComponentStats[];
    badgeCount: number;
}
/** Existing badge-family decision over already materialized mask/component evidence. */
export declare function detectBadgeFamily(width: number, dark: Mask, brightComponents: readonly ComponentStats[]): ComponentStats[];
export declare function runBadgeStage(image: RgbaImage): BadgeStageResult;
