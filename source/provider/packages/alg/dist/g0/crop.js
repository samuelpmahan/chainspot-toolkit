"use strict";
// Crop APPLY — the second half of auto-crop. proposeSharedCrop (autoCrop.ts)
// already does the MEASURE (propose shared chrome insets from N>=2
// same-sized rasters); this file extracts the APPLY step that used to live
// inline in the page's analyze() (src/routes/+page.svelte, ~lines 511-540):
// crop every raster to the proposal, AND — the load-bearing part easy to
// miss — shift every tile's placement by the same (left, top) so
// composite-space coordinates recorded before the crop (e.g. the initial
// spread layout) stay consistent with the now-smaller rasters after it.
//
// OperationKind: 'transform' (the propose step in autoCrop.ts is 'measure').
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyCrop = applyCrop;
const raster_1 = require("../raster");
const autoCrop_1 = require("../autoCrop");
function applyCrop(rasters, placements, options) {
    const proposal = options?.skip ? null : (0, autoCrop_1.proposeSharedCrop)(rasters.slice());
    if (!proposal)
        return { insets: null, rasters, placements };
    return {
        insets: proposal,
        rasters: rasters.map((raster) => (0, raster_1.cropRaster)(raster, proposal)),
        placements: placements.map((p) => ({ x: p.x + proposal.left, y: p.y + proposal.top }))
    };
}
//# sourceMappingURL=crop.js.map