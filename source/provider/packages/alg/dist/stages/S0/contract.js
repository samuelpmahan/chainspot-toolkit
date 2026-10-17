"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stageContract = void 0;
const clean_1 = require("./clean");
exports.stageContract = {
    id: 'S0',
    async execute(context) {
        if (context.pxc)
            throw new Error('S0 must create the page-load PxC.');
        const run = await (0, clean_1.executeS0)({
            stage: (0, clean_1.createS0Stage)(),
            source: context.source,
            decode: context.decode
        });
        return {
            pxc: run.pxc,
            receiptText: (0, clean_1.formatS0ReceiptText)(run, {
                inputLabel: context.inputLabel,
                progression: 'page load → decode FullImage → crop → PxC → cache FullImage'
            }),
            panels: [
                {
                    label: 'FullImage',
                    widthPx: run.fullImage.widthPx,
                    heightPx: run.fullImage.heightPx,
                    rgba: run.fullImage.rgba
                },
                {
                    label: 'CroppedImage',
                    widthPx: run.croppedImage.widthPx,
                    heightPx: run.croppedImage.heightPx,
                    rgba: run.croppedImage.rgba
                }
            ]
        };
    }
};
//# sourceMappingURL=contract.js.map