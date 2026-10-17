"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stageContract = void 0;
const hash_1 = require("../../../../detectors/threeFactor/hash");
const types_1 = require("../../../../detectors/threeFactor/features/types");
const gateway_1 = require("../../../../exec/gateway");
const pcr_1 = require("../../../../exec/pcr");
const sha256_1 = require("../../../../exec/sha256");
const sink_1 = require("../../../../exec/sink");
const componentPxC_1 = require("../../../componentPxC");
const Tee_1 = require("../../../S3/clean/Tee");
const Badge_1 = require("../../../S1/clean/Badge");
const Basket_1 = require("../../../S2/clean/Basket");
const axis_local_1 = require("../axis-local");
const contract_1 = require("../axis-local/contract");
const index_1 = require("./index");
const ops = [
    { id: 'S4.openFrame.measure', kind: 'measure', gate: 'S4', unit: 'TeeBorder',
        consumes: [componentPxC_1.ComponentPxC.fields.address, Badge_1.BadgePxC.objects.address, Basket_1.BasketPxC.objects.address, Tee_1.TeePxC.objects.address],
        produces: [index_1.OpenFramePxC.candidates.address, index_1.OpenFramePxC.measures.address],
        calculations: ['fn.S4.findOpenFrames'], accessConformance: 'exact' },
    { id: 'S4.openFrame.resolve', kind: 'decide', gate: 'S4', unit: 'TeeBorder',
        consumes: [axis_local_1.S4PxC.state.address, index_1.OpenFramePxC.candidates.address, Badge_1.BadgePxC.objects.address, Tee_1.TeePxC.objects.address],
        produces: [axis_local_1.S4PxC.state.address], calculations: ['fn.S4.resolveOpenFrames'], accessConformance: 'exact' }
];
const plan = { ops, bindings: {}, planFingerprint: (0, sha256_1.sha256HexSyncText)((0, hash_1.canonicalJson)({ experiment: 'S4/open-frame', ops })) };
const runtime = {
    implementations: new Map([
        [ops[0].id, pxc => {
                const result = (0, index_1.findOpenFrames)(pxc.get(componentPxC_1.ComponentPxC.fields), pxc.get(Badge_1.BadgePxC.objects), pxc.get(Basket_1.BasketPxC.objects), pxc.get(Tee_1.TeePxC.objects));
                pxc.set(index_1.OpenFramePxC.candidates, result.candidates);
                pxc.set(index_1.OpenFramePxC.measures, result.tested);
            }],
        [ops[1].id, pxc => pxc.set(axis_local_1.S4PxC.state, (0, index_1.resolveOpenFrames)(pxc.get(axis_local_1.S4PxC.state), pxc.get(index_1.OpenFramePxC.candidates), pxc.get(Badge_1.BadgePxC.objects), pxc.get(Tee_1.TeePxC.objects).length))]
    ]),
    calculationBindings: new Map([
        [ops[0].id, [{ address: 'fn.S4.findOpenFrames', calculate: index_1.findOpenFrames }]],
        [ops[1].id, [{ address: 'fn.S4.resolveOpenFrames', calculate: index_1.resolveOpenFrames }]]
    ])
};
exports.stageContract = { id: 'S4', async execute(context) {
        await contract_1.stageContract.execute(context);
        const pxc = context.pxc;
        const initial = pxc.get(axis_local_1.S4PxC.pcr);
        pxc.set('px.s4.basePcr', initial);
        const testimony = (0, gateway_1.executeCompiledPlan)(plan, pxc, types_1.nullFeatureContext, (0, sink_1.createMemorySink)(), runtime);
        pxc.set(axis_local_1.S4PxC.pcr, (0, pcr_1.composePcr)({ id: 'S4.exp.open-frame', title: 'Composed open-border recovery', tickIds: ops.map(op => op.id) }, plan, testimony));
        const state = pxc.get(axis_local_1.S4PxC.state);
        const image = pxc.get(componentPxC_1.ComponentPxC.image);
        return { pxc, receiptText: ['S4 EXPERIMENT open-frame', `resolutions: ${state.resolutions.length}`,
                `unresolved: ${state.unresolvedHoles.join(',')}`, 'No frozen changes; visible S3 debt is retained, not declared solved.'].join('\n'),
            panels: [...(0, contract_1.renderS4)(pxc), { label: 'Composed open frame candidates', widthPx: image.widthPx, heightPx: image.heightPx, rgba: image.rgba,
                    boxes: pxc.get(index_1.OpenFramePxC.candidates).map(c => ({ bbox: c.bbox, color: [255, 180, 40, 255] })) }] };
    } };
//# sourceMappingURL=contract.js.map