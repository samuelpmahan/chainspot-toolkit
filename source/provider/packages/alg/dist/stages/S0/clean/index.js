"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.S0_CACHE_TICK = exports.S0_CROP_TICK = exports.S0_DECODE_TICK = exports.S0_CROPPED_IMAGE_ADDRESS = exports.S0_FULL_IMAGE_ADDRESS = exports.S0_SELECTED_INPUT_ADDRESS = void 0;
exports.createMemoryS0FullImageCache = createMemoryS0FullImageCache;
exports.createS0Stage = createS0Stage;
exports.formatS0ReceiptText = formatS0ReceiptText;
exports.executeS0 = executeS0;
const composite_1 = require("../../../g0/composite");
const inputAsset_1 = require("../../../g0/inputAsset");
const stripChrome_1 = require("../../../g0/stripChrome");
const hash_1 = require("../../../detectors/threeFactor/hash");
const types_1 = require("../../../detectors/threeFactor/features/types");
const board_1 = require("../../../exec/board");
const gateway_1 = require("../../../exec/gateway");
const pcr_1 = require("../../../exec/pcr");
const sha256_1 = require("../../../exec/sha256");
const sink_1 = require("../../../exec/sink");
exports.S0_SELECTED_INPUT_ADDRESS = 'px.source.selectedInput';
exports.S0_FULL_IMAGE_ADDRESS = 'px.source.fullImage';
exports.S0_CROPPED_IMAGE_ADDRESS = 'px.course.canonicalPixels';
exports.S0_DECODE_TICK = {
    id: 'source.decodeFullImage',
    kind: 'materialize',
    gate: 'shared',
    unit: 'source-intake',
    consumes: [exports.S0_SELECTED_INPUT_ADDRESS],
    produces: [exports.S0_FULL_IMAGE_ADDRESS],
    calculations: ['fn.decodeFullImage'],
    accessConformance: 'exact',
    note: 'Decode is S0 sanitation: selected input becomes one usable FullImage.'
};
exports.S0_CROP_TICK = {
    id: 'source.cropUDiscChrome',
    kind: 'materialize',
    gate: 'shared',
    unit: 'source-intake',
    consumes: [exports.S0_FULL_IMAGE_ADDRESS],
    produces: [exports.S0_CROPPED_IMAGE_ADDRESS],
    calculations: ['fn.stripChromeProposal', 'fn.materializeComposite'],
    accessConformance: 'exact',
    note: 'Crop the decoded FullImage and materialize the CroppedImage in PxC.'
};
exports.S0_CACHE_TICK = {
    id: 'source.cacheFullImage',
    kind: 'materialize',
    gate: 'shared',
    unit: 'source-intake',
    consumes: [exports.S0_FULL_IMAGE_ADDRESS],
    produces: [],
    calculations: ['fn.cacheFullImage'],
    accessConformance: 'exact',
    note: 'Write the decoded FullImage to cache after the CroppedImage has materialized.'
};
const S0_PLAN = {
    ops: [exports.S0_DECODE_TICK, exports.S0_CROP_TICK, exports.S0_CACHE_TICK],
    planFingerprint: (0, sha256_1.sha256HexSyncText)((0, hash_1.canonicalJson)({ operations: [exports.S0_DECODE_TICK, exports.S0_CROP_TICK, exports.S0_CACHE_TICK] })),
    bindings: {}
};
function createMemoryS0FullImageCache() {
    const images = new Map();
    return {
        write(fullImage) {
            images.set(fullImage.imageId, fullImage);
        },
        get: (imageId) => images.get(imageId),
        has: (imageId) => images.has(imageId)
    };
}
/** Create S0's live world. Browser callers do this on page load. */
function createS0Stage(pxc = (0, board_1.createExecBoard)(), fullImageCache = createMemoryS0FullImageCache()) {
    return { pxc, fullImageCache };
}
/** Human replay of S0 in execution order. */
function formatS0ReceiptText(run, context) {
    const cropWrites = run.testimony.writes
        .map((write) => `${write.address} (${write.kind})`)
        .join(', ');
    return [
        'S0 RECEIPT',
        `progression: ${context.progression ?? 'page load → decode FullImage → crop → PxC → cache FullImage'}`,
        `input: ${context.inputLabel}`,
        'sanitation: decode selected image → FullImage',
        `originalPx: ${run.cropReceipt.originalPx.width}x${run.cropReceipt.originalPx.height}`,
        `crop: UDisc chrome · ${run.cropReceipt.cropMethod}`,
        `rowsRemoved: upper=${run.cropReceipt.upperRowsRemoved} lower=${run.cropReceipt.lowerRowsRemoved}`,
        `croppedPx: ${run.cropReceipt.croppedPx.width}x${run.cropReceipt.croppedPx.height}`,
        `totalPxRemoved: ${run.cropReceipt.totalPxRemoved}`,
        `pctPxRemoved: ${run.cropReceipt.pctPxRemoved.toFixed(2)}%`,
        `PxC write: ${cropWrites}`,
        'cache write: FullImage (last)',
        `output: PxC · available=[${exports.S0_CROPPED_IMAGE_ADDRESS}]`
    ].join('\n');
}
async function cropFullImage(fullImage) {
    const crop = (0, stripChrome_1.stripChromeProposal)([(0, inputAsset_1.toGrayRaster)(fullImage)]);
    const croppedImage = await (0, composite_1.materializeComposite)([
        {
            rgba: fullImage.rgba,
            widthPx: fullImage.widthPx,
            heightPx: fullImage.heightPx,
            placement: { x: 0, y: 0 }
        }
    ], crop.insets);
    const upperRowsRemoved = crop.insets?.top ?? 0;
    const lowerRowsRemoved = crop.insets?.bottom ?? 0;
    const originalPixelCount = fullImage.widthPx * fullImage.heightPx;
    const croppedPixelCount = croppedImage.widthPx * croppedImage.heightPx;
    const totalPxRemoved = originalPixelCount - croppedPixelCount;
    return {
        crop,
        croppedImage,
        receipt: {
            originalPx: { width: fullImage.widthPx, height: fullImage.heightPx },
            cropMethod: crop.source,
            upperRowsRemoved,
            lowerRowsRemoved,
            croppedPx: { width: croppedImage.widthPx, height: croppedImage.heightPx },
            totalPxRemoved,
            pctPxRemoved: originalPixelCount === 0 ? 0 : (totalPxRemoved / originalPixelCount) * 100
        }
    };
}
/** Run S0 inside the PxC created for it on page load; cache FullImage only after crop. */
async function executeS0(args) {
    const { stage, source, decode } = args;
    stage.pxc.set(exports.S0_SELECTED_INPUT_ADDRESS, source);
    let crop;
    let cropReceipt;
    const decodeFullImage = async (selected) => decode(selected);
    const cacheFullImage = async (fullImage) => stage.fullImageCache.write(fullImage);
    const runtime = {
        implementations: new Map([
            [
                exports.S0_DECODE_TICK.id,
                async (board) => {
                    const selected = board.get(exports.S0_SELECTED_INPUT_ADDRESS);
                    board.set(exports.S0_FULL_IMAGE_ADDRESS, await decodeFullImage(selected));
                }
            ],
            [
                exports.S0_CROP_TICK.id,
                async (board) => {
                    const fullImage = board.get(exports.S0_FULL_IMAGE_ADDRESS);
                    const computed = await cropFullImage(fullImage);
                    crop = computed.crop;
                    cropReceipt = computed.receipt;
                    board.set(exports.S0_CROPPED_IMAGE_ADDRESS, computed.croppedImage);
                }
            ],
            [
                exports.S0_CACHE_TICK.id,
                async (board) => {
                    await cacheFullImage(board.get(exports.S0_FULL_IMAGE_ADDRESS));
                }
            ]
        ]),
        calculationBindings: new Map([
            [exports.S0_DECODE_TICK.id, [{ address: 'fn.decodeFullImage', calculate: decodeFullImage }]],
            [
                exports.S0_CROP_TICK.id,
                [
                    { address: 'fn.stripChromeProposal', calculate: stripChrome_1.stripChromeProposal },
                    { address: 'fn.materializeComposite', calculate: composite_1.materializeComposite }
                ]
            ],
            [exports.S0_CACHE_TICK.id, [{ address: 'fn.cacheFullImage', calculate: cacheFullImage }]]
        ]),
        artifactExtractors: {
            [exports.S0_CROP_TICK.id](board) {
                const output = board.get(exports.S0_CROPPED_IMAGE_ADDRESS);
                return [
                    {
                        kind: 'rgba',
                        id: `${exports.S0_CROPPED_IMAGE_ADDRESS}.${output.imageId.slice(0, 12)}`,
                        bytes: Uint8Array.from(output.rgba),
                        dims: { width: output.widthPx, height: output.heightPx }
                    }
                ];
            }
        }
    };
    const sink = (0, sink_1.createMemorySink)();
    const testimonies = await (0, gateway_1.executeCompiledPlanAsync)(S0_PLAN, stage.pxc, types_1.nullFeatureContext, sink, runtime);
    const fullImage = stage.pxc.get(exports.S0_FULL_IMAGE_ADDRESS);
    const croppedImage = stage.pxc.get(exports.S0_CROPPED_IMAGE_ADDRESS);
    if (!crop || !cropReceipt)
        throw new Error('S0 crop completed without its inspection receipt.');
    const pcr = (0, pcr_1.composePcr)({
        id: 'S0.full-to-cropped',
        title: 'Page load → decoded FullImage → cropped PxC',
        tickIds: S0_PLAN.ops.map((operation) => operation.id)
    }, S0_PLAN, testimonies);
    return {
        pxc: stage.pxc,
        fullImage,
        croppedImage,
        crop,
        cropReceipt,
        plan: S0_PLAN,
        testimonies,
        decodeTestimony: testimonies[0],
        testimony: testimonies[1],
        cacheTestimony: testimonies[2],
        pcr
    };
}
//# sourceMappingURL=index.js.map