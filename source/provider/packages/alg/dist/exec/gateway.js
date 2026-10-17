"use strict";
// R1 / BUILD-3: THE gateway. executeCompiledPlan is the only function in
// this codebase allowed to walk a CompiledExecutionPlan's operation list —
// engine.ts's runEngine calls this and nothing else touches operations
// directly. Writes no files itself: artifacts and receipts flow through
// the caller-supplied ExecSink (R1). No node:fs/node:path here or
// anywhere it imports.
//
// Synchronous by design (see sha256.ts's header): runEngine's public
// contract — and the parity-pinned test that calls runThreeFactor
// synchronously — predates this wave and is a hard invariant, so the ONE
// gateway had to become sync-capable rather than runEngine growing an
// async escape hatch around it.
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeCompiledPlan = executeCompiledPlan;
exports.executeCompiledPlanAsync = executeCompiledPlanAsync;
const board_1 = require("./board");
const sink_1 = require("./sink");
const operations_1 = require("./operations");
const sha256_1 = require("./sha256");
const DEFAULT_OPERATION_RUNTIME = {
    implementations: operations_1.operationImpls,
    calculationBindings: operations_1.operationCalculationBindings,
    artifactExtractors: operations_1.ARTIFACT_EXTRACTORS
};
function now() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
function freezeCalculations(op, impl, runtime) {
    const declared = op.calculations ?? [`fn.${op.id}`];
    const bindings = runtime.calculationBindings?.get(op.id) ??
        declared.map((address) => ({ address, calculate: impl }));
    if (bindings.length !== declared.length ||
        bindings.some((binding, index) => binding.address !== declared[index])) {
        throw new Error(`executeCompiledPlan: Tick '${op.id}' calculation bindings disagree with its declared fn.* addresses. ` +
            `declared=[${declared.join(', ')}] bound=[${bindings.map((binding) => binding.address).join(', ')}]`);
    }
    return bindings.map((binding) => ({
        address: binding.address,
        implementationHash: (0, sha256_1.sha256HexSyncText)(Function.prototype.toString.call(binding.calculate)),
        identityScope: 'runtime-function-body',
        limitation: 'called helpers, constants, templates, and assets are not covered'
    }));
}
/**
 * Generic shape probes: for every slot an operation actually produced,
 * record its element count when the value is array-like. Cheap, universal,
 * and independent of the legacy per-UNIT ctx.measure aggregates (which
 * FeatureContext exposes write-only, so per-operation deltas aren't
 * recoverable from it) — a deliberate, disclosed scope choice: fine-grained
 * score distributions still ride ctx.measure/UnitTrace at unit level;
 * Receipt.probes carries op-level candidate-count shape instead.
 */
function shapeProbes(board, produced) {
    const probes = [];
    for (const slot of produced) {
        const value = board.get(slot);
        if (Array.isArray(value) || ArrayBuffer.isView(value)) {
            probes.push({ name: `${slot}.length`, value: value.length });
        }
    }
    return probes;
}
function assertAccessConformance(op, consumed, produced) {
    if (op.accessConformance !== 'exact')
        return;
    const declaredConsumes = new Set(op.consumes);
    const declaredProduces = new Set(op.produces);
    const missingReads = op.consumes.filter((address) => !consumed.has(address));
    const extraReads = [...consumed].filter((address) => !declaredConsumes.has(address));
    const missingWrites = op.produces.filter((address) => !produced.has(address));
    const extraWrites = [...produced].filter((address) => !declaredProduces.has(address));
    if (missingReads.length || extraReads.length || missingWrites.length || extraWrites.length) {
        throw new Error(`PxC: Tick '${op.id}' access contradicts its declaration; ` +
            `missing reads=[${missingReads.join(', ')}] extra reads=[${extraReads.join(', ')}] ` +
            `missing writes=[${missingWrites.join(', ')}] extra writes=[${extraWrites.join(', ')}].`);
    }
}
function executeCompiledPlan(plan, board, ctx, sink = (0, sink_1.createNullSink)(), runtime = DEFAULT_OPERATION_RUNTIME) {
    if (!board.has('paramsHash'))
        board.set('paramsHash', plan.paramsHash ?? plan.planFingerprint);
    const receipts = [];
    for (const op of plan.ops) {
        const impl = runtime.implementations.get(op.id);
        if (!impl)
            throw new Error(`executeCompiledPlan: no implementation registered for operation '${op.id}'.`);
        const startedAtMs = now();
        const frozenCalculations = freezeCalculations(op, impl, runtime);
        const { tracked, consumed, produced, writes } = (0, board_1.trackAccess)(board, op);
        const result = impl(tracked, ctx);
        if (result instanceof Promise) {
            throw new Error(`executeCompiledPlan: asynchronous operation '${op.id}' requires executeCompiledPlanAsync.`);
        }
        const durationMs = now() - startedAtMs;
        assertAccessConformance(op, consumed, produced);
        const artifacts = (runtime.artifactExtractors?.[op.id]?.(board) ?? []).map((a) => sink.putArtifact(a.kind, a.id, a.bytes, a.dims));
        const receipt = {
            opId: op.id,
            frozenCalculations,
            startedAtMs,
            durationMs,
            declaredConsumes: op.consumes,
            declaredProduces: op.produces,
            actualConsumes: [...consumed],
            actualProduces: [...produced],
            writes,
            probes: shapeProbes(board, produced),
            artifacts
        };
        sink.putReceipt(receipt);
        receipts.push(receipt);
    }
    return receipts;
}
/** Browser/LAB counterpart: same gateway contract, but awaits asynchronous operations in list order. */
async function executeCompiledPlanAsync(plan, board, ctx, sink = (0, sink_1.createNullSink)(), runtime = DEFAULT_OPERATION_RUNTIME) {
    if (!board.has('paramsHash'))
        board.set('paramsHash', plan.paramsHash ?? plan.planFingerprint);
    const receipts = [];
    for (const op of plan.ops) {
        const impl = runtime.implementations.get(op.id);
        if (!impl) {
            throw new Error(`executeCompiledPlanAsync: no implementation registered for operation '${op.id}'.`);
        }
        const startedAtMs = now();
        const frozenCalculations = freezeCalculations(op, impl, runtime);
        const { tracked, consumed, produced, writes } = (0, board_1.trackAccess)(board, op);
        await impl(tracked, ctx);
        const durationMs = now() - startedAtMs;
        assertAccessConformance(op, consumed, produced);
        const artifacts = (runtime.artifactExtractors?.[op.id]?.(board) ?? []).map((artifact) => sink.putArtifact(artifact.kind, artifact.id, artifact.bytes, artifact.dims));
        const receipt = {
            opId: op.id,
            frozenCalculations,
            startedAtMs,
            durationMs,
            declaredConsumes: op.consumes,
            declaredProduces: op.produces,
            actualConsumes: [...consumed],
            actualProduces: [...produced],
            writes,
            probes: shapeProbes(board, produced),
            artifacts
        };
        sink.putReceipt(receipt);
        receipts.push(receipt);
    }
    return receipts;
}
//# sourceMappingURL=gateway.js.map