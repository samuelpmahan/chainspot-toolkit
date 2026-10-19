/** Artifact-only audit/display. Imports Node builtins, never provider code. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('.', import.meta.url));
const BASE = '/workspace/scratch/86659bbafcce/lab14/S1/E4411/baseline/';
const GREEN = '/workspace/scratch/86659bbafcce/lab14/S1/E4412/green/';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sources = [];
function read(path) {
  const bytes = readFileSync(path);
  sources.push({ path, bytes: bytes.length, sha256: sha(bytes) });
  return bytes;
}
function load(directory) {
  const execution = JSON.parse(read(directory + 'execution.json'));
  const stdout = read(directory + 'stdout.txt'), stderr = read(directory + 'stderr.txt');
  assert.equal(sha(stdout), execution.stdout.sha256);
  assert.equal(stdout.length, execution.stdout.bytes);
  assert.equal(sha(stderr), execution.stderr.sha256);
  assert.equal(stderr.length, 0);
  assert.equal(execution.sourcePinsUnchanged, true);
  const runtime = JSON.parse(read(directory + 'runtime.json'));
  return { directory, execution, stdout: stdout.toString(), runtime };
}
const baseline = load(BASE), green = load(GREEN);
assert.equal(baseline.execution.exitCode, 1);
assert.match(baseline.stdout, /desired full ranking materialization is absent/);
assert.match(baseline.stdout, /pass 3/); assert.match(baseline.stdout, /fail 1/);
assert.equal(green.execution.exitCode, 0);
assert.match(green.stdout, /pass 4/); assert.match(green.stdout, /fail 0/);

// Independent, hand-derived complete expected row. No comparator or producer call.
function expectedRow(suffix, badge, score, supportMean, rank) {
  return { raw: {
    pairId: `fixture-${suffix}`, badgeId: `fixture-badge-${badge}`,
    teeId: `fixture-tee-${suffix}`, basketId: `fixture-basket-${suffix}`,
    teeLeg: { endpointId: 'fixture-end', geodesic: 0, path: [], reachable: true },
    basketLeg: { endpointId: 'fixture-end', geodesic: 0, path: [], reachable: true },
    supportMean, supportMin: 0, supportedFraction: 0, worstWindowMean: 0,
    weakSpanCount: 0, weakSpanLongestPx: 0, pathLengthPx: 0, straightDistancePx: 0,
    efficiency: 1, endpointSupportTee: 0, endpointSupportBasket: 0, failureReason: null
  }, score, rank, factors: {
    alignment: 0.5, zone: 0.5, simplePath: 0.5, teeOrientation: 0.5,
    badgeFraction: 0.5, collinearity: 0.5, basketIdentity: 0.5, recoveredPrior: 0.5, zfit: 0.5
  } };
}
function expected(phase) {
  const a1 = expectedRow('a1', 'a', 0.9, 0.5, 1);
  const a2 = expectedRow('a2', 'a', phase === 'B' ? 0.65 : 0.6, 0.4, phase === 'B' ? 2 : 3);
  const a3 = expectedRow('a3', 'a', 0.6, 0.8, phase === 'B' ? 3 : 2);
  return [{ badgeId: 'fixture-badge-a', rows: phase === 'B' ? [a1, a2, a3] : [a1, a3, a2] },
    { badgeId: 'fixture-badge-b', rows: [expectedRow('b1', 'b', 0.8, 0.5, 1)] }];
}
const phases = ['A', 'B', 'A2'];
const table = [];
for (const capture of [baseline, green]) {
  capture.runtime.records.forEach((record, index) => {
    const phase = phases.find(p => record.label.endsWith('-' + p));
    if (!phase) return;
    assert.equal(record.error, null);
    assert.deepEqual(record.ranked, expected(phase), record.label + ' full-row oracle');
    const input = JSON.parse(record.input);
    assert.deepEqual(input, [expectedRow('a2', 'a', phase === 'B' ? 0.65 : 0.6, 0.4, 0),
      expectedRow('b1', 'b', 0.8, 0.5, 0), expectedRow('a3', 'a', 0.6, 0.8, 0),
      expectedRow('a1', 'a', 0.9, 0.5, 0)]);
    assert.equal(record.receipts.length, 1);
    const receipt = record.receipts[0];
    assert.deepEqual(receipt.actualConsumes, ['assignment.scoredPairs']);
    assert.deepEqual(receipt.actualProduces, ['assignment.rankedByBadge']);
    assert.deepEqual(receipt.writes, [{ address: 'assignment.rankedByBadge', kind: 'new-address' }]);
    assert.deepEqual(receipt.probes, []);
    assert.deepEqual(record.pcr.ticks[0].testimony, receipt);
    assert.equal(record.pcr.paramsHash, null);
    assert.equal(record.pcr.planFingerprint, 'lab14-four-row-fixed-synthetic-plan@1');
    assert.equal(record.pcr.runResultIdentityLimitation, 'opaque PxC output values require an emitted Materialization');
    for (const [artifactIndex, artifact] of record.artifacts.entries()) {
      const file = capture.directory + `artifact-${String(index).padStart(2, '0')}-${artifactIndex}.json`;
      const bytes = read(file);
      assert.deepEqual(bytes, Buffer.from(artifact.bytesBase64, 'base64'));
      assert.equal(sha(bytes), artifact.ref.sha256);
      assert.equal(artifact.ref.kind, 'candidateSet');
      assert.equal(artifact.ref.id, 'lab14.assignment.ranking.alternatives');
      assert.deepEqual(JSON.parse(bytes), artifact.json);
      assert.deepEqual(receipt.artifacts[artifactIndex], artifact.ref);
      const groups = record.label.startsWith('winner-only')
        ? expected(phase).map(group => ({ badgeId: group.badgeId, rows: [group.rows[0]] })) : expected(phase);
      assert.deepEqual(artifact.json, { schema: 'lab14-ranked-alternatives@1', groups });
    }
    assert.equal(record.artifacts.length, record.label.startsWith('winner-only') || record.label.startsWith('desired-bridge') ? 1 : 0);
    table.push({ capture: capture.runtime.arm, label: record.label, phase,
      artifactSha256: record.artifacts[0]?.ref.sha256 ?? null,
      pcrRunResultId: record.pcr.runResultId,
      artifactBytes: record.artifacts[0] ? Buffer.from(record.artifacts[0].bytesBase64, 'base64').length : 0,
      rows: record.ranked.flatMap(group => group.rows.map(row => ({ badgeId: group.badgeId,
        pairId: row.raw.pairId, score: row.score, supportMean: row.raw.supportMean, rank: row.rank }))) });
  });
}
const select = (capture, prefix) => phases.map(p => table.find(r => r.capture === capture && r.label === prefix + '-' + p));
const bridge = select('bridge', 'desired-bridge');
assert.notEqual(bridge[0].artifactSha256, bridge[1].artifactSha256);
assert.equal(bridge[0].artifactSha256, bridge[2].artifactSha256);
assert.notEqual(bridge[0].pcrRunResultId, bridge[1].pcrRunResultId);
assert.equal(bridge[0].pcrRunResultId, bridge[2].pcrRunResultId);
for (const [capture, prefix] of [['baseline', 'desired-baseline'], ['bridge', 'off-control'], ['bridge', 'off-after-bridge']]) {
  const group = select(capture, prefix);
  assert.ok(group.every(r => r.artifactSha256 === null));
  assert.ok(group.every(r => r.pcrRunResultId === group[0].pcrRunResultId));
}
const winner = select('bridge', 'winner-only');
assert.ok(winner.every(r => r.artifactSha256 === winner[0].artifactSha256));
assert.ok(winner.every(r => r.pcrRunResultId === winner[0].pcrRunResultId));
assert.notEqual(winner[0].artifactSha256, bridge[0].artifactSha256);

const audit = { schema: 'lab14-e4413-artifact-audit@1', job_id: 'E4413', worker: 'S6',
  scope: 'Captured data only; no provider imports/execution, recomputation of ranking/PCR, pixels/CV or scientific-pixel claim.',
  checks: { exactCompleteFourRowOracle: true, allLosingAlternativeFieldsRetained: true,
    capturedArtifactBytesMatchBase64AndRealSha256: true, receiptPcrTestimonyMatches: true,
    bridgeArtifactAndPcrDifferThenRestore: true, winnerOnlyHashesStayEqual: true,
    offArtifactAbsenceAndOpaqueIdentityPreserved: true },
  sourceFiles: sources, table };
const lines = ['E4413 S6 CAPTURED-DATA AUDIT PASS', 'No rerank, provider imports, producer execution, PCR recomputation or CV.',
  'capture\tlabel\tartifact bytes\tartifact SHA256\tPCR runResultId\trows (pair:score:support:rank)',
  ...table.map(r => [r.capture, r.label, r.artifactBytes, r.artifactSha256 ?? 'ABSENT', r.pcrRunResultId,
    r.rows.map(x => `${x.pairId}:${x.score}:${x.supportMean}:${x.rank}`).join(' | ')].join('\t')),
  'Baseline exit1: desired full ranking materialization absent (0 !== 1); 3/4 pass.',
  'Green exit0: 4/4 pass. Broader E4412 regressions are outside this audit.',
  'OFF equal opaque identity is documented PCR scope, not a native-input collision or ranking bug.',
  'Winner-only keeps real hashes but drops losers; negative control is not a production repair.'];

const esc = s => String(s).replace(/[&<>\"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="700" viewBox="0 0 1400 700">',
  '<rect width="1400" height="700" fill="#f5f7fb"/>'];
const text = (x,y,s,size=18,color='#17253a',weight=400,family='DejaVu Sans') =>
  svg.push(`<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" fill="${color}" font-weight="${weight}">${esc(s)}</text>`);
text(28,42,'Ranked alternatives: captured evidence, not a new ranking run',28,'#12213b',700);
text(28,72,'E4413 / S6   •   Native author capture E4412: 4/4 pass, exit 0   •   Fixed fabricated plan; paramsHash omitted',17);
text(28,102,'Only losing candidate a2 changes: 0.60 → 0.65 → 0.60. Winners a1 / b1 stay unchanged.',20,'#235c55',600);
for (const [i,record] of bridge.entries()) {
  const x=28+i*452;
  svg.push(`<rect x="${x}" y="124" width="436" height="336" rx="12" fill="#ffffff" stroke="#c9d5e5"/>`);
  text(x+18,155,`${record.phase}${record.phase === 'B' ? '  •  loser changed' : record.phase === 'A2' ? '  •  restored' : '  •  initial'}`,23,'#12213b',700);
  text(x+18,186,'Candidate',15,'#59677d',600); text(x+154,186,'Score',15,'#59677d',600);
  text(x+245,186,'Support',15,'#59677d',600); text(x+353,186,'Rank',15,'#59677d',600);
  record.rows.forEach((r,j) => {
    const y=220+j*35;
    if(r.pairId === 'fixture-a2') svg.push(`<rect x="${x+10}" y="${y-23}" width="416" height="31" fill="#eaf2ff"/>`);
    text(x+18,y,r.pairId.replace('fixture-',''),21,r.rank === 1 ? '#1c5d4c' : '#17253a',r.rank===1?700:400);
    text(x+154,y,r.score.toFixed(2),21); text(x+253,y,r.supportMean.toFixed(2),21); text(x+365,y,r.rank,21);
  });
  text(x+18,366,`Artifact ${record.artifactBytes} B  ·  ${record.artifactSha256.slice(0,18)}…`,16,'#294e83',500,'DejaVu Sans Mono');
  text(x+18,397,`PCR  ${record.pcrRunResultId.slice(0,24)}…`,16,'#294e83',500,'DejaVu Sans Mono');
  text(x+18,432,'Full rows: raw + legs + factors + score + rank',14,'#59677d');
}
text(28,493,'Full artifact + PCR: A ≠ B and A = A2',22,'#235c55',700);
text(28,525,'Baseline / OFF',18,'#7c4e1c',700);
text(230,525,`No artifact; equal PCR ${select('baseline','desired-baseline')[0].pcrRunResultId.slice(0,18)}…`,18);
text(28,556,'Winner-only',18,'#7c4e1c',700);
text(230,556,`2 rows only; equal artifact ${winner[0].artifactSha256.slice(0,18)}… and equal PCR ${winner[0].pcrRunResultId.slice(0,14)}…`,18);
text(28,588,'Baseline desired test: missing capability (0 artifacts vs 1). Winner-only: lossy control, not the bridge.',17);
text(28,626,'Exact bytes/hash + complete 4-row oracle audited. Full identities and source paths: audit.json / audit.tsv.',17,'#294e83');
text(28,655,'Scope: trace/artifact view only; no provider run, rerank, PCR recomputation, CV, native-input collision or geometry claim.',16,'#59677d');
text(28,680,'Native image / Real44query HOLD unchanged. Broader regression results are outside this view.',15,'#59677d');
svg.push('</svg>');
for (const [name,bytes] of [['audit.json',JSON.stringify(audit,null,2)+'\n'],['audit.tsv',lines.join('\n')+'\n'],['view.svg',svg.join('\n')]])
  writeFileSync(OUT+name,bytes,{flag:'wx'});
console.log(lines.join('\n'));
