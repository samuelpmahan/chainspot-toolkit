import type { GrayRaster } from '../raster';
import type { Placement } from './types';
/** Placement-only fallback gap, in px, when tiles don't overlap enough to measure. */
export declare const FALLBACK_GAP_PX = 120;
/** The initial "spread" layout tiles get before any alignment runs. */
export declare function initialSpreadPlacements(tileWidthsPx: readonly number[]): Placement[];
export interface BadgeCenter {
    readonly n: number;
    readonly x: number;
    readonly y: number;
}
export interface SemanticAlignMatch {
    readonly tileIndex: number;
    readonly badgeNumbers: readonly number[];
}
export interface SemanticAlignResult {
    readonly placements: readonly Placement[];
    readonly matches: readonly SemanticAlignMatch[];
}
/**
 * Median-offset semantic alignment. Tile 0 is the anchor; every other tile
 * sharing at least one badge number with the anchor is placed at
 * `anchorPlacement + median(dx, dy)` over its shared badges (median, not
 * mean — a single mislabeled badge can't drag the whole tile). Tiles with
 * zero shared badge numbers are left at their current placement. Returns
 * null when nothing at all matched — the caller keeps the prior layout.
 */
export declare function trySemanticAlign(tileBadges: readonly (readonly BadgeCenter[])[], placements: readonly Placement[]): SemanticAlignResult | null;
export interface PixelStitchResult {
    readonly placements: readonly Placement[];
    /** true when at least one adjacent pair had no plausible overlap and fell back to the fixed gap. */
    readonly hadFallback: boolean;
}
/**
 * Pairwise pixel-translation stitch, accumulated left-to-right. Returns
 * null when there's nothing to stitch (fewer than 2 rasters) — the
 * caller's "not ready yet" messaging is page-side, not this function's job.
 */
export declare function solvePixelStitch(rasters: readonly GrayRaster[]): PixelStitchResult | null;
