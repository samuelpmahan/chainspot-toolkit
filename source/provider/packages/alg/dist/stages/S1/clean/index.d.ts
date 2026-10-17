import type { CompositeResult } from '../../../g0/composite';
import type { BadgeStageResult } from '../../../detectors/threeFactor/badgeStage';
import type { BrightDarkComponentFields } from '../../../detectors/threeFactor/componentField';
import type { ComponentStats } from '../../../detectors/threeFactor/components';
import type { PxC } from '../../../exec/board';
import { type CompiledExecutionPlan } from '../../../exec/compile';
import type { OperationSpec, TickTestimony } from '../../../exec/contract';
import { type Pcr } from '../../../exec/pcr';
import { Badge, type BadgeMasks } from './Badge';
export { Badge, BadgeFn, BadgePxC } from './Badge';
export declare const S1_ACCEPT_CROPPED_IMAGE_TICK: OperationSpec;
export declare const S1_BADGE_FAMILY_TICK: OperationSpec;
export declare const S1_COMPONENT_SUBSTRATE_TICK: OperationSpec;
export declare const S1_BADGE_RECOVERY_TICK: OperationSpec;
export declare const S1_BADGE_OBJECTS_TICK: OperationSpec;
export interface S1Subtraction {
    readonly widthPx: number;
    readonly heightPx: number;
    readonly rgba: Uint8ClampedArray;
    readonly badgePx: number;
    readonly addedMutePx: number;
    readonly mutedPx: number;
    readonly overlapPx: number;
    readonly remainingOpaquePx: number;
}
/** Materializer-only alpha subtraction; neither raster is written back to PxC. */
export declare function materializeS1Subtractions(run: Pick<S1BadgesCandidateRun, 'croppedImage' | 'badges'>): {
    badgePx: S1Subtraction;
    muted: S1Subtraction;
};
export interface S1BadgesCandidateRun {
    readonly pxc: PxC;
    readonly croppedImage: CompositeResult;
    readonly masks: BadgeMasks;
    readonly components: BrightDarkComponentFields;
    readonly family: readonly ComponentStats[];
    readonly stage: BadgeStageResult;
    readonly badges: readonly Badge[];
    readonly plan: CompiledExecutionPlan;
    readonly testimonies: readonly TickTestimony[];
    readonly pcr: Pcr;
}
export declare function executeS1BadgesCandidate(pxc: PxC): S1BadgesCandidateRun;
