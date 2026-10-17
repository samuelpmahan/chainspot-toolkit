"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stageContract = void 0;
const clean_1 = require("./clean");
exports.stageContract = {
    id: 'S2',
    async execute(context) {
        if (!context.pxc)
            throw new Error('S2 requires S1 PxC.');
        const run = (0, clean_1.executeS2BasketsCandidate)(context.pxc);
        const subtraction = (0, clean_1.materializeS2Subtraction)(run.image, run.baskets);
        const lines = [
            'S2 RECEIPT',
            'progression: 1=CroppedImage from S1 PxC · 2=Basket family · 3=common inner/outer perimeters · 4=BasketPx subtraction · 5=Basket objects',
            `input: ${context.inputLabel}`,
            `Basket family: ${run.family.members.length}`,
            `common shell margins: ${run.shellFamily.margins?.join(',') ?? 'NONE'}`,
            `common shell pixels: ${run.shellFamily.shellOffsets.length}`,
            `Basket objects: ${run.baskets.length}`,
            `BasketPx: ${subtraction.basketPx}`,
            'recovery: NOT RUN',
            'materialization: subtraction raster is PCR output only; it is not written to PxC',
            '',
            'BASKETS',
            'order | bbox | white BasketPx | black BasketPx | total BasketPx'
        ];
        run.baskets.forEach((basket, index) => {
            lines.push(`${index + 1} | ${basket.bbox.join(',')} | ${basket.whitePx} | ${basket.blackPx} | ${basket.px.length}`);
        });
        return {
            pxc: run.pxc,
            receiptText: lines.join('\n'),
            panels: [
                {
                    label: 'CroppedImage from S1 PxC',
                    widthPx: run.image.widthPx,
                    heightPx: run.image.heightPx,
                    rgba: run.image.rgba
                },
                {
                    label: 'Basket family',
                    widthPx: run.image.widthPx,
                    heightPx: run.image.heightPx,
                    rgba: run.image.rgba,
                    boxes: run.family.members.map((member) => ({
                        bbox: [member.body.bboxX, member.body.bboxY, member.body.bboxW, member.body.bboxH],
                        color: [34, 211, 238, 255]
                    }))
                },
                {
                    label: 'Common inner / outer perimeters',
                    widthPx: run.image.widthPx,
                    heightPx: run.image.heightPx,
                    rgba: run.image.rgba,
                    boxes: run.shellFamily.members.flatMap((member) => [
                        { bbox: member.bbox, color: [34, 197, 94, 255] },
                        {
                            bbox: [
                                member.candidate.body.bboxX,
                                member.candidate.body.bboxY,
                                member.candidate.body.bboxW,
                                member.candidate.body.bboxH
                            ],
                            color: [34, 211, 238, 255]
                        }
                    ])
                },
                {
                    label: 'BasketPx subtraction',
                    widthPx: subtraction.widthPx,
                    heightPx: subtraction.heightPx,
                    rgba: subtraction.rgba
                },
                {
                    label: 'Basket objects',
                    widthPx: run.image.widthPx,
                    heightPx: run.image.heightPx,
                    rgba: run.image.rgba,
                    boxes: run.baskets.map((basket) => ({
                        bbox: basket.bbox,
                        color: [168, 85, 247, 255]
                    }))
                }
            ]
        };
    }
};
//# sourceMappingURL=contract.js.map