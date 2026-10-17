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
exports.DEFAULT_BADGE_STAGE_KNOBS = void 0;
exports.detectBadgeFamily = detectBadgeFamily;
exports.recoverDarkPlateBadges = recoverDarkPlateBadges;
exports.runBadgeStage = runBadgeStage;
const raster_1 = require("./raster");
const components_1 = require("./components");
const families_1 = require("./families");
exports.DEFAULT_BADGE_STAGE_KNOBS = {
    badgeAspectMin: 1.15,
    badgeAspectMax: 1.8,
    badgeDarkInteriorMin: 0.45,
    badgeSizeTolFactor: 1.15,
    plateMinWidth: 34,
    plateMaxWidth: 78,
    plateMinHeight: 24,
    plateMaxHeight: 54,
    plateAspectMin: 1,
    plateAspectMax: 2.4,
    plateFillMin: 0.55,
    plateInteriorMargin: 4,
    plateGlyphFractionMin: 0.04,
    plateGlyphFractionMax: 0.4,
    plateProximityThreshold: 22,
    plateBboxMargin: 4,
    badgeInsidePadding: 3,
    // C1 (docs/seven-whys/g1-badge-digit-garbage.md): raster-cell allowance for
    // "a bright component reaches all 4 edges of the measured plate interior"
    // -- a digit glyph never spans the full interior on every axis, only the
    // plate's own printed rim does. Raster geometry, not a size threshold
    // (footgun law): 2px covers anti-aliasing without ever letting a genuine
    // digit (inset 3-4px per the forensic table) qualify as the frame.
    plateFrameTolerancePx: 2
};
/** Existing badge-family decision over already materialized mask/component evidence. */
function detectBadgeFamily(width, dark, brightComponents, knobs = exports.DEFAULT_BADGE_STAGE_KNOBS) {
    const badgeCandidates = [];
    for (const c of brightComponents) {
        if (c.bboxH <= 0)
            continue;
        const aspect = c.bboxW / c.bboxH;
        if (aspect < knobs.badgeAspectMin || aspect > knobs.badgeAspectMax)
            continue;
        let darkCount = 0;
        for (let y = c.bboxY; y < c.bboxY + c.bboxH; y++) {
            const row = y * width;
            for (let x = c.bboxX; x < c.bboxX + c.bboxW; x++) {
                if (dark.data[row + x])
                    darkCount++;
            }
        }
        if (darkCount / (c.bboxW * c.bboxH) >= knobs.badgeDarkInteriorMin)
            badgeCandidates.push(c);
    }
    const families = (0, families_1.anchoredFamilies)(badgeCandidates, Math.log(knobs.badgeSizeTolFactor), families_1.bboxSizeDistance);
    return families.length > 0 ? families[0] : [];
}
/**
 * Dark-plate badge recovery: scans dark-mask components for plausible
 * hole-number plates that the bright-family pass missed, and appends any
 * that pass, mutating `badges`/`badgeSources`/`plateBboxes` in place.
 * Extracted from runBadgeStage's tail (moved verbatim, not rewritten) so
 * the exec layer's badgeStage.badges operation (packages/alg/src/exec/
 * operations.ts) can call the exact same recovery pass without duplicating
 * its logic — runBadgeStage below is now a thin composition of this
 * function plus the earlier mask/component/family steps.
 */
function recoverDarkPlateBadges(width, bright, dark, badges, badgeSources, plateBboxes, knobs = exports.DEFAULT_BADGE_STAGE_KNOBS, darkComponentsInput) {
    const darkComponents = darkComponentsInput ?? (0, components_1.extractComponents)(dark).components;
    for (const component of darkComponents) {
        if (component.bboxW < knobs.plateMinWidth ||
            component.bboxW > knobs.plateMaxWidth ||
            component.bboxH < knobs.plateMinHeight ||
            component.bboxH > knobs.plateMaxHeight)
            continue;
        const aspect = component.bboxW / component.bboxH;
        if (aspect < knobs.plateAspectMin || aspect > knobs.plateAspectMax)
            continue;
        if (component.area / (component.bboxW * component.bboxH) < knobs.plateFillMin)
            continue;
        let glyphCount = 0;
        let interior = 0;
        for (let y = component.bboxY + knobs.plateInteriorMargin; y < component.bboxY + component.bboxH - knobs.plateInteriorMargin; y++) {
            const row = y * width;
            for (let x = component.bboxX + knobs.plateInteriorMargin; x < component.bboxX + component.bboxW - knobs.plateInteriorMargin; x++) {
                interior++;
                if (bright.data[row + x])
                    glyphCount++;
            }
        }
        const glyphFraction = interior ? glyphCount / interior : 0;
        if (glyphFraction < knobs.plateGlyphFractionMin || glyphFraction > knobs.plateGlyphFractionMax)
            continue;
        if (badges.some((badge) => Math.hypot(badge.cx - component.cx, badge.cy - component.cy) < knobs.plateProximityThreshold))
            continue;
        const margin = knobs.plateBboxMargin;
        badges.push({
            label: -1,
            cx: component.cx,
            cy: component.cy,
            area: component.area,
            bboxX: component.bboxX - margin,
            bboxY: component.bboxY - margin,
            bboxW: component.bboxW + margin * 2,
            bboxH: component.bboxH + margin * 2,
            major: component.major,
            minor: component.minor,
            angle: component.angle,
            fill: component.fill
        });
        badgeSources.push('dark-plate-recovery');
        plateBboxes.push([
            component.bboxX,
            component.bboxY,
            component.bboxW,
            component.bboxH
        ]);
    }
}
function runBadgeStage(image, knobs = exports.DEFAULT_BADGE_STAGE_KNOBS, hsvKnobs = raster_1.DEFAULT_HSV_KNOBS) {
    const { width, height } = image;
    const { bright, dark } = (0, raster_1.computeBrightDarkMasks)(image, hsvKnobs);
    const { labels: brightLabels, components: brightComponents } = (0, components_1.extractComponents)(bright);
    const { labels: darkLabels, components: darkComponents } = (0, components_1.extractComponents)(dark);
    const badges = detectBadgeFamily(width, dark, brightComponents, knobs);
    const badgeSources = badges.map(() => 'bright-family');
    const plateBboxes = badges.map(() => null);
    recoverDarkPlateBadges(width, bright, dark, badges, badgeSources, plateBboxes, knobs, darkComponents);
    return {
        width,
        height,
        brightMask: bright,
        darkMask: dark,
        brightLabels,
        brightComponents,
        darkLabels,
        darkComponents,
        badges,
        badgeSources,
        plateBboxes,
        badgeCount: badges.length,
        plateInteriorMarginPx: knobs.plateInteriorMargin,
        plateFrameTolerancePx: knobs.plateFrameTolerancePx
    };
}
//# sourceMappingURL=badgeStage.js.map