/**
 * End-to-end badge reading: NuThing P1 result -> per-badge digit string.
 *
 * Browser-portable: pure TS over typed arrays, no Node APIs. The classifier
 * is injected through the DigitScorer interface so competing models
 * (prototype matcher, logistic regression, ...) run through the identical
 * pipeline: badge -> glyph mask -> label-blind segmentation -> canonical
 * normalization -> per-digit scores -> concatenated label.
 *
 * Every prediction retains the evidence needed to render a full diagnostic
 * card (glyph mask, per-digit bbox/mask/normalized raster, scores, margins).
 */
import type { Mask } from '../raster';
import type { ComponentStats } from '../components';
import type { BadgeGlyph } from './badgeGlyph';
import type { DigitCandidate } from './segment';
import type { NormalizedDigit } from './normalize';
export declare const DIGIT_CLASSES: readonly ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
/** A trained digit model: scores a normalized 24x32 mask for classes 0-9. */
export interface DigitScorer {
    readonly name: string;
    /** Higher = more likely; index i corresponds to digit String(i). */
    scores(mask: NormalizedDigit): number[];
}
export interface DigitReading {
    candidate: DigitCandidate;
    normalized: NormalizedDigit;
    scores: number[];
    predicted: string;
    runnerUp: string;
    /** score[winner] - score[runnerUp]. */
    margin: number;
}
export interface BadgeReading {
    badge: ComponentStats;
    glyph: BadgeGlyph;
    digits: DigitReading[];
    /** Concatenated predicted digits ('' when no digit segments). */
    label: string;
    /** Minimum per-digit margin (Infinity when no digits). */
    confidence: number;
}
/** Minimal context readBadge needs — satisfied by NuThingP1Result and the
 * fast BadgeStageResult alike. */
export interface BadgeReadContext {
    brightMask: Mask;
    darkMask: Mask;
    brightLabels: Int32Array;
    badges: ComponentStats[];
}
export declare function readBadge(badge: ComponentStats, result: BadgeReadContext, scorer: DigitScorer): BadgeReading;
/** Read every badge-family observation of a P1 (or badge-stage) result. */
export declare function readCourseBadges(result: BadgeReadContext, scorer: DigitScorer): BadgeReading[];
