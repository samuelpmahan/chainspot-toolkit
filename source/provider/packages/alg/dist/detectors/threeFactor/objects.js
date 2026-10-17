"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.acquireObjectGraphV1 = acquireObjectGraphV1;
exports.objectGraph = objectGraph;
exports.requireComponentAssembly = requireComponentAssembly;
exports.occlude = occlude;
const componentAssembly_1 = require("./componentAssembly");
function failure(seedBbox, reason) {
    return { status: 'failed', seedBbox, reason };
}
function rasterFromAssembly(detectorId, fallbackBbox, fallbackKind, assembly, rasterEvidence) {
    const canonical = assembly.status === 'assembled'
        ? (0, componentAssembly_1.materializeComponentAssembly)(assembly, rasterEvidence)
        : assembly;
    return {
        detectorId,
        bbox: canonical.status === 'assembled' ? canonical.bbox : fallbackBbox,
        kind: canonical.status === 'assembled' ? 'observed' : fallbackKind,
        componentAssembly: canonical
    };
}
function sourceComponentLabel(source) {
    if (!source)
        return null;
    const match = /^bright-component:(-?\d+)$/.exec(source);
    return match ? Number(match[1]) : null;
}
/**
 * V1 component-backed root-object acquisition.
 *
 * Clean badges/tees use their bright outer CC. Clean baskets use their bright
 * body plus the exact modal enclosing dark-shell CC. Recovery/overlap cases
 * remain root objects for detector testimony, but their componentAssembly is
 * FAILED instead of fabricating a perimeter. Successful acquisition stores
 * the exact merged owned pixels + boundary pixels directly on the root object.
 */
function acquireObjectGraphV1(measurement, components) {
    const { brightComponents, darkComponents } = components;
    const brightByLabel = new Map(brightComponents.map((component) => [component.label, component]));
    const topPx = measurement.viewport.topPx;
    const rasterEvidence = {
        width: components.width,
        height: components.height,
        topPx,
        brightLabels: components.brightLabels,
        darkLabels: components.darkLabels
    };
    const basketBodies = measurement.baskets.flatMap((evidence) => {
        if (evidence.tier === 'occlusion-recovery')
            return [];
        const label = sourceComponentLabel(evidence.source);
        const component = label === null ? undefined : brightByLabel.get(label);
        return component ? [component] : [];
    });
    const basketShellFamily = (0, componentAssembly_1.learnBasketShellFamilyV1)(basketBodies, darkComponents);
    return {
        badges: measurement.badges.map((evidence) => {
            let assembly;
            if (evidence.source !== 'bright-family') {
                assembly = failure(evidence.bbox, 'dark-plate recovery has no trustworthy intact outer bright component in object-perimeter V1');
            }
            else {
                const outer = brightByLabel.get(evidence.component.label);
                assembly = outer
                    ? (0, componentAssembly_1.assembleBadgeV1)(outer, brightComponents, darkComponents, topPx)
                    : failure(evidence.bbox, `badge outer bright component ${evidence.component.label} is unavailable`);
            }
            return {
                kind: 'badge',
                id: evidence.detId,
                raster: rasterFromAssembly(evidence.detId, evidence.bbox, 'observed', assembly, rasterEvidence),
                evidence
            };
        }),
        baskets: measurement.baskets.map((evidence) => {
            let assembly;
            const label = sourceComponentLabel(evidence.source);
            const body = label === null ? undefined : brightByLabel.get(label);
            if (evidence.tier === 'occlusion-recovery' || !body) {
                assembly = failure(evidence.bbox, 'accepted basket has no intact bright body component; overlap/recovery is object-perimeter V2');
            }
            else if (!basketShellFamily) {
                assembly = failure(evidence.bbox, 'no unique intact basket outer-shell component family exists in this run');
            }
            else {
                assembly = (0, componentAssembly_1.assembleBasketV1)(body, darkComponents, basketShellFamily, topPx);
            }
            return {
                kind: 'basket',
                id: evidence.detId,
                raster: rasterFromAssembly(evidence.detId, evidence.bbox, 'fitted', assembly, rasterEvidence),
                evidence
            };
        }),
        tees: measurement.tees.map((evidence) => {
            let assembly;
            const component = evidence.pad ? brightByLabel.get(evidence.pad.componentLabel) : undefined;
            if (evidence.tier === 'recovered' || !component) {
                assembly = failure(evidence.bbox, evidence.tier === 'recovered'
                    ? 'recovered/occluded tee has no intact outer bright component; object-perimeter V2'
                    : 'tee has no accepted intact outer bright component');
            }
            else {
                assembly = (0, componentAssembly_1.assembleTeeV1)(component, topPx);
            }
            return {
                kind: 'tee',
                id: evidence.detId,
                raster: rasterFromAssembly(evidence.detId, evidence.bbox, evidence.tier === 'recovered' ? 'fitted' : 'observed', assembly, rasterEvidence),
                evidence
            };
        }),
        occlusions: []
    };
}
/**
 * Legacy adapter retained while consumers migrate. It carries detector/fitted
 * boxes only and therefore must not be used when exact object ownership is
 * required. New physical-object consumers should use acquireObjectGraphV1.
 */
function objectGraph(measurement) {
    return {
        badges: measurement.badges.map((evidence) => ({
            kind: 'badge',
            id: evidence.detId,
            raster: { detectorId: evidence.detId, bbox: evidence.bbox, kind: 'observed' },
            evidence
        })),
        baskets: measurement.baskets.map((evidence) => ({
            kind: 'basket',
            id: evidence.detId,
            raster: { detectorId: evidence.detId, bbox: evidence.bbox, kind: 'fitted' },
            evidence
        })),
        tees: measurement.tees.map((evidence) => ({
            kind: 'tee',
            id: evidence.detId,
            raster: {
                detectorId: evidence.detId,
                bbox: evidence.bbox,
                kind: evidence.tier === 'recovered' ? 'fitted' : 'observed'
            },
            evidence
        })),
        occlusions: []
    };
}
function requireComponentAssembly(object) {
    const assembly = object.raster.componentAssembly;
    if (!assembly)
        throw new Error(`${object.kind} ${object.id} has legacy detector geometry, not component-backed ownership.`);
    if (assembly.status === 'failed')
        throw new Error(`${object.kind} ${object.id} component assembly failed: ${assembly.reason}`);
    return assembly;
}
function occlude(graph, relation) {
    const known = new Set([...graph.badges, ...graph.baskets, ...graph.tees].map((object) => object.id));
    if (!known.has(relation.occluderId) || !known.has(relation.occludedId))
        throw new Error('Occlusion endpoints must be existing root objects.');
    if (relation.occluderId === relation.occludedId)
        throw new Error('An object cannot occlude itself.');
    if (relation.evidence.visiblePixels < 0 || relation.evidence.occludedPixels < 0)
        throw new Error('Occlusion pixel counts must be non-negative.');
    return { ...graph, occlusions: [...graph.occlusions, relation] };
}
//# sourceMappingURL=objects.js.map