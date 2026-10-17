import type { TeeFrameMeasure } from '../../clean/Tee';
export declare const FILL_RATIO_TOLERANCE = 1.25;
/**
 * Experimental fourth family dimension from the historical G3 selector.
 *
 * The clean selector groups enclosing Tee frames by major/minor/area. This
 * variant additionally asks whether their bright-component fill ratios form
 * a common renderer family. It stays separate so a sweep can compare the
 * percepts without silently changing the clean Tee definition.
 */
export declare function selectFillConsistentTeeFamily(measured: readonly TeeFrameMeasure[]): {
    readonly members: readonly TeeFrameMeasure[];
    readonly anchor: TeeFrameMeasure | null;
};
