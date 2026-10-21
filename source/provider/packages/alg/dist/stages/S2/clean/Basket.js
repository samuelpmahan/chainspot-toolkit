"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Basket = exports.BasketFn = exports.BasketPxC = void 0;
exports.registerBasket = registerBasket;
const basket_sprite_json_1 = __importDefault(require("../../../detectors/threeFactor/assets/basket-sprite.json"));
const componentAssembly_1 = require("../../../detectors/threeFactor/componentAssembly");
const board_1 = require("../../../exec/board");
const componentPxC_1 = require("../../componentPxC");
const template = basket_sprite_json_1.default;
const templateWhiteOffsets = Uint32Array.from(template.rows.flatMap((row, y) => [...row].flatMap((value, x) => (value === '1' ? [y * template.width + x] : []))));
exports.BasketPxC = {
    family: (0, board_1.pxKey)('px.baskets.family'),
    shellFamily: (0, board_1.pxKey)('px.baskets.shellFamily'),
    objects: (0, board_1.pxKey)('px.baskets')
};
exports.BasketFn = {
    detectFamily: (0, board_1.pxFn)('fn.Basket.detectFamily'),
    findShellFamily: (0, board_1.pxFn)('fn.Basket.findShellFamily'),
    findPx: (0, board_1.pxFn)('fn.Basket.findPx')
};
function countTemplateCoverage(body, fields) {
    let hit = 0;
    for (const offset of templateWhiteOffsets) {
        const x = offset % template.width;
        const y = (offset - x) / template.width;
        const global = (body.bboxY + y) * fields.bright.mask.width + body.bboxX + x;
        if (fields.bright.labels[global] === body.label)
            hit++;
    }
    return hit / Math.max(1, templateWhiteOffsets.length);
}
const detectFamilyCalculation = ({ fields }) => {
    const members = fields.bright.components.flatMap((body) => {
        if (body.bboxW !== template.width || body.bboxH !== template.height)
            return [];
        const areaRatio = body.area / Math.max(1, templateWhiteOffsets.length);
        const whiteCoverage = countTemplateCoverage(body, fields);
        if (areaRatio < 0.96 || areaRatio > 1.03 || whiteCoverage < 0.96)
            return [];
        return [{ body, areaRatio, whiteCoverage }];
    });
    return { templateSize: [template.width, template.height], members };
};
const findShellFamilyCalculation = ({ family, fields }) => {
    const margins = (0, componentAssembly_1.learnBasketShellFamilyV1)(family.members.map((member) => member.body), fields.dark.components);
    if (!margins) {
        return { margins: null, shellOffsets: new Uint32Array(), members: [] };
    }
    const [left, top, right, bottom] = margins;
    const shellWidth = template.width + left + right;
    const shellHeight = template.height + top + bottom;
    const counts = new Uint16Array(shellWidth * shellHeight);
    for (const { body } of family.members) {
        const x0 = body.bboxX - left;
        const y0 = body.bboxY - top;
        for (let y = 0; y < shellHeight; y++) {
            const row = (y0 + y) * fields.dark.mask.width + x0;
            for (let x = 0; x < shellWidth; x++)
                if (fields.dark.mask.data[row + x])
                    counts[y * shellWidth + x]++;
        }
    }
    const consensus = Math.ceil(family.members.length * 0.75);
    const shellOffsets = Uint32Array.from(Array.from(counts).flatMap((count, offset) => (count >= consensus ? [offset] : [])));
    return {
        margins,
        shellOffsets,
        members: family.members.map((candidate) => {
            const x0 = candidate.body.bboxX - left;
            const y0 = candidate.body.bboxY - top;
            const blackPx = Uint32Array.from(Array.from(shellOffsets).flatMap((offset) => {
                const x = offset % shellWidth;
                const y = (offset - x) / shellWidth;
                const pixel = (y0 + y) * fields.dark.mask.width + x0 + x;
                return fields.dark.mask.data[pixel] ? [pixel] : [];
            }));
            return {
                candidate,
                bbox: [x0, y0, shellWidth, shellHeight],
                blackPx
            };
        })
    };
};
const findPxCalculation = ({ member, raster }) => {
    const body = (0, componentAssembly_1.componentRef)('bright', member.candidate.body);
    const white = (0, componentAssembly_1.materializeRasterComponentPixels)(body, raster);
    const px = Uint32Array.from([...white, ...member.blackPx].sort((a, b) => a - b));
    return {
        parts: [body],
        px,
        whitePx: white.length,
        blackPx: member.blackPx.length
    };
};
function registerBasket(pxc) {
    pxc.register(exports.BasketFn.detectFamily, detectFamilyCalculation);
    pxc.register(exports.BasketFn.findShellFamily, findShellFamilyCalculation);
    pxc.register(exports.BasketFn.findPx, findPxCalculation);
}
class Basket {
    bbox;
    has;
    px;
    whitePx;
    blackPx;
    constructor(member, found, margins) {
        const body = found.parts[0];
        if (!body)
            throw new Error('Basket requires a bright body.');
        this.bbox = member.bbox;
        this.px = found.px;
        this.whitePx = found.whitePx;
        this.blackPx = found.blackPx;
        this.has = {
            detectFamily: {
                fn: exports.BasketFn.detectFamily.address,
                body: (0, componentAssembly_1.componentRef)('bright', member.candidate.body)
            },
            findShellFamily: { fn: exports.BasketFn.findShellFamily.address, margins, blackPx: member.blackPx },
            findPx: { fn: exports.BasketFn.findPx.address, body }
        };
    }
    static detectFamily(pxc) {
        return pxc.call(exports.BasketFn.detectFamily, { fields: pxc.get(componentPxC_1.ComponentPxC.fields) });
    }
    static findShellFamily(pxc) {
        return pxc.call(exports.BasketFn.findShellFamily, {
            family: pxc.get(exports.BasketPxC.family),
            fields: pxc.get(componentPxC_1.ComponentPxC.fields)
        });
    }
    static findPx(pxc) {
        const shellFamily = pxc.get(exports.BasketPxC.shellFamily);
        // read before the early exit: the tick declares px.components and its access is exact, so an image with no shell
        // family records zero baskets (a data condition) instead of failing the run's access check (BeaverRanch-full, 2026-10-21)
        const fields = pxc.get(componentPxC_1.ComponentPxC.fields);
        if (!shellFamily.margins)
            return [];
        const raster = {
            width: fields.bright.mask.width,
            height: fields.bright.mask.height,
            topPx: 0,
            brightLabels: fields.bright.labels,
            darkLabels: fields.dark.labels
        };
        return shellFamily.members.map((member) => {
            const found = pxc.call(exports.BasketFn.findPx, { member, raster });
            return new Basket(member, found, shellFamily.margins);
        });
    }
}
exports.Basket = Basket;
//# sourceMappingURL=Basket.js.map