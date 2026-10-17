"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.S2_FIND_PX_TICK = exports.S2_FIND_SHELL_FAMILY_TICK = exports.S2_DETECT_FAMILY_TICK = exports.BasketPxC = exports.BasketFn = exports.Basket = void 0;
exports.materializeS2Subtraction = materializeS2Subtraction;
exports.executeS2BasketsCandidate = executeS2BasketsCandidate;
const hash_1 = require("../../../detectors/threeFactor/hash");
const types_1 = require("../../../detectors/threeFactor/features/types");
const gateway_1 = require("../../../exec/gateway");
const pcr_1 = require("../../../exec/pcr");
const sha256_1 = require("../../../exec/sha256");
const sink_1 = require("../../../exec/sink");
const componentPxC_1 = require("../../componentPxC");
const Basket_1 = require("./Basket");
var Basket_2 = require("./Basket");
Object.defineProperty(exports, "Basket", { enumerable: true, get: function () { return Basket_2.Basket; } });
Object.defineProperty(exports, "BasketFn", { enumerable: true, get: function () { return Basket_2.BasketFn; } });
Object.defineProperty(exports, "BasketPxC", { enumerable: true, get: function () { return Basket_2.BasketPxC; } });
exports.S2_DETECT_FAMILY_TICK = {
    id: 'Basket.detectFamily',
    kind: 'compute',
    gate: 'S2',
    unit: 'Basket',
    consumes: [componentPxC_1.ComponentPxC.fields.address],
    produces: [Basket_1.BasketPxC.family.address],
    calculations: [Basket_1.BasketFn.detectFamily.address],
    accessConformance: 'exact',
    note: 'Basket queries generic bright components for the current white-body family.'
};
exports.S2_FIND_SHELL_FAMILY_TICK = {
    id: 'Basket.findShellFamily',
    kind: 'compute',
    gate: 'S2',
    unit: 'Basket',
    consumes: [Basket_1.BasketPxC.family.address, componentPxC_1.ComponentPxC.fields.address],
    produces: [Basket_1.BasketPxC.shellFamily.address],
    calculations: [Basket_1.BasketFn.findShellFamily.address],
    accessConformance: 'exact',
    note: 'Find the common smallest-enclosing dark-component perimeter and reject nonmembers.'
};
exports.S2_FIND_PX_TICK = {
    id: 'Basket.findPx',
    kind: 'transform',
    gate: 'S2',
    unit: 'Basket',
    consumes: [Basket_1.BasketPxC.shellFamily.address, componentPxC_1.ComponentPxC.fields.address],
    produces: [Basket_1.BasketPxC.objects.address],
    calculations: [Basket_1.BasketFn.findPx.address],
    accessConformance: 'exact',
    note: 'Construct Basket objects from exact bright-body and dark-shell component pixels.'
};
const S2_OPS = [exports.S2_DETECT_FAMILY_TICK, exports.S2_FIND_SHELL_FAMILY_TICK, exports.S2_FIND_PX_TICK];
const S2_PLAN = {
    ops: S2_OPS,
    bindings: {},
    planFingerprint: (0, sha256_1.sha256HexSyncText)((0, hash_1.canonicalJson)({ candidate: 'S2-baskets', ops: S2_OPS }))
};
function detectFamily(pxc) {
    pxc.set(Basket_1.BasketPxC.family, Basket_1.Basket.detectFamily(pxc));
}
function findShellFamily(pxc) {
    pxc.set(Basket_1.BasketPxC.shellFamily, Basket_1.Basket.findShellFamily(pxc));
}
function findPx(pxc) {
    pxc.set(Basket_1.BasketPxC.objects, Basket_1.Basket.findPx(pxc));
}
const S2_RUNTIME = {
    implementations: new Map([
        [exports.S2_DETECT_FAMILY_TICK.id, detectFamily],
        [exports.S2_FIND_SHELL_FAMILY_TICK.id, findShellFamily],
        [exports.S2_FIND_PX_TICK.id, findPx]
    ]),
    calculationBindings: new Map([
        [
            exports.S2_DETECT_FAMILY_TICK.id,
            [{ address: Basket_1.BasketFn.detectFamily.address, calculate: Basket_1.Basket.detectFamily }]
        ],
        [
            exports.S2_FIND_SHELL_FAMILY_TICK.id,
            [{ address: Basket_1.BasketFn.findShellFamily.address, calculate: Basket_1.Basket.findShellFamily }]
        ],
        [exports.S2_FIND_PX_TICK.id, [{ address: Basket_1.BasketFn.findPx.address, calculate: Basket_1.Basket.findPx }]]
    ])
};
function materializeS2Subtraction(image, baskets) {
    const px = new Set();
    let visits = 0;
    for (const basket of baskets)
        for (const pixel of basket.px) {
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
        basketPx: px.size,
        overlapPx: visits - px.size,
        remainingOpaquePx
    };
}
function executeS2BasketsCandidate(pxc) {
    if (!pxc.has(componentPxC_1.ComponentPxC.fields))
        throw new Error(`S2 requires PxC address '${componentPxC_1.ComponentPxC.fields.address}'.`);
    (0, Basket_1.registerBasket)(pxc);
    const testimonies = (0, gateway_1.executeCompiledPlan)(S2_PLAN, pxc, types_1.nullFeatureContext, (0, sink_1.createMemorySink)(), S2_RUNTIME);
    const pcr = (0, pcr_1.composePcr)({
        id: 'S2.baskets-candidate',
        title: 'Components → Basket objects',
        tickIds: S2_PLAN.ops.map((operation) => operation.id)
    }, S2_PLAN, testimonies);
    return {
        pxc,
        image: pxc.get(componentPxC_1.ComponentPxC.image),
        family: pxc.get(Basket_1.BasketPxC.family),
        shellFamily: pxc.get(Basket_1.BasketPxC.shellFamily),
        baskets: pxc.get(Basket_1.BasketPxC.objects),
        plan: S2_PLAN,
        testimonies,
        pcr
    };
}
//# sourceMappingURL=index.js.map