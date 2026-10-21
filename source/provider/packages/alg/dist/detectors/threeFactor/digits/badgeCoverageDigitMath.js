"use strict";
/**
 * Coverage DIGIT reader (Sam, 2026-10-21: "You could do anti-aliasing digit by digit as well and improve"): the B+W
 * digit reader's cells (badgeDigitCells: one cell, or two split at the gap measured on this badge) applied to the
 * badge's coverage instead of its binary mask, each cell matched against coverage digit templates by NCC.
 *
 *  - The cells come from the B+W reader's own binarized grid (its LOCAL midway threshold), so both digit readers split
 *    a badge the same way.
 *  - The values are coverage = (lum - plate) / (glyph - plate), clamped, with the coverage reader's LOCAL levels
 *    (coverageLevels), sampled bilinearly on the same grid.
 *  - A cell's tight box is its half-coverage extent widened by one sample for the fringe; it is scaled by the badge's
 *    full ink height (as the B+W reader does) onto the 16 x 24 digit canvas and area-resampled, so the fringe is kept.
 *  - Scores are zero-mean NCC (badgeCoverageTemplateMath bestCoverageScore), best over +/- maxShiftPx.
 * It returns every cell's best NCC per digit (the table the learned confidence reads) and the read: per cell its best
 * digit, in the layout with the better mean. Confidence is the learned P (badgeReaderCalibration.ts), not a gate.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.badgeCoverageDigitCells = badgeCoverageDigitCells;
exports.badgeCoverageDigitScoreTable = badgeCoverageDigitScoreTable;
exports.readCoverageDigits = readCoverageDigits;
const badgeCoverageTemplateMath_1 = require("./badgeCoverageTemplateMath");
const badgeDigitTemplateMath_1 = require("./badgeDigitTemplateMath");
const SUPERSAMPLE = 4;
function lumAt(image, x, y) {
    const cx = Math.max(0, Math.min(image.width - 1, x));
    const cy = Math.max(0, Math.min(image.height - 1, y));
    const o = (cy * image.width + cx) * 4;
    return (image.data[o] + image.data[o + 1] + image.data[o + 2]) / 3;
}
/** Coverage on the digit readers' sampling grid (same inset), bilinear. */
function coverageGrid(image, badge) {
    const { widthPx: SW, heightPx: SH, marginX, marginY } = badgeDigitTemplateMath_1.BADGE_DIGIT_SAMPLE;
    const lv = (0, badgeCoverageTemplateMath_1.coverageLevels)(image, badge), span = Math.max(1, lv.glyphLum - lv.plateLum);
    const left = badge.xPx - badge.widthPx / 2, top = badge.yPx - badge.heightPx / 2;
    const g = new Float64Array(SW * SH);
    for (let y = 0; y < SH; y++) {
        const v = (y + 0.5) / SH;
        if (v < marginY || v > 1 - marginY)
            continue;
        for (let x = 0; x < SW; x++) {
            const u = (x + 0.5) / SW;
            if (u < marginX || u > 1 - marginX)
                continue;
            const fx = left + u * badge.widthPx - 0.5, fy = top + v * badge.heightPx - 0.5;
            const x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
            const lum = (1 - ay) * ((1 - ax) * lumAt(image, x0, y0) + ax * lumAt(image, x0 + 1, y0)) + ay * ((1 - ax) * lumAt(image, x0, y0 + 1) + ax * lumAt(image, x0 + 1, y0 + 1));
            g[y * SW + x] = Math.max(0, Math.min(1, (lum - lv.plateLum) / span));
        }
    }
    return g;
}
function cellCoverage(g, x0, x1, inkHeight) {
    const { widthPx: SW, heightPx: SH } = badgeDigitTemplateMath_1.BADGE_DIGIT_SAMPLE;
    const W = badgeDigitTemplateMath_1.DEFAULT_BADGE_DIGIT_TEMPLATE_KNOBS.digitWidthPx, H = badgeDigitTemplateMath_1.DEFAULT_BADGE_DIGIT_TEMPLATE_KNOBS.digitHeightPx;
    let minX = Infinity, maxX = -1, minY = Infinity, maxY = -1;
    for (let y = 0; y < SH; y++)
        for (let x = x0; x <= x1; x++)
            if (g[y * SW + x] >= 0.5) {
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
            }
    if (maxX < 0)
        return null;
    minX = Math.max(x0, minX - 1);
    maxX = Math.min(x1, maxX + 1);
    minY = Math.max(0, minY - 1);
    maxY = Math.min(SH - 1, maxY + 1);
    const w = maxX - minX + 1, h = maxY - minY + 1;
    const scale = Math.min((H - 2) / (inkHeight + 2), (W - 2) / w);
    const dw = Math.max(1, Math.round(w * scale)), dh = Math.max(1, Math.round(h * scale));
    const ox = Math.floor((W - dw) / 2), oy = Math.floor((H - dh) / 2);
    const data = new Float64Array(W * H);
    const at = (x, y) => g[y * SW + x];
    for (let y = 0; y < dh; y++)
        for (let x = 0; x < dw; x++) {
            let sum = 0;
            for (let sy = 0; sy < SUPERSAMPLE; sy++)
                for (let sx = 0; sx < SUPERSAMPLE; sx++) {
                    const gx = minX + ((x + (sx + 0.5) / SUPERSAMPLE) * w) / dw - 0.5, gy = minY + ((y + (sy + 0.5) / SUPERSAMPLE) * h) / dh - 0.5;
                    const xa = Math.max(minX, Math.min(maxX, Math.floor(gx))), ya = Math.max(minY, Math.min(maxY, Math.floor(gy)));
                    const xb = Math.min(maxX, xa + 1), yb = Math.min(maxY, ya + 1), ax = Math.max(0, Math.min(1, gx - xa)), ay = Math.max(0, Math.min(1, gy - ya));
                    sum += (1 - ay) * ((1 - ax) * at(xa, ya) + ax * at(xb, ya)) + ay * ((1 - ax) * at(xa, yb) + ax * at(xb, yb));
                }
            data[(oy + y) * W + ox + x] = sum / (SUPERSAMPLE * SUPERSAMPLE);
        }
    return { widthPx: W, heightPx: H, data };
}
/** The coverage digit cells of a badge: one-cell and two-cell layouts (null when the glyph does not form them). */
function badgeCoverageDigitCells(image, badge) {
    const cells = (0, badgeDigitTemplateMath_1.badgeDigitCells)((0, badgeDigitTemplateMath_1.sampleBadgeDigits)(image, badge));
    if (!cells)
        return { one: null, two: null };
    const g = coverageGrid(image, badge);
    const one = cellCoverage(g, cells.one[0], cells.one[1], cells.inkHeight);
    const two = cells.two ? cells.two.map(([a, b]) => cellCoverage(g, a, b, cells.inkHeight)) : null;
    return { one: one ? [one] : null, two: two && two.every(Boolean) ? two : null };
}
/** Best NCC per digit 0..9 in every cell of both layouts. */
function badgeCoverageDigitScoreTable(image, badge, templates, maxShiftPx = badgeDigitTemplateMath_1.DEFAULT_BADGE_DIGIT_TEMPLATE_KNOBS.maxShiftPx) {
    const cells = badgeCoverageDigitCells(image, badge);
    const score = (cell) => {
        const s = new Array(10).fill(-1);
        for (const t of templates)
            s[t.digit] = Math.max(s[t.digit], (0, badgeCoverageTemplateMath_1.bestCoverageScore)(cell, t.coverage, maxShiftPx));
        return s;
    };
    return { one: cells.one ? cells.one.map(score) : null, two: cells.two ? cells.two.map(score) : null };
}
/** The read: each cell's best digit, in the layout whose mean best NCC is higher (null without glyph). */
function readCoverageDigits(table) {
    const mean = (cells) => (cells ? cells.reduce((a, c) => a + Math.max(...c), 0) / cells.length : -Infinity);
    const cells = mean(table.two) > mean(table.one) ? table.two : table.one;
    return cells ? cells.map((c) => String(c.indexOf(Math.max(...c)))).join('') : null;
}
//# sourceMappingURL=badgeCoverageDigitMath.js.map