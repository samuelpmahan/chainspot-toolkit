"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DIGIT_CLASSES = void 0;
exports.readBadge = readBadge;
exports.readCourseBadges = readCourseBadges;
const badgeGlyph_1 = require("./badgeGlyph");
const segment_1 = require("./segment");
const normalize_1 = require("./normalize");
exports.DIGIT_CLASSES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
function readBadge(badge, result, scorer) {
    const glyph = (0, badgeGlyph_1.extractBadgeGlyph)(badge, result.brightMask, result.darkMask, result.brightLabels);
    const segmented = glyph.mask.width > 0 ? (0, segment_1.segmentDigits)(glyph.mask) : { digits: [], notes: [] };
    const digits = [];
    for (const candidate of segmented.digits) {
        const normalized = (0, normalize_1.normalizeDigitMask)(candidate.mask, candidate.bbox[2], candidate.bbox[3]);
        const scores = scorer.scores(normalized);
        let win = 0;
        let second = -1;
        for (let i = 1; i < scores.length; i++) {
            if (scores[i] > scores[win]) {
                second = win;
                win = i;
            }
            else if (second < 0 || scores[i] > scores[second]) {
                second = i;
            }
        }
        digits.push({
            candidate,
            normalized,
            scores,
            predicted: exports.DIGIT_CLASSES[win],
            runnerUp: second >= 0 ? exports.DIGIT_CLASSES[second] : exports.DIGIT_CLASSES[win],
            margin: second >= 0 ? scores[win] - scores[second] : 0
        });
    }
    return {
        badge,
        glyph,
        digits,
        label: digits.map((d) => d.predicted).join(''),
        confidence: digits.length ? Math.min(...digits.map((d) => d.margin)) : Infinity
    };
}
/** Read every badge-family observation of a P1 (or badge-stage) result. */
function readCourseBadges(result, scorer) {
    return result.badges.map((badge) => readBadge(badge, result, scorer));
}
//# sourceMappingURL=readBadges.js.map