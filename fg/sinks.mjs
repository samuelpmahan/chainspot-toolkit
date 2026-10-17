/**
 * Artifact sinks for the fg runtime (browser-safe).
 *
 * The provider's exec layer never touches disk: executeCompiledPlan hands
 * artifact bytes to whatever ExecSink the caller injects
 * (source/provider/packages/alg/src/exec/sink.ts). The fg runtime takes
 * the same boundary so a FunctionalGuarantee can run unchanged in the
 * toolkit runner (files), the Svelte FE (memory) and tests (memory):
 *
 *   putArtifact(kind, id, bytes, dims?) -> { id, kind, sha256, bytes, uri, dims? }
 *   readArtifact(id) -> Uint8Array | undefined      (optional)
 *
 * readArtifact is what turns the old "writeFileSync, readFileSync, rehash"
 * dance in ports/early/runEarly.mjs into one uniform check: when a sink can
 * read back, ctx.artifact re-reads and rehashes every artifact it puts, and
 * the record says which artifacts were verified that way.
 *
 * The memory sink stores a COPY of the bytes, so a caller mutating its
 * buffer after the put is caught by the read-back rehash rather than
 * silently changing evidence. scopeSink prefixes ids, which is how
 * comparableForkJoin keeps two branches' identically-named artifacts apart.
 * The Node file sink lives in fg/node-sink.mjs, which this file never
 * imports.
 */
import { sha256Hex } from './canon.mjs';

export function createMemorySink() {
  const artifacts = [];
  const blobs = new Map();
  return {
    artifacts,
    blobs,
    putArtifact(kind, id, bytes, dims) {
      if (blobs.has(id)) throw new Error(`memory sink: artifact ${id} already put`);
      const copy = new Uint8Array(bytes);
      blobs.set(id, copy);
      const ref = { id, kind, sha256: sha256Hex(copy), bytes: copy.length, uri: `memory://${id}`, ...(dims ? { dims } : {}) };
      artifacts.push(ref);
      return ref;
    },
    readArtifact(id) {
      return blobs.get(id);
    }
  };
}

export function scopeSink(sink, prefix) {
  const scoped = (id) => `${prefix}/${id}`;
  return {
    putArtifact: (kind, id, bytes, dims) => sink.putArtifact(kind, scoped(id), bytes, dims),
    ...(typeof sink.readArtifact === 'function' ? { readArtifact: (id) => sink.readArtifact(id) } : {})
  };
}
