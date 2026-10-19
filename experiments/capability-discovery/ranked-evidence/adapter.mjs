/**
 * Default-OFF materialization of already-ranked alternatives, not selection.
 * Caller supplies trusted complete finite JSON-safe ScoredPairEvidence rows.
 * This is not a serializer for arbitrary Maps, nonfinite values or typed arrays.
 */
const OP = 'assignment.ranking';
const OUTPUT = 'assignment.rankedByBadge';
const ARTIFACT = 'lab14.assignment.ranking.alternatives';
const SCHEMA = 'lab14-ranked-alternatives@1';

/** Preserve the original runtime/defaults; ON copies only the extractor table. */
export function withRankedEvidence(runtime, { enabled = false } = {}) {
  if (enabled !== true) return runtime;
  return {
    ...runtime,
    artifactExtractors: {
      ...runtime.artifactExtractors,
      [OP](board) {
        const ranked = board.get(OUTPUT);
        if (!(ranked instanceof Map)) throw new TypeError('ranked evidence requires the produced ranked Map');
        // Map iteration and existing row order are evidence: never sort/rerank.
        // JSON serialization copies every complete row/raw/factors into bytes.
        const groups = [...ranked].map(([badgeId, rows]) => ({ badgeId, rows }));
        const bytes = new TextEncoder().encode(JSON.stringify({ schema: SCHEMA, groups }));
        return [{ kind: 'candidateSet', id: ARTIFACT, bytes }];
      }
    }
  };
}
