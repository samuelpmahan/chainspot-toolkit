import type { Mask } from './raster';
import type { BrightDarkMasks } from './raster';
import { type ComponentStats } from './components';
export type ComponentFieldPolarity = 'bright' | 'dark';
/**
 * One connected-component view of one binary raster class. Bright and dark
 * are configurations of this same object; consumers can retain the whole
 * coherent value instead of recomputing labels/components from a mask.
 */
export interface ComponentField {
    readonly config: {
        readonly polarity: ComponentFieldPolarity;
    };
    readonly mask: Mask;
    readonly labels: Int32Array;
    readonly components: readonly ComponentStats[];
}
export interface BrightDarkComponentFields {
    readonly bright: ComponentField;
    readonly dark: ComponentField;
}
export declare const BRIGHT_COMPONENT_FIELD: {
    readonly polarity: "bright";
};
export declare const DARK_COMPONENT_FIELD: {
    readonly polarity: "dark";
};
/** Group an already-measured binary mask without changing mask/component math. */
export declare function groupComponentField(mask: Mask, config: {
    readonly polarity: ComponentFieldPolarity;
}): ComponentField;
/**
 * The minimal E/cache value for the existing shared HSV measurement: same
 * threshold outputs as computeBrightDarkMasks, now grouped into two instances
 * of one component-field object.
 */
export declare function groupBrightDarkComponentFields(masks: BrightDarkMasks): BrightDarkComponentFields;
