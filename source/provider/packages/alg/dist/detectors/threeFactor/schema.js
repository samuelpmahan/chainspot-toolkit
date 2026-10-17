"use strict";
// JSON Schema (draft-07) generator for threeFactor configs — derived FROM
// the feature registry and engine units, so the schema can never drift from
// the code: a pinned test regenerates it and compares against the checked-in
// configs/threeFactor-config.schema.json. External agents and editors
// validate config files against that .json without running the engine.
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildConfigJsonSchema = buildConfigJsonSchema;
const registry_1 = require("./features/registry");
const config_1 = require("./config");
const GATE_IDS = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'shared'];
function knobSchema(defaultValue) {
    switch (typeof defaultValue) {
        case 'number':
            return { type: 'number' };
        case 'boolean':
            return { type: 'boolean' };
        case 'string':
            return { type: 'string' };
        default:
            return Array.isArray(defaultValue) ? { type: 'array' } : { type: 'object' };
    }
}
function featureSchema(feature) {
    const knobProperties = {};
    for (const [name, spec] of Object.entries(feature.knobs)) {
        knobProperties[name] = { ...knobSchema(spec.default), description: spec.note ?? '', default: spec.default };
    }
    return {
        type: 'object',
        additionalProperties: false,
        description: feature.note ?? '',
        properties: {
            enabled: { type: 'boolean', default: feature.defaultEnabled },
            knobs: { type: 'object', additionalProperties: false, properties: knobProperties }
        }
    };
}
function buildConfigJsonSchema(unitIds) {
    const gateProperties = {};
    for (const gate of GATE_IDS) {
        const features = registry_1.ALL_FEATURES.filter((feature) => feature.gate === gate);
        if (features.length === 0)
            continue;
        const properties = {};
        for (const feature of features)
            properties[feature.id] = featureSchema(feature);
        gateProperties[gate] = { type: 'object', additionalProperties: false, properties };
    }
    return {
        $schema: 'http://json-schema.org/draft-07/schema#',
        $id: 'chainspot://threeFactor-config@1',
        title: 'threeFactor engine config',
        description: 'Sparse deviations from registry defaults. The execution list is the algorithm order, validated against unit consumes/produces at load. Default config = recovered production behavior.',
        type: 'object',
        additionalProperties: false,
        required: ['schema', 'name'],
        properties: {
            $schema: { type: 'string' },
            schema: { const: config_1.CONFIG_SCHEMA },
            name: { type: 'string', minLength: 1 },
            note: { type: 'string' },
            execution: {
                type: 'array',
                items: { enum: [...unitIds] },
                uniqueItems: true,
                description: 'Full unit order; omit to inherit the default order.'
            },
            gates: { type: 'object', additionalProperties: false, properties: gateProperties }
        }
    };
}
//# sourceMappingURL=schema.js.map