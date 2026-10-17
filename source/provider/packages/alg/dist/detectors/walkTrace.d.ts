import type { Detector, RgbaRaster } from '../detect';
export declare const WALK_TRACE_ALGO = "walk-trace-grid";
export declare const WALK_TRACE_ALGO_VERSION = "1.0.0";
export interface WalkVertex {
    readonly xPx: number;
    readonly yPx: number;
}
/** Douglas–Peucker on an ordered open polyline. */
export declare function simplifyPath(points: readonly WalkVertex[], tolerancePx: number): WalkVertex[];
/**
 * Pure core: extract the ordered walk polyline, or [] when no plausible
 * walk mass exists (e.g. this image is not a thrown round).
 */
export declare function traceWalk(image: RgbaRaster): WalkVertex[];
export declare const walkTraceDetector: Detector;
