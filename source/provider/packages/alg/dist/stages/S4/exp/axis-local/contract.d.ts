import { type PxC } from '../../../../exec/board';
import type { StageContract } from '../../../contract';
/** Projection uses retained state only, never reruns measurement or judgment. */
export declare function renderS4(pxc: PxC): {
    label: string;
    widthPx: number;
    heightPx: number;
    rgba: Uint8ClampedArray<ArrayBuffer>;
    boxes: {
        bbox: readonly [number, number, number, number];
        color: readonly [255, 80, 80, 255];
    }[];
}[];
export declare const stageContract: StageContract;
