"use strict";
// Deterministic identity for reviewed spatial traces.
//
// Wall-clock spans and heatmap bytes are deliberately excluded: they are not
// semantic testimony and would make the same execution hash differently. The
// payload includes every structured S0 row and drawable, so CLI and visual
// consumers can prove that they read the same reviewed trace.
Object.defineProperty(exports, "__esModule", { value: true });
exports.semanticTracePayload = semanticTracePayload;
exports.makeTraceRunId = makeTraceRunId;
exports.sealTrace = sealTrace;
const sha256_1 = require("../../../exec/sha256");
const hash_1 = require("../hash");
function unitPayload(unit) {
    const { ms: _ms, ...semantic } = unit;
    return semantic;
}
/** The exact stable payload hashed for trace↔CLI↔Visual correspondence. */
function semanticTracePayload(trace, identity) {
    return {
        schema: 'chainspot-semantic-trace@1',
        runId: identity.runId,
        imageId: identity.imageId,
        configName: trace.configName,
        paramsHash: trace.paramsHash,
        execution: trace.execution,
        features: trace.features,
        units: trace.units.map(unitPayload),
        ...(trace.straightTest ? { straightTest: trace.straightTest } : {})
    };
}
function makeTraceRunId(imageId, paramsHash, planFingerprint) {
    return (0, sha256_1.sha256HexSyncText)((0, hash_1.canonicalJson)({ schema: 'chainspot-run-id@1', imageId, paramsHash, planFingerprint }));
}
/** Return a trace with immutable correspondence identity attached. */
function sealTrace(trace, identity) {
    const traceHash = (0, sha256_1.sha256HexSyncText)((0, hash_1.canonicalJson)(semanticTracePayload(trace, identity)));
    return { ...trace, ...identity, traceHash };
}
//# sourceMappingURL=traceIdentity.js.map