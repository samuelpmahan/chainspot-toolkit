"use strict";
/**
 * Fast badge-only localization stage (experimental speed path).
 *
 * Runs exactly P1's mask -> components -> badge-family stages and stops:
 * the projected-border tee scoring (the dominant P1 cost) is skipped
 * because middle-out ribbon endpoint discovery (./ribbon.ts) replaces the
 * tee template ranking in the P1.5 pipeline. Badge semantics are identical
 * to runNuThingP1 — same masks, same components, same anchored family.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectBadgeFamily = detectBadgeFamily;
exports.runBadgeStage = runBadgeStage;
const raster_1 = require("./raster");
const components_1 = require("./components");
const families_1 = require("./families");
// Copied from LAB's P1 constants. Keeping them here avoids importing the
// slower projected-border tee scorer that the quick endpoint pass does not use.
const BADGE_ASPECT_MIN = 1.15;
const BADGE_ASPECT_MAX = 1.8;
const BADGE_DARK_INTERIOR_MIN = 0.45;
const BADGE_SIZE_TOL = Math.log(1.15);
/** Existing badge-family decision over already materialized mask/component evidence. */
function detectBadgeFamily(width, dark, brightComponents) {
    const badgeCandidates = [];
    for (const c of brightComponents) {
        if (c.bboxH <= 0)
            continue;
        const aspect = c.bboxW / c.bboxH;
        if (aspect < BADGE_ASPECT_MIN || aspect > BADGE_ASPECT_MAX)
            continue;
        let darkCount = 0;
        for (let y = c.bboxY; y < c.bboxY + c.bboxH; y++) {
            const row = y * width;
            for (let x = c.bboxX; x < c.bboxX + c.bboxW; x++) {
                if (dark.data[row + x])
                    darkCount++;
            }
        }
        if (darkCount / (c.bboxW * c.bboxH) >= BADGE_DARK_INTERIOR_MIN)
            badgeCandidates.push(c);
    }
    const families = (0, families_1.anchoredFamilies)(badgeCandidates, BADGE_SIZE_TOL, families_1.bboxSizeDistance);
    return families.length > 0 ? families[0] : [];
}
function runBadgeStage(image) {
    const { width, height } = image;
    const { bright, dark } = (0, raster_1.computeBrightDarkMasks)(image);
    const { labels: brightLabels, components: brightComponents } = (0, components_1.extractComponents)(bright);
    const badges = detectBadgeFamily(width, dark, brightComponents);
    return {
        width,
        height,
        brightMask: bright,
        darkMask: dark,
        brightLabels,
        brightComponents,
        badges,
        badgeCount: badges.length
    };
}
//# sourceMappingURL=badgeStage.js.map