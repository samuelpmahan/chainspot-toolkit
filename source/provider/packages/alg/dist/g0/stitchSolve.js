"use strict";
// Stitch solve: two DISTINCT decision paths the page composes, extracted
// behavior-identical from src/routes/+page.svelte. They are kept as two
// functions (not folded into one "solve" call) because that is genuinely
// how the app uses them today:
//
// - Semantic alignment (trySemanticAlign, ~lines 311-344) runs
//   automatically whenever badge detections change, and is PREFERRED — it
//   anchors tiles by shared badge numbers, which pixel search cannot know
//   about. It only ever upgrades the initial spread layout; it never
//   fights a manual drag or a pixel-stitch run (that gating is page/session
//   state, not part of the alignment rule itself).
// - Pixel stitch (runStitch, ~lines 564-592) is the USER-INVOKED fallback
//   when semantic alignment found no shared badges: pairwise translation
//   search between adjacent tiles, accumulated left-to-right, falling back
//   to a fixed placement-only gap when a pair has no plausible overlap.
//
// Both paths start from the same initial layout (initialSpreadPlacements,
// ~lines 486-491) and share the same fallback gap constant.
//
// OperationKind: trySemanticAlign and solvePixelStitch are both 'decide'
// (they choose a layout, they don't measure a single scalar); the
// per-pair findBestTranslation call inside solvePixelStitch remains its
// own 'measure' operation (stitch.ts, untouched).
Object.defineProperty(exports, "__esModule", { value: true });
exports.FALLBACK_GAP_PX = void 0;
exports.initialSpreadPlacements = initialSpreadPlacements;
exports.trySemanticAlign = trySemanticAlign;
exports.solvePixelStitch = solvePixelStitch;
const stitch_1 = require("../stitch");
/** Placement-only fallback gap, in px, when tiles don't overlap enough to measure. */
exports.FALLBACK_GAP_PX = 120;
/** The initial "spread" layout tiles get before any alignment runs. */
function initialSpreadPlacements(tileWidthsPx) {
    let x = 0;
    return tileWidthsPx.map((widthPx) => {
        const p = { x, y: 0 };
        x += widthPx + exports.FALLBACK_GAP_PX;
        return p;
    });
}
/**
 * Median-offset semantic alignment. Tile 0 is the anchor; every other tile
 * sharing at least one badge number with the anchor is placed at
 * `anchorPlacement + median(dx, dy)` over its shared badges (median, not
 * mean — a single mislabeled badge can't drag the whole tile). Tiles with
 * zero shared badge numbers are left at their current placement. Returns
 * null when nothing at all matched — the caller keeps the prior layout.
 */
function trySemanticAlign(tileBadges, placements) {
    if (tileBadges.length < 2 || placements.length !== tileBadges.length)
        return null;
    const anchor = new Map(tileBadges[0].map((b) => [b.n, b]));
    if (anchor.size === 0)
        return null;
    const next = placements.slice();
    const matches = [];
    for (let i = 1; i < tileBadges.length; i++) {
        const offsets = [];
        for (const b of tileBadges[i]) {
            const ap = anchor.get(b.n);
            if (ap)
                offsets.push({ dx: ap.x - b.x, dy: ap.y - b.y, n: b.n });
        }
        if (offsets.length === 0)
            continue;
        // median dx, median dy independently (matches the page's original
        // double-sort — not a joint 2D median, a per-axis one)
        offsets.sort((a, b) => a.dx - b.dx);
        const dx = offsets[Math.floor(offsets.length / 2)].dx;
        offsets.sort((a, b) => a.dy - b.dy);
        const dy = offsets[Math.floor(offsets.length / 2)].dy;
        next[i] = { x: next[0].x + dx, y: next[0].y + dy };
        matches.push({ tileIndex: i, badgeNumbers: offsets.map((o) => o.n) });
    }
    if (matches.length === 0)
        return null;
    return { placements: next, matches };
}
/**
 * Pairwise pixel-translation stitch, accumulated left-to-right. Returns
 * null when there's nothing to stitch (fewer than 2 rasters) — the
 * caller's "not ready yet" messaging is page-side, not this function's job.
 */
function solvePixelStitch(rasters) {
    if (rasters.length < 2)
        return null;
    const placements = [{ x: 0, y: 0 }];
    let hadFallback = false;
    for (let index = 1; index < rasters.length; index++) {
        const previous = placements[index - 1];
        const offset = (0, stitch_1.findBestTranslation)(rasters[index - 1], rasters[index]);
        if (offset) {
            placements.push({ x: previous.x + offset.dx, y: previous.y + offset.dy });
        }
        else {
            hadFallback = true;
            placements.push({ x: previous.x + rasters[index - 1].widthPx + exports.FALLBACK_GAP_PX, y: previous.y });
        }
    }
    return { placements, hadFallback };
}
//# sourceMappingURL=stitchSolve.js.map