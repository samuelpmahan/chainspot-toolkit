"use strict";
/**
 * G1 badgeDigitTemplate: the black-and-white DIGIT reader
 * (digits/badgeDigitTemplateMath.ts), beside the binary whole-number reader
 * and the coverage reader. Not an engine unit and in no execution list: it
 * changes nothing in a run until it is judged. Offered as a pure function over
 * one badge on the same crop geometry as the other two readers.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BADGE_DIGIT_TEMPLATES = void 0;
exports.classifyBadgeDigits = classifyBadgeDigits;
const badge_digit_templates_json_1 = __importDefault(require("../assets/badge-digit-templates.json"));
const badgeDigitTemplateMath_1 = require("../digits/badgeDigitTemplateMath");
const ASSET = badge_digit_templates_json_1.default;
if (ASSET.digitWidthPx !== badgeDigitTemplateMath_1.DEFAULT_BADGE_DIGIT_TEMPLATE_KNOBS.digitWidthPx ||
    ASSET.digitHeightPx !== badgeDigitTemplateMath_1.DEFAULT_BADGE_DIGIT_TEMPLATE_KNOBS.digitHeightPx) {
    throw new Error('g1.badgeDigitTemplate: assets/badge-digit-templates.json canvas differs from the reader knobs; ' +
        're-bake with scripts/generate-badge-glyph-templates.mjs.');
}
{
    const digits = new Set(ASSET.templates.map((t) => t.digit));
    for (let d = 0; d <= 9; d++)
        if (!digits.has(d))
            throw new Error(`g1.badgeDigitTemplate: assets/badge-digit-templates.json has no template for digit ${d}.`);
}
exports.BADGE_DIGIT_TEMPLATES = ASSET.templates.map((t) => ({
    digit: t.digit,
    from: t.from,
    mask: (0, badgeDigitTemplateMath_1.decodeDigitRows)(t.rows, ASSET.digitWidthPx, ASSET.digitHeightPx)
}));
/** One badge's digit read. `badgeCount` is N, the badges S1 found on the image: a read above it is reported. */
function classifyBadgeDigits(image, badge, viewportTopPx = 0, badgeCount = null, knobs = badgeDigitTemplateMath_1.DEFAULT_BADGE_DIGIT_TEMPLATE_KNOBS) {
    const [x, y, w, h] = badge.bbox;
    return (0, badgeDigitTemplateMath_1.classifyBadgeDigitsAgainstTemplates)(image, { xPx: x + w / 2, yPx: y + h / 2 - viewportTopPx, widthPx: w, heightPx: h }, exports.BADGE_DIGIT_TEMPLATES, badgeCount, knobs);
}
//# sourceMappingURL=g1.badgeDigitTemplate.js.map