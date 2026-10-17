"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Tee = exports.TeeFn = exports.TeePxC = void 0;
exports.selectTeeFamily = selectTeeFamily;
exports.registerTee = registerTee;
const endpoints_1 = require("../../../detectors/threeFactor/endpoints");
const componentAssembly_1 = require("../../../detectors/threeFactor/componentAssembly");
const board_1 = require("../../../exec/board");
const Badge_1 = require("../../S1/clean/Badge");
const componentPxC_1 = require("../../componentPxC");
exports.TeePxC = {
    rings: (0, board_1.pxKey)('px.tees.rings'),
    family: (0, board_1.pxKey)('px.tees.family'),
    objects: (0, board_1.pxKey)('px.tees')
};
exports.TeeFn = {
    detectRings: (0, board_1.pxFn)('fn.Tee.detectRings'),
    findFamily: (0, board_1.pxFn)('fn.Tee.findFamily'),
    findPx: (0, board_1.pxFn)('fn.Tee.findPx')
};
const FRAME_AREA_MIN = 10;
const FRAME_AREA_MAX = 500;
const FRAME_MAX_WIDTH = 50;
const FRAME_MAX_HEIGHT = 50;
const MAJOR_RATIO = 1.25;
const MINOR_RATIO = 1.25;
const AREA_RATIO = 1.5;
function centerPixel(ring, width, height) {
    const x = Math.round(ring.cx);
    const y = Math.round(ring.cy);
    return x >= 0 && y >= 0 && x < width && y < height ? y * width + x : null;
}
const detectRingsCalculation = ({ fields, badges }) => {
    const enclosed = (0, endpoints_1.detectTeeRings)(fields.bright.mask);
    const elongated = enclosed.filter((ring) => ring.kind === 'tee-rect');
    const muted = new Set();
    for (const badge of badges)
        for (const pixel of badge.has.mute.px)
            muted.add(pixel);
    const excludedByBadge = [];
    const candidates = [];
    for (const ring of elongated) {
        const pixel = centerPixel(ring, fields.bright.mask.width, fields.bright.mask.height);
        if (pixel !== null && muted.has(pixel))
            excludedByBadge.push(ring);
        else
            candidates.push(ring);
    }
    return { enclosed, elongated, excludedByBadge, candidates };
};
function enclosingFrame(ring, components) {
    return (components
        .filter((component) => component.area >= FRAME_AREA_MIN &&
        component.area <= FRAME_AREA_MAX &&
        component.bboxW <= FRAME_MAX_WIDTH &&
        component.bboxH <= FRAME_MAX_HEIGHT &&
        ring.cx >= component.bboxX &&
        ring.cx <= component.bboxX + component.bboxW &&
        ring.cy >= component.bboxY &&
        ring.cy <= component.bboxY + component.bboxH)
        .sort((left, right) => left.bboxW * left.bboxH - right.bboxW * right.bboxH ||
        right.area - left.area ||
        left.label - right.label)[0] ?? null);
}
function logRatio(left, right) {
    return Math.abs(Math.log(Math.max(left, 1) / Math.max(right, 1)));
}
function selectTeeFamily(measured) {
    let members = [];
    let anchor = null;
    let bestSpread = Infinity;
    for (const seed of measured) {
        const family = measured.filter((candidate) => logRatio(candidate.frame.major, seed.frame.major) <= Math.log(MAJOR_RATIO) &&
            logRatio(candidate.frame.minor, seed.frame.minor) <= Math.log(MINOR_RATIO) &&
            logRatio(candidate.frame.area, seed.frame.area) <= Math.log(AREA_RATIO));
        const spread = family.reduce((sum, candidate) => sum +
            logRatio(candidate.frame.major, seed.frame.major) +
            logRatio(candidate.frame.minor, seed.frame.minor) +
            logRatio(candidate.frame.area, seed.frame.area), 0);
        if (family.length > members.length || (family.length === members.length && spread < bestSpread)) {
            members = family;
            anchor = seed;
            bestSpread = spread;
        }
    }
    return {
        members: [...members].sort((left, right) => left.ring.cy - right.ring.cy || left.ring.cx - right.ring.cx),
        anchor
    };
}
const findFamilyCalculation = ({ rings, fields }) => {
    const measured = [];
    const unframed = [];
    for (const ring of rings.candidates) {
        const frame = enclosingFrame(ring, fields.bright.components);
        if (frame)
            measured.push({ ring, frame });
        else
            unframed.push(ring);
    }
    const selected = selectTeeFamily(measured);
    return { measured, unframed, ...selected };
};
const findPxCalculation = ({ member, fields }) => {
    const frame = (0, componentAssembly_1.componentRef)('bright', member.frame);
    const raster = {
        width: fields.bright.mask.width,
        height: fields.bright.mask.height,
        topPx: 0,
        brightLabels: fields.bright.labels,
        darkLabels: fields.dark.labels
    };
    return { frame, px: (0, componentAssembly_1.materializeRasterComponentPixels)(frame, raster) };
};
function registerTee(pxc) {
    pxc.register(exports.TeeFn.detectRings, detectRingsCalculation);
    pxc.register(exports.TeeFn.findFamily, findFamilyCalculation);
    pxc.register(exports.TeeFn.findPx, findPxCalculation);
}
class Tee {
    center;
    innerBbox;
    bbox;
    angleRad;
    has;
    px;
    constructor(member, found) {
        this.center = [member.ring.cx, member.ring.cy];
        this.innerBbox = [
            member.ring.bboxX,
            member.ring.bboxY,
            member.ring.bboxW,
            member.ring.bboxH
        ];
        this.bbox = found.frame.bbox;
        this.angleRad = member.frame.angle;
        this.px = found.px;
        this.has = {
            detectRings: { fn: exports.TeeFn.detectRings.address, hole: member.ring },
            findFamily: { fn: exports.TeeFn.findFamily.address, frame: found.frame },
            findPx: { fn: exports.TeeFn.findPx.address, parts: [found.frame] }
        };
    }
    static detectRings(pxc) {
        return pxc.call(exports.TeeFn.detectRings, {
            fields: pxc.get(componentPxC_1.ComponentPxC.fields),
            badges: pxc.get(Badge_1.BadgePxC.objects)
        });
    }
    static findFamily(pxc) {
        return pxc.call(exports.TeeFn.findFamily, {
            rings: pxc.get(exports.TeePxC.rings),
            fields: pxc.get(componentPxC_1.ComponentPxC.fields)
        });
    }
    static findPx(pxc) {
        const fields = pxc.get(componentPxC_1.ComponentPxC.fields);
        return pxc.get(exports.TeePxC.family).members.map((member) => {
            const found = pxc.call(exports.TeeFn.findPx, { member, fields });
            return new Tee(member, found);
        });
    }
}
exports.Tee = Tee;
//# sourceMappingURL=Tee.js.map