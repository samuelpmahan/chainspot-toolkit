"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.threeFactorDetector = exports.sha256Hex = exports.canonicalJson = exports.validateExecution = exports.resolveConfig = exports.parseConfig = exports.ENGINE_UNITS = exports.DEFAULT_EXECUTION = exports.assignMeasuredThreeFactor = exports.findTeeCustody = exports.buildChainOfCustody = exports.CHAIN_OF_CUSTODY_SCHEMA = exports.occlude = exports.objectGraph = exports.THREE_FACTOR_ALGO_VERSION = exports.THREE_FACTOR_ALGO = void 0;
exports.measureThreeFactor = measureThreeFactor;
exports.insertRecoveredEndpoints = insertRecoveredEndpoints;
exports.runThreeFactor = runThreeFactor;
exports.emitThreeFactorRun = emitThreeFactorRun;
exports.createThreeFactorDetector = createThreeFactorDetector;
const assignment_1 = require("./assignment");
const custody_1 = require("./custody");
const engine_1 = require("./engine");
const objects_1 = require("./objects");
const measure_1 = require("./measure");
const types_1 = require("./types");
var types_2 = require("./types");
Object.defineProperty(exports, "THREE_FACTOR_ALGO", { enumerable: true, get: function () { return types_2.THREE_FACTOR_ALGO; } });
Object.defineProperty(exports, "THREE_FACTOR_ALGO_VERSION", { enumerable: true, get: function () { return types_2.THREE_FACTOR_ALGO_VERSION; } });
var objects_2 = require("./objects");
Object.defineProperty(exports, "objectGraph", { enumerable: true, get: function () { return objects_2.objectGraph; } });
Object.defineProperty(exports, "occlude", { enumerable: true, get: function () { return objects_2.occlude; } });
var custody_2 = require("./custody");
Object.defineProperty(exports, "CHAIN_OF_CUSTODY_SCHEMA", { enumerable: true, get: function () { return custody_2.CHAIN_OF_CUSTODY_SCHEMA; } });
Object.defineProperty(exports, "buildChainOfCustody", { enumerable: true, get: function () { return custody_2.buildChainOfCustody; } });
Object.defineProperty(exports, "findTeeCustody", { enumerable: true, get: function () { return custody_2.findTeeCustody; } });
function clamp01(value) {
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}
function toStageImage(image) {
    if (!Number.isInteger(image.widthPx) || image.widthPx <= 0)
        throw new RangeError('widthPx must be a positive integer');
    if (!Number.isInteger(image.heightPx) || image.heightPx <= 0)
        throw new RangeError('heightPx must be a positive integer');
    if (image.rgba.length !== image.widthPx * image.heightPx * 4)
        throw new RangeError('rgba length does not match image dimensions');
    return { width: image.widthPx, height: image.heightPx, data: image.rgba };
}
function validateParams(params) {
    const viewport = params.viewport;
    if (!viewport)
        return;
    if (!Number.isInteger(viewport.topPx) || viewport.topPx < 0)
        throw new RangeError('viewport.topPx must be a non-negative integer');
    if (!Number.isInteger(viewport.bottomPx) || viewport.bottomPx < viewport.topPx)
        throw new RangeError('viewport.bottomPx must be an integer >= topPx');
}
/** Raw stage output. It preserves every primitive measurement for parity/debugging. */
function measureThreeFactor(image, params = {}) {
    const stageImage = toStageImage(image);
    validateParams(params);
    return (0, measure_1.measureThreeFactor)(stageImage, params);
}
/** Explicit assignment seam: recovered/manual tees are inserted before pairing. */
function insertRecoveredEndpoints(measurement, recoveredTees = []) {
    return (0, assignment_1.assignThreeFactor)(measurement, recoveredTees);
}
exports.assignMeasuredThreeFactor = insertRecoveredEndpoints;
function runThreeFactor(image, params = {}) {
    const stageImage = toStageImage(image);
    validateParams(params);
    const { config, paramsHash, recoveredTees, ...stageParams } = params;
    const result = (0, engine_1.runEngine)(stageImage, stageParams, recoveredTees ?? [], config, paramsHash);
    return {
        imageId: image.imageId,
        measurement: result.measurement,
        assignment: result.assignment,
        objects: (0, objects_1.objectGraph)(result.measurement),
        custody: (0, custody_1.buildChainOfCustody)(result.assignment, result.trace),
        ...(result.trace ? { trace: result.trace } : {}),
        ...(paramsHash ? { paramsHash } : {})
    };
}
var engine_2 = require("./engine");
Object.defineProperty(exports, "DEFAULT_EXECUTION", { enumerable: true, get: function () { return engine_2.DEFAULT_EXECUTION; } });
Object.defineProperty(exports, "ENGINE_UNITS", { enumerable: true, get: function () { return engine_2.ENGINE_UNITS; } });
var config_1 = require("./config");
Object.defineProperty(exports, "parseConfig", { enumerable: true, get: function () { return config_1.parseConfig; } });
Object.defineProperty(exports, "resolveConfig", { enumerable: true, get: function () { return config_1.resolveConfig; } });
Object.defineProperty(exports, "validateExecution", { enumerable: true, get: function () { return config_1.validateExecution; } });
var hash_1 = require("./hash");
Object.defineProperty(exports, "canonicalJson", { enumerable: true, get: function () { return hash_1.canonicalJson; } });
Object.defineProperty(exports, "sha256Hex", { enumerable: true, get: function () { return hash_1.sha256Hex; } });
__exportStar(require("./gate-sets"), exports);
function badgeConfidence(badge) {
    return clamp01(badge.confidence);
}
function basketConfidence(basket) {
    return clamp01(basket.score);
}
function teeConfidence(tee) {
    if (tee.tier === 'ring')
        return clamp01(tee.ring?.ringFrac ?? 0);
    if (tee.tier === 'component')
        return clamp01(tee.fill);
    return clamp01(tee.recovery?.score ?? 0.5);
}
function objectEmission(image, detId, objType, xPx, yPx, confidence) {
    return {
        kind: 'object',
        imageId: image.imageId,
        algo: types_1.THREE_FACTOR_ALGO,
        algoVersion: types_1.THREE_FACTOR_ALGO_VERSION,
        detId,
        objType,
        xPx,
        yPx,
        confidence: clamp01(confidence)
    };
}
function labelEmission(image, badge) {
    if (badge.label === null)
        return null;
    const n = Number(badge.label);
    if (!Number.isInteger(n) || n <= 0)
        return null;
    const selected = badge.labelCandidates.find((candidate) => candidate.label === n);
    const candidates = badge.labelCandidates
        .filter((candidate) => Number.isInteger(candidate.label) && candidate.label > 0 && candidate.label !== n)
        .map((candidate) => ({ n: candidate.label, confidence: clamp01(candidate.confidence) }));
    candidates.sort((a, b) => b.confidence - a.confidence || a.n - b.n);
    return {
        kind: 'label',
        imageId: image.imageId,
        algo: types_1.THREE_FACTOR_ALGO,
        algoVersion: types_1.THREE_FACTOR_ALGO_VERSION,
        detId: badge.detId,
        n,
        confidence: clamp01(selected?.confidence ?? badge.confidence),
        ...(candidates.length ? { candidates } : {})
    };
}
function associationEmission(image, fromDetId, toDetId, relation, confidence) {
    return {
        kind: 'association',
        imageId: image.imageId,
        algo: types_1.THREE_FACTOR_ALGO,
        algoVersion: types_1.THREE_FACTOR_ALGO_VERSION,
        fromDetId,
        toDetId,
        relation,
        confidence: clamp01(confidence)
    };
}
function emitMeasurementObjects(image, measurement, tees, emit) {
    for (const badge of [...measurement.badges].sort((a, b) => a.detId.localeCompare(b.detId))) {
        emit(objectEmission(image, badge.detId, 'hole-badge', badge.cxPx, badge.cyPx, badgeConfidence(badge)));
        const label = labelEmission(image, badge);
        if (label)
            emit(label);
    }
    for (const basket of [...measurement.baskets].sort((a, b) => a.detId.localeCompare(b.detId))) {
        emit(objectEmission(image, basket.detId, 'basket', basket.tipXPx, basket.tipYPx, basketConfidence(basket)));
    }
    for (const tee of [...tees].sort((a, b) => a.detId.localeCompare(b.detId))) {
        emit(objectEmission(image, tee.detId, 'tee', tee.xPx, tee.yPx, teeConfidence(tee)));
    }
}
function emitAssignmentAssociations(image, assignments, emit) {
    for (const assignment of [...assignments].sort((a, b) => a.badgeId.localeCompare(b.badgeId))) {
        const confidence = clamp01(assignment.score);
        // The endpoint points to the badge that owns the selected triple. Keeping
        // the two relations separate preserves the contract's pairwise event shape.
        emit(associationEmission(image, assignment.teeId, assignment.badgeId, 'tee-of', confidence));
        emit(associationEmission(image, assignment.basketId, assignment.badgeId, 'basket-of', confidence));
    }
}
function emitThreeFactorRun(image, run, emit) {
    // stamp paramsHash on every emission when the run carries one
    const stamped = run.paramsHash
        ? (emission) => emit({ ...emission, paramsHash: run.paramsHash })
        : emit;
    emitMeasurementObjects(image, run.measurement, run.assignment.tees, stamped);
    emitAssignmentAssociations(image, run.assignment.assignments, stamped);
}
function createThreeFactorDetector(params = {}) {
    return async (image, emit) => {
        const run = runThreeFactor(image, params);
        emitThreeFactorRun(image, run, emit);
    };
}
exports.threeFactorDetector = createThreeFactorDetector();
exports.default = exports.threeFactorDetector;
//# sourceMappingURL=index.js.map