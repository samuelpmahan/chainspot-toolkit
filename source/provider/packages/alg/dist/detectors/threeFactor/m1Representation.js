"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.M1_REPRESENTATION_SCHEMA = void 0;
exports.materializeM1Representation = materializeM1Representation;
exports.encodeMaterializedM1Representation = encodeMaterializedM1Representation;
exports.decodeMaterializedM1Representation = decodeMaterializedM1Representation;
const componentAssembly_1 = require("./componentAssembly");
exports.M1_REPRESENTATION_SCHEMA = 'chainspot.object-representation-m1/v1';
function componentId(ref) {
    return `component.${ref.polarity}.${ref.label}`;
}
function roleFor(kind, index) {
    if (kind === 'badge') {
        if (index === 0)
            return 'outer-bright';
        if (index === 1)
            return 'dark-plate';
        return 'glyph';
    }
    return index === 0 ? 'white-body' : 'dark-shell';
}
function relationship(objectId, index, value) {
    const basketShellFamilyId = value.margins
        ? `family.basket-shell.${value.margins.join('.')}`
        : undefined;
    return {
        id: `relationship.${objectId}.${index}`,
        objectId,
        containerComponentId: componentId(value.container),
        memberComponentId: componentId(value.member),
        predicate: value.predicate,
        selection: value.selection,
        ...(value.margins ? { margins: value.margins } : {}),
        ...(basketShellFamilyId ? { basketShellFamilyId } : {}),
        producedBy: 'component-backed-object-assembly-v1'
    };
}
function samePixels(left, right) {
    return left.length === right.length && left.every((pixel, index) => pixel === right[index]);
}
function assembledObject(object, assembly, raster, consumers, components, relationships) {
    const kind = object.kind;
    const componentUses = assembly.components.map((ref, index) => {
        const id = componentId(ref);
        const role = roleFor(kind, index);
        const consumer = { objectId: object.id, objectKind: kind, role };
        const priorConsumers = consumers.get(id) ?? [];
        priorConsumers.push(consumer);
        consumers.set(id, priorConsumers);
        if (!components.has(id))
            throw new Error(`${object.id}: selected primitive ${id} is absent from its ComponentField`);
        return { componentId: id, role };
    });
    const objectRelationships = assembly.relationships.map((value, index) => relationship(object.id, index, value));
    relationships.push(...objectRelationships);
    const available = Uint32Array.from(assembly.ownedPixels);
    const explained = Uint32Array.from(assembly.ownedPixels);
    if (!samePixels(available, explained))
        throw new Error(`${object.id}: M1 changed the preserved V1 B+W ownership set`);
    return {
        id: object.id,
        kind,
        detectorId: object.raster.detectorId,
        assemblyStatus: 'assembled',
        componentUses,
        relationshipIds: objectRelationships.map((value) => value.id),
        accounting: {
            status: 'known',
            universe: 'selected-bw-component-pixels',
            availablePixels: available,
            explainedPixels: explained,
            unexplainedPixels: new Uint32Array()
        },
        consumedBy: 'component-backed-object-assembly-v1'
    };
}
/**
 * Freeze the already-proven Badge/Basket B+W component composition as M1.
 * This only dereferences selections made by acquireObjectGraphV1; it performs
 * no thresholding, component search, matching, ownership expansion, or AA work.
 */
function materializeM1Representation(graph, fields, provenance, topPx = 0) {
    const raster = {
        width: fields.bright.mask.width,
        height: fields.bright.mask.height,
        topPx,
        brightLabels: fields.bright.labels,
        darkLabels: fields.dark.labels
    };
    const components = new Map();
    const consumers = new Map();
    for (const [polarity, field] of [
        ['bright', fields.bright],
        ['dark', fields.dark]
    ]) {
        for (const component of field.components) {
            const ref = (0, componentAssembly_1.componentRef)(polarity, component, topPx);
            const id = componentId(ref);
            components.set(id, {
                id,
                polarity,
                label: component.label,
                bbox: ref.bbox,
                area: component.area,
                pixels: (0, componentAssembly_1.materializeRasterComponentPixels)(ref, raster),
                producedBy: 'badgeStage.components',
                consumers: []
            });
        }
    }
    const relationships = [];
    const objects = [...graph.badges, ...graph.baskets].map((object) => {
        const assembly = object.raster.componentAssembly;
        if (!assembly || assembly.status === 'failed') {
            return {
                id: object.id,
                kind: object.kind,
                detectorId: object.raster.detectorId,
                assemblyStatus: 'failed',
                componentUses: [],
                relationshipIds: [],
                accounting: {
                    status: 'unknown',
                    reason: assembly?.reason ?? 'no component-backed V1 assembly was attempted'
                },
                consumedBy: 'component-backed-object-assembly-v1'
            };
        }
        return assembledObject(object, assembly, raster, consumers, components, relationships);
    });
    const basketShellFamilies = [
        ...new Set(relationships.flatMap((value) => value.basketShellFamilyId ? [value.basketShellFamilyId] : []))
    ].map((id) => {
        const members = relationships.filter((value) => value.basketShellFamilyId === id);
        const margins = members[0]?.margins;
        if (!margins)
            throw new Error(`${id}: Basket shell family has no exact modal margins`);
        return {
            id,
            kind: 'basket-shell-exact-modal-margins-v1',
            margins,
            relationshipIds: members.map((value) => value.id),
            componentIds: [
                ...new Set(members.flatMap((value) => [value.containerComponentId, value.memberComponentId]))
            ].sort(),
            producedBy: 'learnBasketShellFamilyV1'
        };
    });
    return {
        schema: exports.M1_REPRESENTATION_SCHEMA,
        provenance,
        raster: { width: raster.width, height: raster.height, topPx },
        components: [...components.values()].map((component) => ({
            ...component,
            consumers: [...(consumers.get(component.id) ?? [])]
        })),
        relationships,
        basketShellFamilies,
        objects
    };
}
function encodeMaterializedM1Representation(value) {
    return new TextEncoder().encode(JSON.stringify(value, (_key, field) => field instanceof Uint32Array
        ? { $chainspotTypedArray: 'u32', data: Array.from(field) }
        : field));
}
function decodeMaterializedM1Representation(bytes) {
    const value = JSON.parse(new TextDecoder().decode(bytes), (_key, field) => {
        if (!field || typeof field !== 'object' || !('$chainspotTypedArray' in field))
            return field;
        const tagged = field;
        if (tagged.$chainspotTypedArray !== 'u32' || !Array.isArray(tagged.data))
            throw new Error('M1 representation has an unsupported typed-array payload');
        return Uint32Array.from(tagged.data);
    });
    if (value.schema !== exports.M1_REPRESENTATION_SCHEMA)
        throw new Error(`unsupported M1 representation schema '${String(value.schema)}'`);
    return value;
}
//# sourceMappingURL=m1Representation.js.map