"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stageContract = void 0;
const hash_1 = require("../../../../detectors/threeFactor/hash");
const types_1 = require("../../../../detectors/threeFactor/features/types");
const gateway_1 = require("../../../../exec/gateway");
const board_1 = require("../../../../exec/board");
const pcr_1 = require("../../../../exec/pcr");
const sha256_1 = require("../../../../exec/sha256");
const sink_1 = require("../../../../exec/sink");
const componentPxC_1 = require("../../../componentPxC");
const Tee_1 = require("../../clean/Tee");
const clean_1 = require("../../clean");
const index_1 = require("./index");
const selectFn = (0, board_1.pxFn)('fn.Tee.exp.fillConsistent');
const ops = [clean_1.S3_DETECT_RINGS_TICK, {
        ...clean_1.S3_FIND_FAMILY_TICK,
        id: 'Tee.exp.fillConsistent',
        calculations: [Tee_1.TeeFn.findFamily.address, selectFn.address],
        note: 'Reuse clean ring-to-frame measurement, then select using the retained experimental fill dimension.'
    }, clean_1.S3_FIND_PX_TICK];
const plan = {
    ops, bindings: {},
    planFingerprint: (0, sha256_1.sha256HexSyncText)((0, hash_1.canonicalJson)({ experiment: 'S3/fill-consistent', ops }))
};
exports.stageContract = {
    id: 'S3',
    async execute(context) {
        if (!context.pxc)
            throw new Error('S3/fill-consistent requires prior Stage PxC.');
        const pxc = context.pxc;
        (0, Tee_1.registerTee)(pxc);
        pxc.register(selectFn, index_1.selectFillConsistentTeeFamily);
        const runtime = {
            implementations: new Map([
                [ops[0].id, board => board.set(Tee_1.TeePxC.rings, Tee_1.Tee.detectRings(board))],
                [ops[1].id, board => {
                        const measured = Tee_1.Tee.findFamily(board);
                        const selected = board.call(selectFn, measured.measured);
                        board.set(Tee_1.TeePxC.family, { ...measured, ...selected });
                    }],
                [ops[2].id, board => board.set(Tee_1.TeePxC.objects, Tee_1.Tee.findPx(board))]
            ]),
            calculationBindings: new Map([
                [ops[0].id, [{ address: Tee_1.TeeFn.detectRings.address, calculate: Tee_1.Tee.detectRings }]],
                [ops[1].id, [{ address: Tee_1.TeeFn.findFamily.address, calculate: Tee_1.Tee.findFamily },
                        { address: selectFn.address, calculate: index_1.selectFillConsistentTeeFamily }]],
                [ops[2].id, [{ address: Tee_1.TeeFn.findPx.address, calculate: Tee_1.Tee.findPx }]]
            ])
        };
        const testimonies = (0, gateway_1.executeCompiledPlan)(plan, pxc, types_1.nullFeatureContext, (0, sink_1.createMemorySink)(), runtime);
        const pcr = (0, pcr_1.composePcr)({ id: 'S3.exp.fill-consistent', title: 'Experimental fill-consistent Tee family', tickIds: ops.map(op => op.id) }, plan, testimonies);
        pxc.set('px.tees.exp.pcr', pcr);
        pxc.set('px.tees.exp.selectionFn', selectFn.address);
        const image = pxc.get(componentPxC_1.ComponentPxC.image);
        const family = pxc.get(Tee_1.TeePxC.family);
        const tees = pxc.get(Tee_1.TeePxC.objects);
        const sub = (0, clean_1.materializeS3Subtraction)(image, tees);
        const panel = { widthPx: image.widthPx, heightPx: image.heightPx, rgba: image.rgba };
        return {
            pxc,
            receiptText: [
                'S3 EXPERIMENT RECEIPT', 'variant: fill-consistent', `input: ${context.inputLabel}`,
                `measured frames: ${family.measured.length}`, `Tee objects: ${tees.length}`,
                `selection: ${selectFn.address}`, `plan: ${plan.planFingerprint}`,
                'recovery: NOT RUN', 'semantic correctness: UNKNOWN',
                'source PxC pixels: unchanged; subtraction is Materialization only'
            ].join('\n'),
            panels: [
                { ...panel, label: 'CroppedImage' },
                { ...panel, label: 'Selected experimental Tees', boxes: tees.map(tee => ({ bbox: tee.bbox, color: [168, 85, 247, 255] })) },
                { ...sub, label: 'TeePx subtraction' }
            ]
        };
    }
};
//# sourceMappingURL=contract.js.map