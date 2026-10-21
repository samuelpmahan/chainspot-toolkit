"use strict";
/**
 * G1 badgeCrosscheck (Sam, 2026-10-21: "Yes, make readers crosscheck"). Over every badge S1 found:
 *  - the per-digit reader (measure.ts) still sets the label;
 *  - the coverage DIGIT reader checks it: the same label is 'confirmed'; another label is 'disagree', recorded with
 *    both reads and both P, and the per-digit label is kept (nothing changes silently);
 *  - where the per-digit reader has no label (it abstained, or read outside the vocabulary) and the coverage digit
 *    reader reads with P >= READER_P_STAR, its read is used and marked 'filled', unless another badge already holds that
 *    label; otherwise the badge stays 'unread';
 *  - the B+W digit reader and the whole-number coverage reader are witnesses, recorded with their reads and P; they
 *    never decide.
 * P is the learned confidence (badgeReaderCalibration.ts). Pure; the toolkit's Calculation fn.Badge.crosscheck calls it.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.crosscheckBadges = crosscheckBadges;
const holeLabels_1 = require("../digits/holeLabels");
const badgeDigitTemplateMath_1 = require("../digits/badgeDigitTemplateMath");
const badgeReaderCalibration_1 = require("../digits/badgeReaderCalibration");
const g1_badgeCoverageDigit_1 = require("./g1.badgeCoverageDigit");
const g1_badgeCoverageTemplate_1 = require("./g1.badgeCoverageTemplate");
const g1_badgeDigitTemplate_1 = require("./g1.badgeDigitTemplate");
const round4 = (v) => Math.round(v * 1e4) / 1e4;
/** The best label of the vocabulary from a digit score table, and its P. */
function digitTableRead(reader, table) {
    const joint = (L) => {
        const ds = [...String(L)].map(Number), cells = ds.length === 1 ? table.one : table.two;
        return cells && cells.length === ds.length ? ds.reduce((a, d, i) => a + cells[i][d], 0) / ds.length : -Infinity;
    };
    const label = holeLabels_1.HOLE_LABELS.reduce((a, L) => (joint(L) > joint(a) ? L : a), holeLabels_1.HOLE_LABELS[0]);
    if (!Number.isFinite(joint(label)))
        return { label: null, p: null };
    return { label, p: round4((0, badgeReaderCalibration_1.readerProbability)(reader, (0, badgeReaderCalibration_1.digitLabelFeatures)(table, label))) };
}
function crosscheckBadges(image, badges, viewportTopPx = 0) {
    const rows = badges.map((badge) => {
        const [x, y, w, h] = badge.bbox;
        const body = { xPx: x + w / 2, yPx: y + h / 2 - viewportTopPx, widthPx: w, heightPx: h };
        const perDigitLabel = badge.label == null ? null : Number(badge.label);
        const digitScores = (badge.digits ?? []).map((d) => d.scores);
        const perDigit = {
            label: perDigitLabel,
            p: perDigitLabel == null ? null : round4((0, badgeReaderCalibration_1.readerProbability)('perDigit', (0, badgeReaderCalibration_1.perDigitLabelFeatures)(digitScores, perDigitLabel, holeLabels_1.HOLE_LABELS))),
            abstention: badge.abstentionReason ?? null
        };
        const coverageDigit = digitTableRead('coverageDigit', (0, g1_badgeCoverageDigit_1.classifyBadgeCoverageDigits)(image, badge, viewportTopPx).table);
        const digitBW = digitTableRead('digitBW', (0, badgeDigitTemplateMath_1.badgeDigitScoreTable)(image, body, g1_badgeDigitTemplate_1.BADGE_DIGIT_TEMPLATES));
        const cov = (0, g1_badgeCoverageTemplate_1.classifyBadgeCoverage)(image, badge, viewportTopPx);
        const coverage = cov.bestLabel == null ? { label: null, p: null } : { label: cov.bestLabel, p: round4((0, badgeReaderCalibration_1.readerProbability)('coverage', [cov.bestScore, cov.ambiguityMargin])) };
        return { badge, perDigit, coverageDigit, witnesses: { digitBW, coverage } };
    });
    const held = new Set(rows.map((r) => r.perDigit.label).filter((l) => l != null));
    return rows.map(({ badge, perDigit, coverageDigit, witnesses }) => {
        let verdict, label = perDigit.label, note = null;
        if (perDigit.label != null)
            verdict = coverageDigit.label === perDigit.label ? 'confirmed' : 'disagree';
        else if (coverageDigit.label != null && coverageDigit.p != null && coverageDigit.p >= badgeReaderCalibration_1.READER_P_STAR) {
            if (held.has(coverageDigit.label)) {
                verdict = 'unread';
                note = `coverage digit read ${coverageDigit.label} is held by another badge`;
            }
            else {
                verdict = 'filled';
                label = coverageDigit.label;
                held.add(label);
            }
        }
        else
            verdict = 'unread';
        if (verdict === 'disagree')
            note = `per-digit ${perDigit.label} (P ${perDigit.p}) vs coverage digit ${coverageDigit.label} (P ${coverageDigit.p}); the per-digit label is kept`;
        return { detId: badge.detId, bbox: badge.bbox, label, verdict, note, perDigit, coverageDigit, witnesses };
    });
}
//# sourceMappingURL=g1.badgeCrosscheck.js.map