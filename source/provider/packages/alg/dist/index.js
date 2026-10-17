"use strict";
// @chainspot/alg — the pure course-detection algorithm surface: the
// Detector contract (detect.ts), the raster crop/stitch primitives, and the
// detector implementations (reachable via deep subpath imports, e.g.
// '@chainspot/alg/detectors/threeFactor'). No DOM, no SvelteKit, no Node-only
// APIs. See detect.ts's own header for the contract's rules.
//
// This barrel deliberately re-exports only the top-level pure algorithm
// pieces the app imports bare — detect's types, the pure raster slice, and
// autoCrop/stitch. The detectors/** subtree is intentionally NOT barreled
// here (it's large, and both detectors/threeFactor and detectors/labEndpoint
// have their own internal raster.ts that would collide by name with this
// package's raster.ts); consumers reach it via explicit subpaths, matching
// how the app already named them before this move.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
__exportStar(require("./detect"), exports);
__exportStar(require("./raster"), exports);
__exportStar(require("./autoCrop"), exports);
__exportStar(require("./stitch"), exports);
//# sourceMappingURL=index.js.map