"use strict";
/**
 * Canonical digit-mask normalization for all NuThing P2 digit experiments.
 *
 * Every real, synthetic, or augmented digit sample goes through THIS module
 * so competing feature/classifier experiments consume byte-identical
 * representations. Do not fork or re-implement the normalization elsewhere.
 *
 * A digit sample is a binary mask tightly cropped to the digit's bounding
 * box. Normalization scales it into a DIGIT_W x DIGIT_H grid preserving
 * aspect (nearest-neighbor), centered with equal margins.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DIGIT_H = exports.DIGIT_W = void 0;
exports.normalizeDigitMask = normalizeDigitMask;
exports.digitToBase64 = digitToBase64;
exports.digitFromBase64 = digitFromBase64;
const segment_1 = require("./segment");
exports.DIGIT_W = 24;
exports.DIGIT_H = 32;
function normalizeDigitMask(mask, width, height, knobs = segment_1.DEFAULT_DIGITS_KNOBS) {
    const digitW = knobs.digitW;
    const digitH = knobs.digitH;
    const out = new Uint8Array(digitW * digitH);
    if (width <= 0 || height <= 0)
        return out;
    const s = Math.min(digitW / width, digitH / height);
    const outW = Math.max(1, Math.round(width * s));
    const outH = Math.max(1, Math.round(height * s));
    const ox = Math.floor((digitW - outW) / 2);
    const oy = Math.floor((digitH - outH) / 2);
    for (let y = 0; y < outH; y++) {
        const sy = Math.min(height - 1, Math.floor(((y + 0.5) * height) / outH));
        for (let x = 0; x < outW; x++) {
            const sx = Math.min(width - 1, Math.floor(((x + 0.5) * width) / outW));
            if (mask[sy * width + sx])
                out[(oy + y) * digitW + (ox + x)] = 1;
        }
    }
    return out;
}
/** Serialize a normalized digit as base64 (one byte per pixel, 0/1). */
function digitToBase64(digit) {
    let bin = '';
    for (let i = 0; i < digit.length; i++)
        bin += String.fromCharCode(digit[i]);
    // btoa is unavailable in Node scripts without DOM; use Buffer when present.
    if (typeof Buffer !== 'undefined')
        return Buffer.from(digit).toString('base64');
    return btoa(bin);
}
function digitFromBase64(b64) {
    if (typeof Buffer !== 'undefined')
        return new Uint8Array(Buffer.from(b64, 'base64'));
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++)
        out[i] = bin.charCodeAt(i);
    return out;
}
//# sourceMappingURL=normalize.js.map