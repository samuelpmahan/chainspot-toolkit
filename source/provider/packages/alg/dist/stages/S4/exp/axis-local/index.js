"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.S4PxC = exports.AXIS_WINDOW_DEG = void 0;
exports.measurePairs = measurePairs;
exports.judgePairs = judgePairs;
const board_1 = require("../../../../exec/board");
exports.AXIS_WINDOW_DEG = 5; // Owner hint as an explicit NaiveGate, not a law.
exports.S4PxC = {
    pairs: (0, board_1.pxKey)('px.s4.teeBadge.pairs'),
    state: (0, board_1.pxKey)('px.s4.teeBadge.state'),
    pcr: (0, board_1.pxKey)('px.s4.pcr')
};
/** Bidirectional major axis: the eigenvector's sign is not semantic direction. */
function measurePairs(tees, badges) {
    return tees.flatMap((tee, index) => badges.flatMap(badge => {
        const hole = Number(badge.label);
        if (!Number.isInteger(hole) || hole <= 0)
            return [];
        const center = [badge.bbox[0] + (badge.bbox[2] - 1) / 2,
            badge.bbox[1] + (badge.bbox[3] - 1) / 2];
        const dx = center[0] - tee.center[0], dy = center[1] - tee.center[1];
        const distancePx = Math.hypot(dx, dy);
        const perpendicularPx = Math.abs(-Math.sin(tee.angleRad) * dx + Math.cos(tee.angleRad) * dy);
        const angleDeg = distancePx > 0 ? Math.asin(Math.min(1, perpendicularPx / distancePx)) * 180 / Math.PI : 90;
        return [{ tee: index, hole, badgeCenter: center, distancePx, angleDeg, perpendicularPx }];
    }));
}
/** Non-executing Gate: judgment over already-computed pair measurements.
 * Reciprocal nearest within the axis window is deliberately falsifiable.
 * Do not free conflicting candidates and rerun until the cardinality is 18.
 */
function judgePairs(pairs, tees) {
    const eligible = pairs.filter(pair => pair.angleDeg <= exports.AXIS_WINDOW_DEG && pair.distancePx > 0);
    const nearest = (items) => [...items].sort((a, b) => a.distancePx - b.distancePx || a.angleDeg - b.angleDeg || a.hole - b.hole || a.tee - b.tee)[0];
    const preferred = tees.map((_, tee) => nearest(eligible.filter(pair => pair.tee === tee)));
    const resolutions = preferred.filter((pair) => !!pair &&
        nearest(eligible.filter(other => other.hole === pair.hole))?.tee === pair.tee)
        .map(pair => ({ ...pair, center: tees[pair.tee].center, visibility: 'VISIBLE',
        ownedPx: Uint32Array.from(tees[pair.tee].px), state: 'RESOLVED_BY_NAIVE_GATE' }));
    return { resolutions: resolutions.sort((a, b) => a.hole - b.hole),
        unresolvedHoles: [...new Set(pairs.map(pair => pair.hole))].filter(hole => !resolutions.some(r => r.hole === hole)).sort((a, b) => a - b),
        unresolvedTees: tees.map((_, i) => i).filter(tee => !resolutions.some(r => r.tee === tee)),
        assumption: 'NaiveGate: reciprocal nearest candidate within 5 degrees of the bidirectional major axis',
        recovery: 'NOT_RUN' };
}
//# sourceMappingURL=index.js.map