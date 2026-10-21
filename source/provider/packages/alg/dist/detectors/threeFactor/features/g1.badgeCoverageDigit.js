"use strict";
/**
 * G1 badgeCoverageDigit: the coverage DIGIT reader (digits/badgeCoverageDigitMath.ts) with its vendored templates.
 * Not an engine unit and in no execution list: a pure function over one badge, beside the other readers.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BADGE_COVERAGE_DIGIT_TEMPLATES = void 0;
exports.classifyBadgeCoverageDigits = classifyBadgeCoverageDigits;
const badge_coverage_digit_templates_json_1 = __importDefault(require("../assets/badge-coverage-digit-templates.json"));
const badgeCoverageTemplateMath_1 = require("../digits/badgeCoverageTemplateMath");
const badgeCoverageDigitMath_1 = require("../digits/badgeCoverageDigitMath");
const ASSET = badge_coverage_digit_templates_json_1.default;
{
    const digits = new Set(ASSET.templates.map((t) => t.digit));
    for (let d = 0; d <= 9; d++)
        if (!digits.has(d))
            throw new Error(`g1.badgeCoverageDigit: no template for digit ${d}.`);
}
exports.BADGE_COVERAGE_DIGIT_TEMPLATES = ASSET.templates.map((t) => ({
    digit: t.digit,
    from: t.from,
    coverage: (0, badgeCoverageTemplateMath_1.decodeCoverageRows)(t.rows, ASSET.digitWidthPx, ASSET.digitHeightPx)
}));
/** One badge: its per-cell digit NCC table and its read. */
function classifyBadgeCoverageDigits(image, badge, viewportTopPx = 0) {
    const [x, y, w, h] = badge.bbox;
    const table = (0, badgeCoverageDigitMath_1.badgeCoverageDigitScoreTable)(image, { xPx: x + w / 2, yPx: y + h / 2 - viewportTopPx, widthPx: w, heightPx: h }, exports.BADGE_COVERAGE_DIGIT_TEMPLATES);
    return { table, number: (0, badgeCoverageDigitMath_1.readCoverageDigits)(table) };
}
//# sourceMappingURL=g1.badgeCoverageDigit.js.map