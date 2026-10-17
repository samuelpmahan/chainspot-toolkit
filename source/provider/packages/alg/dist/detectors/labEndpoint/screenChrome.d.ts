import type { ComponentStats } from './components';
/**
 * Residual screen-space map chrome that survives viewport auto-crop.
 *
 * UDisc course geometry is rendered into map space; Apple Maps attribution
 * and controls (the Apple/Maps mark, MAP/SAT pill, etc.) are screen-space UI.
 * Their individual white glyph fragments can satisfy the hollow-ring / tee
 * fallback geometry, but the *parent neighborhood* is unmistakably chrome:
 * a wide, multi-component, screen-axis cluster anchored to the bottom-left
 * or bottom-right edge.
 *
 * This module attributes those parent clusters explicitly. It does NOT
 * tighten tee geometry and does NOT blanket-suppress an edge strip: a real
 * hole is allowed near an image edge. Only candidate centers inside a
 * detected chrome parent region should be discounted/removed.
 */
export interface ScreenChromeRegion {
    x: number;
    y: number;
    width: number;
    height: number;
    componentCount: number;
}
/**
 * Detect bottom-edge screen chrome from the bright-component universe.
 *
 * The expansion is intentionally anisotropic (10 px horizontal, 2 px
 * vertical): text/control glyphs on one UI baseline should join into their
 * parent control, while nearby course geometry above the control should not.
 *
 * Measured on the five current course rasters, this finds exactly the two
 * obvious AlexClark parent regions (MAP/SAT and Apple Maps attribution) and
 * removes their tee-like children without removing any of the 69/72 baseline
 * dev truth tees.
 */
export declare function detectScreenChromeRegions(components: readonly ComponentStats[], width: number, height: number): ScreenChromeRegion[];
export declare function pointInScreenChrome(x: number, y: number, regions: readonly ScreenChromeRegion[], padding?: number): boolean;
