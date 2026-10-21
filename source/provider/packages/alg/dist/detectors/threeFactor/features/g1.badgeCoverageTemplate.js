"use strict";
/**
 * G1 badgeCoverageTemplate: the coverage whole-glyph reader
 * (digits/badgeCoverageTemplateMath.ts), a second reader beside the binary
 * template reader (g1.badgeGlyphTemplate.ts). Not an engine unit and in no
 * execution list: it changes nothing in a run until it is judged. It is
 * offered as a pure function over one badge and the raster it was detected
 * in, on the same crop geometry as classifyBadgeAgainstTemplates, so the two
 * readers can be compared badge by badge.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BADGE_COVERAGE_TEMPLATES = void 0;
exports.classifyBadgeCoverage = classifyBadgeCoverage;
const badge_coverage_templates_json_1 = __importDefault(require("../assets/badge-coverage-templates.json"));
const badgeCoverageTemplateMath_1 = require("../digits/badgeCoverageTemplateMath");
const holeLabels_1 = require("../digits/holeLabels");
const ASSET = badge_coverage_templates_json_1.default;
if (ASSET.normalizedWidthPx !== badgeCoverageTemplateMath_1.DEFAULT_BADGE_COVERAGE_TEMPLATE_KNOBS.normalizedWidthPx ||
    ASSET.normalizedHeightPx !== badgeCoverageTemplateMath_1.DEFAULT_BADGE_COVERAGE_TEMPLATE_KNOBS.normalizedHeightPx) {
    throw new Error('g1.badgeCoverageTemplate: assets/badge-coverage-templates.json canvas differs from the reader knobs; ' +
        're-bake with scripts/generate-badge-glyph-templates.mjs.');
}
{
    const baked = ASSET.templates.map((template) => template.label).sort((a, b) => a - b);
    if (baked.length !== holeLabels_1.HOLE_LABELS.length || baked.some((label, index) => label !== holeLabels_1.HOLE_LABELS[index])) {
        throw new Error(`g1.badgeCoverageTemplate: assets/badge-coverage-templates.json carries labels ${baked.join(',')}, ` +
            `expected exactly 1..${holeLabels_1.HOLE_LABELS.length} (digits/holeLabels.ts).`);
    }
}
exports.BADGE_COVERAGE_TEMPLATES = ASSET.templates
    .map((template) => ({
    label: template.label,
    coverage: (0, badgeCoverageTemplateMath_1.decodeCoverageRows)(template.rows, ASSET.normalizedWidthPx, ASSET.normalizedHeightPx)
}))
    .sort((a, b) => a.label - b.label);
/** One badge's coverage read: same crop as the binary reader (bbox in original-image px, shifted into localImage). */
function classifyBadgeCoverage(image, badge, viewportTopPx = 0, knobs = badgeCoverageTemplateMath_1.DEFAULT_BADGE_COVERAGE_TEMPLATE_KNOBS) {
    const [x, y, w, h] = badge.bbox;
    return (0, badgeCoverageTemplateMath_1.classifyBadgeCoverageAgainstTemplates)(image, { xPx: x + w / 2, yPx: y + h / 2 - viewportTopPx, widthPx: w, heightPx: h }, exports.BADGE_COVERAGE_TEMPLATES, knobs);
}
//# sourceMappingURL=g1.badgeCoverageTemplate.js.map