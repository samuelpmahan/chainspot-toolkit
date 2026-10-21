/**
 * G1 badgeCoverageTemplate: the coverage whole-glyph reader
 * (digits/badgeCoverageTemplateMath.ts), a second reader beside the binary
 * template reader (g1.badgeGlyphTemplate.ts). Not an engine unit and in no
 * execution list: it changes nothing in a run until it is judged. It is
 * offered as a pure function over one badge and the raster it was detected
 * in, on the same crop geometry as classifyBadgeAgainstTemplates, so the two
 * readers can be compared badge by badge.
 */

import templateAssetData from '../assets/badge-coverage-templates.json';
import type { BadgeEvidence } from '../types';
import type { RgbaBitmap } from '../digits/badgeGlyphTemplateMath';
import {
	classifyBadgeCoverageAgainstTemplates,
	decodeCoverageRows,
	DEFAULT_BADGE_COVERAGE_TEMPLATE_KNOBS,
	type BadgeCoverageClassification,
	type BadgeCoverageTemplateEntry,
	type BadgeCoverageTemplateKnobs
} from '../digits/badgeCoverageTemplateMath';
import { HOLE_LABELS } from '../digits/holeLabels';

interface BadgeCoverageTemplateAsset {
	readonly schema: string;
	readonly normalizedWidthPx: number;
	readonly normalizedHeightPx: number;
	readonly templates: readonly { readonly label: number; readonly rows: readonly string[] }[];
}

const ASSET = templateAssetData as BadgeCoverageTemplateAsset;

if (
	ASSET.normalizedWidthPx !== DEFAULT_BADGE_COVERAGE_TEMPLATE_KNOBS.normalizedWidthPx ||
	ASSET.normalizedHeightPx !== DEFAULT_BADGE_COVERAGE_TEMPLATE_KNOBS.normalizedHeightPx
) {
	throw new Error(
		'g1.badgeCoverageTemplate: assets/badge-coverage-templates.json canvas differs from the reader knobs; ' +
			're-bake with scripts/generate-badge-glyph-templates.mjs.'
	);
}
{
	const baked = ASSET.templates.map((template) => template.label).sort((a, b) => a - b);
	if (baked.length !== HOLE_LABELS.length || baked.some((label, index) => label !== HOLE_LABELS[index])) {
		throw new Error(
			`g1.badgeCoverageTemplate: assets/badge-coverage-templates.json carries labels ${baked.join(',')}, ` +
				`expected exactly 1..${HOLE_LABELS.length} (digits/holeLabels.ts).`
		);
	}
}

export const BADGE_COVERAGE_TEMPLATES: readonly BadgeCoverageTemplateEntry[] = ASSET.templates
	.map((template) => ({
		label: template.label,
		coverage: decodeCoverageRows(template.rows, ASSET.normalizedWidthPx, ASSET.normalizedHeightPx)
	}))
	.sort((a, b) => a.label - b.label);

/** One badge's coverage read: same crop as the binary reader (bbox in original-image px, shifted into localImage). */
export function classifyBadgeCoverage(
	image: RgbaBitmap,
	badge: Pick<BadgeEvidence, 'bbox'>,
	viewportTopPx = 0,
	knobs: BadgeCoverageTemplateKnobs = DEFAULT_BADGE_COVERAGE_TEMPLATE_KNOBS
): BadgeCoverageClassification {
	const [x, y, w, h] = badge.bbox;
	return classifyBadgeCoverageAgainstTemplates(
		image,
		{ xPx: x + w / 2, yPx: y + h / 2 - viewportTopPx, widthPx: w, heightPx: h },
		BADGE_COVERAGE_TEMPLATES,
		knobs
	);
}
