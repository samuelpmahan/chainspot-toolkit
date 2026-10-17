"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BADGE_MATERIALIZED_EVIDENCE_SCHEMA = void 0;
exports.materializeBadgeEvidence = materializeBadgeEvidence;
exports.encodeMaterializedBadgeEvidence = encodeMaterializedBadgeEvidence;
exports.decodeMaterializedBadgeEvidence = decodeMaterializedBadgeEvidence;
exports.badgeOwnedPixels = badgeOwnedPixels;
exports.BADGE_MATERIALIZED_EVIDENCE_SCHEMA = 'chainspot.badge-evidence/v1';
function cropBbox(bbox, width, height, minimumY = 0, maximumY = height) {
    const x0 = Math.max(0, bbox[0] - 1);
    const y0 = Math.max(0, minimumY, bbox[1] - 1);
    const x1 = Math.min(width, bbox[0] + bbox[2] + 1);
    const y1 = Math.min(height, maximumY, bbox[1] + bbox[3] + 1);
    return [x0, y0, x1 - x0, y1 - y0];
}
function cropBytes(source, rasterWidth, bbox, channels = 1) {
    const [x0, y0, width, height] = bbox;
    const out = new Uint8Array(width * height * channels);
    let target = 0;
    for (let y = y0; y < y0 + height; y++) {
        const start = (y * rasterWidth + x0) * channels;
        for (let offset = 0; offset < width * channels; offset++)
            out[target++] = source[start + offset] ?? 0;
    }
    return out;
}
function cropLabels(source, rasterWidth, bbox) {
    const [x0, y0, width, height] = bbox;
    const out = new Int32Array(width * height);
    let target = 0;
    for (let y = y0; y < y0 + height; y++) {
        const start = y * rasterWidth + x0;
        for (let offset = 0; offset < width; offset++)
            out[target++] = source[start + offset];
    }
    return out;
}
function sorted(values) {
    return Uint32Array.from([...values].sort((a, b) => a - b));
}
/**
 * Refine exact B+W component ownership with the deliberately naive AA floor.
 * This consumes measurements already made by G1/object acquisition; it never
 * thresholds, labels, selects components, or consults truth.
 */
function materializeBadgeEvidence(image, fields, badge, assembly, provenance, fieldTopPx = 0) {
    if (image.data.length !== image.width * image.height * 4)
        throw new Error('badge evidence source RGBA does not match declared dimensions');
    for (const field of [fields.bright, fields.dark]) {
        if (field.mask.width !== image.width ||
            fieldTopPx < 0 ||
            fieldTopPx + field.mask.height > image.height)
            throw new Error('badge evidence component-field frame does not fit the source raster');
        if (field.labels.length !== field.mask.width * field.mask.height)
            throw new Error('badge evidence component-field labels do not match source dimensions');
    }
    if (assembly.rasterWidth !== image.width)
        throw new Error('badge evidence ownership raster width does not match source');
    const owned = new Set(assembly.ownedPixels);
    const aa = new Set();
    for (const pixel of assembly.perimeterPixels) {
        const x = pixel % image.width;
        const y = (pixel - x) / image.width;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0)
                    continue;
                const xx = x + dx;
                const yy = y + dy;
                if (xx < 0 || yy < 0 || xx >= image.width || yy >= image.height)
                    continue;
                if (yy < fieldTopPx || yy >= fieldTopPx + fields.bright.mask.height)
                    continue;
                const neighbor = yy * image.width + xx;
                const localNeighbor = (yy - fieldTopPx) * image.width + xx;
                if (owned.has(neighbor))
                    continue;
                if (fields.bright.mask.data[localNeighbor] || fields.dark.mask.data[localNeighbor])
                    continue;
                aa.add(neighbor);
            }
        }
    }
    const regionBbox = cropBbox(assembly.bbox, image.width, image.height, fieldTopPx, fieldTopPx + fields.bright.mask.height);
    const localRegionBbox = [
        regionBbox[0],
        regionBbox[1] - fieldTopPx,
        regionBbox[2],
        regionBbox[3]
    ];
    const [x0, y0, width, height] = regionBbox;
    const residueBefore = new Set();
    const residueAfter = new Set();
    for (let y = y0; y < y0 + height; y++) {
        for (let x = x0; x < x0 + width; x++) {
            const pixel = y * image.width + x;
            if (!owned.has(pixel))
                residueBefore.add(pixel);
            if (!owned.has(pixel) && !aa.has(pixel))
                residueAfter.add(pixel);
        }
    }
    return {
        schema: exports.BADGE_MATERIALIZED_EVIDENCE_SCHEMA,
        id: badge.detId,
        provenance,
        badge,
        raster: { width: image.width, height: image.height },
        region: {
            bbox: regionBbox,
            rgba: cropBytes(image.data, image.width, regionBbox, 4),
            brightMask: cropBytes(fields.bright.mask.data, image.width, localRegionBbox),
            darkMask: cropBytes(fields.dark.mask.data, image.width, localRegionBbox),
            brightLabels: cropLabels(fields.bright.labels, image.width, localRegionBbox),
            darkLabels: cropLabels(fields.dark.labels, image.width, localRegionBbox)
        },
        components: assembly.components,
        ownedBwPixels: sorted(owned),
        aaPixels: sorted(aa),
        residuePixels: sorted(residueAfter),
        measurements: {
            bwOwnedPixelCount: owned.size,
            aaAddedPixelCount: aa.size,
            residueBefore: residueBefore.size,
            residueAfter: residueAfter.size
        }
    };
}
/** Stable sink payload; typed arrays stay typed when read back in browser or Node. */
function encodeMaterializedBadgeEvidence(specimen) {
    return new TextEncoder().encode(JSON.stringify(specimen, (_key, value) => {
        if (typeof value === 'number' && !Number.isFinite(value))
            return { $chainspotNumber: String(value) };
        if (value instanceof Uint8Array)
            return { $chainspotTypedArray: 'u8', data: Array.from(value) };
        if (value instanceof Uint32Array)
            return { $chainspotTypedArray: 'u32', data: Array.from(value) };
        if (value instanceof Int32Array)
            return { $chainspotTypedArray: 'i32', data: Array.from(value) };
        return value;
    }));
}
function decodeMaterializedBadgeEvidence(bytes) {
    const value = JSON.parse(new TextDecoder().decode(bytes), (_key, encoded) => {
        if (!encoded || typeof encoded !== 'object')
            return encoded;
        if ('$chainspotNumber' in encoded) {
            const tag = encoded.$chainspotNumber;
            if (tag === 'Infinity')
                return Infinity;
            if (tag === '-Infinity')
                return -Infinity;
            if (tag === 'NaN')
                return NaN;
            throw new Error(`badge evidence has unknown numeric tag '${String(tag)}'`);
        }
        if (!('$chainspotTypedArray' in encoded))
            return encoded;
        const tagged = encoded;
        if (!Array.isArray(tagged.data))
            throw new Error('badge evidence typed array has no data array');
        if (tagged.$chainspotTypedArray === 'u8')
            return Uint8Array.from(tagged.data);
        if (tagged.$chainspotTypedArray === 'u32')
            return Uint32Array.from(tagged.data);
        if (tagged.$chainspotTypedArray === 'i32')
            return Int32Array.from(tagged.data);
        throw new Error(`badge evidence has unknown typed-array tag '${String(tagged.$chainspotTypedArray)}'`);
    });
    if (value.schema !== exports.BADGE_MATERIALIZED_EVIDENCE_SCHEMA)
        throw new Error(`unsupported badge evidence schema '${String(value.schema)}'`);
    const pixels = value.region.bbox[2] * value.region.bbox[3];
    if (value.region.rgba.length !== pixels * 4 ||
        value.region.brightMask.length !== pixels ||
        value.region.darkMask.length !== pixels ||
        value.region.brightLabels.length !== pixels ||
        value.region.darkLabels.length !== pixels)
        throw new Error('badge evidence region payload does not match its declared bbox');
    return value;
}
/** Consumer projection: OFF is the stored exact baseline; ON is additive. */
function badgeOwnedPixels(specimen, includeAa) {
    if (!includeAa)
        return specimen.ownedBwPixels;
    return sorted([...specimen.ownedBwPixels, ...specimen.aaPixels]);
}
//# sourceMappingURL=badgeEvidence.js.map