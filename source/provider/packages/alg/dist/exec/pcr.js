"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.composePcr = composePcr;
exports.pcrRenderId = pcrRenderId;
const hash_1 = require("../detectors/threeFactor/hash");
const sha256_1 = require("./sha256");
function frozenTickIdentity(tick) {
    return {
        opId: tick.opId,
        frozenCalculations: tick.frozenCalculations,
        actualConsumes: tick.actualConsumes,
        actualProduces: tick.actualProduces,
        writes: tick.writes,
        artifacts: tick.artifacts.map((artifact) => ({
            id: artifact.id,
            kind: artifact.kind,
            sha256: artifact.sha256,
            dims: artifact.dims ?? null
        }))
    };
}
function composePcr(spec, plan, testimony) {
    if (spec.tickIds.length === 0)
        throw new Error(`PCR '${spec.id}' requires at least one Tick.`);
    const operationById = new Map(plan.ops.map((operation) => [operation.id, operation]));
    const testimonyById = new Map(testimony.map((tick) => [tick.opId, tick]));
    const seen = new Set();
    const ticks = spec.tickIds.map((tickId) => {
        if (seen.has(tickId))
            throw new Error(`PCR '${spec.id}' names Tick '${tickId}' twice.`);
        seen.add(tickId);
        const operation = operationById.get(tickId);
        if (!operation)
            throw new Error(`PCR '${spec.id}' has no planned Tick '${tickId}'.`);
        const tick = testimonyById.get(tickId);
        if (!tick)
            throw new Error(`PCR '${spec.id}' Tick '${tickId}' never ran.`);
        return { operation, testimony: tick };
    });
    const paramsHash = plan.paramsHash ?? null;
    const runResultId = (0, sha256_1.sha256HexSyncText)((0, hash_1.canonicalJson)({
        planFingerprint: plan.planFingerprint,
        paramsHash,
        ticks: ticks.map(({ testimony: tick }) => frozenTickIdentity(tick))
    }));
    return {
        schema: 'chainspot-pcr@1',
        id: spec.id,
        title: spec.title,
        planFingerprint: plan.planFingerprint,
        paramsHash,
        runResultId,
        runResultIdentityScope: 'tick-testimony-and-materializations',
        runResultIdentityLimitation: 'opaque PxC output values require an emitted Materialization',
        ticks
    };
}
/** View identity is a pure projection of a frozen PCR; it cannot execute CV. */
function pcrRenderId(pcr, viewArgs) {
    return (0, sha256_1.sha256HexSyncText)((0, hash_1.canonicalJson)({ runResultId: pcr.runResultId, viewArgs }));
}
//# sourceMappingURL=pcr.js.map