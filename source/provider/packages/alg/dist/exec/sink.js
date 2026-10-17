"use strict";
// R1: the injected sink boundary. executeCompiledPlan (gateway.ts) never
// touches disk itself — it hands artifact bytes and receipts to whatever
// ExecSink the caller provides. This file stays browser-safe: sha256.ts's
// synchronous hash (not Web Crypto) so the sink interface — and therefore
// executeCompiledPlan — can stay synchronous, matching runEngine's
// existing public (and parity-pinned) synchronous contract. The Node
// filesystem sink lives in node-sink.ts, a separate module the core never
// imports.
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNullSink = createNullSink;
exports.createMemorySink = createMemorySink;
const sha256_1 = require("./sha256");
/** No-op sink: hashes nothing, stores nothing, for callers that don't want receipts/artifacts collected (the trace-off fast path). */
function createNullSink() {
    return {
        putArtifact(kind, id, _bytes, dims) {
            return { id, kind, sha256: '', uri: '', ...(dims ? { dims } : {}) };
        },
        putReceipt() { }
    };
}
/** In-memory sink: the browser-safe default. Collects everything for the caller to inspect or hand to its own storage. */
function createMemorySink() {
    const artifacts = [];
    const receipts = [];
    const blobs = new Map();
    return {
        artifacts,
        receipts,
        blobs,
        putArtifact(kind, id, bytes, dims) {
            const sha256 = (0, sha256_1.sha256HexSync)(bytes);
            const ref = { id, kind, sha256, uri: `memory://${id}`, ...(dims ? { dims } : {}) };
            blobs.set(id, bytes);
            artifacts.push(ref);
            return ref;
        },
        putReceipt(receipt) {
            receipts.push(receipt);
        }
    };
}
//# sourceMappingURL=sink.js.map