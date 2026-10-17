"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.S3_FIND_PX_TICK = exports.S3_FIND_FAMILY_TICK = exports.S3_DETECT_RINGS_TICK = exports.selectTeeFamily = exports.TeePxC = exports.TeeFn = exports.Tee = void 0;
exports.materializeS3Subtraction = materializeS3Subtraction;
exports.executeS3VisibleTees = executeS3VisibleTees;
const hash_1 = require("../../../detectors/threeFactor/hash");
const types_1 = require("../../../detectors/threeFactor/features/types");
const gateway_1 = require("../../../exec/gateway");
const pcr_1 = require("../../../exec/pcr");
const sha256_1 = require("../../../exec/sha256");
const sink_1 = require("../../../exec/sink");
const Badge_1 = require("../../S1/clean/Badge");
const componentPxC_1 = require("../../componentPxC");
const Tee_1 = require("./Tee");
var Tee_2 = require("./Tee");
Object.defineProperty(exports, "Tee", { enumerable: true, get: function () { return Tee_2.Tee; } });
Object.defineProperty(exports, "TeeFn", { enumerable: true, get: function () { return Tee_2.TeeFn; } });
Object.defineProperty(exports, "TeePxC", { enumerable: true, get: function () { return Tee_2.TeePxC; } });
Object.defineProperty(exports, "selectTeeFamily", { enumerable: true, get: function () { return Tee_2.selectTeeFamily; } });
exports.S3_DETECT_RINGS_TICK = {
    id: 'Tee.detectRings',
    kind: 'measure',
    gate: 'S3',
    unit: 'Tee',
    consumes: [componentPxC_1.ComponentPxC.fields.address, Badge_1.BadgePxC.objects.address],
    produces: [Tee_1.TeePxC.rings.address],
    calculations: [Tee_1.TeeFn.detectRings.address],
    accessConformance: 'exact',
    note: 'Find enclosed holes, retain elongated rings, and exclude centers muted by prior Badge objects.'
};
exports.S3_FIND_FAMILY_TICK = {
    id: 'Tee.findFamily',
    kind: 'compute',
    gate: 'S3',
    unit: 'Tee',
    consumes: [Tee_1.TeePxC.rings.address, componentPxC_1.ComponentPxC.fields.address],
    produces: [Tee_1.TeePxC.family.address],
    calculations: [Tee_1.TeeFn.findFamily.address],
    accessConformance: 'exact',
    note: 'Pair rings with enclosing bright components and select the common major/minor/area family.'
};
exports.S3_FIND_PX_TICK = {
    id: 'Tee.findPx',
    kind: 'transform',
    gate: 'S3',
    unit: 'Tee',
    consumes: [Tee_1.TeePxC.family.address, componentPxC_1.ComponentPxC.fields.address],
    produces: [Tee_1.TeePxC.objects.address],
    calculations: [Tee_1.TeeFn.findPx.address],
    accessConformance: 'exact',
    note: 'Construct visible Tee objects from exact accepted bright-component pixels.'
};
const S3_OPS = [exports.S3_DETECT_RINGS_TICK, exports.S3_FIND_FAMILY_TICK, exports.S3_FIND_PX_TICK];
const S3_PLAN = {
    ops: S3_OPS,
    bindings: {},
    planFingerprint: (0, sha256_1.sha256HexSyncText)((0, hash_1.canonicalJson)({ clean: 'S3-visible-tees', ops: S3_OPS }))
};
function detectRings(pxc) {
    pxc.set(Tee_1.TeePxC.rings, Tee_1.Tee.detectRings(pxc));
}
function findFamily(pxc) {
    pxc.set(Tee_1.TeePxC.family, Tee_1.Tee.findFamily(pxc));
}
function findPx(pxc) {
    pxc.set(Tee_1.TeePxC.objects, Tee_1.Tee.findPx(pxc));
}
const S3_RUNTIME = {
    implementations: new Map([
        [exports.S3_DETECT_RINGS_TICK.id, detectRings],
        [exports.S3_FIND_FAMILY_TICK.id, findFamily],
        [exports.S3_FIND_PX_TICK.id, findPx]
    ]),
    calculationBindings: new Map([
        [exports.S3_DETECT_RINGS_TICK.id, [{ address: Tee_1.TeeFn.detectRings.address, calculate: Tee_1.Tee.detectRings }]],
        [exports.S3_FIND_FAMILY_TICK.id, [{ address: Tee_1.TeeFn.findFamily.address, calculate: Tee_1.Tee.findFamily }]],
        [exports.S3_FIND_PX_TICK.id, [{ address: Tee_1.TeeFn.findPx.address, calculate: Tee_1.Tee.findPx }]]
    ])
};
function materializeS3Subtraction(image, tees) {
    const px = new Set();
    let visits = 0;
    for (const tee of tees)
        for (const pixel of tee.px) {
            visits++;
            px.add(pixel);
        }
    const rgba = new Uint8ClampedArray(image.rgba);
    for (const pixel of px)
        rgba[pixel * 4 + 3] = 0;
    let remainingOpaquePx = 0;
    for (let pixel = 0; pixel < image.widthPx * image.heightPx; pixel++)
        if (rgba[pixel * 4 + 3] !== 0)
            remainingOpaquePx++;
    return {
        widthPx: image.widthPx,
        heightPx: image.heightPx,
        rgba,
        teePx: px.size,
        overlapPx: visits - px.size,
        remainingOpaquePx
    };
}
function executeS3VisibleTees(pxc) {
    if (!pxc.has(componentPxC_1.ComponentPxC.fields))
        throw new Error(`S3 requires PxC address '${componentPxC_1.ComponentPxC.fields.address}'.`);
    if (!pxc.has(Badge_1.BadgePxC.objects))
        throw new Error(`S3 requires PxC address '${Badge_1.BadgePxC.objects.address}'.`);
    (0, Tee_1.registerTee)(pxc);
    const testimonies = (0, gateway_1.executeCompiledPlan)(S3_PLAN, pxc, types_1.nullFeatureContext, (0, sink_1.createMemorySink)(), S3_RUNTIME);
    const pcr = (0, pcr_1.composePcr)({
        id: 'S3.visible-tees',
        title: 'Hollow rings → visible Tee objects',
        tickIds: S3_PLAN.ops.map((operation) => operation.id)
    }, S3_PLAN, testimonies);
    return {
        pxc,
        image: pxc.get(componentPxC_1.ComponentPxC.image),
        rings: pxc.get(Tee_1.TeePxC.rings),
        family: pxc.get(Tee_1.TeePxC.family),
        tees: pxc.get(Tee_1.TeePxC.objects),
        plan: S3_PLAN,
        testimonies,
        pcr
    };
}
//# sourceMappingURL=index.js.map