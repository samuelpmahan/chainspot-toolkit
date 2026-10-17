"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DARK_COMPONENT_FIELD = exports.BRIGHT_COMPONENT_FIELD = void 0;
exports.groupComponentField = groupComponentField;
exports.groupBrightDarkComponentFields = groupBrightDarkComponentFields;
const components_1 = require("./components");
exports.BRIGHT_COMPONENT_FIELD = { polarity: 'bright' };
exports.DARK_COMPONENT_FIELD = { polarity: 'dark' };
/** Group an already-measured binary mask without changing mask/component math. */
function groupComponentField(mask, config) {
    const { labels, components } = (0, components_1.extractComponents)(mask);
    return { config, mask, labels, components };
}
/**
 * The minimal E/cache value for the existing shared HSV measurement: same
 * threshold outputs as computeBrightDarkMasks, now grouped into two instances
 * of one component-field object.
 */
function groupBrightDarkComponentFields(masks) {
    return {
        bright: groupComponentField(masks.bright, exports.BRIGHT_COMPONENT_FIELD),
        dark: groupComponentField(masks.dark, exports.DARK_COMPONENT_FIELD)
    };
}
//# sourceMappingURL=componentField.js.map