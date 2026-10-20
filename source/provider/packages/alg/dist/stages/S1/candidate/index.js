"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.S1_BADGE_OBJECTS_TICK = exports.S1_BADGE_RECOVERY_TICK = exports.S1_COMPONENT_SUBSTRATE_TICK = exports.S1_BADGE_FAMILY_TICK = exports.S1_ACCEPT_CROPPED_IMAGE_TICK = exports.BadgePxC = exports.BadgeFn = exports.Badge = void 0;
exports.materializeS1Subtractions = materializeS1Subtractions;
exports.executeS1BadgesCandidate = executeS1BadgesCandidate;
const threeFactor_1 = require("../../../detectors/threeFactor");
const g1_badges_1 = require("../../../detectors/threeFactor/features/g1.badges");
const types_1 = require("../../../detectors/threeFactor/features/types");
const compile_1 = require("../../../exec/compile");
const gateway_1 = require("../../../exec/gateway");
const operations_1 = require("../../../exec/operations");
const pcr_1 = require("../../../exec/pcr");
const sha256_1 = require("../../../exec/sha256");
const sink_1 = require("../../../exec/sink");
const clean_1 = require("../../S0/clean");
const Badge_1 = require("./Badge");
var Badge_2 = require("./Badge");
Object.defineProperty(exports, "Badge", { enumerable: true, get: function () { return Badge_2.Badge; } });
Object.defineProperty(exports, "BadgeFn", { enumerable: true, get: function () { return Badge_2.BadgeFn; } });
Object.defineProperty(exports, "BadgePxC", { enumerable: true, get: function () { return Badge_2.BadgePxC; } });
const LEGACY = {
    localImage: 'localImage',
    viewport: 'viewport',
    masks: 'badgeStage.masks',
    components: 'badgeStage.components',
    reads: 'badges',
    stage: 'stage'
};
exports.S1_ACCEPT_CROPPED_IMAGE_TICK = {
    id: 'badges.acceptCroppedImage',
    kind: 'transform',
    gate: 'G1',
    unit: 'Badge',
    consumes: [clean_1.S0_CROPPED_IMAGE_ADDRESS],
    produces: [LEGACY.localImage, LEGACY.viewport, Badge_1.BadgePxC.image.address],
    calculations: ['fn.acceptCroppedImage'],
    accessConformance: 'exact',
    note: 'Expose S0 CroppedImage to the inherited mask/component substrate without another decode.'
};
exports.S1_BADGE_FAMILY_TICK = {
    id: 'Badge.detectFamily',
    kind: 'compute',
    gate: 'G1',
    unit: 'Badge',
    consumes: [Badge_1.BadgePxC.image.address, Badge_1.BadgePxC.masks.address, Badge_1.BadgePxC.components.address],
    produces: [Badge_1.BadgePxC.family.address],
    calculations: [Badge_1.BadgeFn.detectFamily.address],
    accessConformance: 'exact',
    note: 'Badge queries shared bright/dark components and selects its current family.'
};
exports.S1_COMPONENT_SUBSTRATE_TICK = {
    id: 'components.publish',
    kind: 'transform',
    gate: 'G1',
    unit: 'components',
    consumes: [LEGACY.masks, LEGACY.components],
    produces: [Badge_1.BadgePxC.masks.address, Badge_1.BadgePxC.components.address],
    calculations: ['fn.publishComponents'],
    accessConformance: 'exact',
    note: 'Publish inherited mask/component results once as generic typed PxC values.'
};
exports.S1_BADGE_RECOVERY_TICK = {
    id: 'Badge.recover',
    kind: 'decide',
    gate: 'G1',
    unit: 'Badge',
    consumes: [
        Badge_1.BadgePxC.image.address,
        Badge_1.BadgePxC.masks.address,
        Badge_1.BadgePxC.components.address,
        Badge_1.BadgePxC.family.address
    ],
    produces: [Badge_1.BadgePxC.stage.address, LEGACY.stage],
    calculations: [Badge_1.BadgeFn.recover.address],
    accessConformance: 'exact',
    note: 'Badge performs dark-plate recovery and exposes the transitional shape required by digit reading.'
};
exports.S1_BADGE_OBJECTS_TICK = {
    id: 'Badge.findPx',
    kind: 'transform',
    gate: 'G1',
    unit: 'Badge',
    consumes: [Badge_1.BadgePxC.stage.address, Badge_1.BadgePxC.components.address, LEGACY.reads],
    produces: [Badge_1.BadgePxC.objects.address],
    calculations: [Badge_1.BadgeFn.findPx.address, Badge_1.BadgeFn.mute.address],
    accessConformance: 'exact',
    note: 'Construct Badge objects whose has map names the operations and component parts that define them.'
};
const resolved = (0, threeFactor_1.resolveConfig)({
    schema: 'threeFactor-config@1',
    name: 'S1-badges-candidate',
    execution: ['badgeStage', 'badges']
}, threeFactor_1.DEFAULT_EXECUTION);
const paramsHash = (0, sha256_1.sha256HexSyncText)((0, threeFactor_1.canonicalJson)(resolved));
const inherited = (0, compile_1.compileExecutionPlan)(resolved, paramsHash);
function inheritedTick(id) {
    const tick = inherited.ops.find((operation) => operation.id === id);
    if (!tick)
        throw new Error(`S1: inherited operation '${id}' is unavailable.`);
    return tick;
}
const S1_OPS = [
    exports.S1_ACCEPT_CROPPED_IMAGE_TICK,
    inheritedTick('badgeStage.masks'),
    inheritedTick('badgeStage.components'),
    exports.S1_COMPONENT_SUBSTRATE_TICK,
    exports.S1_BADGE_FAMILY_TICK,
    exports.S1_BADGE_RECOVERY_TICK,
    inheritedTick('badges'),
    exports.S1_BADGE_OBJECTS_TICK
];
const S1_PLAN = {
    ...inherited,
    ops: S1_OPS,
    planFingerprint: (0, sha256_1.sha256HexSyncText)((0, threeFactor_1.canonicalJson)({ candidate: 'S1-badges', base: inherited.planFingerprint, ops: S1_OPS }))
};
function acceptCroppedImage(pxc) {
    const cropped = pxc.get(clean_1.S0_CROPPED_IMAGE_ADDRESS);
    const localImage = {
        width: cropped.widthPx,
        height: cropped.heightPx,
        data: cropped.rgba
    };
    pxc.set(LEGACY.localImage, localImage);
    pxc.set(LEGACY.viewport, { topPx: 0, bottomPx: cropped.heightPx });
    pxc.set(Badge_1.BadgePxC.image, cropped);
}
function publishComponents(pxc) {
    pxc.set(Badge_1.BadgePxC.masks, pxc.get(LEGACY.masks));
    pxc.set(Badge_1.BadgePxC.components, pxc.get(LEGACY.components));
}
function detectFamily(pxc, ctx) {
    const knobs = ctx.resolve(g1_badges_1.g1BadgesFeature).knobs;
    pxc.set(Badge_1.BadgePxC.family, Badge_1.Badge.detectFamily(pxc, knobs));
}
function recover(pxc, ctx) {
    const knobs = ctx.resolve(g1_badges_1.g1BadgesFeature).knobs;
    const stage = Badge_1.Badge.recover(pxc, knobs);
    pxc.set(Badge_1.BadgePxC.stage, stage);
    pxc.set(LEGACY.stage, stage);
}
function constructBadges(pxc) {
    const reads = pxc.get(LEGACY.reads);
    pxc.set(Badge_1.BadgePxC.objects, reads.map((read) => Badge_1.Badge.fromRead(pxc, read)));
}
const S1_RUNTIME = {
    implementations: new Map([
        ...operations_1.operationImpls,
        [exports.S1_ACCEPT_CROPPED_IMAGE_TICK.id, acceptCroppedImage],
        [exports.S1_COMPONENT_SUBSTRATE_TICK.id, publishComponents],
        [exports.S1_BADGE_FAMILY_TICK.id, detectFamily],
        [exports.S1_BADGE_RECOVERY_TICK.id, recover],
        [exports.S1_BADGE_OBJECTS_TICK.id, constructBadges]
    ]),
    calculationBindings: new Map([
        ...operations_1.operationCalculationBindings,
        [
            exports.S1_ACCEPT_CROPPED_IMAGE_TICK.id,
            [{ address: 'fn.acceptCroppedImage', calculate: acceptCroppedImage }]
        ],
        [
            exports.S1_COMPONENT_SUBSTRATE_TICK.id,
            [{ address: 'fn.publishComponents', calculate: publishComponents }]
        ],
        [
            exports.S1_BADGE_FAMILY_TICK.id,
            [{ address: Badge_1.BadgeFn.detectFamily.address, calculate: Badge_1.Badge.detectFamily }]
        ],
        [exports.S1_BADGE_RECOVERY_TICK.id, [{ address: Badge_1.BadgeFn.recover.address, calculate: Badge_1.Badge.recover }]],
        [
            exports.S1_BADGE_OBJECTS_TICK.id,
            [
                { address: Badge_1.BadgeFn.findPx.address, calculate: Badge_1.Badge.fromRead },
                { address: Badge_1.BadgeFn.mute.address, calculate: Badge_1.Badge.fromRead }
            ]
        ]
    ]),
    artifactExtractors: operations_1.ARTIFACT_EXTRACTORS
};
function subtract(image, parts) {
    // Distinct pixels counted with a byte mark (a Set only for any pixel past
    // the raster, where the typed alpha write is a no-op either way).
    const rgba = new Uint8ClampedArray(image.rgba);
    const pixels = image.widthPx * image.heightPx;
    const writable = rgba.length >> 2;
    const mark = new Uint8Array(writable);
    const offRaster = new Set();
    let visits = 0;
    let mutedPx = 0;
    for (const part of parts)
        for (let k = 0; k < part.length; k++) {
            const pixel = part[k];
            visits++;
            if (pixel < writable) {
                if (mark[pixel])
                    continue;
                mark[pixel] = 1;
                mutedPx++;
                rgba[pixel * 4 + 3] = 0;
            }
            else
                offRaster.add(pixel);
        }
    mutedPx += offRaster.size;
    let remainingOpaquePx = 0;
    for (let pixel = 0; pixel < pixels; pixel++)
        if (rgba[pixel * 4 + 3] !== 0)
            remainingOpaquePx++;
    return {
        widthPx: image.widthPx,
        heightPx: image.heightPx,
        rgba,
        badgePx: 0,
        addedMutePx: 0,
        mutedPx,
        overlapPx: visits - mutedPx,
        remainingOpaquePx
    };
}
/** Materializer-only alpha subtraction; neither raster is written back to PxC. */
function materializeS1Subtractions(run) {
    const core = new Set();
    for (const badge of run.badges)
        for (const pixel of badge.px)
            core.add(pixel);
    const badgePx = subtract(run.croppedImage, run.badges.map((badge) => badge.px));
    const muted = subtract(run.croppedImage, run.badges.map((badge) => badge.has.mute.px));
    return {
        badgePx: { ...badgePx, badgePx: core.size },
        muted: { ...muted, badgePx: core.size, addedMutePx: muted.mutedPx - core.size }
    };
}
function executeS1BadgesCandidate(pxc) {
    if (!pxc.has(clean_1.S0_CROPPED_IMAGE_ADDRESS))
        throw new Error(`S1 requires PxC address '${clean_1.S0_CROPPED_IMAGE_ADDRESS}'.`);
    (0, Badge_1.registerBadge)(pxc);
    const sink = (0, sink_1.createMemorySink)();
    const testimonies = (0, gateway_1.executeCompiledPlan)(S1_PLAN, pxc, types_1.nullFeatureContext, sink, S1_RUNTIME);
    const pcr = (0, pcr_1.composePcr)({
        id: 'S1.badges-candidate',
        title: 'CroppedImage → Badge objects',
        tickIds: S1_PLAN.ops.map((operation) => operation.id)
    }, S1_PLAN, testimonies);
    return {
        pxc,
        croppedImage: pxc.get(Badge_1.BadgePxC.image),
        masks: pxc.get(Badge_1.BadgePxC.masks),
        components: pxc.get(Badge_1.BadgePxC.components),
        family: pxc.get(Badge_1.BadgePxC.family),
        stage: pxc.get(Badge_1.BadgePxC.stage),
        badges: pxc.get(Badge_1.BadgePxC.objects),
        plan: S1_PLAN,
        testimonies,
        pcr
    };
}
//# sourceMappingURL=index.js.map