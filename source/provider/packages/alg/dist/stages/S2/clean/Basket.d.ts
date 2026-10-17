import { type BasketShellMargins, type ComponentRasterEvidence, type RasterComponentRef } from '../../../detectors/threeFactor/componentAssembly';
import type { BrightDarkComponentFields } from '../../../detectors/threeFactor/componentField';
import type { ComponentStats } from '../../../detectors/threeFactor/components';
import { type PxC } from '../../../exec/board';
export interface BasketFamilyMember {
    readonly body: ComponentStats;
    readonly areaRatio: number;
    readonly whiteCoverage: number;
}
export interface BasketFamily {
    readonly templateSize: readonly [number, number];
    readonly members: readonly BasketFamilyMember[];
}
export interface BasketShellMember {
    readonly candidate: BasketFamilyMember;
    readonly bbox: readonly [number, number, number, number];
    readonly blackPx: Uint32Array;
}
export interface BasketShellFamily {
    readonly margins: BasketShellMargins | null;
    readonly shellOffsets: Uint32Array;
    readonly members: readonly BasketShellMember[];
}
interface DetectFamilyArgs {
    readonly fields: BrightDarkComponentFields;
}
interface FindShellFamilyArgs {
    readonly family: BasketFamily;
    readonly fields: BrightDarkComponentFields;
}
interface FindPxArgs {
    readonly member: BasketShellMember;
    readonly raster: ComponentRasterEvidence;
}
interface FoundBasketPx {
    readonly parts: readonly RasterComponentRef[];
    readonly px: Uint32Array;
    readonly whitePx: number;
    readonly blackPx: number;
}
export declare const BasketPxC: {
    readonly family: import("../../../exec/board").PxKey<BasketFamily>;
    readonly shellFamily: import("../../../exec/board").PxKey<BasketShellFamily>;
    readonly objects: import("../../../exec/board").PxKey<readonly Basket[]>;
};
export declare const BasketFn: {
    readonly detectFamily: import("../../../exec/board").PxFn<DetectFamilyArgs, BasketFamily>;
    readonly findShellFamily: import("../../../exec/board").PxFn<FindShellFamilyArgs, BasketShellFamily>;
    readonly findPx: import("../../../exec/board").PxFn<FindPxArgs, FoundBasketPx>;
};
export declare function registerBasket(pxc: PxC): void;
export interface BasketHas {
    readonly detectFamily: {
        readonly fn: typeof BasketFn.detectFamily.address;
        readonly body: RasterComponentRef;
    };
    readonly findShellFamily: {
        readonly fn: typeof BasketFn.findShellFamily.address;
        readonly margins: BasketShellMargins;
        readonly blackPx: Uint32Array;
    };
    readonly findPx: {
        readonly fn: typeof BasketFn.findPx.address;
        readonly body: RasterComponentRef;
    };
}
export declare class Basket {
    readonly bbox: readonly [number, number, number, number];
    readonly has: BasketHas;
    readonly px: Uint32Array;
    readonly whitePx: number;
    readonly blackPx: number;
    private constructor();
    static detectFamily(pxc: PxC): BasketFamily;
    static findShellFamily(pxc: PxC): BasketShellFamily;
    static findPx(pxc: PxC): readonly Basket[];
}
export {};
