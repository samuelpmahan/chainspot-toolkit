/**
 * G1 badgeDigitTemplate: the black-and-white DIGIT reader
 * (digits/badgeDigitTemplateMath.ts), beside the binary whole-number reader
 * and the coverage reader. Not an engine unit and in no execution list: it
 * changes nothing in a run until it is judged. Offered as a pure function over
 * one badge on the same crop geometry as the other two readers.
 */
import type { BadgeEvidence } from '../types';
import type { RgbaBitmap } from '../digits/badgeGlyphTemplateMath';
import { type BadgeDigitClassification, type BadgeDigitTemplateEntry, type BadgeDigitTemplateKnobs } from '../digits/badgeDigitTemplateMath';
export declare const BADGE_DIGIT_TEMPLATES: readonly BadgeDigitTemplateEntry[];
/** One badge's digit read. `badgeCount` is N, the badges S1 found on the image: a read above it is reported. */
export declare function classifyBadgeDigits(image: RgbaBitmap, badge: Pick<BadgeEvidence, 'bbox'>, viewportTopPx?: number, badgeCount?: number | null, knobs?: BadgeDigitTemplateKnobs): BadgeDigitClassification;
