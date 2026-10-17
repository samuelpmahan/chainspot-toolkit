import type { GateId } from './features/types';
import type { ABFeatureSet, ABFeatureSetOperation } from '../../exec/feature-set';
/** Stable semantic compositions. These describe ownership, not execution order.
 *
 * The LAB has seven knowledge gates: G1 badges, G2 baskets, G3 visible tees,
 * G4 endpoint recovery, G5 straight-test, G6 assignment, and G7 bend/path
 * refinement. There is no second engine vocabulary.
 */
export type GateFeatureSetId = 'shared-set' | 'g1-set' | 'g2-set' | 'g3-set' | 'g4-set' | 'g5-set' | 'g6-set' | 'g7-set';
/** Explicit owned feature membership, intentionally excluding parked supportRoi. */
export declare const GATE_FEATURE_IDS: {
    readonly 'shared-set': readonly ["hsv"];
    readonly 'g1-set': readonly ["badges", "digits", "badgeGlyphTemplate"];
    readonly 'g2-set': readonly ["sprite", "cleanBasketFamily"];
    readonly 'g3-set': readonly ["endpoints", "teeFamily", "teeMinAreaPose"];
    readonly 'g4-set': readonly ["teeRecovery", "phantomTee", "teeBadgeLock", "posteriorTeeRecovery"];
    readonly 'g5-set': readonly ["fourLaneSensor", "straightTest", "ribbon", "routing", "badgeM2Aa"];
    readonly 'g6-set': readonly ["scoring", "search"];
    readonly 'g7-set': readonly ["zfit"];
};
/** The semantic production compositions, in the required feature order. */
export declare const GATE_FEATURE_SETS: Record<GateFeatureSetId, ABFeatureSet>;
/** Operation definitions grouped once by semantic composition order. */
export declare const GATE_SET_OPERATIONS: Record<GateFeatureSetId, readonly ABFeatureSetOperation[]>;
/** One-to-one operation ownership, useful to receipts and conformance tests. */
export declare const GATE_OPERATION_OWNERSHIP: Readonly<Record<string, GateFeatureSetId>>;
/** Operation labels whose engine `spec.gate` is an old alias for the
 * semantic LAB composition. Keeping this exported makes the divergence
 * inspectable instead of silently trusting the stale label. */
export declare const GATE_OPERATION_DECLARATION_DIVERGENCES: Readonly<Record<string, {
    readonly declaredGate: GateId;
    readonly semanticSet: GateFeatureSetId;
}>>;
/** Feature declarations that retain the engine gate vocabulary while their
 * authoritative semantic composition is a later LAB phase. */
export declare const GATE_FEATURE_DECLARATION_DIVERGENCES: Readonly<Record<string, {
    readonly declaredGate: GateId;
    readonly semanticSet: GateFeatureSetId;
}>>;
/** Feature reads crossing the operation's owning gate, never inferred as membership. */
export declare const GATE_CROSS_GATE_DEPENDENCIES: Readonly<Record<string, readonly string[]>>;
