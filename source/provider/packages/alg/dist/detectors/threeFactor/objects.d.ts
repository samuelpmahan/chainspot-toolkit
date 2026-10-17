import type { ComponentStats } from './components';
import { type ComponentAssemblyFailure, type MaterializedComponentAssembly } from './componentAssembly';
import type { BadgeEvidence, BasketEvidence, TeeEvidence, ThreeFactorMeasurement } from './types';
export type RasterOwnership = {
    readonly bbox: readonly [number, number, number, number];
    readonly detectorId: string;
    readonly kind: 'observed' | 'fitted';
    /**
     * Present on component-backed acquisition. `failed` is deliberately
     * first-class: downstream code must not quietly reinterpret detector/fitted
     * geometry as the physical object perimeter.
     */
    readonly componentAssembly?: MaterializedComponentAssembly | ComponentAssemblyFailure;
};
export interface Badge {
    readonly kind: 'badge';
    readonly id: string;
    readonly raster: RasterOwnership;
    readonly evidence: BadgeEvidence;
}
export interface Basket {
    readonly kind: 'basket';
    readonly id: string;
    readonly raster: RasterOwnership;
    readonly evidence: BasketEvidence;
}
export interface Tee {
    readonly kind: 'tee';
    readonly id: string;
    readonly raster: RasterOwnership;
    readonly evidence: TeeEvidence;
}
export type CourseObject = Badge | Basket | Tee;
export interface Occlusion {
    readonly kind: 'occlusion';
    readonly occluderId: string;
    readonly occludedId: string;
    readonly evidence: {
        readonly basis: 'alpha-mask' | 'pixel-support';
        readonly visiblePixels: number;
        readonly occludedPixels: number;
        readonly note: string;
    };
}
/** The stable object seam: base objects keep only their own measured support. */
export interface ObjectGraph {
    readonly badges: readonly Badge[];
    readonly baskets: readonly Basket[];
    readonly tees: readonly Tee[];
    readonly occlusions: readonly Occlusion[];
}
/**
 * Same-stage connected-component evidence already computed by badgeStage.
 * Acquisition dereferences these labels exactly once, then stores the owned
 * pixels on the root object so physical consumers never reconstruct masks.
 */
export interface ObjectComponentEvidence {
    readonly width: number;
    readonly height: number;
    readonly brightLabels: Int32Array;
    readonly darkLabels: Int32Array;
    readonly brightComponents: readonly ComponentStats[];
    readonly darkComponents: readonly ComponentStats[];
}
/**
 * V1 component-backed root-object acquisition.
 *
 * Clean badges/tees use their bright outer CC. Clean baskets use their bright
 * body plus the exact modal enclosing dark-shell CC. Recovery/overlap cases
 * remain root objects for detector testimony, but their componentAssembly is
 * FAILED instead of fabricating a perimeter. Successful acquisition stores
 * the exact merged owned pixels + boundary pixels directly on the root object.
 */
export declare function acquireObjectGraphV1(measurement: ThreeFactorMeasurement, components: ObjectComponentEvidence): ObjectGraph;
/**
 * Legacy adapter retained while consumers migrate. It carries detector/fitted
 * boxes only and therefore must not be used when exact object ownership is
 * required. New physical-object consumers should use acquireObjectGraphV1.
 */
export declare function objectGraph(measurement: ThreeFactorMeasurement): ObjectGraph;
export declare function requireComponentAssembly(object: CourseObject): MaterializedComponentAssembly;
export declare function occlude(graph: ObjectGraph, relation: Occlusion): ObjectGraph;
