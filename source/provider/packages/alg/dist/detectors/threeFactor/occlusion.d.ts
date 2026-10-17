/**
 * Small, truth-independent occlusion vocabulary used by G3 recovery.
 *
 * The detector deliberately distinguishes OPAQUE from ALPHA.  A flattened
 * alpha edge is not evidence that an expected tee border is hidden, so the
 * recovery scorer may only use OPAQUE samples as an occlusion excuse.
 */
export type OcclusionKind = 'OPAQUE' | 'ALPHA' | 'UNKNOWN';
export interface OpaqueDetector {
    /** Coordinates are always original-image pixels. */
    kindAt(xPx: number, yPx: number): OcclusionKind;
}
/** Reserved sibling provider: ALPHA is legal vocabulary but tee recovery
 * deliberately does not use it as an excuse for missing paint. */
export interface AlphaDetector {
    kindAt(xPx: number, yPx: number): Extract<OcclusionKind, 'ALPHA' | 'UNKNOWN'>;
}
/**
 * Run-scoped composition seam. Producers register their known footprints;
 * consumers query one stable handler for the duration of that run. OPAQUE
 * wins over ALPHA, so an actual opaque sprite/badge is never weakened by a
 * later antialiasing provider. This is infrastructure, not a feature stage.
 */
export declare class OcclusionDetector implements OpaqueDetector {
    private readonly opaqueProviders;
    private readonly alphaProviders;
    registerOpaque(provider: OpaqueDetector): void;
    registerAlpha(provider: AlphaDetector): void;
    kindAt(xPx: number, yPx: number): OcclusionKind;
}
export interface OpaqueBox {
    readonly x0: number;
    readonly y0: number;
    readonly x1: number;
    readonly y1: number;
}
/** A deterministic detector useful for the basket/badge footprint seam. */
export declare class BoxOpaqueDetector implements OpaqueDetector {
    readonly boxes: readonly OpaqueBox[];
    constructor(boxes: readonly OpaqueBox[]);
    kindAt(xPx: number, yPx: number): OcclusionKind;
}
export declare function opaqueDetectorFromBoxes(boxes: readonly OpaqueBox[]): OpaqueDetector;
