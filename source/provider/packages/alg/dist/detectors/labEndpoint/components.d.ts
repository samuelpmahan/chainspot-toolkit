/**
 * 8-connected component labeling + the exact per-component statistics the
 * Python baseline derives (centroid, bbox, area, biased-covariance PCA
 * orientation, projected major/minor extents, fill, angle).
 *
 * Label numbering: components are numbered 1..N in raster-scan first-encounter
 * order. OpenCV's block-based labeler can emit a different numbering; parity
 * comparisons therefore match components structurally (bbox+area+centroid),
 * not by label id. All downstream semantics operate on component sets and
 * explicitly sorted orders.
 */
import type { Mask } from './raster';
export interface ComponentStats {
    label: number;
    cx: number;
    cy: number;
    area: number;
    bboxX: number;
    bboxY: number;
    bboxW: number;
    bboxH: number;
    /** Projected extent along the PCA major axis (max-min+1). */
    major: number;
    /** Projected extent along the PCA minor axis (max-min+1). */
    minor: number;
    /** Orientation of the (sign-normalized) major axis, radians. */
    angle: number;
    /** area / (major*minor), clamped denominator. */
    fill: number;
}
export interface LabeledComponents {
    labels: Int32Array;
    components: ComponentStats[];
}
/**
 * PCA major axis of a point set relative to its centroid, using the biased
 * (divide-by-N) covariance like np.cov(..., bias=True), with the baseline's
 * sign normalization: flip so x > 0, or if |x| ~ 0, y > 0.
 *
 * Closed-form eigen decomposition of the symmetric 2x2 covariance
 * [[cxx, cxy], [cxy, cyy]]; matches np.linalg.eigh + argmax(eigvals) up to
 * floating-point noise. When the matrix is (numerically) diagonal, mirrors
 * eigh's behavior: equal eigenvalues -> argmax picks index 0 -> axis (1,0);
 * otherwise the axis of the larger diagonal entry.
 */
export declare function majorAxisOf(cxx: number, cxy: number, cyy: number): {
    ax: number;
    ay: number;
};
interface PixelSet {
    xs: Float64Array;
    ys: Float64Array;
    count: number;
}
/** Statistics identical to the baseline's Component dataclass for one pixel set. */
export declare function statsForPixels(label: number, pixels: PixelSet, bboxX: number, bboxY: number, bboxW: number, bboxH: number): ComponentStats | null;
/**
 * Two-pass 8-connected labeling with union-find, then per-component stats.
 * Mirrors extract_components() in the baseline (components with fewer than
 * 2 pixels are dropped from the stats list but keep their label in `labels`).
 */
export declare function extractComponents(mask: Mask): LabeledComponents;
/** Pixel coordinates of one labeled component, in raster order. */
export declare function componentPixels(labels: Int32Array, width: number, c: ComponentStats): {
    xs: Float64Array;
    ys: Float64Array;
    count: number;
};
export {};
