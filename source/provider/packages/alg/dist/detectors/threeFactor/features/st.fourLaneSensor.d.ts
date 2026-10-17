import type { RgbaImage } from '../types';
export interface FourLaneSensorKnobs {
    readonly edgeDeltaPx: number;
    readonly liftReference: number;
    readonly tangentHalfPx: number;
    readonly tangentSamples: number;
}
export declare const DEFAULT_FOUR_LANE_SENSOR_KNOBS: FourLaneSensorKnobs;
export declare const fourLaneSensorFeature: {
    id: string;
    gate: "G5";
    kind: "deviation";
    defaultEnabled: false;
    note: string;
    knobs: {
        edgeDeltaPx: {
            default: number;
            note: string;
            validate: (value: unknown) => string | null;
        };
        liftReference: {
            default: number;
            note: string;
            validate: (value: unknown) => string | null;
        };
        tangentHalfPx: {
            default: number;
            note: string;
            validate: (value: unknown) => string | null;
        };
        tangentSamples: {
            default: number;
            note: string;
            validate: (value: unknown) => "tangentSamples must be a positive integer" | null;
        };
    };
};
export interface FourLanePoint {
    readonly xPx: number;
    readonly yPx: number;
}
export interface FourLaneState extends FourLanePoint {
    readonly headingRad: number;
    readonly corridorWidthPx: number;
}
export interface FourLaneOccluder {
    readonly bboxX: number;
    readonly bboxY: number;
    readonly bboxW: number;
    readonly bboxH: number;
    readonly kind?: string;
}
export type FourLaneRailMode = 'paired' | 'one-sided' | 'occluded';
export interface FourLaneBandSample {
    readonly mean: number | null;
    readonly occluded: boolean;
}
export interface FourLaneObservation {
    readonly laneOffsetsPx: readonly [number, number, number, number];
    readonly laneWidthPx: number;
    readonly leftRail: number | null;
    readonly innerLeft: number | null;
    readonly innerRight: number | null;
    readonly rightRail: number | null;
    readonly leftRailOccluded: boolean;
    readonly innerLeftOccluded: boolean;
    readonly innerRightOccluded: boolean;
    readonly rightRailOccluded: boolean;
    readonly railMode: FourLaneRailMode;
    readonly railScore: number | null;
    readonly innerScore: number | null;
    readonly score: number | null;
}
/**
 * Exact LAB band sampler. Expected pixels hidden by known occluders are
 * neutral: they do not contribute zero-valued appearance evidence.
 */
export declare function sampleFourLaneBand(image: RgbaImage, center: FourLanePoint, headingRad: number, normalOffsetPx: number, occluders: readonly FourLaneOccluder[], knobs: FourLaneSensorKnobs): FourLaneBandSample;
/** Pure cross-section observation math; no tracker/search behavior. */
export declare function observeFourLaneCrossSection(image: RgbaImage, state: FourLaneState, occluders: readonly FourLaneOccluder[], knobs: FourLaneSensorKnobs): FourLaneObservation;
