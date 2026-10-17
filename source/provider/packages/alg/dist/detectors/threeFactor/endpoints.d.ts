/**
 * Solid endpoint detection from render identity, replacing loose
 * bright-component family bounds ("bbox 36-48 × 58-74, fill ≥ 0.45"-style)
 * with detectors built on what UDisc actually draws (contact-sheet study of
 * all 72 dev truth tees + 72 truth baskets):
 *
 * - The BASKET is one fixed, unrotated 42×66 sprite bitmap — byte-identical
 *   in 60/66 clean dev detections (consensus template committed at
 *   resources/nuthing-p2/endpoints/basket-sprite.json). Detection is a
 *   matched filter over the bright mask, coarse-to-fine, so partially
 *   occluded sprites (badges, adjacent sprites, map furniture) still match
 *   on their visible fraction instead of falling out of a rigid
 *   connected-component family.
 *
 * - The TEE is the render stack's only small HOLLOW glyph: a thick white
 *   rectangle outline around a transparent (basemap-dark) interior, rotated
 *   to the hole direction, at two sizes (≈32×24 and ≈20×15 outer).
 *   Detection finds small enclosed dark holes in the bright mask and
 *   verifies the enclosing white ring. Merging with walking-path dashes or
 *   ring furniture does not destroy the hole, so this survives exactly the
 *   cases that broke component-family matching. Every qualifying hollow
 *   marker is a tee; squarer renderings are not a separate object class.
 */
import type { Mask } from './raster';
export interface SpriteTemplate {
    width: number;
    height: number;
    rows: string[];
}
export interface SpriteMatch {
    /** Sprite bbox top-left, source px. */
    x: number;
    y: number;
    /** Sprite center. */
    cx: number;
    cy: number;
    /** Pole-tip annotation point (center + h/2 + 4). */
    tipX: number;
    tipY: number;
    /** Fraction of template-on cells that are bright. */
    onFrac: number;
    /** Fraction of template-off cells that are bright (outline+corners). */
    offFrac: number;
    score: number;
}
export interface TeeRing {
    /** Hole (interior) centroid = tee center, source px. */
    cx: number;
    cy: number;
    /** Interior area in px. */
    holeArea: number;
    /** Interior bbox. */
    bboxX: number;
    bboxY: number;
    bboxW: number;
    bboxH: number;
    /** Principal-axis angle, radians in [0,π). */
    angle: number;
    /** Principal-axis elongation of the enclosed hole. */
    elongation: number;
    /** Bright fraction of the enclosing ring band. */
    ringFrac: number;
    /** Elongated tee versus square distractor. */
    kind: 'tee-rect' | 'diamond';
}
interface TemplateOffsets {
    w: number;
    h: number;
    on: Int32Array;
    off: Int32Array;
    onSample: Int32Array;
    offSample: Int32Array;
}
export declare function prepareSpriteTemplate(t: SpriteTemplate): TemplateOffsets;
/**
 * g2.sprite knobs, threaded down as plain parameters. spriteWidth/
 * spriteHeight (measure.ts's basket bbox) are structurally coupled to the
 * committed basket-sprite.json template asset — see the validate() on those
 * two knobs in features/g2.sprite.ts, which checks the configured value
 * against the asset's actual width/height rather than letting a mismatch
 * silently misreport the basket bbox size.
 *
 * NOT here: prepareSpriteTemplate's internal `sample(a, 4)` calls (its
 * on/off subsampling stride for the coarse pass) stay a literal. That
 * function runs once at MODULE LOAD (measure.ts's top-level
 * `prepareSpriteTemplate(basketSpriteData)`), before any config or ctx
 * exists — wiring it would mean recomputing the packed template per run
 * instead of once for the process lifetime, a restructuring beyond
 * "thread as parameter" for this commit.
 */
export interface SpriteKnobs {
    readonly coarseStride: number;
    readonly coarseThreshold: number;
    readonly scoreMin: number;
    readonly tipOffset: number;
    readonly coarseGateYOffset: number;
    readonly coarseGateXOffset: number;
    readonly refinementRadius: number;
    readonly staleScoreEpsilon: number;
    readonly spriteWidth: number;
    readonly spriteHeight: number;
}
export declare const DEFAULT_SPRITE_KNOBS: SpriteKnobs;
/**
 * Matched filter for the fixed basket sprite over the bright mask.
 * score = onFrac − offFrac; a clean sprite scores ~0.95+, a half-occluded
 * one ~0.3, a solid white blob 0. Coarse pass on sampled offsets at stride
 * 3, stride-1 refinement around surviving peaks, then matching-pursuit
 * dedupe (see below).
 */
export declare function matchBasketSprites(bright: Mask, template: TemplateOffsets, knobs?: SpriteKnobs): SpriteMatch[];
/**
 * g3.endpoints knobs, threaded down as plain parameters. Covers only the
 * TEE-related detection below (detectTeeRings/detectTeeRingsPass/
 * collectTeePoints); the sprite matched-filter knobs above (SpriteKnobs /
 * matchBasketSprites) are g2.sprite's, a separate cluster.
 */
export interface EndpointsKnobs {
    readonly holeAreaMin: number;
    readonly holeAreaMax: number;
    readonly holeDimMax: number;
    readonly ringBand: number;
    readonly ringFracMin: number;
    readonly dilationRadii: readonly number[];
    readonly largeRadiiThreshold: number;
    readonly largeRadiiAreaMin: number;
    readonly ringMergeProximity: number;
    readonly elongationThreshold: number;
    readonly componentMinDim: number;
    readonly componentMaxDim: number;
    readonly componentMinArea: number;
    readonly componentMaxArea: number;
    readonly componentMinFill: number;
    readonly componentMaxFill: number;
    readonly teeRingDedupDistance: number;
    readonly teeSpriteExclusionDistance: number;
}
export declare const DEFAULT_ENDPOINTS_KNOBS: EndpointsKnobs;
/**
 * Enclosed-hole tee detection: flood the non-bright background in from the
 * image border; any remaining non-bright pixel belongs to a hole fully
 * enclosed by bright pixels. Small holes wrapped in a mostly-bright ring band
 * are tee glyphs. Near-square geometry is expected and is not a negative
 * signal; no aspect or elongation gate is applied.
 *
 * Occlusion/antialiasing cuts 1-4 px gaps into some tee outlines, letting
 * the hole leak to background (5 of 9 dev tee misses). Fix: run the flood
 * against a DILATED copy of the mask (walls only) at radii 0, 1 and 2, but
 * always measure the hole on cells that are raw-dark, unflooded and not
 * wall-covered — never on a closed mask, which fills small holes outright.
 * Detections merge across radii, preferring the smallest radius (least
 * geometric distortion). Ring brightness is verified on the raw mask.
 */
export declare function detectTeeRings(bright: Mask, knobs?: EndpointsKnobs): TeeRing[];
export declare function detectTeeRingsPass(bright: Mask, wallRadius: number, areaMin: number, knobs?: EndpointsKnobs): TeeRing[];
export interface TeeComponentLike {
    cx: number;
    cy: number;
    bboxX?: number;
    bboxY?: number;
    bboxW: number;
    bboxH: number;
    area: number;
    fill: number;
    angle?: number;
}
export interface TeePoint {
    cx: number;
    cy: number;
    /** 'ring' = hollow-glyph detection (solid identity, has ring info);
     * 'component' = bright-component family fallback for rings the hole
     * method structurally cannot close (tees ON a C2D ring whose outline gap
     * opens into the ring interior — 4 of 72 dev tees). */
    tier: 'ring' | 'component';
    ring?: TeeRing;
    component?: TeeComponentLike;
}
/**
 * Two-tier tee candidate set. Tier 1: ring-detected hollow tees. Tier 2:
 * bright components matching the (widened, dev-measured) tee-rect family,
 * excluding anything already explained by a tier-1 tee or a matched basket
 * sprite's own neighborhood. Caller removes badge glyphs
 * from `components` first (digit counters contain rect-like holes/shapes).
 */
/** A tee candidate this function dropped, and exactly why. Recorded ONLY when
 * the caller passes a sink; omit the sink and behavior is byte-identical to
 * before this type existed. A dropped candidate is not evidence the hole has
 * no tee -- `sprite-exclusion` in particular fires on tees that sit close to a
 * basket, which is the occluded case, not the absent one. */
export interface SuppressedTee {
    readonly cx: number;
    readonly cy: number;
    readonly reason: 'dim' | 'area' | 'fill' | 'dedup-tee' | 'sprite-exclusion';
    /** The measured value that failed. */
    readonly value: number;
    /** The knob it was measured against. */
    readonly limit: number;
    /** For 'sprite-exclusion' and 'dedup-tee': what suppressed it, and how far. */
    readonly nearest?: {
        readonly cx: number;
        readonly cy: number;
        readonly dist: number;
    };
}
export declare function collectTeePoints(rings: TeeRing[], components: TeeComponentLike[], spriteCenters: {
    cx: number;
    cy: number;
}[], knobs?: EndpointsKnobs, suppressed?: SuppressedTee[]): TeePoint[];
export {};
