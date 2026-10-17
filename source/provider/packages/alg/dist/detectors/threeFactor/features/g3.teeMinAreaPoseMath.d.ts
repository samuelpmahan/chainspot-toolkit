/**
 * Deterministic minimum-area pose for one exact tee component.
 *
 * This uses the same minimum-area-rectangle class of geometry as the
 * pre-engine tee detector's OpenCV `minAreaRect(contour)`. It is deliberately
 * not literal OpenCV contour parity: today's input is the exact
 * detector-owned component, expanded into a unit-cell envelope, rather than
 * old gray/Canny contour points. Returned extents can therefore differ from
 * OpenCV's contour-point extents while containing every painted cell.
 * It does not inspect truth, badges, baskets, assignments, paths, neighboring
 * tees, or pixels outside the component.
 */
export interface TeeComponentCell {
    readonly xPx: number;
    readonly yPx: number;
}
export interface TeeMinAreaPoint {
    readonly xPx: number;
    readonly yPx: number;
}
export interface TeeMinimumAreaPoseResult {
    readonly accepted: boolean;
    readonly reason: string;
    readonly pixelCount: number;
    readonly hullVertexCount: number;
    readonly candidateCount: number;
    readonly score: number | null;
    readonly occupancy: number | null;
    readonly areaPx2: number | null;
    readonly center: TeeMinAreaPoint | null;
    readonly angleDeg: number | null;
    readonly majorPx: number | null;
    readonly minorPx: number | null;
    /** Four fitted rectangle corners in cyclic order. */
    readonly corners: readonly TeeMinAreaPoint[] | null;
}
/**
 * Fit the minimum-area rectangle enclosing every exact owned pixel cell.
 * The exact component cells are the complete input, including tie-breaking.
 */
export declare function fitMinimumAreaPixelRect(pixels: readonly TeeComponentCell[]): TeeMinimumAreaPoseResult;
