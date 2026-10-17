/**
 * Trace-only CLI and Visual receipt for G3 teeMinAreaPose.
 *
 * The producer owns every component pixel, candidate, corner, and verdict.
 * This module sees only the actual UnitTrace/Drawable seam: it partitions
 * producer-stamped visualRole/metadata.role values and forwards the original
 * Drawable objects to the renderer. It never reads a raster, reconstructs a
 * corner, or converts a result into a new presentation geometry.
 */
import type { Drawable, FeatureRender, FeatureRenderPlan, RunTrace, UnitTrace } from './types';
export declare const TEE_MIN_AREA_POSE_FEATURE_ID: "teeMinAreaPose";
export declare const G0_CANONICAL_DETECTOR_INPUT_PIXEL_FRAME: "G0 canonical detector-input pixels";
declare const UNKNOWN: "UNKNOWN";
type MinAreaPoseRole = 'component-pixel-set' | 'target' | 'fitted-corner' | 'diagonal';
export type TeeMinAreaPoseValue = number | string | typeof UNKNOWN;
export interface TeeMinAreaPoseReceiptRow {
    /** Trace ordinal is the one-to-one identity when a producer ref is absent. */
    readonly traceIndex: number;
    readonly id: string;
    readonly role: MinAreaPoseRole;
    readonly ref: string;
    readonly type: Drawable['type'];
    readonly verdict: Drawable['verdict'];
    readonly reason: string;
    readonly values: Readonly<Record<string, TeeMinAreaPoseValue>>;
}
export interface TeeMinAreaPoseCorrespondence {
    readonly traceIds: readonly string[];
    readonly cliIds: readonly string[];
    readonly visualIds: readonly string[];
    readonly matched: boolean;
}
export interface TeeMinAreaPoseReceipt {
    readonly plan: FeatureRenderPlan;
    readonly rows: readonly TeeMinAreaPoseReceiptRow[];
    readonly cliText: string;
    readonly correspondence: TeeMinAreaPoseCorrespondence;
}
/** Required target observations. Absent producer testimony is explicit
 * UNKNOWN; no numeric value or coordinate is inferred by this selector. */
export declare const TEE_MIN_AREA_POSE_REQUIRED_VALUES: readonly ["targetRef", "targetComponent", "pixelCount", "hullVertexCount", "candidateCount", "score", "occupancy", "rectangleAreaPx2", "centerXPx", "centerYPx", "angleDeg", "majorPx", "minorPx", "producerCornerC0X", "producerCornerC0Y", "producerCornerC1X", "producerCornerC1Y", "producerCornerC2X", "producerCornerC2Y", "producerCornerC3X", "producerCornerC3Y"];
/** Build the matching CLI/Visual receipt from one actual producer UnitTrace. */
export declare function buildTeeMinAreaPoseReceipt(unit: UnitTrace, run: RunTrace): TeeMinAreaPoseReceipt;
/** FeatureRender seam: actual producer drawables are forwarded unchanged. */
export declare const teeMinAreaPoseRender: FeatureRender;
export {};
