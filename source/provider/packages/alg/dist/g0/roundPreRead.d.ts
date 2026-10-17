import type { RgbaRaster } from '../detect';
export interface RoundPreReadPoint {
    readonly xPx: number;
    readonly yPx: number;
}
export interface RoundPreRead {
    readonly walk: readonly RoundPreReadPoint[];
    readonly droplets: readonly RoundPreReadPoint[];
}
export declare function preReadRound(image: RgbaRaster): Promise<RoundPreRead>;
