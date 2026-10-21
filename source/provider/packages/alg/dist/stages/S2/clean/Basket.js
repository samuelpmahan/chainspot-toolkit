"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Basket = exports.BasketFn = exports.BasketPxC = exports.SHELL_AGREEMENT_MIN = void 0;
exports.shellWindow = shellWindow;
exports.overlapShellFrames = overlapShellFrames;
exports.shellAgreementCount = shellAgreementCount;
exports.shellShapeOf = shellShapeOf;
exports.registerBasket = registerBasket;
const basket_sprite_json_1 = __importDefault(require("../../../detectors/threeFactor/assets/basket-sprite.json"));
const basket_shell_json_1 = __importDefault(require("../../../detectors/threeFactor/assets/basket-shell.json"));
const componentAssembly_1 = require("../../../detectors/threeFactor/componentAssembly");
const components_1 = require("../../../detectors/threeFactor/components");
const board_1 = require("../../../exec/board");
const componentPxC_1 = require("../../componentPxC");
const template = basket_sprite_json_1.default;
const templateWhiteOffsets = Uint32Array.from(template.rows.flatMap((row, y) => [...row].flatMap((value, x) => (value === '1' ? [y * template.width + x] : []))));
const shellPrior = basket_shell_json_1.default;
/** The fraction of a family's members that must share a dark px for it to be part of their common frame. */
exports.SHELL_AGREEMENT_MIN = 0.75;
exports.BasketPxC = {
    family: (0, board_1.pxKey)('px.baskets.family'),
    shellShape: (0, board_1.pxKey)('px.baskets.shellShape'),
    shellFamily: (0, board_1.pxKey)('px.baskets.shellFamily'),
    objects: (0, board_1.pxKey)('px.baskets')
};
exports.BasketFn = {
    detectFamily: (0, board_1.pxFn)('fn.Basket.detectFamily'),
    learnShellShape: (0, board_1.pxFn)('fn.Basket.learnShellShape'),
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
/** The sprite-frame window around a body: padded by the body's own width and height on each side. */
function shellWindow(bodyWidth, bodyHeight) {
    return { width: 3 * bodyWidth, height: 3 * bodyHeight, bodyX: bodyWidth, bodyY: bodyHeight };
}
/** Overlap members' frames: each entry is a body and the dark mask of its own image (several images pool into one). */
function overlapShellFrames(entries, window) {
    const agree = new Uint16Array(window.width * window.height);
    for (const { body, dark } of entries) {
        const x0 = body.bboxX - window.bodyX;
        const y0 = body.bboxY - window.bodyY;
        for (let y = 0; y < window.height; y++) {
            const gy = y0 + y;
            if (gy < 0 || gy >= dark.height)
                continue;
            for (let x = 0; x < window.width; x++) {
                const gx = x0 + x;
                if (gx >= 0 && gx < dark.width && dark.data[gy * dark.width + gx])
                    agree[y * window.width + x]++;
            }
        }
    }
    return { window, memberCount: entries.length, agree };
}
/** How many of n members must agree (the same rounding the common shell has always used). */
function shellAgreementCount(memberCount, agreementMin = exports.SHELL_AGREEMENT_MIN) {
    return Math.ceil(memberCount * agreementMin);
}
/**
 * The shape the members share: px dark in at least the agreement count, and of those the smallest 8-connected
 * component enclosing the body (the same smallest-enclosing rule as one member's shell, applied to their overlap).
 * Its bbox gives the margins; its frame px are every agreeing px inside them. Null when nothing encloses the body.
 */
function shellShapeOf(overlap, bodyWidth, bodyHeight, agreementMin = exports.SHELL_AGREEMENT_MIN) {
    const { window, agree, memberCount } = overlap;
    if (!memberCount)
        return null;
    const need = shellAgreementCount(memberCount, agreementMin);
    const data = new Uint8Array(agree.length);
    for (let i = 0; i < agree.length; i++)
        data[i] = agree[i] >= need ? 1 : 0;
    const { components } = (0, components_1.extractComponents)({ width: window.width, height: window.height, data });
    const shell = components
        .filter((c) => c.bboxX <= window.bodyX &&
        c.bboxY <= window.bodyY &&
        c.bboxX + c.bboxW >= window.bodyX + bodyWidth &&
        c.bboxY + c.bboxH >= window.bodyY + bodyHeight)
        .sort((a, b) => a.bboxW * a.bboxH - b.bboxW * b.bboxH || b.area - a.area || a.label - b.label)[0];
    if (!shell)
        return null;
    const margins = [
        window.bodyX - shell.bboxX,
        window.bodyY - shell.bboxY,
        shell.bboxX + shell.bboxW - (window.bodyX + bodyWidth),
        shell.bboxY + shell.bboxH - (window.bodyY + bodyHeight)
    ];
    const offsets = [];
    for (let y = 0; y < shell.bboxH; y++)
        for (let x = 0; x < shell.bboxW; x++)
            if (data[(shell.bboxY + y) * window.width + shell.bboxX + x])
                offsets.push(y * shell.bboxW + x);
    return { margins, offsets: Uint32Array.from(offsets), areaPx: shell.area };
}
const carriedShape = (() => {
    const offsets = [];
    shellPrior.rows.forEach((row, y) => [...row].forEach((v, x) => v === '1' && offsets.push(y * shellPrior.width + x)));
    const [left, top, right, bottom] = shellPrior.margins;
    return {
        margins: [left, top, right, bottom],
        offsets: Uint32Array.from(offsets),
        areaPx: offsets.length,
        members: shellPrior.provenance.members
    };
})();
/** Learned vs carried, in window coordinates (their margins may differ). */
function compareShapes(learned, carried, window, bodyWidth) {
    const inWindow = ({ margins: [left, top, right], offsets }) => {
        const width = bodyWidth + left + right;
        return new Set(Array.from(offsets, (o) => {
            const x = o % width;
            return (window.bodyY - top + (o - x) / width) * window.width + window.bodyX - left + x;
        }));
    };
    const a = inWindow(learned);
    const b = inWindow(carried);
    let shared = 0;
    for (const p of a)
        if (b.has(p))
            shared++;
    return {
        marginsAgree: learned.margins.every((v, i) => v === carried.margins[i]),
        learnedPx: a.size,
        carriedPx: b.size,
        sharedPx: shared,
        iou: shared / Math.max(1, a.size + b.size - shared)
    };
}
const learnShellShapeCalculation = ({ family, fields }) => {
    const [bodyWidth, bodyHeight] = family.templateSize;
    const window = shellWindow(bodyWidth, bodyHeight);
    const overlap = overlapShellFrames(family.members.map(({ body }) => ({ body, dark: fields.dark.mask })), window);
    const learned = shellShapeOf(overlap, bodyWidth, bodyHeight);
    const source = !family.members.length ? 'none' : learned ? 'learned' : 'carried';
    const chosen = source === 'learned' ? learned : source === 'carried' ? carriedShape : null;
    return {
        schema: 'chainspot-basket-shell-shape@1',
        source,
        agreementMin: exports.SHELL_AGREEMENT_MIN,
        agreementCount: shellAgreementCount(family.members.length),
        overlap,
        learned,
        learnedCondition: !family.members.length
            ? 'no basket family members'
            : learned
                ? null
                : 'no agreeing dark component encloses the body: the carried prior is used',
        carried: carriedShape,
        comparison: learned ? compareShapes(learned, carriedShape, window, bodyWidth) : null,
        margins: chosen ? chosen.margins : null,
        shellOffsets: chosen ? chosen.offsets : new Uint32Array()
    };
};
const findShellFamilyCalculation = ({ shape, family, fields }) => {
    const { margins, shellOffsets } = shape;
    if (!margins) {
        return { margins: null, shellOffsets: new Uint32Array(), members: [] };
    }
    const [left, top, right] = margins;
    const shellWidth = family.templateSize[0] + left + right;
    const shellHeight = family.templateSize[1] + top + margins[3];
    return {
        margins,
        shellOffsets,
        members: family.members.map((candidate) => {
            const x0 = candidate.body.bboxX - left;
            const y0 = candidate.body.bboxY - top;
            // the member's shell is the shape, read on the member's own dark px; dark px off the shape (canopy contact) are not its
            const blackPx = Uint32Array.from(Array.from(shellOffsets).flatMap((offset) => {
                const x = offset % shellWidth;
                const y = (offset - x) / shellWidth;
                const pixel = (y0 + y) * fields.dark.mask.width + x0 + x;
                return fields.dark.mask.data[pixel] ? [pixel] : [];
            }));
            return {
                candidate,
                bbox: [x0, y0, shellWidth, shellHeight],
                blackPx,
                shellCoverage: blackPx.length / Math.max(1, shellOffsets.length)
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
    pxc.register(exports.BasketFn.learnShellShape, learnShellShapeCalculation);
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
    static learnShellShape(pxc) {
        return pxc.call(exports.BasketFn.learnShellShape, {
            family: pxc.get(exports.BasketPxC.family),
            fields: pxc.get(componentPxC_1.ComponentPxC.fields)
        });
    }
    static findShellFamily(pxc) {
        return pxc.call(exports.BasketFn.findShellFamily, {
            shape: pxc.get(exports.BasketPxC.shellShape),
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