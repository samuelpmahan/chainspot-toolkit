/**
 * G1 badgeCoverageDigit: the coverage DIGIT reader (digits/badgeCoverageDigitMath.ts) with its vendored templates.
 * Not an engine unit and in no execution list: a pure function over one badge, beside the other readers.
 */
import type { BadgeEvidence } from '../types';
import type { RgbaBitmap } from '../digits/badgeGlyphTemplateMath';
import { type CoverageDigitTemplateEntry } from '../digits/badgeCoverageDigitMath';
export declare const BADGE_COVERAGE_DIGIT_TEMPLATES: readonly CoverageDigitTemplateEntry[];
/** One badge: its per-cell digit NCC table and its read. */
export declare function classifyBadgeCoverageDigits(image: RgbaBitmap, badge: Pick<BadgeEvidence, 'bbox'>, viewportTopPx?: number): {
    table: {
        one: number[][] | null;
        two: number[][] | null;
    };
    number: string | null;
};
