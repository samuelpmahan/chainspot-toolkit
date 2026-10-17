"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Badge = exports.BadgeFn = exports.BadgePxC = void 0;
exports.registerBadge = registerBadge;
const componentAssembly_1 = require("../../../detectors/threeFactor/componentAssembly");
const badgeStage_1 = require("../../../detectors/threeFactor/badgeStage");
const board_1 = require("../../../exec/board");
const componentPxC_1 = require("../../componentPxC");
exports.BadgePxC = {
    image: componentPxC_1.ComponentPxC.image,
    masks: componentPxC_1.ComponentPxC.masks,
    components: componentPxC_1.ComponentPxC.fields,
    family: (0, board_1.pxKey)('px.badges.family'),
    stage: (0, board_1.pxKey)('px.badges.stage'),
    reads: (0, board_1.pxKey)('badges'),
    objects: (0, board_1.pxKey)('px.badges')
};
exports.BadgeFn = {
    detectFamily: (0, board_1.pxFn)('fn.Badge.detectFamily'),
    recover: (0, board_1.pxFn)('fn.Badge.recover'),
    findPx: (0, board_1.pxFn)('fn.Badge.findPx'),
    mute: (0, board_1.pxFn)('fn.Badge.mute')
};
function sortedUnique(parts) {
    const values = new Set();
    for (const part of parts)
        for (const value of part)
            values.add(value);
    return Uint32Array.from([...values].sort((left, right) => left - right));
}
function sameBbox(left, right) {
    return left.every((value, index) => value === right[index]);
}
function fillOuter(component, raster) {
    const edge = (0, componentAssembly_1.materializeRasterComponentPixels)(component, raster);
    const spans = new Map();
    for (const pixel of edge) {
        const x = pixel % raster.width;
        const y = (pixel - x) / raster.width;
        const span = spans.get(y);
        if (span) {
            span.minimumX = Math.min(span.minimumX, x);
            span.maximumX = Math.max(span.maximumX, x);
        }
        else
            spans.set(y, { minimumX: x, maximumX: x });
    }
    const filled = [];
    for (const [y, span] of spans) {
        for (let x = span.minimumX; x <= span.maximumX; x++)
            filled.push(y * raster.width + x);
    }
    return Uint32Array.from(filled.sort((left, right) => left - right));
}
function fillBbox(bbox, width, height) {
    const [x, y, bboxWidth, bboxHeight] = bbox;
    const filled = [];
    for (let yy = Math.max(0, y); yy < Math.min(height, y + bboxHeight); yy++) {
        for (let xx = Math.max(0, x); xx < Math.min(width, x + bboxWidth); xx++) {
            filled.push(yy * width + xx);
        }
    }
    return Uint32Array.from(filled);
}
function expand(px, width, height, radiusPx) {
    const expanded = new Set(px);
    for (const pixel of px) {
        const x = pixel % width;
        const y = (pixel - x) / width;
        for (let dy = -radiusPx; dy <= radiusPx; dy++) {
            for (let dx = -radiusPx; dx <= radiusPx; dx++) {
                if (dx * dx + dy * dy > radiusPx * radiusPx)
                    continue;
                const xx = x + dx;
                const yy = y + dy;
                if (xx >= 0 && yy >= 0 && xx < width && yy < height)
                    expanded.add(yy * width + xx);
            }
        }
    }
    return Uint32Array.from([...expanded].sort((left, right) => left - right));
}
const detectFamilyCalculation = ({ width, dark, bright, knobs }) => (0, badgeStage_1.detectBadgeFamily)(width, dark, bright, knobs);
const recoverCalculation = ({ width, height, masks, fields, family, knobs }) => {
    const badges = [...family];
    const badgeSources = badges.map(() => 'bright-family');
    const plateBboxes = badges.map(() => null);
    (0, badgeStage_1.recoverDarkPlateBadges)(width, masks.bright, masks.dark, badges, badgeSources, plateBboxes, knobs, fields.dark.components);
    return {
        width,
        height,
        brightMask: masks.bright,
        darkMask: masks.dark,
        brightLabels: fields.bright.labels,
        brightComponents: [...fields.bright.components],
        darkLabels: fields.dark.labels,
        darkComponents: [...fields.dark.components],
        badges,
        badgeSources,
        plateBboxes,
        badgeCount: badges.length,
        plateInteriorMarginPx: knobs.plateInteriorMargin,
        plateFrameTolerancePx: knobs.plateFrameTolerancePx
    };
};
const findPxCalculation = ({ stage, fields, read }) => {
    const raster = {
        width: stage.width,
        height: stage.height,
        topPx: 0,
        brightLabels: fields.bright.labels,
        darkLabels: fields.dark.labels
    };
    if (read.source === 'bright-family') {
        const outer = fields.bright.components.find((component) => component.label === read.component.label);
        if (!outer)
            return {
                basis: 'unresolved',
                components: [],
                px: new Uint32Array(),
                whitePx: 0,
                blackPx: 0,
                note: 'outer bright component unavailable'
            };
        const assembly = (0, componentAssembly_1.assembleBadgeV1)(outer, fields.bright.components, fields.dark.components);
        if (assembly.status === 'failed')
            return {
                basis: 'unresolved',
                components: [],
                px: new Uint32Array(),
                whitePx: 0,
                blackPx: 0,
                note: assembly.reason
            };
        const materialized = (0, componentAssembly_1.materializeComponentAssembly)(assembly, raster);
        const white = sortedUnique(materialized.components
            .filter((part) => part.polarity === 'bright')
            .map((part) => (0, componentAssembly_1.materializeRasterComponentPixels)(part, raster)));
        const black = sortedUnique(materialized.components
            .filter((part) => part.polarity === 'dark')
            .map((part) => (0, componentAssembly_1.materializeRasterComponentPixels)(part, raster)));
        return {
            basis: 'bright-family',
            components: materialized.components,
            px: materialized.ownedPixels,
            whitePx: white.length,
            blackPx: black.length
        };
    }
    if (!read.plateBbox)
        return {
            basis: 'unresolved',
            components: [],
            px: new Uint32Array(),
            whitePx: 0,
            blackPx: 0,
            note: 'recovered badge has no plate bounds'
        };
    const plate = fields.dark.components.find((component) => sameBbox([component.bboxX, component.bboxY, component.bboxW, component.bboxH], read.plateBbox));
    if (!plate)
        return {
            basis: 'unresolved',
            components: [],
            px: new Uint32Array(),
            whitePx: 0,
            blackPx: 0,
            note: 'recovered dark plate unavailable'
        };
    const components = [
        (0, componentAssembly_1.componentRef)('dark', plate),
        ...fields.bright.components
            .filter((component) => (0, componentAssembly_1.containsBbox)(read.plateBbox, [
            component.bboxX,
            component.bboxY,
            component.bboxW,
            component.bboxH
        ]))
            .map((component) => (0, componentAssembly_1.componentRef)('bright', component))
    ];
    const white = sortedUnique(components
        .filter((part) => part.polarity === 'bright')
        .map((part) => (0, componentAssembly_1.materializeRasterComponentPixels)(part, raster)));
    const black = sortedUnique(components
        .filter((part) => part.polarity === 'dark')
        .map((part) => (0, componentAssembly_1.materializeRasterComponentPixels)(part, raster)));
    return {
        basis: 'dark-plate-recovery',
        components,
        px: sortedUnique([white, black]),
        whitePx: white.length,
        blackPx: black.length,
        note: '7/9 overlap remains a recovery concern'
    };
};
const muteCalculation = ({ found, read, raster, radiusPx }) => {
    const support = found.basis === 'bright-family' && found.components[0]
        ? fillOuter(found.components[0], raster)
        : fillBbox(read.bbox, raster.width, raster.height);
    return expand(support, raster.width, raster.height, radiusPx);
};
function registerBadge(pxc) {
    pxc.register(exports.BadgeFn.detectFamily, detectFamilyCalculation);
    pxc.register(exports.BadgeFn.recover, recoverCalculation);
    pxc.register(exports.BadgeFn.findPx, findPxCalculation);
    pxc.register(exports.BadgeFn.mute, muteCalculation);
}
class Badge {
    label;
    source;
    bbox;
    rawLabel;
    confidence;
    abstentionReason;
    has;
    px;
    whitePx;
    blackPx;
    note;
    constructor(read, found, muted) {
        this.label = read.label;
        this.source = read.source;
        this.bbox = read.bbox;
        this.rawLabel = read.rawLabel;
        this.confidence = read.confidence;
        this.abstentionReason = read.abstentionReason;
        this.px = found.px;
        this.whitePx = found.whitePx;
        this.blackPx = found.blackPx;
        this.note = found.note;
        const outer = found.components.find((part) => part.polarity === 'bright');
        const plate = found.components.find((part) => part.polarity === 'dark');
        this.has = {
            ...(read.source === 'bright-family' && outer
                ? { detectFamily: { fn: exports.BadgeFn.detectFamily.address, outer } }
                : {}),
            ...(read.source === 'dark-plate-recovery' && plate
                ? { recover: { fn: exports.BadgeFn.recover.address, plate } }
                : {}),
            findPx: { fn: exports.BadgeFn.findPx.address, parts: found.components },
            readDigit: { fn: 'fn.readCourseBadges', label: read.label },
            mute: { fn: exports.BadgeFn.mute.address, radiusPx: 2, px: muted }
        };
    }
    static detectFamily(pxc, knobs) {
        const image = pxc.get(exports.BadgePxC.image);
        const masks = pxc.get(exports.BadgePxC.masks);
        const fields = pxc.get(exports.BadgePxC.components);
        return pxc.call(exports.BadgeFn.detectFamily, {
            width: image.widthPx,
            dark: masks.dark,
            bright: fields.bright.components,
            knobs
        });
    }
    static recover(pxc, knobs) {
        const image = pxc.get(exports.BadgePxC.image);
        return pxc.call(exports.BadgeFn.recover, {
            width: image.widthPx,
            height: image.heightPx,
            masks: pxc.get(exports.BadgePxC.masks),
            fields: pxc.get(exports.BadgePxC.components),
            family: pxc.get(exports.BadgePxC.family),
            knobs
        });
    }
    static fromRead(pxc, read) {
        const stage = pxc.get(exports.BadgePxC.stage);
        const fields = pxc.get(exports.BadgePxC.components);
        const found = pxc.call(exports.BadgeFn.findPx, { stage, fields, read });
        const raster = {
            width: stage.width,
            height: stage.height,
            topPx: 0,
            brightLabels: fields.bright.labels,
            darkLabels: fields.dark.labels
        };
        const muted = pxc.call(exports.BadgeFn.mute, { found, read, raster, radiusPx: 2 });
        return new Badge(read, found, muted);
    }
}
exports.Badge = Badge;
//# sourceMappingURL=Badge.js.map