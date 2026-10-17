"use strict";
// Shared RGB → HSV conversion for color-mask detectors. Hue in degrees
// [0, 360), saturation and value in [0, 1].
Object.defineProperty(exports, "__esModule", { value: true });
exports.rgbToHsv = rgbToHsv;
function rgbToHsv(r, g, b) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const delta = max - min;
    let h = 0;
    if (delta > 0) {
        if (max === rn)
            h = 60 * (((gn - bn) / delta) % 6);
        else if (max === gn)
            h = 60 * ((bn - rn) / delta + 2);
        else
            h = 60 * ((rn - gn) / delta + 4);
        if (h < 0)
            h += 360;
    }
    return { h, s: max === 0 ? 0 : delta / max, v: max };
}
//# sourceMappingURL=hsv.js.map