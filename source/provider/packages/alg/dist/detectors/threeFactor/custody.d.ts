import type { AssignmentEvidence, RecoveryProvenance, TeeEvidence, ThreeFactorAssignment } from './types';
import type { Drawable, GateId, RunTrace, Verdict } from './features/types';
/**
 * Chain-of-custody is observability, not detector behavior.
 *
 * Evidence is never re-scored here and no selection can change. This module
 * only joins already-retained TeeEvidence, sealed trace testimony, and the
 * final assignment decision into one inspectable record keyed by the opaque
 * tee detId that downstream code already uses.
 */
export declare const CHAIN_OF_CUSTODY_SCHEMA: "chainspot-chain-of-custody@1";
export type TeeCustodyOriginKind = 'visible-ring' | 'visible-component' | 'recovered';
export interface TeeCustodyPhysicalSnapshot {
    readonly tier: TeeEvidence['tier'];
    readonly centerXPx: number;
    readonly centerYPx: number;
    readonly bbox: TeeEvidence['bbox'];
    readonly angleRad: number | null;
    readonly area: number;
    readonly fill: number;
    readonly onRing: boolean;
    readonly ring?: TeeEvidence['ring'];
    readonly pad?: TeeEvidence['pad'];
    readonly recovery?: RecoveryProvenance;
}
export interface TeeCustodyTraceEvent {
    readonly kind: 'trace';
    /** Deterministic order in the sealed trace: unit order first, drawable order second. */
    readonly sequence: number;
    readonly unitId: string;
    readonly gate: GateId;
    readonly featureIds: readonly string[];
    readonly verdict: Verdict;
    readonly drawableType: Drawable['type'];
    readonly ref?: string;
    readonly visualRole?: Drawable['visualRole'];
    readonly reason?: string;
    readonly values?: Readonly<Record<string, number>>;
    readonly metadata?: Readonly<Record<string, string>>;
}
export interface TeeCustodyAssignmentEvent {
    readonly kind: 'assignment';
    readonly sequence: number;
    readonly producerUnit: 'assignment' | 'zfit' | 'UNKNOWN';
    readonly hole: string | null;
    readonly badgeId: string;
    readonly basketId: string;
    readonly score: number;
    readonly rank: number;
    readonly ownership: AssignmentEvidence['ownership'];
    readonly alternatives: AssignmentEvidence['alternatives'];
}
export type TeeCustodyEvent = TeeCustodyTraceEvent | TeeCustodyAssignmentEvent;
export interface TeeCustodyRecord {
    /** The exact opaque id used by raw pairs and final assignment, e.g. tee-7. */
    readonly teeId: string;
    readonly originKind: TeeCustodyOriginKind;
    /** Human-readable answer to "what the hell is tee-N?" without opening source. */
    readonly summary: string;
    /** Structured evidence handles retained by the current representation. */
    readonly evidenceRefs: readonly string[];
    /**
     * Places where the current representation already forgot something useful.
     * These are first-class output: custody must reveal missing lineage rather
     * than reconstructing certainty that no longer exists.
     */
    readonly gaps: readonly string[];
    readonly physical: TeeCustodyPhysicalSnapshot;
    readonly events: readonly TeeCustodyEvent[];
}
/**
 * Intentionally starts with tees only. The schema is the system-wide custody
 * envelope; badges, baskets, paths, and higher symbolic claims can be added as
 * sibling collections without changing the tee record contract.
 */
export interface ChainOfCustodyLedger {
    readonly schema: typeof CHAIN_OF_CUSTODY_SCHEMA;
    readonly runId?: string;
    readonly imageId?: string;
    readonly paramsHash?: string;
    readonly traceHash?: string;
    readonly traceAvailable: boolean;
    readonly tees: readonly TeeCustodyRecord[];
}
/**
 * Build the first structural custody ledger from one completed detector run.
 * The function is deliberately pure and deterministic; callers can rebuild it
 * from persisted assignment + trace without rerunning CV.
 */
export declare function buildChainOfCustody(assignment: ThreeFactorAssignment, trace?: RunTrace): ChainOfCustodyLedger;
export declare function findTeeCustody(ledger: ChainOfCustodyLedger, teeId: string): TeeCustodyRecord | undefined;
