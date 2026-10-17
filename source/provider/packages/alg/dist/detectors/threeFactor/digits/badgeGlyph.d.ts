/**
 * Badge glyph extraction — the exact logic scripts/nuthing/build-manifest.ts
 * used to materialize the manifest's glyph masks, as a browser-portable
 * function so runtime badge reading and the training data share one
 * definition: interior = bounding box of dark pixels inside the badge bbox;
 * glyph = bright pixels inside that interior that are NOT part of the badge
 * frame component.
 *
 * FRAME EXCLUSION (fix contract C1, docs/seven-whys/g1-badge-digit-garbage.md):
 * a `bright-family` badge's own frame IS a bright component (`badge.label`),
 * so `brightLabels[i] !== badge.label` excludes it correctly on its own. A
 * `dark-plate-recovery` badge (badgeStage.ts's `recoverDarkPlateBadges`) has
 * no bright component of its own — it is stamped with the sentinel
 * `label: -1`, which no real bright pixel ever carries, so that same test is
 * a silent no-op and the plate's own bright rounded-rect outline is fed to
 * the digit segmenter as if it were a glyph.
 *
 * The fix is POSITIVE identification of the frame from the plate geometry
 * `recoverDarkPlateBadges` already measured, not a percentage-of-interior
 * heuristic: `recoverDarkPlateBadges` measures the plate's glyph-bearing
 * interior as `plateBbox` inset by `plateInteriorMargin` on every side (the
 * exact rectangle it scans for `plateGlyphFraction`). Any bright component
 * touching (within `plateFrameTolerancePx` raster cells, a raster-geometry
 * allowance per the footgun law, NOT a size threshold) all four edges of
 * that same rectangle is, by construction, tracing the rectangle's own
 * boundary — i.e. the plate's printed rim — because a real digit glyph is
 * rendered centered with margin on every side and never reaches all four
 * edges at once. This is reused, not reinvented, geometry: the identical
 * inset rectangle `recoverDarkPlateBadges` already computed to measure
 * `plateGlyphFraction` at badge-discovery time.
 */
import type { Mask } from '../raster';
import type { ComponentStats } from '../components';
export interface BadgeGlyph {
    /** [x, y, w, h] of the dark interior in image coordinates; w=h=0 if none. */
    interiorBbox: [number, number, number, number];
    /** Binary glyph mask of size interior w*h (row-major). */
    mask: Mask;
    /** Bright-component labels excluded as the plate's own frame (C1 receipt
     * provenance); empty for badges with no plate-frame geometry supplied. */
    frameLabels: readonly number[];
    /** Human-readable provenance for the frame exclusion, or null when no
     * plate geometry was supplied (bright-family badges rely solely on the
     * badge's own component label, which is already a positive identity). */
    frameProvenance: string | null;
}
/** The plate geometry `recoverDarkPlateBadges` already measured for a
 * `dark-plate-recovery` badge, threaded down so glyph extraction can
 * positively identify the plate's own bright frame instead of guessing. */
export interface PlateFrameGeometry {
    /** [x, y, w, h] of the ORIGINAL dark plate component, image coordinates
     * (badgeStage.ts's `plateBboxes[i]`, pre-margin-expansion). */
    readonly plateBbox: readonly [number, number, number, number];
    /** Same inset badgeStage.ts's `recoverDarkPlateBadges` used to measure
     * `plateGlyphFraction` (its `plateInteriorMargin` knob). */
    readonly plateInteriorMarginPx: number;
    /** Raster-cell allowance for "touches the edge" (footgun law: commented
     * as raster geometry, not a size threshold). */
    readonly plateFrameTolerancePx: number;
}
export declare function extractBadgeGlyph(badge: ComponentStats, brightMask: Mask, darkMask: Mask, brightLabels: Int32Array, plateFrame?: PlateFrameGeometry | null): BadgeGlyph;
