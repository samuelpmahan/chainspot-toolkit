"use strict";
/**
 * Trace-only CLI and Visual receipt for G3 teeMinAreaPose.
 *
 * The producer owns every component pixel, candidate, corner, and verdict.
 * This module sees only the actual UnitTrace/Drawable seam: it partitions
 * producer-stamped visualRole/metadata.role values and forwards the original
 * Drawable objects to the renderer. It never reads a raster, reconstructs a
 * corner, or converts a result into a new presentation geometry.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.teeMinAreaPoseRender = exports.TEE_MIN_AREA_POSE_REQUIRED_VALUES = exports.G0_CANONICAL_DETECTOR_INPUT_PIXEL_FRAME = exports.TEE_MIN_AREA_POSE_FEATURE_ID = void 0;
exports.buildTeeMinAreaPoseReceipt = buildTeeMinAreaPoseReceipt;
exports.TEE_MIN_AREA_POSE_FEATURE_ID = 'teeMinAreaPose';
exports.G0_CANONICAL_DETECTOR_INPUT_PIXEL_FRAME = 'G0 canonical detector-input pixels';
const UNKNOWN = 'UNKNOWN';
/** Required target observations. Absent producer testimony is explicit
 * UNKNOWN; no numeric value or coordinate is inferred by this selector. */
exports.TEE_MIN_AREA_POSE_REQUIRED_VALUES = [
    'targetRef',
    'targetComponent',
    'pixelCount',
    'hullVertexCount',
    'candidateCount',
    'score',
    'occupancy',
    'rectangleAreaPx2',
    'centerXPx',
    'centerYPx',
    'angleDeg',
    'majorPx',
    'minorPx',
    'producerCornerC0X',
    'producerCornerC0Y',
    'producerCornerC1X',
    'producerCornerC1Y',
    'producerCornerC2X',
    'producerCornerC2Y',
    'producerCornerC3X',
    'producerCornerC3Y'
];
function roleOf(drawable) {
    const role = drawable.metadata?.role;
    return role === 'component-pixel-set' ||
        role === 'target' ||
        role === 'fitted-corner' ||
        role === 'diagonal'
        ? role
        : undefined;
}
function text(value) {
    return typeof value === 'string' && value.length > 0 ? value : UNKNOWN;
}
function valuesOf(drawable, target) {
    const values = {
        ...(drawable.metadata ?? {}),
        ...(drawable.values ?? {})
    };
    if (target) {
        for (const name of exports.TEE_MIN_AREA_POSE_REQUIRED_VALUES) {
            if (!(name in values))
                values[name] = UNKNOWN;
        }
    }
    return values;
}
function selected(unit) {
    return unit.drawables.flatMap((drawable, traceIndex) => {
        const role = roleOf(drawable);
        return role ? [{ drawable, role, traceIndex }] : [];
    });
}
function idFor(traceIndex, drawable) {
    return `${traceIndex}:${text(drawable.ref)}`;
}
function rowsFor(unit) {
    return selected(unit).map(({ drawable, role, traceIndex }) => ({
        traceIndex,
        id: idFor(traceIndex, drawable),
        role,
        ref: text(drawable.ref),
        type: drawable.type,
        verdict: drawable.verdict,
        reason: text(drawable.reason),
        values: valuesOf(drawable, role === 'target')
    }));
}
function runMetadata(run, unit) {
    return {
        runId: text(run.runId),
        imageId: text(run.imageId),
        paramsHash: text(run.paramsHash),
        featureId: text(unit.featureId),
        traceHash: text(run.traceHash),
        coordinateFrame: text(run.canonicalFrame)
    };
}
function partition(unit) {
    const entries = selected(unit);
    return {
        exactPixels: entries
            .filter(({ drawable, role }) => (role === 'component-pixel-set' || role === 'target') &&
            drawable.type === 'pixelSet' &&
            drawable.visualRole === 'tee-visible-pixels')
            .map(({ drawable }) => drawable),
        corners: entries
            .filter(({ drawable, role }) => role === 'fitted-corner' && drawable.visualRole === 'tee-corner-tick')
            .map(({ drawable }) => drawable),
        diagonals: entries
            .filter(({ drawable, role }) => role === 'diagonal' && drawable.visualRole === 'tee-diagonal')
            .map(({ drawable }) => drawable),
        rejected: entries
            .filter(({ drawable, role }) => role === 'target' && drawable.verdict === 'rejected')
            .map(({ drawable }) => drawable)
    };
}
/** Build the matching CLI/Visual receipt from one actual producer UnitTrace. */
function buildTeeMinAreaPoseReceipt(unit, run) {
    const rows = rowsFor(unit);
    const metadata = runMetadata(run, unit);
    const parts = partition(unit);
    const visualDrawables = [
        ...parts.exactPixels,
        ...parts.corners,
        ...parts.diagonals,
        ...parts.rejected
    ];
    const traceIds = rows.map((row) => row.id);
    const visualIds = visualDrawables.map((drawable) => idFor(unit.drawables.indexOf(drawable), drawable));
    const cliIds = rows.map((row) => row.id);
    const same = (a, b) => a.length === b.length && [...a].sort().every((id, index) => id === [...b].sort()[index]);
    const correspondence = {
        traceIds,
        cliIds,
        visualIds,
        matched: same(traceIds, cliIds) && same(traceIds, visualIds)
    };
    const plan = {
        title: `G3 teeMinAreaPose -- exact-component unit-cell minimum-area pose (${run.configName})`,
        base: 'badgeStage.masks.bright',
        layers: [
            {
                name: 'exact accepted visible tee components (G3)',
                note: 'green means exact detector-owned bright component cells only; fitting never paints inferred fill',
                drawables: parts.exactPixels
            },
            {
                name: 'minimum-area fitted corners (G3)',
                note: 'cyan pluses are the four producer-emitted minimum-area rectangle corners; renderer does not recompute them',
                drawables: parts.corners
            },
            {
                name: 'minimum-area center guides (G3)',
                note: 'the thinnest red opposite-corner diagonals are producer-emitted and intersect at the selected center',
                drawables: parts.diagonals
            },
            {
                name: 'minimum-area rejected targets (G3)',
                note: 'rejected target testimony is forwarded with its reason; it never removes a baseline visible tee',
                drawables: parts.rejected
            }
        ],
        notes: [
            `runId=${metadata.runId}`,
            `imageId=${metadata.imageId}`,
            `paramsHash=${metadata.paramsHash}`,
            `featureId=${metadata.featureId}`,
            `traceHash=${metadata.traceHash}`,
            `coordinateFrame=${metadata.coordinateFrame}`,
            'Math: convex hull plus hull-edge minimum-area rectangle over exact detector-owned unit cells; OpenCV comparison is historical only, not literal contour parity.',
            'Extent disclosure: full unit-cell envelope is fitted here; OpenCV contour-point extents can differ.',
            `Trace -> CLI: ${same(traceIds, cliIds) ? 'MATCH' : 'MISMATCH'}`,
            `Trace -> Visual: ${same(traceIds, visualIds) ? 'MATCH' : 'MISMATCH'}`,
            `CLI <-> Visual: ${same(cliIds, visualIds) ? 'MATCH' : 'MISMATCH'}`,
            'visual palette is selector-only: exact green cells, cyan corners, and one-pixel red diagonals; no yellow/orange decoration.'
        ]
    };
    const cliText = [
        'TEE MIN-AREA POSE (EXACT COMPONENT UNIT-CELL ENVELOPE)',
        ...plan.notes,
        ...rows.map((row) => [
            `id=${row.id}`,
            `role=${row.role}`,
            `ref=${row.ref}`,
            `verdict=${row.verdict}`,
            `reason=${row.reason}`,
            `values=${JSON.stringify(row.values)}`
        ].join(' | '))
    ].join('\n');
    return { plan, rows, cliText, correspondence };
}
/** FeatureRender seam: actual producer drawables are forwarded unchanged. */
exports.teeMinAreaPoseRender = {
    units: [exports.TEE_MIN_AREA_POSE_FEATURE_ID],
    draw(unit, run) {
        return buildTeeMinAreaPoseReceipt(unit, run).plan;
    }
};
//# sourceMappingURL=g3.teeMinAreaPoseReceipt.js.map