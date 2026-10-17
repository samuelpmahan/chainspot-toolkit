import type { ComponentStats } from './components';
export type RasterPolarity = 'bright' | 'dark';
export type RasterBbox = readonly [number, number, number, number];
export interface RasterComponentRef {
    readonly polarity: RasterPolarity;
    readonly label: number;
    readonly bbox: RasterBbox;
    readonly area: number;
}
export interface ComponentAssemblyRelationship {
    readonly container: RasterComponentRef;
    readonly member: RasterComponentRef;
    readonly predicate: 'bbox-contains' | 'modal-shell-encloses';
    readonly selection: 'largest-contained-dark-component' | 'contained-bright-component' | 'smallest-enclosing-dark-component-with-modal-margins';
    readonly margins?: BasketShellMargins;
}
export interface ComponentAssembly {
    readonly status: 'assembled';
    readonly components: readonly RasterComponentRef[];
    /** The component whose own connected perimeter is the object's visible outer perimeter. */
    readonly outerComponent: RasterComponentRef;
    /** Union of the owned components; derived once, never detector/fitted geometry. */
    readonly bbox: RasterBbox;
    /** Exact predicates the proven V1 assembler used to compose these components. */
    readonly relationships: readonly ComponentAssemblyRelationship[];
}
export interface ComponentAssemblyFailure {
    readonly status: 'failed';
    readonly reason: string;
    readonly seedBbox: RasterBbox;
}
export type ComponentAssemblyResult = ComponentAssembly | ComponentAssemblyFailure;
export type BasketShellMargins = readonly [
    left: number,
    top: number,
    right: number,
    bottom: number
];
export declare function componentRef(polarity: RasterPolarity, component: ComponentStats, yOffsetPx?: number): RasterComponentRef;
export declare function containsBbox(outer: RasterBbox, inner: RasterBbox): boolean;
export declare function unionBbox(parts: readonly RasterBbox[]): RasterBbox;
/**
 * V1 badge assembly: the detector's accepted bright badge-family component is
 * already the white outside. Own the largest contained dark component as the
 * plate, plus all bright components contained by that plate (glyphs).
 * Ambiguous/overlapped outer-white recovery is deliberately not rescued here.
 */
export declare function assembleBadgeV1(outerBright: ComponentStats, brightComponents: readonly ComponentStats[], darkComponents: readonly ComponentStats[], yOffsetPx?: number): ComponentAssemblyResult;
export declare function basketShellMargins(outerDark: ComponentStats, whiteBody: ComponentStats): BasketShellMargins;
/** Exact modal component geometry, no tolerance. Fused shells become V1 failures. */
export declare function learnBasketShellFamilyV1(whiteBodies: readonly ComponentStats[], darkComponents: readonly ComponentStats[]): BasketShellMargins | null;
export declare function assembleBasketV1(whiteBody: ComponentStats, darkComponents: readonly ComponentStats[], intactFamily: BasketShellMargins, yOffsetPx?: number): ComponentAssemblyResult;
/** V1 intact tee: the enclosing bright component is already the white outside. */
export declare function assembleTeeV1(outerBright: ComponentStats, yOffsetPx?: number): ComponentAssembly;
export interface ComponentRasterEvidence {
    readonly width: number;
    readonly height: number;
    readonly topPx: number;
    readonly brightLabels: Int32Array;
    readonly darkLabels: Int32Array;
}
export interface MaterializedComponentAssembly extends ComponentAssembly {
    /** Original-image raster width used to decode packed pixel indices. */
    readonly rasterWidth: number;
    /** Exact union of every owned connected-component pixel, packed as y*width+x. */
    readonly ownedPixels: Uint32Array;
    /** Boundary pixels of the exact owned union, packed in the same frame. */
    readonly perimeterPixels: Uint32Array;
}
/** Dereference one already-selected component without applying any new geometry. */
export declare function materializeRasterComponentPixels(component: RasterComponentRef, raster: ComponentRasterEvidence): Uint32Array;
/**
 * Materialize an already-decided component union into self-contained physical
 * ownership. No thresholding, dilation, filling, fitting, or component search
 * occurs here: labels are only dereferenced for the component refs acquisition
 * already selected.
 */
export declare function materializeComponentAssembly(assembly: ComponentAssembly, raster: ComponentRasterEvidence): MaterializedComponentAssembly;
