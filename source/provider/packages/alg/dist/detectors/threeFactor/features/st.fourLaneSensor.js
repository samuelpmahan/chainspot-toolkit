"use strict";
// Four-lane ribbon cross-section sensor, ported from the Dev72 LAB's
// src/lib/nuthing/fourLaneRibbon.ts. This file intentionally stops at the
// observation primitive: no heading search, tracker state machine, basket
// attribution, or deterministic badge transit lives here.
//
// The sensor is a deviation/default-OFF ABFeature so registering it cannot
// change frozen behavior. It is not an EngineUnit yet because the current
// engine has no straight-test pose slot to consume. A future TBS/GS unit can
// call observeFourLaneCrossSection with ctx.resolve(...).knobs.
Object.defineProperty(exports, "__esModule", { value: true });
exports.fourLaneSensorFeature = exports.DEFAULT_FOUR_LANE_SENSOR_KNOBS = void 0;
exports.sampleFourLaneBand = sampleFourLaneBand;
exports.observeFourLaneCrossSection = observeFourLaneCrossSection;
exports.DEFAULT_FOUR_LANE_SENSOR_KNOBS = {
    edgeDeltaPx: 2.5,
    liftReference: 45,
    tangentHalfPx: 4,
    tangentSamples: 5
};
const positiveFinite = (name) => (value) => typeof value === 'number' && Number.isFinite(value) && value > 0
    ? null
    : `${name} must be a positive finite number`;
exports.fourLaneSensorFeature = {
    id: 'fourLaneSensor',
    gate: 'G5',
    kind: 'deviation',
    defaultEnabled: false,
    note: 'Four-lane ribbon cross-section sensor: paired/one-sided rails plus corridor-interior evidence with known occluders treated as UNKNOWN.',
    knobs: {
        edgeDeltaPx: {
            default: exports.DEFAULT_FOUR_LANE_SENSOR_KNOBS.edgeDeltaPx,
            note: 'normal-distance offset on each side of an expected rail used for inside-vs-outside grayscale lift',
            validate: positiveFinite('edgeDeltaPx')
        },
        liftReference: {
            default: exports.DEFAULT_FOUR_LANE_SENSOR_KNOBS.liftReference,
            note: 'inside-minus-outside grayscale lift that maps to score 1.0',
            validate: positiveFinite('liftReference')
        },
        tangentHalfPx: {
            default: exports.DEFAULT_FOUR_LANE_SENSOR_KNOBS.tangentHalfPx,
            note: 'half-length in source pixels sampled along the tangent for each band observation',
            validate: positiveFinite('tangentHalfPx')
        },
        tangentSamples: {
            default: exports.DEFAULT_FOUR_LANE_SENSOR_KNOBS.tangentSamples,
            note: 'number of uniformly spaced tangent samples per band; majority-blocked means UNKNOWN',
            validate: (value) => Number.isInteger(value) && value > 0
                ? null
                : 'tangentSamples must be a positive integer'
        }
    }
};
function clamp01(value) {
    return Math.min(1, Math.max(0, value));
}
function containsPoint(occluder, point) {
    return (point.xPx >= occluder.bboxX &&
        point.xPx <= occluder.bboxX + occluder.bboxW &&
        point.yPx >= occluder.bboxY &&
        point.yPx <= occluder.bboxY + occluder.bboxH);
}
function inOccluder(x, y, occluders) {
    return occluders.some((occluder) => containsPoint(occluder, { xPx: x, yPx: y }));
}
function grayAt(image, x, y) {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || xi >= image.width || yi < 0 || yi >= image.height)
        return null;
    const p = (yi * image.width + xi) * 4;
    return (image.data[p] + image.data[p + 1] + image.data[p + 2]) / 3;
}
/**
 * Exact LAB band sampler. Expected pixels hidden by known occluders are
 * neutral: they do not contribute zero-valued appearance evidence.
 */
function sampleFourLaneBand(image, center, headingRad, normalOffsetPx, occluders, knobs) {
    const tx = Math.cos(headingRad);
    const ty = Math.sin(headingRad);
    const nx = -ty;
    const ny = tx;
    const n = Math.max(1, knobs.tangentSamples);
    let total = 0;
    let visible = 0;
    let blocked = 0;
    for (let i = 0; i < n; i++) {
        const along = n === 1
            ? 0
            : -knobs.tangentHalfPx + (2 * knobs.tangentHalfPx * i) / (n - 1);
        const x = center.xPx + nx * normalOffsetPx + tx * along;
        const y = center.yPx + ny * normalOffsetPx + ty * along;
        if (inOccluder(x, y, occluders)) {
            blocked++;
            continue;
        }
        const gray = grayAt(image, x, y);
        if (gray === null)
            continue;
        total += gray;
        visible++;
    }
    return {
        mean: visible ? total / visible : null,
        occluded: blocked * 2 >= n || visible === 0
    };
}
function normalizedLift(inside, outside, liftReference) {
    return clamp01((inside - outside) / Math.max(liftReference, 1e-6));
}
/** Pure cross-section observation math; no tracker/search behavior. */
function observeFourLaneCrossSection(image, state, occluders, knobs) {
    const width = Math.max(1, state.corridorWidthPx);
    const laneWidth = width / 3;
    const laneOffsets = [
        -width / 2,
        -width / 6,
        width / 6,
        width / 2
    ];
    // Guards just outside the 4W/3 bundle estimate local ground.
    const guardLeft = sampleFourLaneBand(image, state, state.headingRad, (-2 * width) / 3, occluders, knobs);
    const guardRight = sampleFourLaneBand(image, state, state.headingRad, (2 * width) / 3, occluders, knobs);
    const guards = [guardLeft, guardRight]
        .filter((sample) => !sample.occluded && sample.mean !== null)
        .map((sample) => sample.mean);
    const ground = guards.length ? guards.reduce((a, b) => a + b, 0) / guards.length : null;
    const sampleInnerLane = (offset) => {
        const samples = [-laneWidth / 3, 0, laneWidth / 3].map((sub) => sampleFourLaneBand(image, state, state.headingRad, offset + sub, occluders, knobs));
        const visible = samples
            .filter((sample) => !sample.occluded && sample.mean !== null)
            .map((sample) => sample.mean);
        const occluded = samples.filter((sample) => sample.occluded).length >= 2;
        if (occluded || visible.length === 0 || ground === null) {
            return { score: null, occluded: true };
        }
        const mean = visible.reduce((a, b) => a + b, 0) / visible.length;
        return { score: normalizedLift(mean, ground, knobs.liftReference), occluded: false };
    };
    const sampleRail = (railOffset, insideSign) => {
        const inside = sampleFourLaneBand(image, state, state.headingRad, railOffset + insideSign * knobs.edgeDeltaPx, occluders, knobs);
        const outside = sampleFourLaneBand(image, state, state.headingRad, railOffset - insideSign * knobs.edgeDeltaPx, occluders, knobs);
        if (inside.occluded || outside.occluded || inside.mean === null || outside.mean === null) {
            return { score: null, occluded: true };
        }
        return {
            score: normalizedLift(inside.mean, outside.mean, knobs.liftReference),
            occluded: false
        };
    };
    // Normal points left of heading. Left-rail inward is +normal; right is -normal.
    const leftRail = sampleRail(laneOffsets[0], 1);
    const innerLeft = sampleInnerLane(laneOffsets[1]);
    const innerRight = sampleInnerLane(laneOffsets[2]);
    const rightRail = sampleRail(laneOffsets[3], -1);
    const visibleRails = [leftRail, rightRail].filter((rail) => !rail.occluded && rail.score !== null);
    let railMode;
    let railScore;
    if (visibleRails.length === 2) {
        railMode = 'paired';
        railScore = Math.min(visibleRails[0].score, visibleRails[1].score);
    }
    else if (visibleRails.length === 1) {
        railMode = 'one-sided';
        railScore = visibleRails[0].score;
    }
    else {
        railMode = 'occluded';
        railScore = null;
    }
    const visibleInner = [innerLeft, innerRight]
        .filter((lane) => !lane.occluded && lane.score !== null)
        .map((lane) => lane.score);
    const innerScore = visibleInner.length ? Math.min(...visibleInner) : null;
    const observed = [railScore, innerScore].filter((value) => value !== null);
    const score = observed.length ? Math.min(...observed) : null;
    return {
        laneOffsetsPx: laneOffsets,
        laneWidthPx: laneWidth,
        leftRail: leftRail.score,
        innerLeft: innerLeft.score,
        innerRight: innerRight.score,
        rightRail: rightRail.score,
        leftRailOccluded: leftRail.occluded,
        innerLeftOccluded: innerLeft.occluded,
        innerRightOccluded: innerRight.occluded,
        rightRailOccluded: rightRail.occluded,
        railMode,
        railScore,
        innerScore,
        score
    };
}
//# sourceMappingURL=st.fourLaneSensor.js.map