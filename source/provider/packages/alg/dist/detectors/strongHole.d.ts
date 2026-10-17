/**
 * Strong hole straightness detection: uses orthogonal-regression collinearity
 * (mirrors `old-stuff/src/lib/autoAnnotation/collinearityStraightnessTest.ts`).
 *
 * For a bendless hole with tee, badge, and basket points, fits an orthogonal
 * line through all three, measures the RMS perpendicular distance to that line,
 * normalizes by tee-basket distance to yield a ratio (divergence), and compares
 * to a threshold (default 0.015 = 1.5%).
 *
 * Divergence metric: `rmse / distance(tee, basket)` where rmse is the root mean
 * square of perpendicular distances of tee, badge, basket to their fitted line.
 * A ratio of 0.015 means the badge sits ~1.5% of the hole's length away from the
 * tee-basket line — the owner's spec defines holes with divergence <= 0.015 as
 * "strong" and eligible for auto-accept without review.
 *
 * On 50+ real bendless holes, P90 divergence is ~1.9%; the 0.015 threshold
 * captures holes well below that typical spread.
 */
export interface Point {
    readonly xPx: number;
    readonly yPx: number;
}
export interface StrongHoleInput {
    readonly n: number;
    readonly badge: Point;
    readonly tee: Point | null;
    readonly basket: Point | null;
    readonly bends: readonly Point[];
}
export interface StrongHoleVerdict {
    readonly n: number;
    readonly divergence: number | null;
    readonly strong: boolean;
}
/** Threshold (ratio) below which a hole is considered "strong" and eligible for auto-accept. */
export declare const STRONG_DIVERGENCE_MAX = 0.015;
/**
 * Evaluates a batch of holes for "strong" straightness.
 *
 * A hole is strong if and only if:
 * - It has a non-null tee AND non-null basket
 * - It has zero bends
 * - Its divergence (rmse normalized by tee-basket distance) is <= divergenceMax
 *
 * If any required component is missing or bends are present, divergence is null
 * and strong is false. Degenerate cases (coincident points, zero-length rays) also
 * return divergence null and strong false, never NaN or thrown errors.
 */
export declare function evaluateStrongHoles(holes: readonly StrongHoleInput[], divergenceMax?: number): StrongHoleVerdict[];
