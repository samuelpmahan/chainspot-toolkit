"use strict";
// G0 StripChrome — required raster sanitation before any downstream LAB/algorithm work.
//
// This operation used to be called "AutoCrop", but that name conflated two
// different responsibilities. G0 is not trying to find an interesting crop;
// it is stripping capture chrome so downstream code only sees canonical map
// pixels. Scope owns the later, task-aware AutoCrop used for visual framing.
//
// Single-image behavior is the deterministic portrait-phone entropy detector
// recovered from the previous ChainSpot implementation: top/bottom only.
// Multi-image behavior reuses the shared fixed-position chrome consensus.
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_STRIP_CHROME_MARGIN_PX = void 0;
exports.stripChromeProposal = stripChromeProposal;
const autoCrop_1 = require("../autoCrop");
const ENTROPY_BINS = 16;
const ENTROPY_THRESHOLD_RATIO = 0.74;
const ENTROPY_SMOOTH_RADIUS = 1;
const ENTROPY_RUN_LINES = 6;
const ENTROPY_REQUIRED_LINES = 4;
const ENTROPY_INWARD_SAFETY_PX = 1;
const MAX_INSET_FRACTION = 0.25;
const MIN_BAND_PX = 2;
exports.DEFAULT_STRIP_CHROME_MARGIN_PX = 2;
function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}
function smoothedRowEntropy(raster) {
    const { widthPx: width, heightPx: height, gray } = raster;
    const entropy = new Array(height);
    const shift = 8 - Math.log2(ENTROPY_BINS);
    for (let y = 0; y < height; y++) {
        const histogram = new Uint32Array(ENTROPY_BINS);
        const base = y * width;
        let samples = 0;
        for (let x = 0; x < width; x += 2) {
            histogram[gray[base + x] >> shift]++;
            samples++;
        }
        let value = 0;
        for (const count of histogram) {
            if (count === 0)
                continue;
            const p = count / samples;
            value -= p * Math.log2(p);
        }
        entropy[y] = value;
    }
    return entropy.map((_, y) => {
        let sum = 0;
        let count = 0;
        for (let row = Math.max(0, y - ENTROPY_SMOOTH_RADIUS); row <= Math.min(height - 1, y + ENTROPY_SMOOTH_RADIUS); row++) {
            sum += entropy[row];
            count++;
        }
        return sum / count;
    });
}
function looksLikePortraitPhone(raster) {
    return raster.heightPx >= 1000 && raster.widthPx >= 500 && raster.heightPx > raster.widthPx;
}
function singlePhoneInsets(raster) {
    if (!looksLikePortraitPhone(raster))
        return null;
    const entropy = smoothedRowEntropy(raster);
    const height = raster.heightPx;
    const reference = median(entropy.slice(Math.floor(height * 0.35), Math.floor(height * 0.65)));
    if (!Number.isFinite(reference) || reference <= 0)
        return null;
    const threshold = reference * ENTROPY_THRESHOLD_RATIO;
    let topBoundary = null;
    const topLimit = Math.floor(height * 0.32);
    for (let y = 1; y < topLimit - ENTROPY_RUN_LINES; y++) {
        let passing = 0;
        for (let k = 0; k < ENTROPY_RUN_LINES; k++)
            if (entropy[y + k] >= threshold)
                passing++;
        if (passing >= ENTROPY_REQUIRED_LINES) {
            topBoundary = y;
            break;
        }
    }
    let bottomBoundary = null;
    const bottomLimit = Math.floor(height * 0.68);
    for (let y = height - 2; y > bottomLimit + ENTROPY_RUN_LINES; y--) {
        let passing = 0;
        for (let k = 0; k < ENTROPY_RUN_LINES; k++)
            if (entropy[y - k] >= threshold)
                passing++;
        if (passing >= ENTROPY_REQUIRED_LINES) {
            bottomBoundary = y;
            break;
        }
    }
    const maxInset = Math.floor(height * MAX_INSET_FRACTION);
    const topDetected = topBoundary === null ? 0 : topBoundary + ENTROPY_INWARD_SAFETY_PX;
    const bottomDetected = bottomBoundary === null ? 0 : height - 1 - bottomBoundary + ENTROPY_INWARD_SAFETY_PX;
    const top = topDetected >= MIN_BAND_PX ? Math.min(maxInset, topDetected + exports.DEFAULT_STRIP_CHROME_MARGIN_PX) : 0;
    const bottom = bottomDetected >= MIN_BAND_PX ? Math.min(maxInset, bottomDetected + exports.DEFAULT_STRIP_CHROME_MARGIN_PX) : 0;
    return top || bottom ? { top, right: 0, bottom, left: 0 } : null;
}
function addSafetyMargin(insets, width, height) {
    const maxX = Math.floor(width * MAX_INSET_FRACTION);
    const maxY = Math.floor(height * MAX_INSET_FRACTION);
    return {
        top: insets.top ? Math.min(maxY, insets.top + exports.DEFAULT_STRIP_CHROME_MARGIN_PX) : 0,
        right: insets.right ? Math.min(maxX, insets.right + exports.DEFAULT_STRIP_CHROME_MARGIN_PX) : 0,
        bottom: insets.bottom ? Math.min(maxY, insets.bottom + exports.DEFAULT_STRIP_CHROME_MARGIN_PX) : 0,
        left: insets.left ? Math.min(maxX, insets.left + exports.DEFAULT_STRIP_CHROME_MARGIN_PX) : 0
    };
}
/** Required G0 sanitation. Null means the input already presents no defensible chrome band. */
function stripChromeProposal(rasters) {
    if (rasters.length === 0)
        throw new Error('StripChrome requires at least one raster.');
    if (rasters.length === 1) {
        const insets = singlePhoneInsets(rasters[0]);
        return { insets, source: insets ? 'single-phone-entropy' : 'none' };
    }
    const shared = (0, autoCrop_1.proposeSharedCrop)(rasters.slice());
    if (!shared)
        return { insets: null, source: 'none' };
    return {
        insets: addSafetyMargin(shared, rasters[0].widthPx, rasters[0].heightPx),
        source: 'shared-chrome-consensus'
    };
}
//# sourceMappingURL=stripChrome.js.map