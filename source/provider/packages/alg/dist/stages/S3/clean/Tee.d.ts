import { type TeeRing } from '../../../detectors/threeFactor/endpoints';
import { type RasterComponentRef } from '../../../detectors/threeFactor/componentAssembly';
import type { BrightDarkComponentFields } from '../../../detectors/threeFactor/componentField';
import type { ComponentStats } from '../../../detectors/threeFactor/components';
import { type PxC } from '../../../exec/board';
import { type Badge } from '../../S1/clean/Badge';
export interface TeeRingSearch {
    readonly enclosed: readonly TeeRing[];
    readonly elongated: readonly TeeRing[];
    readonly excludedByBadge: readonly TeeRing[];
    readonly candidates: readonly TeeRing[];
}
export interface TeeFrameMeasure {
    readonly ring: TeeRing;
    readonly frame: ComponentStats;
}
export interface TeeFamily {
    readonly measured: readonly TeeFrameMeasure[];
    readonly unframed: readonly TeeRing[];
    readonly members: readonly TeeFrameMeasure[];
    readonly anchor: TeeFrameMeasure | null;
}
interface DetectRingsArgs {
    readonly fields: BrightDarkComponentFields;
    readonly badges: readonly Badge[];
}
interface FindFamilyArgs {
    readonly rings: TeeRingSearch;
    readonly fields: BrightDarkComponentFields;
}
interface FindPxArgs {
    readonly member: TeeFrameMeasure;
    readonly fields: BrightDarkComponentFields;
}
interface FoundTeePx {
    readonly frame: RasterComponentRef;
    readonly px: Uint32Array;
}
export declare const TeePxC: {
    readonly rings: import("../../../exec/board").PxKey<TeeRingSearch>;
    readonly family: import("../../../exec/board").PxKey<TeeFamily>;
    readonly objects: import("../../../exec/board").PxKey<readonly Tee[]>;
};
export declare const TeeFn: {
    readonly detectRings: import("../../../exec/board").PxFn<DetectRingsArgs, TeeRingSearch>;
    readonly findFamily: import("../../../exec/board").PxFn<FindFamilyArgs, TeeFamily>;
    readonly findPx: import("../../../exec/board").PxFn<FindPxArgs, FoundTeePx>;
};
export declare function selectTeeFamily(measured: readonly TeeFrameMeasure[]): {
    readonly members: readonly TeeFrameMeasure[];
    readonly anchor: TeeFrameMeasure | null;
};
export declare function registerTee(pxc: PxC): void;
export interface TeeHas {
    readonly detectRings: {
        readonly fn: typeof TeeFn.detectRings.address;
        readonly hole: TeeRing;
    };
    readonly findFamily: {
        readonly fn: typeof TeeFn.findFamily.address;
        readonly frame: RasterComponentRef;
    };
    readonly findPx: {
        readonly fn: typeof TeeFn.findPx.address;
        readonly parts: readonly RasterComponentRef[];
    };
}
export declare class Tee {
    readonly center: readonly [number, number];
    readonly innerBbox: readonly [number, number, number, number];
    readonly bbox: readonly [number, number, number, number];
    readonly angleRad: number;
    readonly has: TeeHas;
    readonly px: Uint32Array;
    private constructor();
    static detectRings(pxc: PxC): TeeRingSearch;
    static findFamily(pxc: PxC): TeeFamily;
    static findPx(pxc: PxC): readonly Tee[];
}
export {};
