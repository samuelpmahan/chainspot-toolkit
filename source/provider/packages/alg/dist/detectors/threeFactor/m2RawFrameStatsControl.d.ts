import type { M2RawSourceProbeTrace } from './m2Representation';
/** Fixed-size deterministic negative-control experiment for the raw probe. */
export declare const M2_RAW_CONTROL_REPLICATES: 999;
export interface M2RawFrameStatsControlOptions {
    readonly imageId: string;
    readonly paramsHash: string;
    readonly featureId: string;
    readonly replicates?: number;
    readonly supportThresholds?: readonly number[];
}
export interface M2RawNullSummary {
    readonly observed: number;
    readonly nullMean: number;
    readonly nullSampleSd: number;
    readonly nullQuantiles: Readonly<Record<'p50' | 'p95' | 'p99', number>>;
    readonly nullMaximum: number;
    readonly empiricalP: number;
    readonly replicateCount: number;
    /** Every replicate statistic is retained for receipt/audit replay. */
    readonly nullSamples: readonly number[];
}
export interface M2RawFrameStatsControlMargin {
    readonly marginPx: number;
    readonly fixedSampleId: string | null;
    readonly shifts: readonly (readonly [number, number])[];
    readonly replicateShifts: readonly (readonly (readonly [number, number])[])[];
    readonly bySupportThreshold: Readonly<Record<string, {
        readonly globalMaxExactOverlap: M2RawNullSummary;
        readonly largestEightConnectedCluster: M2RawNullSummary;
    }>>;
    readonly outermostClearedRing?: M2RawNullSummary;
}
export interface M2RawFrameStatsControl {
    readonly status: 'measured' | 'unknown';
    readonly reason: string;
    readonly controlSeed: string;
    readonly seedAlgorithm: 'fnv1a32(imageId+paramsHash+featureId)';
    readonly replicateCount: number;
    readonly supportThresholds: readonly number[];
    readonly assumptions: readonly string[];
    /**
     * At most one entry: the final margin's control (`trace.final.finalMarginPx`).
     * Only the final margin's per-pixel observations feed the promotion
     * decision, and only the final margin retains them (see the
     * EVIDENCE-RETENTION POLICY comment above M2_RAW_SOURCE_PROBE_SCHEMA in
     * m2Representation.ts). The PRIMARY statistics every consumer reads --
     * `bySupportThreshold`, in particular the `'18'`-threshold
     * `globalMaxExactOverlap`/`largestEightConnectedCluster` that gates
     * ownership -- are bit-identical to what looping over every swept margin
     * and keeping only `marginPx === finalMarginPx` produced, because every
     * consumer already selected that way.
     *
     * CORRECTION: `outermostClearedRing` is not covered by that argument.
     * m2Projection.ts's `adaptM2RawFrameStatsControl` and
     * tmp-render-m2-frame-receipt.mjs both pick it via
     * `control.margins.find(m => m.outermostClearedRing)`, which takes the
     * FIRST cleared margin in array order, not the final one. Before this
     * change `margins[]` held one entry per swept margin in original order,
     * so `.find()` could surface an EARLIER cleared margin than the final
     * one (a reviewer fixture demonstrated margin 2 winning over margin 3).
     * With at most one entry here, that ring statistic now always comes from
     * the final margin -- an intended correction to which margin's
     * outermost-cleared-ring reading gets shown, not a preserved behavior.
     * `reason` below also now names the final margin explicitly, so its text
     * changed too.
     */
    readonly margins: readonly M2RawFrameStatsControlMargin[];
}
/** Compute deterministic circular-shift null controls from a materialized probe trace. */
export declare function materializeM2RawFrameStatsControl(trace: M2RawSourceProbeTrace, options: M2RawFrameStatsControlOptions): M2RawFrameStatsControl;
