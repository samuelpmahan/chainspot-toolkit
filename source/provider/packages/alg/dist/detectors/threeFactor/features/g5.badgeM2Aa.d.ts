/**
 * Default-OFF Badge M2 raw expanded-frame probe.
 *
 * M1 remains byte-identical. This feature reads the original source raster
 * only when enabled, searches outside the old bbox±1 evidence crop, and
 * records raw appearance recurrence before it ever looks at historical
 * AA/residue labels. Those labels are post-discovery accounting only.
 */
import type { ABFeatureOperation } from '../../../exec/feature-set';
import { type MaterializedBadgeM2Representation, type MaterializedExpandedBadgeRawFrameProbe } from '../m2Representation';
import type { FeatureRender } from './types';
export declare const BADGE_M2_AA_FEATURE_ID: "badgeM2Aa";
/**
 * Schema v2 (chainspot #m2-rootcause): wraps M2_RAW_SOURCE_PROBE_SCHEMA/v2
 * and M2_REPRESENTATION_SCHEMA/v2. `rawProbe.trace.margins[].observations`
 * is now retained ONLY for the final margin (superseded margins carry
 * summaries); `rawProbe.trace.final.targets[].observations` and
 * `representations[].rawTrace.observations` no longer exist -- callers join
 * the final margin's per-pixel data by `finalMarginPx` instead of reading a
 * re-embedded copy. See the EVIDENCE-RETENTION POLICY comment above
 * M2_RAW_SOURCE_PROBE_SCHEMA in m2Representation.ts for the full accounting.
 */
export declare const BADGE_M2_AA_LIBRARY_SCHEMA: "chainspot.badge-m2-raw-frame-library/v2";
export interface MaterializedBadgeM2Library {
    readonly schema: typeof BADGE_M2_AA_LIBRARY_SCHEMA;
    readonly featureId: typeof BADGE_M2_AA_FEATURE_ID;
    readonly state: 'disabled' | 'materialized' | 'insufficient';
    readonly provenance: {
        readonly imageId: string;
        readonly paramsHash: string;
        readonly source: 'full source RGBA expanded-frame recurrence';
    };
    /**
     * Undefined when explicitly disabled, or when `sizeGuard` fired (the
     * estimated serialized size exceeded V8's max string length -- see
     * `libraryBytes()`). Otherwise this is the one raw discovery trace.
     */
    readonly rawProbe?: MaterializedExpandedBadgeRawFrameProbe;
    /**
     * Compatibility/control projections. M1 remains exact. A newly discovered
     * raw pixel is promoted only when the final adequate frame has exact 18/18
     * support and its deterministic circular-shift control passes. Empty when
     * `sizeGuard` fired, for the same reason `rawProbe` is undefined.
     */
    readonly representations: readonly MaterializedBadgeM2Representation[];
    /**
     * Present only when the artifact was too large to safely JSON.stringify
     * (a loud UNKNOWN instead of the `RangeError: Invalid string length`
     * crash this guards against) -- either the pre-flight estimate exceeded
     * the limit, or it didn't but the real JSON.stringify threw anyway (see
     * `libraryBytes()`'s try/catch). `rawProbe`/`representations` are
     * omitted from THIS encoded artifact when this fires; in-memory
     * `ctx.measure()` numbers for the run that produced it are unaffected.
     * `observationCount`/`bytesPerObservation`/`estimatedBytes` let a reader
     * check the estimate's arithmetic; `marginCount`/`finalMarginPx`/
     * `finalStatus`/`finalReason` are cheap scalar reads off the same trace
     * that say what state the omitted rawProbe was actually in.
     */
    readonly sizeGuard?: {
        readonly status: 'UNKNOWN';
        readonly reason: string;
        readonly estimatedBytes: number;
        readonly limitBytes: number;
        readonly observationCount: number;
        readonly bytesPerObservation: number;
        readonly marginCount: number;
        readonly finalMarginPx: number | null;
        readonly finalStatus: string | null;
        readonly finalReason: string | null;
        readonly omitted: string;
    };
}
/**
 * `run()` sets `library.rawProbe.representations` and top-level
 * `library.representations` to the SAME array by reference (the probe's own
 * `representations` field is where the value originates; the library just
 * names it again at the top level for callers that don't want to reach
 * through `rawProbe`). JSON.stringify does not dedupe references, so without
 * this the 18 representations would be embedded twice. Strip the nested
 * duplicate for the wire only -- `decodeMaterializedBadgeM2Library` rehydrates
 * it, so every in-memory/decoded consumer still sees a complete `rawProbe`.
 */
/** Wire-only marker: `rawProbe.representations` was elided because it is an
 *  exact reference duplicate of the top-level `representations` array;
 *  decodeMaterializedBadgeM2Library() rehydrates it from there. Exported so
 *  tests can assert on the raw wire bytes, not just the rehydrated decode. */
export declare const RAW_PROBE_REPRESENTATIONS_ELIDED: "$chainspotElidedDuplicateOf:representations";
export declare function encodeMaterializedBadgeM2Library(value: MaterializedBadgeM2Library): Uint8Array;
export declare function decodeMaterializedBadgeM2Library(bytes: Uint8Array): MaterializedBadgeM2Library;
/** Default-OFF measurement; M1 and all downstream detector behavior remain untouched. */
export declare const badgeM2AaFeature: {
    id: "badgeM2Aa";
    gate: "G5";
    kind: "deviation";
    defaultEnabled: false;
    resolveOnlyWhenConfigured: true;
    note: string;
    knobs: {};
    render: FeatureRender;
};
/**
 * Production operation. It obtains `image` before the OFF gate so declared
 * and actual evidence custody match in both states. It never writes M1.
 */
export declare const badgeM2AaOperation: ABFeatureOperation;
