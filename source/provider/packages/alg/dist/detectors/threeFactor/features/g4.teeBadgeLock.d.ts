/**
 * G4 teeBadgeLock: an opt-in, independent tee↔badge ownership decision.
 *
 * The semantic set owns the executable operation.  The ABFeature is only its
 * default-OFF declaration and render seam; keeping those separate means a
 * caller can compose this deviation without changing the frozen engine plan.
 */
import type { ABFeatureOperation } from '../../../exec/feature-set';
import type { ThreeFactorMeasurement } from '../types';
import type { EngineUnit } from './types';
export interface TeeBadgeLockMeasurement extends ThreeFactorMeasurement {
    readonly field: ThreeFactorMeasurement['field'];
}
/** Default-OFF G4 deviation.  Operation ownership remains with the semantic
 * set, hence `operations` is deliberately undefined. */
export declare const teeBadgeLockFeature: {
    id: string;
    gate: "G4";
    kind: "deviation";
    defaultEnabled: false;
    resolveOnlyWhenConfigured: true;
    knobs: {};
    render: import("./types").FeatureRender;
};
/** Legacy engine descriptor used by the chronology seam.  Production ABFeature
 * sets use teeBadgeLockOperation below, whose dotted slots make custody
 * explicit and never expose the mutable assignment object. */
export declare const teeBadgeLockUnit: EngineUnit;
/** Semantic-set operation.  It reads exactly the three declared dotted slots,
 * including while OFF, and writes only `teeBadgeLock`. */
export declare const teeBadgeLockOperation: ABFeatureOperation;
