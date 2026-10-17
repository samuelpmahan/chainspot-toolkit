import type { MaterializedBadgeEvidence } from './badgeEvidence';
import type { MaterializedM1Representation } from './m1Representation';
import type { RgbaImage } from './types';
import { type M2RawFrameStatsControl, type M2RawFrameStatsControlOptions } from './m2RawFrameStatsControl';
/**
 * M2 deliberately keeps the proven M1 B+W worldview intact.
 *
 * Schema v2 (chainspot #m2-rootcause): `rawTrace.observations` was removed
 * from MaterializedBadgeM2Representation's wire shape (it used to duplicate
 * the raw-source probe's final-margin per-pixel array by value once per
 * representation). See the EVIDENCE-RETENTION POLICY comment above
 * M2_RAW_SOURCE_PROBE_SCHEMA for the full accounting.
 */
export declare const M2_REPRESENTATION_SCHEMA: "chainspot.badge-representation-m2/v2";
export type M2RegistrationMethod = 'same-raster-m1-geometry' | 'independent-registered-samples';
export type M2DigitCondition = 'all' | 'digit-adjacent' | 'same-digit';
export type M2SupportClass = 'structural-common' | 'digit-conditioned' | 'unresolved' | 'unsupported';
export interface M2OverlapOptions {
    /** How samples were registered. Same-raster recurrence is not multisampling. */
    readonly registrationMethod: M2RegistrationMethod;
    /** The condition used when interpreting support, retained as provenance. */
    readonly digitCondition?: M2DigitCondition;
    /** Minimum number of aligned samples carrying a candidate. */
    readonly minimumSupportCount?: number;
    /** Minimum fraction of aligned samples carrying a candidate. */
    readonly minimumSupportFraction?: number;
    /** Optional results from larger, independently materialized context frames. */
    readonly frameSweep?: readonly M2FrameSweepSample[];
    /** Optional library-level fieldset, built once and shared by all objects. */
    readonly overlapFieldSet?: M2OverlapFieldSet;
}
export interface M2FrameSweepSample {
    /** Context margin around the stable M1 object geometry, in pixels. */
    readonly marginPx: number;
    /** Canonical object-local coordinates; these remain comparable as the frame grows. */
    readonly supportedPixels: readonly (readonly [number, number])[];
    /** Repeat-supported pixels touching this sample's outer boundary. */
    readonly boundarySupportedPixelCount: number;
    /** Source/crop truncation count; nonzero means the frame is not trustworthy. */
    readonly unobservedSampleCount?: number;
}
export interface M2FrameAssessment {
    readonly status: 'adequate' | 'insufficient' | 'not-measured';
    readonly samples: number;
    readonly latestMarginPx: number | null;
    readonly stableSet: boolean;
    readonly boundarySupportedPixelCount: number;
    readonly unobservedSampleCount: number;
    /** Exact deterministic identity for the final supported set. */
    readonly latestSetFingerprint: string | null;
    /** Exact canonical observations retained for E inspection/replay. */
    readonly sweep: readonly M2FrameSweepSample[];
    readonly reason: string;
}
export interface M2SupportObservation {
    readonly localPixel: readonly [number, number];
    readonly supportCount: number;
    readonly alignedSampleCount: number;
    readonly supportFraction: number;
    readonly class: M2SupportClass;
    readonly sampleIds: readonly string[];
}
/**
 * A lossless recurrence observation over materialized AA candidate masks.
 *
 * This is deliberately a count field, not a classifier.  `numOverlaps` is
 * the number of distinct materialized specimens whose candidate mask landed
 * at the canonical coordinate; `eligibleCount` is the number of specimens in
 * the field's condition for which that coordinate could be observed.  The
 * complete field is retained so a view may sweep a display threshold later.
 */
export interface M2OverlapObservation {
    readonly localPixel: readonly [number, number];
    readonly numOverlaps: number;
    readonly eligibleCount: number;
    readonly overlapFraction: number;
    readonly contributorIds: readonly string[];
}
export type M2OverlapChannel = 'structural' | 'digit-conditioned';
export interface M2OverlapField {
    readonly channel: M2OverlapChannel;
    /** Coordinates are centered on the channel's geometry, with a one-pixel support ring. */
    readonly coordinateFrame: 'm1-bbox-plus-one-support-ring' | 'digit-bbox-plus-one-support-ring';
    /** Canonical raster dimensions, including the support ring. */
    readonly canonicalSize: readonly [number, number];
    readonly sampleIds: readonly string[];
    /** Samples whose evidence is valid for this field's condition. */
    readonly eligibleSampleIds: readonly string[];
    /** Per-sample audit of lossy integer registration collisions. */
    readonly contributions: readonly M2OverlapContribution[];
    /** For digit fields, this identifies the validated digit condition. */
    readonly digitCondition?: {
        readonly index: number;
        readonly character: string;
    };
    /** Candidate pixels that could not be assigned to this channel. */
    readonly excludedCandidateCount: number;
    readonly observations: readonly M2OverlapObservation[];
}
export interface M2OverlapContribution {
    readonly sampleId: string;
    readonly sourceCandidateCount: number;
    readonly uniqueCanonicalCellCount: number;
    readonly collisionCount: number;
}
export interface M2OverlapFieldSet {
    readonly sampleIds: readonly string[];
    readonly structural: M2OverlapField;
    readonly digitConditioned: readonly M2OverlapField[];
}
export interface M2KnownSetAccounting {
    readonly availablePixels: Uint32Array;
    readonly explainedPixels: Uint32Array;
    readonly unexplainedPixels: Uint32Array;
}
export interface M2TransitionAccounting {
    readonly preservedPixels: Uint32Array;
    readonly lostPixels: Uint32Array;
    readonly discoveredPixels: Uint32Array;
    readonly newlyExplainedPixels: Uint32Array;
    readonly stillUnexplainedPixels: Uint32Array;
    readonly regressionLoss: number | null;
    readonly discoveryLoss: number | null;
}
export interface MaterializedBadgeM2Representation {
    readonly schema: typeof M2_REPRESENTATION_SCHEMA;
    readonly objectId: string;
    readonly registration: {
        readonly method: M2RegistrationMethod;
        /** Number of real input specimens supplied to the overlap calculation. */
        readonly sampleCount: number;
        /** Number whose M1 geometry was compatible with the target. */
        readonly alignedSampleCount: number;
        /** Distinct badge objects used as observations, not repeated reads of one object. */
        readonly sampleUnit: 'distinct-badge-objects';
        readonly alignedSampleIds: readonly string[];
        readonly excludedSampleIds: readonly string[];
        /** Exact dimension gate; each aligned sample is translated to local M1 coordinates. */
        readonly alignment: 'exact-m1-owned-bbox-dimensions-plus-top-left-translation';
        readonly digitCondition: M2DigitCondition;
        readonly minimumSupportCount: number;
        readonly minimumSupportFraction: number;
        readonly provenance: string;
    };
    readonly m1: M2KnownSetAccounting;
    readonly m2: M2KnownSetAccounting;
    readonly aa: {
        /** Existing naive AA candidates; none are silently discarded as noise. */
        readonly candidatePixels: Uint32Array;
        /** Candidate pixels promoted only after an adequate expanded-frame sweep. */
        readonly explainedPixels: Uint32Array;
        /** Supported by recurrence but held provisional until frame adequacy is proven. */
        readonly provisionalPixels: Uint32Array;
        /** Candidates without enough support to claim ownership. */
        readonly unresolvedPixels: Uint32Array;
        readonly observations: readonly M2SupportObservation[];
    };
    readonly transition: M2TransitionAccounting;
    readonly frame: M2FrameAssessment;
    /** Stable pointer to the library-level fieldset; the fieldset is not duplicated per object. */
    readonly overlapRef: 'badgeEvidence.m2Library.overlap';
    /** Raw-source trace when this representation came from the expanded-frame probe. */
    readonly rawTrace?: M2TargetRawTrace;
}
export declare function m2RegistrationBounds(specimen: MaterializedBadgeEvidence): readonly [number, number, number, number];
declare function localCoordinate(specimen: MaterializedBadgeEvidence, pixel: number): readonly [number, number];
export declare const m2LocalCoordinate: typeof localCoordinate;
export declare function m2CanonicalCoordinate(specimen: MaterializedBadgeEvidence, pixel: number, canonicalSize: readonly [number, number]): readonly [number, number];
/** Build the global structural recurrence field from every supplied sample. */
export declare function buildM2StructuralOverlapField(specimens: readonly MaterializedBadgeEvidence[]): M2OverlapField;
/**
 * Build one digit-conditioned recurrence field.  It is keyed by the
 * validated digit's position and character, and coordinates are relative to
 * that digit bbox rather than pretending different glyphs share the same
 * object-local geometry.
 */
export declare function buildM2DigitConditionedOverlapField(specimens: readonly MaterializedBadgeEvidence[], index: number, character: string): M2OverlapField;
/** Materialize both non-overlapping observational channels for an E library. */
export declare function buildM2OverlapFieldSet(specimens: readonly MaterializedBadgeEvidence[]): M2OverlapFieldSet;
/**
 * Judge whether a sequence of increasingly large context frames has stopped
 * discovering repeat-supported signal. The final two exact support sets must
 * match and the final set must not touch the frame boundary.
 */
export declare function assessM2FrameSweep(samples: readonly M2FrameSweepSample[]): M2FrameAssessment;
/**
 * Compute exact M1→M2 accounting from retained pixel identities. This is a
 * projection over sets, not a score and not a detector: M1 pixels are copied
 * verbatim and only supplied AA candidates may expand the M2 universe.
 */
export declare function transitionM1ToM2(m1AvailablePixels: Iterable<number>, m1ExplainedPixels: Iterable<number>, discoveredPixels: Iterable<number>, newlyExplainedPixels: Iterable<number>): {
    m1: M2KnownSetAccounting;
    m2: M2KnownSetAccounting;
    transition: M2TransitionAccounting;
};
/** Materialize one Badge M2 from the existing Badge AA candidates. */
export declare function materializeBadgeM2Representation(target: MaterializedBadgeEvidence, peers: readonly MaterializedBadgeEvidence[], options: M2OverlapOptions): MaterializedBadgeM2Representation;
/** Stable content payload for the E/Storybook seam. */
export declare function encodeMaterializedBadgeM2Representation(value: MaterializedBadgeM2Representation): Uint8Array;
export declare function decodeMaterializedBadgeM2Representation(bytes: Uint8Array): MaterializedBadgeM2Representation;
export declare const M2_RAW_SOURCE_PROBE_SCHEMA: "chainspot.badge-m2-raw-source/v2";
export type M2RawPartition = 'm1-owned' | 'old-aa' | 'old-residue' | 'exterior';
export interface M2RawSourceProbeOptions {
    /** First symmetric context margin. The contract's old region was ±1. */
    readonly startMarginPx?: number;
    /** Alias accepted by callers that name the sweep fields explicitly. */
    readonly marginStartPx?: number;
    /** Symmetric margin increment. */
    readonly marginStepPx?: number;
    /** Last margin to try before returning explicit insufficient/UNKNOWN. */
    readonly safetyCapMarginPx?: number;
    /** Alias for safetyCapMarginPx. */
    readonly maxMarginPx?: number;
    /** Authoritative minimum exact-RGBA support among eligible specimens. */
    readonly minimumSupportCount?: number;
    /** Diagnostic quantizer only; it never changes the exact verdict. */
    readonly quantizedBinWidth?: number;
    /** Ownership remains OFF unless an independent measured control passes. */
    readonly ownershipGate?: {
        readonly status: 'measured' | 'unknown';
        readonly significant: boolean;
        readonly criterion: string;
    };
}
export interface M2RawSourceProbeInput {
    readonly image: RgbaImage;
    readonly specimens: readonly MaterializedBadgeEvidence[];
    readonly m1: MaterializedM1Representation;
    readonly options?: M2RawSourceProbeOptions;
}
export interface M2RawSourceProbeWithControlOptions extends M2RawSourceProbeOptions {
    readonly control: Omit<M2RawFrameStatsControlOptions, 'imageId' | 'paramsHash' | 'featureId'> & {
        readonly alpha?: number;
    };
}
export interface M2RawRegistration {
    readonly sampleId: string;
    readonly m1ObjectId: string;
    /** Tight bbox computed from that object's M1-owned pixels. */
    readonly ownedBbox: readonly [number, number, number, number];
    /** Translation only: source = bbox top-left + local coordinate. */
    readonly translation: readonly [number, number];
    readonly glyphExactCount: number;
    readonly glyphHaloCount: number;
    readonly glyphExactCoordinates: readonly (readonly [number, number])[];
    readonly glyphHaloCoordinates: readonly (readonly [number, number])[];
    readonly sourceFrame: 'full-rgba-image';
    readonly provenance: string;
}
export interface M2RawValueGroup {
    readonly rgba: readonly [number, number, number, number];
    readonly sampleIds: readonly string[];
    readonly count: number;
}
export interface M2RawQuantizedValueGroup {
    readonly bins: readonly [number, number, number, number];
    readonly sampleIds: readonly string[];
    readonly count: number;
}
export interface M2RawCoordinateObservation {
    readonly localPixel: readonly [number, number];
    readonly eligibleSampleIds: readonly string[];
    readonly exactGroups: readonly M2RawValueGroup[];
    readonly quantizedGroups: readonly M2RawQuantizedValueGroup[];
    readonly exactSupportCount: number;
    readonly exactSupported: boolean;
    /** Lexicographically deterministic modal tuple (ties choose lowest tuple). */
    readonly modalRgba: readonly [number, number, number, number] | null;
    readonly modalSupportCount: number;
    readonly modalSupportFraction: number;
    /** Per-channel sample standard deviation over eligible observations. */
    readonly sampleSd: readonly [number, number, number, number] | null;
    readonly sampleSdDenominator: 'n-1' | null;
    readonly nullModel: {
        readonly p: 0.5;
        readonly sampleCount: number;
        readonly probabilityAllMatch: number | null;
        readonly percentAllMatch: number | null;
    };
    readonly quantizedSupportCount: number;
    readonly quantizedSupported: boolean;
}
export interface M2RawBoundarySides {
    readonly left: M2RawBoundarySide;
    readonly right: M2RawBoundarySide;
    readonly top: M2RawBoundarySide;
    readonly bottom: M2RawBoundarySide;
    readonly total: number;
    readonly status: 'clear' | 'supported' | 'unknown';
}
export interface M2RawBoundarySide {
    readonly count: number;
    readonly status: 'clear' | 'supported' | 'unknown';
    /** Samples clipped on this side of the requested source crop. */
    readonly affectedSampleIds: readonly string[];
}
export interface M2RawMarginTrace {
    readonly marginPx: number;
    readonly frameSize: readonly [number, number];
    /**
     * Full per-pixel observations. Retained ONLY on the final materialized
     * margin (the one `trace.final.finalMarginPx` names); every superseded
     * margin carries every other field on this interface as a summary but
     * omits `observations` -- see the EVIDENCE-RETENTION POLICY comment above
     * M2_RAW_SOURCE_PROBE_SCHEMA. A caller that needs the final margin's
     * per-pixel data joins by `marginPx`; it is never re-embedded elsewhere.
     */
    readonly observations?: readonly M2RawCoordinateObservation[];
    readonly exactSupportedCoordinates: readonly (readonly [number, number])[];
    readonly exactModalSupportedCoordinates: readonly (readonly [number, number])[];
    readonly quantizedSupportedCoordinates: readonly (readonly [number, number])[];
    readonly exactBoundary: M2RawBoundarySides;
    readonly quantizedBoundary: M2RawBoundarySides;
    readonly clippedSampleIds: readonly string[];
    readonly unobservedSampleCount: number;
    readonly status: 'measured' | 'unknown';
}
export interface M2RawTargetPartition {
    readonly targetId: string;
    readonly exactSupportedCoordinates: readonly (readonly [number, number])[];
    readonly exactOwnedCoordinates: readonly (readonly [number, number])[];
    readonly byPartition: Readonly<Record<M2RawPartition, readonly (readonly [number, number])[]>>;
    readonly counts: Readonly<Record<M2RawPartition, number>>;
}
export interface M2TargetRawTrace {
    readonly targetId: string;
    /**
     * Join key, not a duplicate: per-pixel observations for this target's
     * frame live at `trace.margins.find(m => m.marginPx ===
     * finalMarginPx)?.observations` and are not re-embedded here. Before
     * schema v2 this object carried its own copy of that array, which
     * JSON.stringify re-serialized once per target (and again once per
     * representation via `rawTrace`) instead of dereferencing it.
     */
    readonly finalMarginPx: number | null;
    readonly finalExactSupportedCoordinates: readonly (readonly [number, number])[];
    readonly exactOwnedCoordinates: readonly (readonly [number, number])[];
    readonly partition: M2RawTargetPartition;
}
export interface M2RawSourceProbeTrace {
    readonly algorithm: {
        readonly exact: {
            readonly authoritative: true;
            readonly equality: 'exact-rgba-tuple';
            readonly tuple: '(r,g,b,a)';
            readonly minimumSupportCount: number;
            readonly nullModel: {
                readonly p: 0.5;
                readonly eighteenSampleProbability: 3.814697265625e-6;
                readonly eighteenSamplePercent: 0.0003814697265625;
                readonly assumption: 'independent Bernoulli trials';
            };
        };
        readonly quantized: {
            readonly authoritative: false;
            readonly equality: 'floor-channel-bin';
            readonly binWidth: number;
            readonly equation: 'q(c)=floor(c/binWidth)';
        };
        readonly modelProvenance: string;
    };
    /** Deterministic circular-shift control, when the one-call seam ran it. */
    readonly control?: M2RawFrameStatsControl;
    readonly statistics?: M2RawFrameStatsControl;
    readonly margins: readonly M2RawMarginTrace[];
    readonly registrations: readonly M2RawRegistration[];
    readonly excludedSampleIds: readonly string[];
    readonly final: {
        readonly status: 'adequate' | 'insufficient' | 'unknown';
        readonly reason: string;
        readonly targets: readonly M2TargetRawTrace[];
        readonly exactSupportedCoordinates: readonly (readonly [number, number])[];
        readonly exactModalSupportedCoordinates: readonly (readonly [number, number])[];
        readonly quantizedSupportedCoordinates: readonly (readonly [number, number])[];
        readonly finalMarginPx: number | null;
        readonly ownership: {
            readonly promoted: boolean;
            readonly criterion: string;
        };
    };
}
export interface MaterializedExpandedBadgeRawFrameProbe {
    readonly schema: typeof M2_RAW_SOURCE_PROBE_SCHEMA;
    readonly state: 'materialized' | 'insufficient';
    readonly provenance: {
        readonly source: 'full-rgba-image';
        readonly exactBaseline: 'authoritative';
        readonly quantizedDiagnostic: 'non-authoritative';
        readonly jpegCaveat: string;
    };
    readonly trace: M2RawSourceProbeTrace;
    readonly representations: readonly MaterializedBadgeM2Representation[];
    readonly statistics?: M2RawFrameStatsControl;
}
/**
 * Materialize the M2 expanded-frame model from the real source raster.
 * Every sample is translated by its M1-owned bbox top-left. No scaling,
 * fitting, candidate mask, residue mask, or pre-cropped region participates
 * in discovery. The final exact support set is the only authoritative result.
 */
export declare function materializeExpandedBadgeRawFrameProbe(input: M2RawSourceProbeInput): MaterializedExpandedBadgeRawFrameProbe;
/** Alias with the longer name used by some callers. */
export declare const materializeExpandedBadgeRawSourceFrame: typeof materializeExpandedBadgeRawFrameProbe;
/**
 * One-call producer seam: discover the raw trace, run the deterministic
 * circular-shift control, then decorate the same trace with the gated 18/18
 * ownership projection. The initial discovery is never repeated by a caller.
 */
export declare function materializeExpandedBadgeRawFrameProbeWithControl(input: M2RawSourceProbeInput & {
    readonly options: M2RawSourceProbeWithControlOptions;
}): MaterializedExpandedBadgeRawFrameProbe;
export {};
