"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComponentPxC = void 0;
const board_1 = require("../exec/board");
/** Generic raster/component substrate shared by object Stages. */
exports.ComponentPxC = {
    image: (0, board_1.pxKey)('px.image.cropped'),
    masks: (0, board_1.pxKey)('px.components.masks'),
    fields: (0, board_1.pxKey)('px.components')
};
//# sourceMappingURL=componentPxC.js.map