/**
 * Badge glyph extraction — the exact logic scripts/nuthing/build-manifest.ts
 * used to materialize the manifest's glyph masks, as a browser-portable
 * function so runtime badge reading and the training data share one
 * definition: interior = bounding box of dark pixels inside the badge bbox;
 * glyph = bright pixels inside that interior that are NOT part of the badge
 * frame component.
 */
import type { Mask } from '../raster';
import type { ComponentStats } from '../components';
export interface BadgeGlyph {
    /** [x, y, w, h] of the dark interior in image coordinates; w=h=0 if none. */
    interiorBbox: [number, number, number, number];
    /** Binary glyph mask of size interior w*h (row-major). */
    mask: Mask;
}
export declare function extractBadgeGlyph(badge: ComponentStats, brightMask: Mask, darkMask: Mask, brightLabels: Int32Array): BadgeGlyph;
