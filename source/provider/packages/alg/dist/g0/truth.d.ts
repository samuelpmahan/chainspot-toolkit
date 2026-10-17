import type { CanonicalFrame } from './canonicalFrame';
export interface AnnotationPoint {
    readonly xPx: number;
    readonly yPx: number;
}
export interface AnnotationHole {
    readonly id: string;
    readonly number: number;
    readonly shots: readonly unknown[];
    readonly corridorBends: readonly AnnotationPoint[];
    readonly corridorWidthPx: number;
    readonly tee: AnnotationPoint;
    readonly basket: AnnotationPoint;
    /** Optional explicit rendered-number/badge anchor for navigation tooling. */
    readonly numberBadge?: AnnotationPoint;
    /** Backward/alternate spelling accepted when an annotation source owns it. */
    readonly badge?: AnnotationPoint;
}
export interface AnnotationSourceImage {
    readonly fileName: string;
    readonly mimeType: string;
    readonly widthPx: number;
    readonly heightPx: number;
    readonly sha256: string;
    readonly bundlePath: string;
}
/** Native Annotation JSON shape (schemaVersion 1), used as truth as-is. */
export interface CanonicalTruth {
    readonly schemaVersion: number;
    readonly sourceImage: AnnotationSourceImage;
    readonly holes: readonly AnnotationHole[];
}
export type TruthMatchLevel = 'byte' | 'reconciled-verified' | 'dims-only';
export interface TruthMatch {
    readonly level: TruthMatchLevel;
    readonly matchedAgainst?: 'raw' | 'canonical';
    readonly warning?: string;
}
export declare function matchTruth(rawImageSha256: string, frame: Pick<CanonicalFrame, 'imageId' | 'widthPx' | 'heightPx' | 'ledger'>, truth: CanonicalTruth): TruthMatch | null;
