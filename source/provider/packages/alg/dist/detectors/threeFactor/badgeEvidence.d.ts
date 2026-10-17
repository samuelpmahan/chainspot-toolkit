import type { MaterializedComponentAssembly, RasterComponentRef } from './componentAssembly';
import type { BrightDarkComponentFields } from './componentField';
import type { BadgeEvidence, RgbaImage } from './types';
export declare const BADGE_MATERIALIZED_EVIDENCE_SCHEMA: "chainspot.badge-evidence/v1";
export interface BadgeEvidenceProvenance {
    readonly imageId: string;
    readonly paramsHash: string;
    readonly detector: string;
    readonly detectorVersion: string;
}
export interface MaterializedBadgeEvidence {
    readonly schema: typeof BADGE_MATERIALIZED_EVIDENCE_SCHEMA;
    readonly id: string;
    readonly provenance: BadgeEvidenceProvenance;
    readonly badge: BadgeEvidence;
    readonly raster: {
        readonly width: number;
        readonly height: number;
    };
    readonly region: {
        readonly bbox: readonly [number, number, number, number];
        readonly rgba: Uint8Array;
        readonly brightMask: Uint8Array;
        readonly darkMask: Uint8Array;
        readonly brightLabels: Int32Array;
        readonly darkLabels: Int32Array;
    };
    readonly components: readonly RasterComponentRef[];
    readonly ownedBwPixels: Uint32Array;
    readonly aaPixels: Uint32Array;
    readonly residuePixels: Uint32Array;
    readonly measurements: {
        readonly bwOwnedPixelCount: number;
        readonly aaAddedPixelCount: number;
        readonly residueBefore: number;
        readonly residueAfter: number;
    };
}
/**
 * Refine exact B+W component ownership with the deliberately naive AA floor.
 * This consumes measurements already made by G1/object acquisition; it never
 * thresholds, labels, selects components, or consults truth.
 */
export declare function materializeBadgeEvidence(image: RgbaImage, fields: BrightDarkComponentFields, badge: BadgeEvidence, assembly: MaterializedComponentAssembly, provenance: BadgeEvidenceProvenance, fieldTopPx?: number): MaterializedBadgeEvidence;
/** Stable sink payload; typed arrays stay typed when read back in browser or Node. */
export declare function encodeMaterializedBadgeEvidence(specimen: MaterializedBadgeEvidence): Uint8Array;
export declare function decodeMaterializedBadgeEvidence(bytes: Uint8Array): MaterializedBadgeEvidence;
/** Consumer projection: OFF is the stored exact baseline; ON is additive. */
export declare function badgeOwnedPixels(specimen: MaterializedBadgeEvidence, includeAa: boolean): Uint32Array;
