import { type ComponentRasterEvidence, type RasterComponentRef } from '../../../detectors/threeFactor/componentAssembly';
import type { BrightDarkComponentFields } from '../../../detectors/threeFactor/componentField';
import type { ComponentStats } from '../../../detectors/threeFactor/components';
import { type BadgeStageKnobs, type BadgeStageResult } from '../../../detectors/threeFactor/badgeStage';
import type { Mask } from '../../../detectors/threeFactor/raster';
import type { BadgeEvidence as LegacyBadgeRead } from '../../../detectors/threeFactor/types';
import { type PxC } from '../../../exec/board';
import { type BrightDarkMasks } from '../../componentPxC';
export type BadgeMasks = BrightDarkMasks;
export declare const BadgePxC: {
    readonly image: import("../../../exec/board").PxKey<import("../../../g0/composite").CompositeResult>;
    readonly masks: import("../../../exec/board").PxKey<BrightDarkMasks>;
    readonly components: import("../../../exec/board").PxKey<BrightDarkComponentFields>;
    readonly family: import("../../../exec/board").PxKey<readonly ComponentStats[]>;
    readonly stage: import("../../../exec/board").PxKey<BadgeStageResult>;
    readonly reads: import("../../../exec/board").PxKey<readonly LegacyBadgeRead[]>;
    readonly objects: import("../../../exec/board").PxKey<readonly Badge[]>;
};
interface DetectFamilyArgs {
    readonly width: number;
    readonly dark: Mask;
    readonly bright: readonly ComponentStats[];
    readonly knobs: BadgeStageKnobs;
}
interface RecoverArgs {
    readonly width: number;
    readonly height: number;
    readonly masks: BadgeMasks;
    readonly fields: BrightDarkComponentFields;
    readonly family: readonly ComponentStats[];
    readonly knobs: BadgeStageKnobs;
}
interface FindPxArgs {
    readonly stage: BadgeStageResult;
    readonly fields: BrightDarkComponentFields;
    readonly read: LegacyBadgeRead;
}
interface FoundPx {
    readonly basis: 'bright-family' | 'dark-plate-recovery' | 'unresolved';
    readonly components: readonly RasterComponentRef[];
    readonly px: Uint32Array;
    readonly whitePx: number;
    readonly blackPx: number;
    readonly note?: string;
}
interface MuteArgs {
    readonly found: FoundPx;
    readonly read: LegacyBadgeRead;
    readonly raster: ComponentRasterEvidence;
    readonly radiusPx: number;
}
export declare const BadgeFn: {
    readonly detectFamily: import("../../../exec/board").PxFn<DetectFamilyArgs, ComponentStats[]>;
    readonly recover: import("../../../exec/board").PxFn<RecoverArgs, BadgeStageResult>;
    readonly findPx: import("../../../exec/board").PxFn<FindPxArgs, FoundPx>;
    readonly mute: import("../../../exec/board").PxFn<MuteArgs, Uint32Array<ArrayBufferLike>>;
};
export declare function registerBadge(pxc: PxC): void;
export interface BadgeHas {
    readonly detectFamily?: {
        readonly fn: typeof BadgeFn.detectFamily.address;
        readonly outer: RasterComponentRef;
    };
    readonly recover?: {
        readonly fn: typeof BadgeFn.recover.address;
        readonly plate: RasterComponentRef;
    };
    readonly findPx: {
        readonly fn: typeof BadgeFn.findPx.address;
        readonly parts: readonly RasterComponentRef[];
    };
    readonly readDigit: {
        readonly fn: 'fn.readCourseBadges';
        readonly label: string | null;
    };
    readonly mute: {
        readonly fn: typeof BadgeFn.mute.address;
        readonly radiusPx: number;
        readonly px: Uint32Array;
    };
}
export declare class Badge {
    readonly label: string | null;
    readonly source: LegacyBadgeRead['source'];
    readonly bbox: readonly [number, number, number, number];
    readonly rawLabel: string;
    readonly confidence: number;
    readonly abstentionReason: LegacyBadgeRead['abstentionReason'];
    readonly has: BadgeHas;
    readonly px: Uint32Array;
    readonly whitePx: number;
    readonly blackPx: number;
    readonly note?: string;
    private constructor();
    static detectFamily(pxc: PxC, knobs: BadgeStageKnobs): readonly ComponentStats[];
    static recover(pxc: PxC, knobs: BadgeStageKnobs): BadgeStageResult;
    static fromRead(pxc: PxC, read: LegacyBadgeRead): Badge;
}
export {};
