import type { ArtifactKind, ArtifactRef, RasterDims, Receipt } from './contract';
export interface ExecSink {
    putArtifact(kind: ArtifactKind, id: string, bytes: Uint8Array, dims?: RasterDims): ArtifactRef;
    putReceipt(receipt: Receipt): void;
}
/** No-op sink: hashes nothing, stores nothing, for callers that don't want receipts/artifacts collected (the trace-off fast path). */
export declare function createNullSink(): ExecSink;
export interface MemorySink extends ExecSink {
    readonly artifacts: ArtifactRef[];
    readonly receipts: Receipt[];
    readonly blobs: Map<string, Uint8Array>;
}
/** In-memory sink: the browser-safe default. Collects everything for the caller to inspect or hand to its own storage. */
export declare function createMemorySink(): MemorySink;
