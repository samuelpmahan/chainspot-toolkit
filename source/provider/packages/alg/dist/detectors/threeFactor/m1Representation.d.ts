import { type ComponentAssemblyRelationship } from './componentAssembly';
import type { BrightDarkComponentFields } from './componentField';
import type { ObjectGraph } from './objects';
export declare const M1_REPRESENTATION_SCHEMA: "chainspot.object-representation-m1/v1";
export interface M1RepresentationProvenance {
    readonly imageId: string;
    readonly paramsHash: string;
    readonly detector: string;
    readonly detectorVersion: string;
}
export type M1ObjectKind = 'badge' | 'basket';
export type M1ComponentRole = 'outer-bright' | 'dark-plate' | 'glyph' | 'white-body' | 'dark-shell';
export interface M1ComponentConsumer {
    readonly objectId: string;
    readonly objectKind: M1ObjectKind;
    readonly role: M1ComponentRole;
}
export interface M1PrimitiveComponent {
    readonly id: string;
    readonly polarity: 'bright' | 'dark';
    readonly label: number;
    readonly bbox: readonly [number, number, number, number];
    readonly area: number;
    readonly pixels: Uint32Array;
    readonly producedBy: 'badgeStage.components';
    readonly consumers: readonly M1ComponentConsumer[];
}
export interface M1ComponentRelationship {
    readonly id: string;
    readonly objectId: string;
    readonly containerComponentId: string;
    readonly memberComponentId: string;
    readonly predicate: ComponentAssemblyRelationship['predicate'];
    readonly selection: ComponentAssemblyRelationship['selection'];
    readonly margins?: readonly [number, number, number, number];
    readonly basketShellFamilyId?: string;
    readonly producedBy: 'component-backed-object-assembly-v1';
}
/** The one family V1 actually learns: exact modal Basket shell margins. */
export interface M1BasketShellFamily {
    readonly id: string;
    readonly kind: 'basket-shell-exact-modal-margins-v1';
    readonly margins: readonly [number, number, number, number];
    readonly relationshipIds: readonly string[];
    readonly componentIds: readonly string[];
    readonly producedBy: 'learnBasketShellFamilyV1';
}
export interface M1KnownAccounting {
    readonly status: 'known';
    readonly universe: 'selected-bw-component-pixels';
    /** Exact B+W pixels justified as object evidence by V1 component selection. */
    readonly availablePixels: Uint32Array;
    /** Exact pixels consumed by the preserved V1 object composition. */
    readonly explainedPixels: Uint32Array;
    /** availablePixels \\ explainedPixels; retained even when empty. */
    readonly unexplainedPixels: Uint32Array;
}
export interface M1UnknownAccounting {
    readonly status: 'unknown';
    readonly reason: string;
}
export interface M1ObjectComposition {
    readonly id: string;
    readonly kind: M1ObjectKind;
    readonly detectorId: string;
    readonly assemblyStatus: 'assembled' | 'failed';
    readonly componentUses: readonly {
        readonly componentId: string;
        readonly role: M1ComponentRole;
    }[];
    readonly relationshipIds: readonly string[];
    readonly accounting: M1KnownAccounting | M1UnknownAccounting;
    readonly consumedBy: 'component-backed-object-assembly-v1';
}
/** One coherent run-scoped library: components are addressable by id without object semantics. */
export interface MaterializedM1Representation {
    readonly schema: typeof M1_REPRESENTATION_SCHEMA;
    readonly provenance: M1RepresentationProvenance;
    readonly raster: {
        readonly width: number;
        readonly height: number;
        readonly topPx: number;
    };
    readonly components: readonly M1PrimitiveComponent[];
    readonly relationships: readonly M1ComponentRelationship[];
    readonly basketShellFamilies: readonly M1BasketShellFamily[];
    readonly objects: readonly M1ObjectComposition[];
}
/**
 * Freeze the already-proven Badge/Basket B+W component composition as M1.
 * This only dereferences selections made by acquireObjectGraphV1; it performs
 * no thresholding, component search, matching, ownership expansion, or AA work.
 */
export declare function materializeM1Representation(graph: ObjectGraph, fields: BrightDarkComponentFields, provenance: M1RepresentationProvenance, topPx?: number): MaterializedM1Representation;
export declare function encodeMaterializedM1Representation(value: MaterializedM1Representation): Uint8Array;
export declare function decodeMaterializedM1Representation(bytes: Uint8Array): MaterializedM1Representation;
