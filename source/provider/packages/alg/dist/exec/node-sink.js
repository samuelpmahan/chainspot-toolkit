"use strict";
// R1: the ONLY file in exec/** allowed to touch node:fs/node:path. Never
// imported by contract.ts, board.ts, sink.ts, compile.ts, operations.ts,
// sha256.ts or gateway.ts — those stay browser-safe. This is the Node-only
// proof-plan sink: artifacts land under <outDir>/artifacts/<kind>/<id>.bin,
// receipts are appended one JSON object per line to
// <outDir>/receipts.jsonl. Deterministic given a deterministic outDir +
// plan: same plan, same inputs, same bytes on disk every run. Synchronous
// throughout (writeFileSync/appendFileSync + sha256.ts's sync digest) to
// match ExecSink's synchronous contract.
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNodeSink = createNodeSink;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const sha256_1 = require("./sha256");
function createNodeSink(outDir) {
    const artifactsDir = (0, node_path_1.join)(outDir, 'artifacts');
    (0, node_fs_1.mkdirSync)(artifactsDir, { recursive: true });
    const receiptsPath = (0, node_path_1.join)(outDir, 'receipts.jsonl');
    if ((0, node_fs_1.existsSync)(receiptsPath))
        (0, node_fs_1.writeFileSync)(receiptsPath, '');
    return {
        putArtifact(kind, id, bytes, dims) {
            const sha256 = (0, sha256_1.sha256HexSync)(bytes);
            const kindDir = (0, node_path_1.join)(artifactsDir, kind);
            (0, node_fs_1.mkdirSync)(kindDir, { recursive: true });
            const filePath = (0, node_path_1.join)(kindDir, `${id}.bin`);
            (0, node_fs_1.writeFileSync)(filePath, bytes);
            return { id, kind, sha256, uri: `file://${filePath.replace(/\\/g, '/')}`, ...(dims ? { dims } : {}) };
        },
        putReceipt(receipt) {
            (0, node_fs_1.appendFileSync)(receiptsPath, `${JSON.stringify(receipt)}\n`);
        }
    };
}
//# sourceMappingURL=node-sink.js.map