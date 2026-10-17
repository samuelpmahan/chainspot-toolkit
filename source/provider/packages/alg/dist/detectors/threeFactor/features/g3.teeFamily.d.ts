import type { TeePadEvidence } from '../types';
import type { EngineUnit, FeatureRender } from './types';
export interface TeeFamilyKnobs {
    readonly frameAreaMin: number;
    readonly frameAreaMax: number;
    readonly frameMaxWidth: number;
    readonly frameMaxHeight: number;
    readonly majorRatioToleranceFactor: number;
    readonly minorRatioToleranceFactor: number;
    readonly areaRatioToleranceFactor: number;
    readonly fillRatioToleranceFactor: number;
}
export declare const teeFamilyFeature: {
    id: string;
    gate: "G3";
    kind: "baseline";
    defaultEnabled: true;
    note: string;
    render: FeatureRender;
    knobs: {
        frameAreaMin: {
            default: number;
            note: string;
            validate: (value: unknown) => string | null;
        };
        frameAreaMax: {
            default: number;
            note: string;
            validate: (value: unknown) => string | null;
        };
        frameMaxWidth: {
            default: number;
            note: string;
            validate: (value: unknown) => string | null;
        };
        frameMaxHeight: {
            default: number;
            note: string;
            validate: (value: unknown) => string | null;
        };
        majorRatioToleranceFactor: {
            default: number;
            note: string;
            validate: (value: unknown) => string | null;
        };
        minorRatioToleranceFactor: {
            default: number;
            note: string;
            validate: (value: unknown) => string | null;
        };
        areaRatioToleranceFactor: {
            default: number;
            note: string;
            validate: (value: unknown) => string | null;
        };
        fillRatioToleranceFactor: {
            default: number;
            note: string;
            validate: (value: unknown) => string | null;
        };
    };
};
export interface TeeFamilyFrame {
    readonly componentLabel: number;
    readonly bboxX: number;
    readonly bboxY: number;
    readonly bboxW: number;
    readonly bboxH: number;
    readonly componentCentroidXPx: number;
    readonly componentCentroidYPx: number;
    readonly area: number;
    readonly fill: number;
    readonly major: number;
    readonly minor: number;
    readonly angleRad: number;
    readonly axisMajorMin: number;
    readonly axisMajorMax: number;
    readonly axisMinorMin: number;
    readonly axisMinorMax: number;
}
export interface TeeFamilyRingPoint {
    readonly id: string;
    readonly cx: number;
    readonly cy: number;
}
export interface TeeFamilyMeasure {
    readonly ring: TeeFamilyRingPoint;
    readonly frame: TeeFamilyFrame;
}
export interface TeeFamilySelection {
    readonly family: readonly TeeFamilyMeasure[];
    readonly anchor: TeeFamilyMeasure | null;
}
/** Oriented rectangle centered on the already-measured component centroid.
 * Component PCA already paid for angle + projected major/minor extents; this
 * function only converts those retained measurements into four corners. */
export declare function orientedPadCorners(frame: TeeFamilyFrame): TeePadEvidence['orientedCorners'];
/**
 * LAB frameForRing: the smallest-bbox (tie: largest-area) frame among
 * size-windowed candidates whose bbox contains the ring center, inclusive.
 * Null when no candidate contains the center.
 */
export declare function findEnclosingFrame(ring: TeeFamilyRingPoint, frames: readonly TeeFamilyFrame[], knobs: TeeFamilyKnobs): TeeFamilyFrame | null;
/**
 * LAB selectTeeFamily: for every measure as a candidate anchor, the family
 * is every measure whose frame major/minor/area/fill all sit within the
 * configured log-ratio tolerance of the anchor's frame; keep the largest
 * family, ties broken by minimum summed spread. Output (and the winning
 * anchor, for trace reporting) sorted deterministically by ring cy then cx.
 */
export declare function selectTeeFamily(measures: readonly TeeFamilyMeasure[], knobs: TeeFamilyKnobs): TeeFamilySelection;
/** Exact bright-mask cells owned by one connected component, shifted from
 * badge-stage-local Y into the detector's original-image coordinate frame. */
export declare function exactBrightComponentPixels(labels: Int32Array, width: number, height: number, componentLabel: number, topPx: number): readonly (readonly [number, number])[];
export declare const teeFamilyUnit: EngineUnit;
