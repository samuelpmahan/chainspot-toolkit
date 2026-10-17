"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compileABFeatureSet = compileABFeatureSet;
exports.executeABFeatureSet = executeABFeatureSet;
exports.formatABFeatureSetManifestMarkdown = formatABFeatureSetManifestMarkdown;
const types_1 = require("../detectors/threeFactor/features/types");
const hash_1 = require("../detectors/threeFactor/hash");
const compile_1 = require("./compile");
const gateway_1 = require("./gateway");
const sha256_1 = require("./sha256");
const sink_1 = require("./sink");
function resolveFeature(feature, override) {
    const knobs = { ...(0, types_1.defaultKnobs)(feature), ...(override?.knobs ?? {}) };
    for (const [name, value] of Object.entries(knobs)) {
        const spec = feature.knobs[name];
        if (!spec)
            throw new Error(`ABFeatureSet: feature '${feature.id}' has unknown knob '${name}'.`);
        const error = spec.validate?.(value);
        if (error)
            throw new Error(`ABFeatureSet: feature '${feature.id}' knob '${name}' invalid: ${error}`);
    }
    return { enabled: override?.enabled ?? feature.defaultEnabled, knobs };
}
function compileABFeatureSet(definition, overrides = {}, paramsHash) {
    const featureIds = new Set();
    const operationIds = new Set();
    const ops = [];
    const implementations = new Map();
    const calculationBindings = new Map();
    const artifactExtractors = {};
    const bindings = {};
    const enabledFeatureIds = [];
    const setOperations = definition.operations ?? [];
    const services = definition.services ?? [];
    const serviceIds = new Set();
    for (const service of services) {
        if (!service || typeof service.id !== 'string' || service.id.length === 0) {
            throw new Error(`ABFeatureSet '${definition.id}': service id must be a non-empty string.`);
        }
        if (service.id.trim() !== service.id) {
            throw new Error(`ABFeatureSet '${definition.id}': service id '${service.id}' must not have surrounding whitespace.`);
        }
        if (typeof service.kind !== 'string' || service.kind.length === 0) {
            throw new Error(`ABFeatureSet '${definition.id}': service '${service.id}' kind must be a non-empty string.`);
        }
        if (service.kind.trim() !== service.kind) {
            throw new Error(`ABFeatureSet '${definition.id}': service '${service.id}' kind must not have surrounding whitespace.`);
        }
        if (service.scope !== undefined && service.scope !== 'run') {
            throw new Error(`ABFeatureSet '${definition.id}': service '${service.id}' has unsupported scope '${service.scope}'.`);
        }
        if (serviceIds.has(service.id)) {
            throw new Error(`ABFeatureSet '${definition.id}': duplicate service '${service.id}'.`);
        }
        serviceIds.add(service.id);
    }
    const ownedFeatureIds = new Set(definition.features.map((feature) => feature.id));
    const locallyReadFeatureIds = new Set(setOperations
        .flatMap(({ operation }) => operation.spec.features ?? [])
        .filter((id) => ownedFeatureIds.has(id)));
    const imports = new Set(definition.imports ?? []);
    const locallyOperationlessFeatureIds = new Set(definition.locallyOperationlessFeatureIds ?? []);
    for (const id of imports) {
        if (ownedFeatureIds.has(id)) {
            throw new Error(`ABFeatureSet '${definition.id}': import '${id}' is already owned by the set.`);
        }
    }
    for (const id of locallyOperationlessFeatureIds) {
        if (!ownedFeatureIds.has(id)) {
            throw new Error(`ABFeatureSet '${definition.id}': locally operationless feature '${id}' is not owned by the set.`);
        }
    }
    for (const entry of setOperations) {
        for (const dependency of entry.operation.spec.features ?? []) {
            if (!ownedFeatureIds.has(dependency) && !imports.has(dependency)) {
                throw new Error(`ABFeatureSet '${definition.id}': operation '${entry.operation.spec.id}' reads '${dependency}' but the set neither owns nor imports it.`);
            }
        }
    }
    for (const id of Object.keys(overrides)) {
        if (!definition.features.some((feature) => feature.id === id)) {
            throw new Error(`ABFeatureSet '${definition.id}': override names unknown feature '${id}'.`);
        }
    }
    for (const feature of definition.features) {
        if (featureIds.has(feature.id)) {
            throw new Error(`ABFeatureSet '${definition.id}': duplicate feature '${feature.id}'.`);
        }
        featureIds.add(feature.id);
        const resolved = resolveFeature(feature, overrides[feature.id]);
        bindings[feature.id] = resolved;
        if (!resolved.enabled)
            continue;
        const featureOps = feature.operations ?? [];
        if (!featureOps || featureOps.length === 0) {
            if (locallyOperationlessFeatureIds.has(feature.id) || locallyReadFeatureIds.has(feature.id)) {
                enabledFeatureIds.push(feature.id);
                continue;
            }
            throw new Error(`ABFeatureSet '${definition.id}': enabled feature '${feature.id}' has no operations.`);
        }
        enabledFeatureIds.push(feature.id);
        for (const operation of featureOps) {
            if (operationIds.has(operation.spec.id)) {
                throw new Error(`ABFeatureSet '${definition.id}': duplicate operation '${operation.spec.id}'.`);
            }
            if (!operation.spec.features?.includes(feature.id)) {
                throw new Error(`ABFeatureSet '${definition.id}': operation '${operation.spec.id}' does not name owning feature '${feature.id}'.`);
            }
            operationIds.add(operation.spec.id);
            ops.push(operation.spec);
            implementations.set(operation.spec.id, operation.run);
            if (operation.calculationBindings)
                calculationBindings.set(operation.spec.id, operation.calculationBindings);
            if (operation.extractArtifacts)
                artifactExtractors[operation.spec.id] = operation.extractArtifacts;
        }
    }
    // Set-owned operations are a complete production composition and run in
    // the declaration's fixed order, independent of feature enablement. The
    // saved config remains the sole source of execution scheduling.
    for (const { operation } of setOperations) {
        if (operationIds.has(operation.spec.id)) {
            throw new Error(`ABFeatureSet '${definition.id}': duplicate operation '${operation.spec.id}'.`);
        }
        operationIds.add(operation.spec.id);
        ops.push(operation.spec);
        implementations.set(operation.spec.id, operation.run);
        if (operation.calculationBindings)
            calculationBindings.set(operation.spec.id, operation.calculationBindings);
        if (operation.extractArtifacts)
            artifactExtractors[operation.spec.id] = operation.extractArtifacts;
    }
    (0, compile_1.validateOperationOrder)(ops, definition.seededSlots ?? [], `ABFeatureSet '${definition.id}' compile`);
    const planFingerprint = (0, sha256_1.sha256HexSyncText)((0, hash_1.canonicalJson)({
        setId: definition.id,
        features: definition.features.map((feature) => ({
            id: feature.id,
            resolved: bindings[feature.id]
        })),
        ...(services.length
            ? {
                services: services.map((service) => ({
                    id: service.id,
                    kind: service.kind,
                    ...(service.scope ? { scope: service.scope } : {}),
                    ...(service.note ? { note: service.note } : {})
                }))
            }
            : {}),
        imports: definition.imports ?? [],
        locallyOperationlessFeatureIds: definition.locallyOperationlessFeatureIds ?? [],
        operations: ops,
        seededSlots: definition.seededSlots ?? []
    }));
    const plan = {
        ops,
        planFingerprint,
        bindings,
        ...(paramsHash ? { paramsHash } : {})
    };
    return {
        definition,
        plan,
        runtime: { implementations, calculationBindings, artifactExtractors },
        enabledFeatureIds,
        ownedServiceIds: [...serviceIds]
    };
}
function now() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
async function executeABFeatureSet(compiled, board, ctx, run, sink = (0, sink_1.createMemorySink)()) {
    const startedAtMs = now();
    const operations = await (0, gateway_1.executeCompiledPlanAsync)(compiled.plan, board, ctx, sink, compiled.runtime);
    const durationMs = now() - startedAtMs;
    const semanticReceipt = {
        setId: compiled.definition.id,
        planFingerprint: compiled.plan.planFingerprint,
        ownedFeatureIds: compiled.definition.features.map((feature) => feature.id),
        ...(compiled.ownedServiceIds.length
            ? { ownedServiceIds: compiled.ownedServiceIds }
            : {}),
        enabledFeatureIds: compiled.enabledFeatureIds,
        importedFeatureIds: compiled.definition.imports ?? [],
        locallyOperationlessFeatureIds: compiled.definition.locallyOperationlessFeatureIds ?? [],
        operations: operations.map(({ startedAtMs, durationMs, ...receipt }) => {
            void startedAtMs;
            void durationMs;
            return receipt;
        })
    };
    return {
        runId: run.runId,
        invocation: run.invocation,
        ...semanticReceipt,
        ownedServiceIds: compiled.ownedServiceIds,
        startedAtMs,
        durationMs,
        operations,
        manifestHash: (0, sha256_1.sha256HexSyncText)((0, hash_1.canonicalJson)(semanticReceipt))
    };
}
function list(values) {
    return values.length === 0 ? '(none)' : values.join(', ');
}
function formatABFeatureSetManifestMarkdown(manifest) {
    const lines = [
        '# ABFeatureSet Execution Manifest',
        '',
        `- run: \`${manifest.runId}\``,
        `- invocation: \`${manifest.invocation}\``,
        `- set: \`${manifest.setId}\``,
        `- plan fingerprint: \`${manifest.planFingerprint}\``,
        `- manifest hash: \`${manifest.manifestHash}\``,
        `- owned features: ${list(manifest.ownedFeatureIds.map((id) => `\`${id}\``))}`,
        `- owned services: ${list(manifest.ownedServiceIds.map((id) => `\`${id}\``))}`,
        `- enabled features: ${list(manifest.enabledFeatureIds.map((id) => `\`${id}\``))}`,
        `- imported features: ${list(manifest.importedFeatureIds.map((id) => `\`${id}\``))}`,
        `- locally operationless features: ${list(manifest.locallyOperationlessFeatureIds.map((id) => `\`${id}\``))}`,
        `- total time: ${manifest.durationMs.toFixed(3)} ms`,
        ''
    ];
    for (const operation of manifest.operations) {
        lines.push(`## ${operation.opId}`, '', `- time: ${operation.durationMs.toFixed(3)} ms`, `- declared consumes: ${list(operation.declaredConsumes.map((slot) => `\`${slot}\``))}`, `- actual consumes: ${list(operation.actualConsumes.map((slot) => `\`${slot}\``))}`, `- declared produces: ${list(operation.declaredProduces.map((slot) => `\`${slot}\``))}`, `- actual produces: ${list(operation.actualProduces.map((slot) => `\`${slot}\``))}`, `- probes: ${operation.probes.length === 0
            ? '(none)'
            : operation.probes.map((probe) => `\`${probe.name}=${probe.value}\``).join(', ')}`, `- artifacts: ${operation.artifacts.length === 0
            ? '(none)'
            : operation.artifacts
                .map((artifact) => `\`${artifact.id} ${artifact.kind} sha256=${artifact.sha256}\``)
                .join(', ')}`, '');
    }
    return lines.join('\n');
}
//# sourceMappingURL=feature-set.js.map