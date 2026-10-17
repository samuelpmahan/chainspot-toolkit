"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.labEndpointDetector = exports.LAB_ENDPOINT_ALGO_VERSION = exports.LAB_ENDPOINT_ALGO = void 0;
const basket_sprite_json_1 = __importDefault(require("./assets/basket-sprite.json"));
const logistic_json_1 = __importDefault(require("./assets/logistic.json"));
const badgeStage_1 = require("./badgeStage");
const endpoints_1 = require("./endpoints");
const logisticInference_1 = require("./digits/logisticInference");
const readBadges_1 = require("./digits/readBadges");
const screenChrome_1 = require("./screenChrome");
exports.LAB_ENDPOINT_ALGO = 'lab-quick-endpoints';
exports.LAB_ENDPOINT_ALGO_VERSION = '1.0.0';
const basketTemplate = (0, endpoints_1.prepareSpriteTemplate)(basket_sprite_json_1.default);
const logisticModel = logistic_json_1.default;
const digitScorer = {
    name: 'nuthing-p2-logistic',
    scores: (mask) => (0, logisticInference_1.predictProbs)(logisticModel, mask)
};
function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}
function badgeDarkFraction(badge, dark) {
    let count = 0;
    for (let y = badge.bboxY; y < badge.bboxY + badge.bboxH; y++) {
        const row = y * dark.width;
        for (let x = badge.bboxX; x < badge.bboxX + badge.bboxW; x++)
            count += dark.data[row + x];
    }
    return count / Math.max(1, badge.bboxW * badge.bboxH);
}
function labelCandidates(reading) {
    if (reading.digits.length === 0)
        return [];
    const raw = Array.from({ length: 18 }, (_, index) => index + 1)
        .filter((n) => String(n).length === reading.digits.length)
        .map((n) => {
        const confidence = [...String(n)].reduce((product, digit, index) => product * (reading.digits[index]?.scores[Number(digit)] ?? 0), 1);
        return { n, confidence };
    })
        .sort((a, b) => b.confidence - a.confidence || a.n - b.n);
    const total = raw.reduce((sum, candidate) => sum + candidate.confidence, 0);
    return raw.map((candidate) => ({
        n: candidate.n,
        confidence: total > 0 ? candidate.confidence / total : 0
    }));
}
function emitObject(emit, image, detId, objType, xPx, yPx, confidence) {
    emit({
        kind: 'object',
        imageId: image.imageId,
        detId,
        objType,
        xPx,
        yPx,
        confidence: clamp01(confidence),
        algo: exports.LAB_ENDPOINT_ALGO,
        algoVersion: exports.LAB_ENDPOINT_ALGO_VERSION
    });
}
/**
 * LAB's fast mask/component endpoint pass behind the app's Detector contract.
 * It emits object observations and badge-label readings. Ownership association
 * is intentionally a later Detector pass over these stable detIds.
 */
const labEndpointDetector = async (image, emit) => {
    if (image.widthPx <= 0 || image.heightPx <= 0)
        throw new Error('Detector image dimensions must be positive.');
    if (image.rgba.length !== image.widthPx * image.heightPx * 4) {
        throw new Error('Detector RGBA byte length does not match image dimensions.');
    }
    const stage = (0, badgeStage_1.runBadgeStage)({ width: image.widthPx, height: image.heightPx, data: image.rgba });
    const badgeIds = stage.badges.map((badge, index) => {
        const detId = `badge-${index}`;
        emitObject(emit, image, detId, 'hole-badge', badge.cx, badge.cy, badgeDarkFraction(badge, stage.darkMask));
        return detId;
    });
    for (const [index, reading] of (0, readBadges_1.readCourseBadges)(stage, digitScorer).entries()) {
        const candidates = labelCandidates(reading);
        const best = candidates[0];
        if (!best)
            continue;
        emit({
            kind: 'label',
            imageId: image.imageId,
            detId: badgeIds[index],
            n: best.n,
            confidence: best.confidence,
            candidates: candidates.slice(1, 4),
            algo: exports.LAB_ENDPOINT_ALGO,
            algoVersion: exports.LAB_ENDPOINT_ALGO_VERSION
        });
    }
    const sprites = (0, endpoints_1.matchBasketSprites)(stage.brightMask, basketTemplate);
    for (const [index, sprite] of sprites.entries()) {
        emitObject(emit, image, `basket-${index}`, 'basket', sprite.tipX, sprite.tipY, sprite.score);
    }
    const chromeRegions = (0, screenChrome_1.detectScreenChromeRegions)(stage.brightComponents, image.widthPx, image.heightPx);
    const insideBadge = (x, y) => stage.badges.some((badge) => x >= badge.bboxX - 3 &&
        x <= badge.bboxX + badge.bboxW + 3 &&
        y >= badge.bboxY - 3 &&
        y <= badge.bboxY + badge.bboxH + 3);
    const attributedToChrome = (x, y) => (0, screenChrome_1.pointInScreenChrome)(x, y, chromeRegions);
    const rings = (0, endpoints_1.detectTeeRings)(stage.brightMask).filter((ring) => !insideBadge(ring.cx, ring.cy) && !attributedToChrome(ring.cx, ring.cy));
    const badgeLabels = new Set(stage.badges.map((badge) => badge.label));
    const teeComponents = stage.brightComponents.filter((component) => !badgeLabels.has(component.label) &&
        !insideBadge(component.cx, component.cy) &&
        !attributedToChrome(component.cx, component.cy));
    const tees = (0, endpoints_1.collectTeePoints)(rings, teeComponents, sprites);
    for (const [index, tee] of tees.entries()) {
        emitObject(emit, image, `tee-${index}`, 'tee', tee.cx, tee.cy, tee.ring?.ringFrac ?? 0.5);
    }
};
exports.labEndpointDetector = labEndpointDetector;
//# sourceMappingURL=index.js.map