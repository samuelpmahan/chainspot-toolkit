"use strict";
/**
 * Small, truth-independent occlusion vocabulary used by G3 recovery.
 *
 * The detector deliberately distinguishes OPAQUE from ALPHA.  A flattened
 * alpha edge is not evidence that an expected tee border is hidden, so the
 * recovery scorer may only use OPAQUE samples as an occlusion excuse.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BoxOpaqueDetector = exports.OcclusionDetector = void 0;
exports.opaqueDetectorFromBoxes = opaqueDetectorFromBoxes;
/**
 * Run-scoped composition seam. Producers register their known footprints;
 * consumers query one stable handler for the duration of that run. OPAQUE
 * wins over ALPHA, so an actual opaque sprite/badge is never weakened by a
 * later antialiasing provider. This is infrastructure, not a feature stage.
 */
class OcclusionDetector {
    opaqueProviders = [];
    alphaProviders = [];
    registerOpaque(provider) {
        this.opaqueProviders.push(provider);
    }
    registerAlpha(provider) {
        this.alphaProviders.push(provider);
    }
    kindAt(xPx, yPx) {
        if (this.opaqueProviders.some((provider) => provider.kindAt(xPx, yPx) === 'OPAQUE'))
            return 'OPAQUE';
        if (this.alphaProviders.some((provider) => provider.kindAt(xPx, yPx) === 'ALPHA'))
            return 'ALPHA';
        return 'UNKNOWN';
    }
}
exports.OcclusionDetector = OcclusionDetector;
/** A deterministic detector useful for the basket/badge footprint seam. */
class BoxOpaqueDetector {
    boxes;
    constructor(boxes) {
        this.boxes = boxes.slice();
    }
    kindAt(xPx, yPx) {
        if (!Number.isFinite(xPx) || !Number.isFinite(yPx))
            return 'UNKNOWN';
        return this.boxes.some((box) => xPx >= box.x0 && xPx <= box.x1 && yPx >= box.y0 && yPx <= box.y1)
            ? 'OPAQUE'
            : 'UNKNOWN';
    }
}
exports.BoxOpaqueDetector = BoxOpaqueDetector;
function opaqueDetectorFromBoxes(boxes) {
    return new BoxOpaqueDetector(boxes);
}
//# sourceMappingURL=occlusion.js.map