"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stageContract = void 0;
exports.renderS4 = renderS4;
const hash_1 = require("../../../../detectors/threeFactor/hash");
const types_1 = require("../../../../detectors/threeFactor/features/types");
const gateway_1 = require("../../../../exec/gateway");
const board_1 = require("../../../../exec/board");
const pcr_1 = require("../../../../exec/pcr");
const sha256_1 = require("../../../../exec/sha256");
const sink_1 = require("../../../../exec/sink");
const componentPxC_1 = require("../../../componentPxC");
const Tee_1 = require("../../../S3/clean/Tee");
const Badge_1 = require("../../../S1/clean/Badge");
const index_1 = require("./index");
const measureFn = (0, board_1.pxFn)('fn.S4.exp.axisLocal.measurePairs');
const judgeFn = (0, board_1.pxFn)('fn.S4.exp.axisLocal.judgePairs');
const ops = [
    { id: 'S4.axisLocal.measure', kind: 'measure', gate: 'S4', unit: 'TeeBadge',
        consumes: [Tee_1.TeePxC.objects.address, Badge_1.BadgePxC.objects.address], produces: [index_1.S4PxC.pairs.address],
        calculations: [measureFn.address], accessConformance: 'exact' },
    { id: 'S4.axisLocal.judge', kind: 'decide', gate: 'S4', unit: 'TeeBadge',
        consumes: [index_1.S4PxC.pairs.address, Tee_1.TeePxC.objects.address], produces: [index_1.S4PxC.state.address],
        calculations: [judgeFn.address], accessConformance: 'exact' }
];
const plan = { ops, bindings: {},
    planFingerprint: (0, sha256_1.sha256HexSyncText)((0, hash_1.canonicalJson)({ experiment: 'S4/axis-local', ops })) };
const runtime = {
    implementations: new Map([
        [ops[0].id, pxc => pxc.set(index_1.S4PxC.pairs, (0, index_1.measurePairs)(pxc.get(Tee_1.TeePxC.objects), pxc.get(Badge_1.BadgePxC.objects)))],
        [ops[1].id, pxc => pxc.set(index_1.S4PxC.state, (0, index_1.judgePairs)(pxc.get(index_1.S4PxC.pairs), pxc.get(Tee_1.TeePxC.objects)))]
    ]),
    calculationBindings: new Map([
        [ops[0].id, [{ address: measureFn.address, calculate: index_1.measurePairs }]],
        [ops[1].id, [{ address: judgeFn.address, calculate: index_1.judgePairs }]]
    ])
};
/** Projection uses retained state only, never reruns measurement or judgment. */
function renderS4(pxc) {
    const image = pxc.get(componentPxC_1.ComponentPxC.image), state = pxc.get(index_1.S4PxC.state), tees = pxc.get(Tee_1.TeePxC.objects);
    const rgba = new Uint8ClampedArray(image.rgba);
    const dot = (x, y, color) => {
        x = Math.round(x);
        y = Math.round(y);
        if (x >= 0 && y >= 0 && x < image.widthPx && y < image.heightPx)
            rgba.set(color, (y * image.widthPx + x) * 4);
    };
    for (const r of state.resolutions) {
        const n = Math.ceil(r.distancePx);
        for (let i = 0; i <= n; i++) {
            const t = i / Math.max(n, 1);
            const x = r.center[0] + t * (r.badgeCenter[0] - r.center[0]);
            const y = r.center[1] + t * (r.badgeCenter[1] - r.center[1]);
            dot(x, y, [0, 220, 110, 255]);
            dot(x + 1, y, [0, 220, 110, 255]);
        }
        for (const pixel of r.ownedPx)
            rgba.set([0, 240, 160, 255], pixel * 4);
    }
    return [{ label: 'S4 local Tee to Badge rays', widthPx: image.widthPx, heightPx: image.heightPx, rgba,
            boxes: state.unresolvedTees.map(index => ({ bbox: tees[index].bbox, color: [255, 80, 80, 255] })) }];
}
exports.stageContract = {
    id: 'S4', async execute(context) {
        if (!context.pxc)
            throw new Error('S4/axis-local needs restored S3 PxC.');
        const pxc = context.pxc;
        const testimony = (0, gateway_1.executeCompiledPlan)(plan, pxc, types_1.nullFeatureContext, (0, sink_1.createMemorySink)(), runtime);
        pxc.set(index_1.S4PxC.pcr, (0, pcr_1.composePcr)({ id: 'S4.exp.axis-local', title: 'Visible Tee to Badge local resolution',
            tickIds: ops.map(op => op.id) }, plan, testimony));
        const state = pxc.get(index_1.S4PxC.state);
        return { pxc, panels: renderS4(pxc), receiptText: [
                'S4 EXPERIMENT: axis-local', `local resolutions: ${state.resolutions.length}`,
                `unresolved holes: ${state.unresolvedHoles.join(',')}`, state.assumption,
                'recovery: NOT RUN; no inferred pixels; no global Basket assignment; not frozen'
            ].join('\n') };
    }
};
//# sourceMappingURL=contract.js.map