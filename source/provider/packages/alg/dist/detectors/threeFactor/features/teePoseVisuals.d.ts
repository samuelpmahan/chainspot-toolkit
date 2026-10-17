import type { PointDrawable, PolylineDrawable } from './types';
export type TeePoseCorner = readonly [number, number];
export interface TeePoseDecoration {
    readonly cornerTicks: readonly PointDrawable[];
    readonly diagonals: readonly PolylineDrawable[];
}
/**
 * Build the one presentation contract shared by visible and shard-recovered
 * tees. The four coordinates are detector-emitted testimony; this helper only
 * joins them and carries their already-established pose into the renderer.
 */
export declare function teePoseDecoration(corners: readonly TeePoseCorner[], ref: string, source: string): TeePoseDecoration;
