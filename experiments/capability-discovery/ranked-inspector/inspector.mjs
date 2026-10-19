/** Opt-in saved metadata inspection; no provider imports, ranking or PCR execution. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { resolve, join } from 'node:path';

const OP = 'assignment.ranking';
const ID = 'lab14.assignment.ranking.alternatives';
const SCHEMA = 'lab14-ranked-alternatives@1';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const PROJECTION = 'Display subset only: badgeId, pairId, score, supportMean, rank; complete admitted payload is retained separately.';
function declined(status, reason, provenance) {
  return { schema: 'lab15-ranked-inspection@1', status, reason, provenance,
    payload: null, rows: [], projectionLimit: PROJECTION };
}

/** Reuses E4413's exact bytes/ref/receipt/PCR association; never trusts record.ranked. */
export function inspect({ runtimePath, artifactDir, recordLabel }) {
  const provenance = { runtimePath: resolve(runtimePath), artifactDir: resolve(artifactDir), recordLabel,
    identityLimit: 'Recorded PCR identity is carried, not recomputed or independently authenticated; no image, geometry, ownership or native-input claim.' };
  let runtimeBytes;
  try { runtimeBytes = readFileSync(provenance.runtimePath); }
  catch (error) { return declined('unavailable', `runtime bytes unavailable: ${error.code}`, provenance); }
  provenance.runtimeSha256 = sha(runtimeBytes);
  try {
    const runtime = JSON.parse(runtimeBytes);
    if (!Array.isArray(runtime.records)) throw new Error('captured records missing');
    const matches = runtime.records.map((record, index) => ({ record, index }))
      .filter(({ record }) => record.label === recordLabel);
    if (matches.length !== 1) throw new Error('exactly one matching record required');
    const { record, index } = matches[0];
    if (record.error !== null) throw new Error('record did not complete successfully');
    if (!Array.isArray(record.artifacts)) throw new Error('artifact list missing');
    if (record.artifacts.length === 0) return declined('unavailable', 'record has no saved artifact', provenance);
    if (record.artifacts.length !== 1) throw new Error('one ranked artifact required');
    const artifact = record.artifacts[0], ref = artifact.ref;
    if (ref?.kind !== 'candidateSet' || ref.id !== ID) throw new Error('unsupported artifact kind/id');
    const receipt = record.receipts?.[0], tick = record.pcr?.ticks?.[0];
    if (record.receipts?.length !== 1 || record.pcr?.schema !== 'chainspot-pcr@1' ||
      record.pcr.ticks.length !== 1 || tick?.operation?.id !== OP || receipt?.opId !== OP ||
      !isDeepStrictEqual(tick.testimony, receipt) || !isDeepStrictEqual(receipt.artifacts, [ref]) ||
      !isDeepStrictEqual(receipt.actualConsumes, ['assignment.scoredPairs']) ||
      !isDeepStrictEqual(receipt.actualProduces, ['assignment.rankedByBadge']) ||
      !tick.operation.produces?.includes('assignment.rankedByBadge'))
      throw new Error('artifact/receipt/PCR testimony association mismatch');
    Object.assign(provenance, { ref, pcrRunResultId: record.pcr.runResultId,
      planFingerprint: record.pcr.planFingerprint, paramsHash: record.pcr.paramsHash,
      operation: OP, artifactPath: join(provenance.artifactDir, `artifact-${String(index).padStart(2, '0')}-0.json`) });
    let bytes;
    try { bytes = readFileSync(provenance.artifactPath); }
    catch (error) { return declined('unavailable', `artifact bytes unavailable: ${error.code}`, provenance); }
    if (typeof artifact.bytesBase64 !== 'string' || !bytes.equals(Buffer.from(artifact.bytesBase64, 'base64')) ||
      sha(bytes) !== ref.sha256) throw new Error('saved bytes do not match captured bytes/ref digest');
    const payload = JSON.parse(bytes);
    if (!isDeepStrictEqual(payload, artifact.json)) throw new Error('saved bytes differ from captured JSON');
    if (payload.schema !== SCHEMA || !Array.isArray(payload.groups) ||
      !payload.groups.every(group => typeof group.badgeId === 'string' && Array.isArray(group.rows) &&
        group.rows.every(row => row && typeof row.raw === 'object' && row.raw !== null)))
      throw new Error('unsupported ranked payload shape/schema');
    const rows = payload.groups.flatMap(group => group.rows.map(row => ({ badgeId: group.badgeId,
      pairId: row.raw.pairId, score: row.score, supportMean: row.raw.supportMean, rank: row.rank })));
    return { schema: 'lab15-ranked-inspection@1', status: rows.length ? 'admitted-nonempty' : 'admitted-empty',
      reason: null, provenance: { ...provenance, artifactBytes: bytes.length }, payload, rows, projectionLimit: PROJECTION };
  } catch (error) {
    return declined('incompatible', error.message, provenance);
  }
}

/** Explicitly lossy display projection. Full payload remains in the JSON report. */
export function toTsv(report) {
  const cell = value => String(value ?? '').replace(/[\t\r\n]/g, ' ');
  const lines = [
    ['status', report.status], ['reason', report.reason], ['projection', report.projectionLimit],
    ['recordLabel', report.provenance.recordLabel], ['artifactSha256', report.provenance.ref?.sha256],
    ['pcrRunResultId', report.provenance.pcrRunResultId],
    ['badgeId', 'pairId', 'score', 'supportMean', 'rank'],
    ...report.rows.map(row => [row.badgeId, row.pairId, row.score, row.supportMean, row.rank])
  ];
  return lines.map(line => line.map(cell).join('\t')).join('\n') + '\n';
}
