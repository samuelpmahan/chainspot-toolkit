/**
 * Repeated-family discovery over component size space, matching the baseline's
 * anchored_families / family_spread semantics exactly (including stable
 * ordering: anchor order determines first-seen family order; the final sort by
 * size is stable, so equal-size families keep anchor order).
 */
import type { ComponentStats } from './components';
export declare function logSizeDistance(aMajor: number, aMinor: number, bMajor: number, bMinor: number): number;
export declare function componentSizeDistance(a: ComponentStats, b: ComponentStats): number;
export declare function bboxSizeDistance(a: ComponentStats, b: ComponentStats): number;
/** np.median: mean of the two middle elements for even-length input. */
export declare function median(values: number[]): number;
export declare function anchoredFamilies(components: ComponentStats[], tolerance: number, distanceFn?: (a: ComponentStats, b: ComponentStats) => number): ComponentStats[][];
export declare function familySpread(family: ComponentStats[]): number;
