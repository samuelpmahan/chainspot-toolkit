/**
 * G1 badgeCoverageDigit: the coverage DIGIT reader (digits/badgeCoverageDigitMath.ts) with its vendored templates.
 * Not an engine unit and in no execution list: a pure function over one badge, beside the other readers.
 */

import templateAssetData from '../assets/badge-coverage-digit-templates.json';
import type { BadgeEvidence } from '../types';
import type { RgbaBitmap } from '../digits/badgeGlyphTemplateMath';
import { decodeCoverageRows } from '../digits/badgeCoverageTemplateMath';
import { badgeCoverageDigitScoreTable, readCoverageDigits, type CoverageDigitTemplateEntry } from '../digits/badgeCoverageDigitMath';

interface CoverageDigitAsset {
	readonly digitWidthPx: number;
	readonly digitHeightPx: number;
	readonly templates: readonly { readonly digit: number; readonly from: string; readonly rows: readonly string[] }[];
}

const ASSET = templateAssetData as CoverageDigitAsset;
{
	const digits = new Set(ASSET.templates.map((t) => t.digit));
	for (let d = 0; d <= 9; d++) if (!digits.has(d)) throw new Error(`g1.badgeCoverageDigit: no template for digit ${d}.`);
}

export const BADGE_COVERAGE_DIGIT_TEMPLATES: readonly CoverageDigitTemplateEntry[] = ASSET.templates.map((t) => ({
	digit: t.digit,
	from: t.from,
	coverage: decodeCoverageRows(t.rows, ASSET.digitWidthPx, ASSET.digitHeightPx)
}));

/** One badge: its per-cell digit NCC table and its read. */
export function classifyBadgeCoverageDigits(image: RgbaBitmap, badge: Pick<BadgeEvidence, 'bbox'>, viewportTopPx = 0) {
	const [x, y, w, h] = badge.bbox;
	const table = badgeCoverageDigitScoreTable(image, { xPx: x + w / 2, yPx: y + h / 2 - viewportTopPx, widthPx: w, heightPx: h }, BADGE_COVERAGE_DIGIT_TEMPLATES);
	return { table, number: readCoverageDigits(table) };
}
