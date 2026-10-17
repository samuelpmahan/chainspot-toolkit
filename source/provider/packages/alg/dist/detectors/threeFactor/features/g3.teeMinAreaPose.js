"use strict";
// G3 teeMinAreaPose — default-OFF exact-component minimum-area pose.
//
// The feature uses the pre-engine `minAreaRect(contour)` geometry class in
// pure TypeScript, but fits a deliberately different unit-cell envelope.
// Only G3-accepted intact visible tees enter;
// their exact bright-component cells are the complete fit input. Badge,
// truth, assignment, recovery, path, neighboring-tee, and exterior pixels
// are unavailable to the fitter.
Object.defineProperty(exports, "__esModule", { value: true });
exports.teeMinAreaPoseUnit = exports.teeMinAreaPoseFeature = void 0;
const g3_teeFamily_1 = require("./g3.teeFamily");
const g3_teeMinAreaPoseMath_1 = require("./g3.teeMinAreaPoseMath");
const g3_teeMinAreaPoseReceipt_1 = require("./g3.teeMinAreaPoseReceipt");
const teePoseVisuals_1 = require("./teePoseVisuals");
exports.teeMinAreaPoseFeature = {
    id: 'teeMinAreaPose',
    gate: 'G3',
    kind: 'deviation',
    defaultEnabled: false,
    resolveOnlyWhenConfigured: true,
    note: 'Blind G3 intact-visible tee pose from the minimum-area rectangle enclosing exact detector-owned unit cells. It is not a literal OpenCV contour result: the unit-cell envelope intentionally differs from contour-point extents.',
    render: g3_teeMinAreaPoseReceipt_1.teeMinAreaPoseRender,
    knobs: {}
};
function finitePad(tee) {
    return Boolean(tee.tier === 'ring' &&
        tee.pad?.source === 'bright-mask-component' &&
        Number.isFinite(tee.xPx) &&
        Number.isFinite(tee.yPx));
}
function componentInfo(ctx, tee, pixels, reason, verdict = 'info', values = {}, metadata = {}) {
    ctx.overlay('teeMinAreaPose', {
        type: 'pixelSet',
        pixels,
        verdict,
        visualRole: 'tee-visible-pixels',
        ref: tee.detId,
        reason,
        values: {
            componentLabel: tee.pad.componentLabel,
            pixelCount: pixels.length,
            ...values
        },
        metadata: {
            role: verdict === 'accepted' ? 'target' : 'component-pixel-set',
            targetRef: tee.detId,
            targetComponent: String(tee.pad.componentLabel),
            coordinateFrame: 'G0 canonical detector-input pixels',
            algorithm: 'minimum-area rectangle over exact owned pixel cells',
            ...metadata
        }
    });
}
function rejectedTarget(ctx, tee, reason, values = {}, metadata = {}) {
    ctx.overlay('teeMinAreaPose', {
        type: 'point',
        xPx: tee.xPx,
        yPx: tee.yPx,
        verdict: 'rejected',
        visualRole: 'tee-rejection',
        ref: tee.detId,
        reason,
        values: { componentLabel: tee.pad.componentLabel, ...values },
        metadata: {
            role: 'target',
            targetRef: tee.detId,
            targetComponent: String(tee.pad.componentLabel),
            coordinateFrame: 'G0 canonical detector-input pixels',
            algorithm: 'minimum-area rectangle over exact owned pixel cells',
            ...metadata
        }
    });
}
function targetValues(record, result) {
    const corners = result.corners;
    const corner = (index, axis) => corners?.[index]?.[axis];
    const values = {
        componentLabel: record.tee.pad.componentLabel,
        pixelCount: result.pixelCount,
        hullVertexCount: result.hullVertexCount,
        candidateCount: result.candidateCount
    };
    const optional = [
        ['score', result.score],
        ['occupancy', result.occupancy],
        ['rectangleAreaPx2', result.areaPx2],
        ['centerXPx', result.center?.xPx],
        ['centerYPx', result.center?.yPx],
        ['angleDeg', result.angleDeg],
        ['majorPx', result.majorPx],
        ['minorPx', result.minorPx],
        ['producerCornerC0X', corner(0, 'xPx')],
        ['producerCornerC0Y', corner(0, 'yPx')],
        ['producerCornerC1X', corner(1, 'xPx')],
        ['producerCornerC1Y', corner(1, 'yPx')],
        ['producerCornerC2X', corner(2, 'xPx')],
        ['producerCornerC2Y', corner(2, 'yPx')],
        ['producerCornerC3X', corner(3, 'xPx')],
        ['producerCornerC3Y', corner(3, 'yPx')]
    ];
    for (const [key, value] of optional)
        if (typeof value === 'number' && Number.isFinite(value))
            values[key] = value;
    return values;
}
function poseFromResult(result) {
    if (!result.corners ||
        result.corners.length !== 4 ||
        !result.center ||
        result.angleDeg === null ||
        result.majorPx === null ||
        result.minorPx === null)
        return undefined;
    const points = result.corners.map((point) => [point.xPx, point.yPx]);
    const corners = [points[0], points[1], points[2], points[3]];
    return {
        centerXPx: result.center.xPx,
        centerYPx: result.center.yPx,
        angleRad: (result.angleDeg * Math.PI) / 180,
        majorPx: result.majorPx,
        minorPx: result.minorPx,
        orientedCorners: corners
    };
}
/** Refinement only: membership, recovery, assignment, and baseline fields are
 * immutable. The exact component alone owns the optional presentation pose. */
exports.teeMinAreaPoseUnit = {
    id: 'teeMinAreaPose',
    gate: 'G3',
    consumes: ['stage', 'tees', 'viewport'],
    produces: ['tees'],
    note: 'default-OFF blind visible-tee pose: minimum-area rectangle over each exact accepted bright component unit-cell envelope; no truth, badge, ring, path, neighboring, recovery, or exterior evidence',
    run(board, ctx) {
        const stop = ctx.span('teeMinAreaPose');
        const stage = board.get('stage');
        const tees = board.get('tees');
        const viewport = board.get('viewport');
        const state = ctx.resolve(exports.teeMinAreaPoseFeature);
        if (!state.enabled) {
            board.set('tees', tees);
            stop();
            return;
        }
        const records = [];
        for (const tee of tees.filter(finitePad)) {
            const pixels = (0, g3_teeFamily_1.exactBrightComponentPixels)(stage.brightLabels, stage.width, stage.height, tee.pad.componentLabel, viewport.topPx);
            if (pixels.length !== tee.pad.area || pixels.length === 0) {
                componentInfo(ctx, tee, pixels, 'exact bright component unavailable for minimum-area fit');
                rejectedTarget(ctx, tee, `minimum-area pose rejected: component ${tee.pad.componentLabel} owns ${pixels.length} exact cells; expected ${tee.pad.area}`);
                continue;
            }
            records.push({ tee, pixels });
        }
        const updated = new Map();
        let accepted = 0;
        let rejected = tees.filter(finitePad).length - records.length;
        for (const record of records) {
            const result = (0, g3_teeMinAreaPoseMath_1.fitMinimumAreaPixelRect)(record.pixels.map(([xPx, yPx]) => ({ xPx, yPx })));
            ctx.measure('teeMinAreaPose', 'candidatesEvaluated', result.candidateCount);
            const values = targetValues(record, result);
            const metadata = {
                role: 'target',
                targetRef: record.tee.detId,
                targetComponent: String(record.tee.pad.componentLabel),
                coordinateFrame: 'G0 canonical detector-input pixels',
                algorithm: 'minimum-area rectangle over exact owned pixel cells',
                historicalReference: 'cv.minAreaRect(contour)',
                currentInput: 'unit-square envelope of exact detector-owned component cells',
                opencvParity: 'not literal: contour-point extents can differ from full unit-cell envelope extents'
            };
            if (!result.accepted || !result.corners) {
                componentInfo(ctx, record.tee, record.pixels, 'exact accepted bright component pixels; pose rejected but membership retained');
                rejectedTarget(ctx, record.tee, `minimum-area pose rejected: ${result.reason}`, values, metadata);
                rejected++;
                continue;
            }
            componentInfo(ctx, record.tee, record.pixels, 'accepted exact detector-owned bright component cells; minimum-area rectangle encloses every full pixel cell', 'accepted', values, metadata);
            const corners = result.corners.map((point) => [point.xPx, point.yPx]);
            const decoration = (0, teePoseVisuals_1.teePoseDecoration)(corners, record.tee.detId, 'producer-emitted exact-component minimum-area corners; renderer must not recompute a pose');
            for (const [cornerIndex, drawable] of decoration.cornerTicks.entries())
                ctx.overlay('teeMinAreaPose', {
                    ...drawable,
                    metadata: {
                        ...metadata,
                        role: 'fitted-corner',
                        producerCorner: `C${cornerIndex}`,
                        producerCornerCycle: 'C0→C1→C2→C3→C0'
                    }
                });
            for (const [diagonalIndex, drawable] of decoration.diagonals.entries())
                ctx.overlay('teeMinAreaPose', {
                    ...drawable,
                    metadata: {
                        ...metadata,
                        role: 'diagonal',
                        producerDiagonal: diagonalIndex === 0 ? 'C0↔C2' : 'C1↔C3',
                        producerCornerCycle: 'C0→C1→C2→C3→C0'
                    }
                });
            const pose = poseFromResult(result);
            if (pose)
                updated.set(record.tee.detId, {
                    ...record.tee,
                    pad: { ...record.tee.pad, minAreaPose: pose }
                });
            accepted++;
        }
        ctx.measure('teeMinAreaPose', 'eligibleVisiblePads', records.length);
        ctx.measure('teeMinAreaPose', 'accepted', accepted);
        ctx.measure('teeMinAreaPose', 'rejected', rejected);
        board.set('tees', tees.map((tee) => updated.get(tee.detId) ?? tee));
        stop();
    }
};
//# sourceMappingURL=g3.teeMinAreaPose.js.map