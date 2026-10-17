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
import { type HsvKnobs } from './raster';
import type { ComponentStats } from './components';
/**
 * g1.badges knobs, threaded down as plain parameters. Copied from LAB's P1
 * constants originally (see file header); badgeSizeTolFactor is the
 * human-readable knob (1.15) — Math.log(...) is applied at the use site
 * (anchoredFamilies) per knob-inventory merge note 4, not baked into a
 * pre-logged constant, so the config value stays human-readable.
 * badgeAspectMin (1.15) and badgeSizeTolFactor (1.15) are coincidentally
 * equal, separate knobs. plateInteriorMargin and plateBboxMargin are also
 * coincidentally both 4, separate knobs.
 *
 * badgeInsidePadding is NOT read by any function in this file — it's the
 * measure.ts makeTees tee-exclusion padding (a g1.badges knob per the
 * cluster's row list). Bundled here anyway, unlike the g5.ribbon/g5.routing
 * CorridorParams-riding knobs: it doesn't ride any separate mechanism, it's
 * just consumed by a different file, so one shared bundle type threaded to
 * both badgeStage.ts and measure.ts is simpler than a second knobs type.
 */
export interface BadgeStageKnobs {
    readonly badgeAspectMin: number;
    readonly badgeAspectMax: number;
    readonly badgeDarkInteriorMin: number;
    readonly badgeSizeTolFactor: number;
    readonly plateMinWidth: number;
    readonly plateMaxWidth: number;
    readonly plateMinHeight: number;
    readonly plateMaxHeight: number;
    readonly plateAspectMin: number;
    readonly plateAspectMax: number;
    readonly plateFillMin: number;
    readonly plateInteriorMargin: number;
    readonly plateGlyphFractionMin: number;
    readonly plateGlyphFractionMax: number;
    readonly plateProximityThreshold: number;
    readonly plateBboxMargin: number;
    readonly badgeInsidePadding: number;
    readonly plateFrameTolerancePx: number;
}
export declare const DEFAULT_BADGE_STAGE_KNOBS: BadgeStageKnobs;
export interface BadgeStageResult {
    width: number;
    height: number;
    brightMask: Mask;
    darkMask: Mask;
    brightLabels: Int32Array;
    brightComponents: ComponentStats[];
    /** Same-stage dark CC evidence retained for object assembly; never recompute it downstream. */
    darkLabels: Int32Array;
    darkComponents: ComponentStats[];
    badges: ComponentStats[];
    badgeSources: ('bright-family' | 'dark-plate-recovery')[];
    plateBboxes: (readonly [number, number, number, number] | null)[];
    badgeCount: number;
    /** C1 provenance: the exact plate-geometry knobs used to measure each
     * `plateBbox`'s interior, threaded down so glyph extraction can
     * positively identify the plate's own frame (see digits/badgeGlyph.ts). */
    plateInteriorMarginPx: number;
    plateFrameTolerancePx: number;
}
/** Existing badge-family decision over already materialized mask/component evidence. */
export declare function detectBadgeFamily(width: number, dark: Mask, brightComponents: readonly ComponentStats[], knobs?: BadgeStageKnobs): ComponentStats[];
/**
 * Dark-plate badge recovery: scans dark-mask components for plausible
 * hole-number plates that the bright-family pass missed, and appends any
 * that pass, mutating `badges`/`badgeSources`/`plateBboxes` in place.
 * Extracted from runBadgeStage's tail (moved verbatim, not rewritten) so
 * the exec layer's badgeStage.badges operation (packages/alg/src/exec/
 * operations.ts) can call the exact same recovery pass without duplicating
 * its logic — runBadgeStage below is now a thin composition of this
 * function plus the earlier mask/component/family steps.
 */
export declare function recoverDarkPlateBadges(width: number, bright: Mask, dark: Mask, badges: ComponentStats[], badgeSources: ('bright-family' | 'dark-plate-recovery')[], plateBboxes: (readonly [number, number, number, number] | null)[], knobs?: BadgeStageKnobs, darkComponentsInput?: readonly ComponentStats[]): void;
export declare function runBadgeStage(image: RgbaImage, knobs?: BadgeStageKnobs, hsvKnobs?: HsvKnobs): BadgeStageResult;
