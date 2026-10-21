import { type BasketShellMargins, type ComponentRasterEvidence, type RasterComponentRef } from '../../../detectors/threeFactor/componentAssembly';
import type { BrightDarkComponentFields } from '../../../detectors/threeFactor/componentField';
import { type ComponentStats } from '../../../detectors/threeFactor/components';
import type { Mask } from '../../../detectors/threeFactor/raster';
import { type PxC } from '../../../exec/board';
/** The fraction of a family's members that must share a dark px for it to be part of their common frame. */
export declare const SHELL_AGREEMENT_MIN = 0.75;
/** A window in sprite frame: the body's bbox padded on every side by the body's own size (template px, screen-fixed). */
export interface ShellWindow {
    readonly width: number;
    readonly height: number;
    readonly bodyX: number;
    readonly bodyY: number;
}
/** Members' frames overlapped in sprite frame, registered on the bright body: how many members are dark at each px. */
export interface ShellOverlap {
    readonly window: ShellWindow;
    readonly memberCount: number;
    readonly agree: Uint16Array;
}
/** A frame shape: margins around the body, and the frame px in shell frame (width = body + left + right). */
export interface ShellShapeGeometry {
    readonly margins: BasketShellMargins;
    readonly offsets: Uint32Array;
    readonly areaPx: number;
}
export interface ShellShapeComparison {
    readonly marginsAgree: boolean;
    readonly learnedPx: number;
    readonly carriedPx: number;
    readonly sharedPx: number;
    readonly iou: number;
}
/**
 * px.baskets.shellShape: the frame shape every member's shell is read with. Learned when the members' overlapped frames
 * share a dark component that encloses the body (canopy contact is idiosyncratic per member, so it never reaches the
 * agreement); otherwise the carried prior. Both are kept, and compared when both exist.
 */
export interface BasketShellShape {
    readonly schema: 'chainspot-basket-shell-shape@1';
    readonly source: 'learned' | 'carried' | 'none';
    readonly agreementMin: number;
    readonly agreementCount: number;
    readonly overlap: ShellOverlap;
    readonly learned: ShellShapeGeometry | null;
    readonly learnedCondition: string | null;
    readonly carried: ShellShapeGeometry & {
        readonly members: number;
    };
    readonly comparison: ShellShapeComparison | null;
    readonly margins: BasketShellMargins | null;
    readonly shellOffsets: Uint32Array;
}
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
    /** The member's own dark px on the shape, over the shape's px: how well this member's frame matches it. */
    readonly shellCoverage: number;
}
export interface BasketShellFamily {
    readonly margins: BasketShellMargins | null;
    readonly shellOffsets: Uint32Array;
    readonly members: readonly BasketShellMember[];
}
interface DetectFamilyArgs {
    readonly fields: BrightDarkComponentFields;
}
interface LearnShellShapeArgs {
    readonly family: BasketFamily;
    readonly fields: BrightDarkComponentFields;
}
interface FindShellFamilyArgs {
    readonly shape: BasketShellShape;
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
    readonly shellShape: import("../../../exec/board").PxKey<BasketShellShape>;
    readonly shellFamily: import("../../../exec/board").PxKey<BasketShellFamily>;
    readonly objects: import("../../../exec/board").PxKey<readonly Basket[]>;
};
export declare const BasketFn: {
    readonly detectFamily: import("../../../exec/board").PxFn<DetectFamilyArgs, BasketFamily>;
    readonly learnShellShape: import("../../../exec/board").PxFn<LearnShellShapeArgs, BasketShellShape>;
    readonly findShellFamily: import("../../../exec/board").PxFn<FindShellFamilyArgs, BasketShellFamily>;
    readonly findPx: import("../../../exec/board").PxFn<FindPxArgs, FoundBasketPx>;
};
/** The sprite-frame window around a body: padded by the body's own width and height on each side. */
export declare function shellWindow(bodyWidth: number, bodyHeight: number): ShellWindow;
/** Overlap members' frames: each entry is a body and the dark mask of its own image (several images pool into one). */
export declare function overlapShellFrames(entries: readonly {
    readonly body: ComponentStats;
    readonly dark: Mask;
}[], window: ShellWindow): ShellOverlap;
/** How many of n members must agree (the same rounding the common shell has always used). */
export declare function shellAgreementCount(memberCount: number, agreementMin?: number): number;
/**
 * The shape the members share: px dark in at least the agreement count, and of those the smallest 8-connected
 * component enclosing the body (the same smallest-enclosing rule as one member's shell, applied to their overlap).
 * Its bbox gives the margins; its frame px are every agreeing px inside them. Null when nothing encloses the body.
 */
export declare function shellShapeOf(overlap: ShellOverlap, bodyWidth: number, bodyHeight: number, agreementMin?: number): ShellShapeGeometry | null;
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
    static learnShellShape(pxc: PxC): BasketShellShape;
    static findShellFamily(pxc: PxC): BasketShellFamily;
    static findPx(pxc: PxC): readonly Basket[];
}
export {};
