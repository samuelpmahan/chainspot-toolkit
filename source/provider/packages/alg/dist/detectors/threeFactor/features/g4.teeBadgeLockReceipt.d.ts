import type { Drawable, FeatureRender, FeatureRenderPlan, RunTrace, UnitTrace } from './types';
export declare const TEE_BADGE_LOCK_FEATURE_ID: "teeBadgeLock";
declare const UNKNOWN: "UNKNOWN";
/** Run-level identity fields are optional on legacy RunTrace callers. */
export interface TeeBadgeLockTraceMetadata {
    readonly runId?: string;
    readonly imageId?: string;
    readonly paramsHash?: string;
    readonly featureId?: string;
    readonly traceHash?: string;
    readonly canonicalFrame?: string;
}
export type TeeBadgeLockValue = number | typeof UNKNOWN;
export type TeeBadgeLockText = string | typeof UNKNOWN;
export interface TeeBadgeLockReceiptRow {
    /** The exact producer ref, retained even when its encoded IDs are invalid. */
    readonly lockId: TeeBadgeLockText;
    /** Numeric hole value from the producer; the CLI renders this as H<number>. */
    readonly hole: TeeBadgeLockValue;
    readonly badgeId: TeeBadgeLockText;
    readonly teeId: TeeBadgeLockText;
    readonly tier: TeeBadgeLockText;
    readonly tierCode: TeeBadgeLockValue;
    readonly score: TeeBadgeLockValue;
    readonly weakAligned: TeeBadgeLockValue;
    readonly efficiency: TeeBadgeLockValue;
    readonly axisErrorDeg: TeeBadgeLockValue;
    readonly axisSource: TeeBadgeLockText;
    readonly axisSourceCode: TeeBadgeLockValue;
    readonly margin: TeeBadgeLockValue;
    readonly pathPoints: TeeBadgeLockValue;
    readonly recovered: TeeBadgeLockValue;
    /** CL-6a: this lock's axis was too poor/absent to drive a confident ray
     * lock and fell back to corroboration-only ranking. */
    readonly rayDegraded: TeeBadgeLockValue;
    readonly sigmaUsedDeg: TeeBadgeLockValue;
    readonly wideningDeg: TeeBadgeLockValue;
    /** CL-6b: 0=basket found, 1=UNKNOWN (partial trace kept as evidence),
     * UNKNOWN=stage B did not run for this lock. */
    readonly traceOutcomeCode: TeeBadgeLockValue;
    readonly traceLengthPx: TeeBadgeLockValue;
    readonly tunneledSegments: TeeBadgeLockValue;
    /** 2026-08-29 gate-reorg: 0 = path ran straight to the basket (new-G5
     * mechanism family), >0 = bent N times (new-G6 mechanism family). */
    readonly bendCount: TeeBadgeLockValue;
    readonly verdict: Drawable['verdict'];
    /** Producer testimony is carried verbatim; absent testimony is UNKNOWN. */
    readonly reason: string;
}
export interface TeeBadgeLockAbstentionRow {
    readonly badgeId: TeeBadgeLockText;
    readonly hole: TeeBadgeLockValue;
    readonly kind: TeeBadgeLockText;
    readonly bestTeeId: TeeBadgeLockText;
    readonly bestScore: TeeBadgeLockValue;
    readonly winningHole: TeeBadgeLockValue;
    readonly winningScore: TeeBadgeLockValue;
    readonly verdict: Drawable['verdict'];
    /** Producer testimony verbatim -- the required one-human-sentence line. */
    readonly reason: string;
}
export interface TeeBadgeLockReceiptCounts {
    readonly candidates: TeeBadgeLockValue;
    readonly locks: TeeBadgeLockValue;
    readonly visibleLocks: TeeBadgeLockValue;
    readonly recoveredLocks: TeeBadgeLockValue;
    readonly unmatchedBadges: TeeBadgeLockValue;
    readonly unusedTees: TeeBadgeLockValue;
    /** CL-6b: of the locks above, how many paths were followed to a credible
     * basket vs. ended in a loud UNKNOWN. */
    readonly basketsFollowed: TeeBadgeLockValue;
    readonly basketsUnknown: TeeBadgeLockValue;
}
export interface TeeBadgeLockCorrespondence {
    /** Every accepted tee-badge trace drawable, in trace order. */
    readonly traceLockRefs: readonly TeeBadgeLockText[];
    /** Every CLI row, in row order. */
    readonly cliLockRefs: readonly TeeBadgeLockText[];
    /** Every drawable forwarded to the visual layer, in draw order. */
    readonly visualLockRefs: readonly TeeBadgeLockText[];
    readonly duplicateCliRefs: readonly TeeBadgeLockText[];
    readonly duplicateVisualRefs: readonly TeeBadgeLockText[];
    readonly missingVisualRefs: readonly TeeBadgeLockText[];
    readonly orphanVisualRefs: readonly TeeBadgeLockText[];
    /** Ref strings which failed the exact teeBadgeLock encoding contract. */
    readonly malformedRefs: readonly TeeBadgeLockText[];
    readonly matched: boolean;
}
export interface TeeBadgeLockReceipt {
    readonly plan: FeatureRenderPlan;
    readonly rows: readonly TeeBadgeLockReceiptRow[];
    /** All-Hn completion: one row per unmatched badge (orphan or conflict),
     * never silence. rows.length + abstentionRows.length === every G1-read
     * badge this feature was handed, whenever the producer's own bookkeeping
     * (locks + abstentions) is itself complete. */
    readonly abstentionRows: readonly TeeBadgeLockAbstentionRow[];
    readonly counts: TeeBadgeLockReceiptCounts;
    readonly cliText: string;
    readonly correspondence: TeeBadgeLockCorrespondence;
}
/** Build the CLI/visual receipt pair from one teeBadgeLock UnitTrace. */
export declare function buildTeeBadgeLockReceipt(unit: UnitTrace, run: RunTrace): TeeBadgeLockReceipt;
/** FeatureRender seam: one exact forwarded layer over the bright-mask base. */
export declare const TEE_BADGE_LOCK_RENDER: FeatureRender;
export declare const teeBadgeLockRender: FeatureRender;
export {};
