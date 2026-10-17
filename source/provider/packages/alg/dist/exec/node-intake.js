"use strict";
// Node-only adapter for the smallest real S0. The frozen browser-safe Stage
// lives under stages/S0/clean; this file contributes filesystem decode.
Object.defineProperty(exports, "__esModule", { value: true });
exports.NODE_CANONICAL_INPUT_TICK = void 0;
exports.executeNodeCanonicalInputTick = executeNodeCanonicalInputTick;
const node_1 = require("../adapters/node");
const clean_1 = require("../stages/S0/clean");
/** Compatibility export retained for existing Storybook evidence callers. */
exports.NODE_CANONICAL_INPUT_TICK = clean_1.S0_CROP_TICK;
/** Decode outside PxC, sanitize, then make the cropped pixels PxC's first image value. */
async function executeNodeCanonicalInputTick(filePath, fullImageCache) {
    const run = await (0, clean_1.executeS0)({
        stage: (0, clean_1.createS0Stage)(undefined, fullImageCache),
        source: filePath,
        decode: node_1.decodeNodeFile
    });
    return { ...run, input: run.croppedImage };
}
//# sourceMappingURL=node-intake.js.map