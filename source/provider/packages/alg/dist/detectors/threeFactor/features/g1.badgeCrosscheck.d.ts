/**
 * G1 badgeCrosscheck (Sam, 2026-10-21: "Yes, make readers crosscheck"). Over every badge S1 found:
 *  - the per-digit reader (measure.ts) still sets the label;
 *  - the coverage DIGIT reader checks it: the same label is 'confirmed'; another label is 'disagree', recorded with
 *    both reads and both P, and the per-digit label is kept (nothing changes silently);
 *  - where the per-digit reader has no label (it abstained, or read outside the vocabulary) and the coverage digit
 *    reader reads with P >= READER_P_STAR, its read is used and marked 'filled', unless another badge already holds that
 *    label; otherwise the badge stays 'unread';
 *  - the B+W digit reader and the whole-number coverage reader are witnesses, recorded with their reads and P; they
 *    never decide.
 * P is the learned confidence (badgeReaderCalibration.ts). Pure; the toolkit's Calculation fn.Badge.crosscheck calls it.
 */
import type { BadgeEvidence } from '../types';
import type { RgbaBitmap } from '../digits/badgeGlyphTemplateMath';
export type CrosscheckVerdict = 'confirmed' | 'disagree' | 'filled' | 'unread';
export interface CrosscheckRead {
    readonly label: number | null;
    readonly p: number | null;
}
export interface BadgeCrosscheck {
    readonly detId: string;
    readonly bbox: readonly [number, number, number, number];
    /** The label after the crosscheck: the per-digit label, or the filled read. */
    readonly label: number | null;
    readonly verdict: CrosscheckVerdict;
    readonly note: string | null;
    readonly perDigit: CrosscheckRead & {
        readonly abstention: string | null;
    };
    readonly coverageDigit: CrosscheckRead;
    readonly witnesses: {
        readonly digitBW: CrosscheckRead;
        readonly coverage: CrosscheckRead;
    };
}
export declare function crosscheckBadges(image: RgbaBitmap, badges: readonly BadgeEvidence[], viewportTopPx?: number): BadgeCrosscheck[];
