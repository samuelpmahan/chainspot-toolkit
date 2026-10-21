/**
 * G1 badgeCoverageTemplate: the coverage whole-glyph reader
 * (digits/badgeCoverageTemplateMath.ts), a second reader beside the binary
 * template reader (g1.badgeGlyphTemplate.ts). Not an engine unit and in no
 * execution list: it changes nothing in a run until it is judged. It is
 * offered as a pure function over one badge and the raster it was detected
 * in, on the same crop geometry as classifyBadgeAgainstTemplates, so the two
 * readers can be compared badge by badge.
 */
import type { BadgeEvidence } from '../types';
import type { RgbaBitmap } from '../digits/badgeGlyphTemplateMath';
import { type BadgeCoverageClassification, type BadgeCoverageTemplateEntry, type BadgeCoverageTemplateKnobs } from '../digits/badgeCoverageTemplateMath';
export declare const BADGE_COVERAGE_TEMPLATES: readonly BadgeCoverageTemplateEntry[];
/** One badge's coverage read: same crop as the binary reader (bbox in original-image px, shifted into localImage). */
export declare function classifyBadgeCoverage(image: RgbaBitmap, badge: Pick<BadgeEvidence, 'bbox'>, viewportTopPx?: number, knobs?: BadgeCoverageTemplateKnobs): BadgeCoverageClassification;
