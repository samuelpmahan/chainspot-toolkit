import type { CompositeResult } from '../g0/composite';
import type { BrightDarkComponentFields } from '../detectors/threeFactor/componentField';
import type { Mask } from '../detectors/threeFactor/raster';
export interface BrightDarkMasks {
    readonly bright: Mask;
    readonly dark: Mask;
}
/** Generic raster/component substrate shared by object Stages. */
export declare const ComponentPxC: {
    readonly image: import("../exec/board").PxKey<CompositeResult>;
    readonly masks: import("../exec/board").PxKey<BrightDarkMasks>;
    readonly fields: import("../exec/board").PxKey<BrightDarkComponentFields>;
};
