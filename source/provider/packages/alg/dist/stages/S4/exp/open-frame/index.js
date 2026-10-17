"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenFramePxC = void 0;
exports.findOpenFrames = findOpenFrames;
exports.resolveOpenFrames = resolveOpenFrames;
const g3_teeMinAreaPoseMath_1 = require("../../../../detectors/threeFactor/features/g3.teeMinAreaPoseMath");
const board_1 = require("../../../../exec/board");
const axis_local_1 = require("../axis-local");
exports.OpenFramePxC = {
    candidates: (0, board_1.pxKey)('px.s4.openFrames'),
    measures: (0, board_1.pxKey)('px.s4.openFrameMeasures')
};
function findOpenFrames(fields, badges, baskets, tees) {
    const width = fields.bright.mask.width;
    const explained = new Set();
    for (const b of badges)
        for (const p of b.has.mute.px)
            explained.add(p);
    for (const b of baskets)
        for (const p of b.px)
            explained.add(p);
    for (const t of tees)
        for (const p of t.px)
            explained.add(p);
    const free = fields.bright.components.filter(c => c.area >= 8 && c.bboxW <= 80 && c.bboxH <= 80 &&
        c.major >= 6 && c.minor >= 4);
    const candidates = [];
    const tested = [];
    const seen = new Set();
    for (const seed of free) {
        const members = fields.bright.components.filter(c => c.bboxX >= seed.bboxX && c.bboxY >= seed.bboxY &&
            c.bboxX + c.bboxW <= seed.bboxX + seed.bboxW && c.bboxY + c.bboxH <= seed.bboxY + seed.bboxH);
        const labels = new Set(members.map(c => c.label));
        const key = [...labels].sort((a, b) => a - b).join(',');
        if (seen.has(key))
            continue;
        seen.add(key);
        const pixels = [];
        let overlaps = false;
        for (let y = seed.bboxY; y < seed.bboxY + seed.bboxH; y++)
            for (let x = seed.bboxX; x < seed.bboxX + seed.bboxW; x++) {
                const p = y * width + x;
                if (!labels.has(fields.bright.labels[p]))
                    continue;
                if (explained.has(p))
                    overlaps = true;
                else
                    pixels.push(p);
            }
        if (overlaps || pixels.length < 8)
            continue;
        const pose = (0, g3_teeMinAreaPoseMath_1.fitMinimumAreaPixelRect)(pixels.map(p => ({ xPx: p % width, yPx: Math.floor(p / width) })));
        if (!pose.accepted || !pose.center || pose.angleDeg === null || !pose.majorPx || !pose.minorPx)
            continue;
        const angle = pose.angleDeg * Math.PI / 180, ux = Math.cos(angle), uy = Math.sin(angle);
        const a = pose.majorPx / 2, b = pose.minorPx / 2;
        const bins = 12;
        const edgeBand = Math.max(1.5, pose.minorPx * 0.22); // Scale-relative border, not one thin pixel rim.
        const sides = [new Set(), new Set(), new Set(), new Set()];
        let interior = 0;
        for (const p of pixels) {
            const dx = p % width - pose.center.xPx, dy = Math.floor(p / width) - pose.center.yPx;
            const u = dx * ux + dy * uy, v = -dx * uy + dy * ux;
            const nearA = a - Math.abs(u) <= edgeBand, nearB = b - Math.abs(v) <= edgeBand;
            if (Math.abs(u) < a * 0.50 && Math.abs(v) < b * 0.50)
                interior++; // Central void, not thick border paint.
            if (nearA)
                sides[u < 0 ? 0 : 1].add(Math.max(0, Math.min(bins - 1, Math.floor((v + b) / (2 * b) * bins))));
            if (nearB)
                sides[v < 0 ? 2 : 3].add(Math.max(0, Math.min(bins - 1, Math.floor((u + a) / (2 * a) * bins))));
        }
        const coverage = sides.map(s => s.size / bins), interiorFraction = interior / pixels.length;
        const ratio = pose.majorPx / pose.minorPx;
        const accepted = ratio >= 1.3 && ratio <= 4 && interiorFraction <= 0.18 &&
            coverage.filter(v => v >= 0.60).length >= 3 && Math.min(...coverage) >= 0.10;
        tested.push({ parts: [...labels], center: pose.center, angleDeg: pose.angleDeg, edgeBand, major: pose.majorPx, minor: pose.minorPx, coverage, interiorFraction, accepted });
        if (accepted)
            candidates.push({ center: [pose.center.xPx, pose.center.yPx], angleRad: angle,
                bbox: [seed.bboxX, seed.bboxY, seed.bboxW, seed.bboxH], px: Uint32Array.from(pixels), parts: [...labels],
                sideCoverage: coverage, interiorFraction });
    }
    return { candidates, tested };
}
function resolveOpenFrames(base, candidates, badges, baseTeeCount) {
    const unresolved = badges.filter(b => base.unresolvedHoles.includes(Number(b.label)));
    const pairs = (0, axis_local_1.measurePairs)(candidates, unresolved);
    const extra = (0, axis_local_1.judgePairs)(pairs, candidates);
    const additions = extra.resolutions.map(r => ({ ...r, tee: r.tee + baseTeeCount,
        visibility: 'PARTIALLY_OBSERVED_RECOVERED', origin: 'composed-open-frame',
        stageDebt: 'S3 closed-ring assumption excluded a visible open/disconnected border' }));
    const resolutions = [...base.resolutions, ...additions].sort((a, b) => a.hole - b.hole);
    return { ...base, resolutions, unresolvedHoles: base.unresolvedHoles.filter(h => !additions.some(r => r.hole === h)),
        assumption: base.assumption + '; challenger: three supported rectangle sides plus a fourth-side fragment; prior local resolutions preserved',
        recovery: 'OPEN_FRAME_ONLY' };
}
//# sourceMappingURL=index.js.map