"use strict";
/**
 * NuThing P1 raster layer: RGBA input contract plus the exact OpenCV
 * bright/dark thresholding used by scripts/nuthing-p1-canonical.py.
 *
 * The Python baseline computes HSV via cv2.cvtColor(..., COLOR_RGB2HSV) on
 * uint8 data. OpenCV's 8-bit path is fixed point: V = max(R,G,B) and
 * S = ((V - min) * sdiv[V] + 2^11) >> 12 with sdiv[v] = cvRound((255<<12)/v).
 * We reproduce that table exactly (cvRound = round half to even) so borderline
 * pixels land on the same side of the S threshold as the baseline.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_HSV_KNOBS = void 0;
exports.opencvSaturation = opencvSaturation;
exports.computeBrightDarkMasks = computeBrightDarkMasks;
exports.DEFAULT_HSV_KNOBS = {
    brightVMin: 210,
    brightSMax: 45,
    darkVMax: 45
};
function roundHalfToEven(x) {
    const floor = Math.floor(x);
    const diff = x - floor;
    if (diff < 0.5)
        return floor;
    if (diff > 0.5)
        return floor + 1;
    return floor % 2 === 0 ? floor : floor + 1;
}
const HSV_SHIFT = 12;
const sdivTable = (() => {
    const t = new Int32Array(256);
    for (let i = 1; i < 256; i++) {
        t[i] = roundHalfToEven((255 << HSV_SHIFT) / i);
    }
    return t;
})();
/** OpenCV 8-bit HSV saturation for one pixel. */
function opencvSaturation(r, g, b) {
    const v = Math.max(r, g, b);
    const vmin = Math.min(r, g, b);
    const diff = v - vmin;
    return (diff * sdivTable[v] + (1 << (HSV_SHIFT - 1))) >> HSV_SHIFT;
}
/**
 * bright = (V >= 210) & (S <= 45); dark = (V <= 45), matching the baseline's
 * BRIGHT_V_MIN / BRIGHT_S_MAX / DARK_V_MAX exactly.
 */
function computeBrightDarkMasks(image, knobs = exports.DEFAULT_HSV_KNOBS) {
    const { width, height, data } = image;
    const n = width * height;
    const bright = new Uint8Array(n);
    const dark = new Uint8Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
        const r = data[p];
        const g = data[p + 1];
        const b = data[p + 2];
        const v = r > g ? (r > b ? r : b) : g > b ? g : b;
        if (v <= knobs.darkVMax)
            dark[i] = 1;
        if (v >= knobs.brightVMin) {
            const vmin = r < g ? (r < b ? r : b) : g < b ? g : b;
            const s = ((v - vmin) * sdivTable[v] + (1 << (HSV_SHIFT - 1))) >> HSV_SHIFT;
            if (s <= knobs.brightSMax)
                bright[i] = 1;
        }
    }
    return {
        bright: { width, height, data: bright },
        dark: { width, height, data: dark }
    };
}
//# sourceMappingURL=raster.js.map