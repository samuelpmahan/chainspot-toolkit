/**
 * G1 badgeDigitTemplate: the black-and-white DIGIT reader
 * (digits/badgeDigitTemplateMath.ts), beside the binary whole-number reader
 * and the coverage reader. Not an engine unit and in no execution list: it
 * changes nothing in a run until it is judged. Offered as a pure function over
 * one badge on the same crop geometry as the other two readers.
 */

import templateAssetData from '../assets/badge-digit-templates.json';
import type { BadgeEvidence } from '../types';
import type { RgbaBitmap } from '../digits/badgeGlyphTemplateMath';
import {
	classifyBadgeDigitsAgainstTemplates,
	decodeDigitRows,
	DEFAULT_BADGE_DIGIT_TEMPLATE_KNOBS,
	type BadgeDigitClassification,
	type BadgeDigitTemplateEntry,
	type BadgeDigitTemplateKnobs
} from '../digits/badgeDigitTemplateMath';

interface BadgeDigitTemplateAsset {
	readonly schema: string;
	readonly digitWidthPx: number;
	readonly digitHeightPx: number;
	readonly templates: readonly { readonly digit: number; readonly from: string; readonly rows: readonly string[] }[];
}

const ASSET = templateAssetData as BadgeDigitTemplateAsset;

if (
	ASSET.digitWidthPx !== DEFAULT_BADGE_DIGIT_TEMPLATE_KNOBS.digitWidthPx ||
	ASSET.digitHeightPx !== DEFAULT_BADGE_DIGIT_TEMPLATE_KNOBS.digitHeightPx
) {
	throw new Error(
		'g1.badgeDigitTemplate: assets/badge-digit-templates.json canvas differs from the reader knobs; ' +
			're-bake with scripts/generate-badge-glyph-templates.mjs.'
	);
}
{
	const digits = new Set(ASSET.templates.map((t) => t.digit));
	for (let d = 0; d <= 9; d++)
		if (!digits.has(d)) throw new Error(`g1.badgeDigitTemplate: assets/badge-digit-templates.json has no template for digit ${d}.`);
}

export const BADGE_DIGIT_TEMPLATES: readonly BadgeDigitTemplateEntry[] = ASSET.templates.map((t) => ({
	digit: t.digit,
	from: t.from,
	mask: decodeDigitRows(t.rows, ASSET.digitWidthPx, ASSET.digitHeightPx)
}));

/** One badge's digit read. `badgeCount` is N, the badges S1 found on the image: a read above it is reported. */
export function classifyBadgeDigits(
	image: RgbaBitmap,
	badge: Pick<BadgeEvidence, 'bbox'>,
	viewportTopPx = 0,
	badgeCount: number | null = null,
	knobs: BadgeDigitTemplateKnobs = DEFAULT_BADGE_DIGIT_TEMPLATE_KNOBS
): BadgeDigitClassification {
	const [x, y, w, h] = badge.bbox;
	return classifyBadgeDigitsAgainstTemplates(
		image,
		{ xPx: x + w / 2, yPx: y + h / 2 - viewportTopPx, widthPx: w, heightPx: h },
		BADGE_DIGIT_TEMPLATES,
		badgeCount,
		knobs
	);
}
