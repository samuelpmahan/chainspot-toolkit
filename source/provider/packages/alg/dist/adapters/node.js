"use strict";
// Node decode adapter — file path -> InputAsset. Node-only (node:fs,
// node:crypto, jpeg-js, pngjs). Used by the LAB / CLI / test harnesses where
// there's no DOM to decode images with.
//
// Reachable ONLY via the explicit subpath export '@chainspot/alg/adapters/node'
// (see package.json's "exports" map) — deliberately NOT re-exported from the
// package's main barrel (index.ts), which must stay free of node: imports so
// it can be bundled for the browser. Format is chosen by file extension
// (case-insensitive), not by sniffing magic bytes — keep it simple.
//
// imageId matches the Detector contract's ImageId rule and the browser
// adapter: sha256 hex of the RAW SOURCE FILE BYTES, never the decoded pixels.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeNodeFile = decodeNodeFile;
const promises_1 = require("node:fs/promises");
const node_crypto_1 = require("node:crypto");
const jpeg_js_1 = __importDefault(require("jpeg-js"));
const pngjs_1 = require("pngjs");
function extensionOf(filePath) {
    const dot = filePath.lastIndexOf('.');
    return dot === -1 ? '' : filePath.slice(dot + 1).toLowerCase();
}
/** Decode a PNG/JPEG file on disk to an InputAsset (RGBA pixels + content-addressed imageId). */
async function decodeNodeFile(filePath) {
    const bytes = await (0, promises_1.readFile)(filePath);
    const imageId = (0, node_crypto_1.createHash)('sha256').update(bytes).digest('hex');
    const ext = extensionOf(filePath);
    let widthPx;
    let heightPx;
    let rgba;
    if (ext === 'jpg' || ext === 'jpeg') {
        const decoded = jpeg_js_1.default.decode(bytes, { useTArray: true });
        widthPx = decoded.width;
        heightPx = decoded.height;
        rgba = new Uint8ClampedArray(decoded.data);
    }
    else if (ext === 'png') {
        const decoded = pngjs_1.PNG.sync.read(bytes);
        widthPx = decoded.width;
        heightPx = decoded.height;
        rgba = new Uint8ClampedArray(decoded.data);
    }
    else {
        throw new Error(`decodeNodeFile: unsupported file extension ".${ext}" (${filePath}); expected .png, .jpg, or .jpeg`);
    }
    return { imageId, widthPx, heightPx, rgba, sourceByteLength: bytes.byteLength };
}
//# sourceMappingURL=node.js.map