import type { BadgeEvidence } from '../types';
export declare const supportRoiFeature: {
    id: string;
    gate: "G5";
    kind: "deviation";
    defaultEnabled: false;
    note: string;
    knobs: {
        marginPx: {
            default: number;
            note: string;
            validate: (value: unknown) => "marginPx must be a non-negative finite number" | null;
        };
        minBadges: {
            default: number;
            note: string;
            validate: (value: unknown) => "minBadges must be a positive integer" | null;
        };
    };
};
/** Inclusive bounds in IMAGE pixels. */
export interface SupportRoi {
    readonly x0: number;
    readonly y0: number;
    readonly x1: number;
    readonly y1: number;
}
/**
 * Pure core, exported for tests. Returns null when the ROI should not be
 * applied — too few badges, or a box that covers the raster anyway, in which
 * case masking would only add overhead.
 */
export declare function badgeRoi(badges: readonly BadgeEvidence[], marginPx: number, imageWidth: number, imageHeight: number, minBadges: number): SupportRoi | null;
/** Fraction of the raster the ROI skips, for receipts. */
export declare function roiSkippedFraction(roi: SupportRoi | null, imageWidth: number, imageHeight: number): number;
