import type { CropInsets } from '../raster';
import type { Placement } from './types';
export type LedgerEntry = {
    readonly kind: 'crop';
    readonly insets: CropInsets;
} | {
    readonly kind: 'placement';
    readonly tileIndex: number;
    readonly placement: Placement;
    readonly source: 'spread' | 'semantic' | 'pixel' | 'manual';
} | {
    readonly kind: 'projection';
    readonly tileIndex: number;
    readonly note: string;
};
export interface CoordinateTransformLedger {
    readonly entries: readonly LedgerEntry[];
}
export declare function createLedger(): CoordinateTransformLedger;
/** Ledgers are immutable — appending returns a new ledger, never mutates. */
export declare function appendEntry(ledger: CoordinateTransformLedger, entry: LedgerEntry): CoordinateTransformLedger;
export declare function appendEntries(ledger: CoordinateTransformLedger, entries: readonly LedgerEntry[]): CoordinateTransformLedger;
