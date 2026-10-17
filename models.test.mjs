import test from 'node:test';
import assert from 'node:assert/strict';
import { compareModels, projectGraph, projectInventory, projectLineage } from './models.mjs';

const facts = {
  checkpoint: { id: 'cp2', base: '5433854c72b1dc5aa420934d91e16458c2abe09f', files: [
    { path: 'target.json', sha256: 't2', size: 10, mode: '100644' },
    { path: 'renderer.mjs', sha256: 'r1', size: 80, mode: '100644' },
    { path: 'unrelated.txt', sha256: 'u1', size: 3, mode: '100644' },
    { path: 'source/provider/package.json', sha256: 'p1', size: 2, mode: '100644' },
  ] },
  declarations: [
    { path: 'target.json', kind: 'target', dependencies: ['renderer.mjs'], target: 'badge-width', ticks: ['S7'], sha256: 't2' },
    { path: 'renderer.mjs', kind: 'renderer', dependencies: [], sha256: 'r1' },
  ],
  requests: [
    { id: 'req-a', target: 'badge-width', args: { width: 8 }, selectedTicks: ['S7'], fingerprint: 'fp-a' },
    { id: 'req-b', target: 'badge-width', args: { width: 9 }, selectedTicks: ['S7'], fingerprint: 'fp-b' },
  ],
  attempts: [
    { id: 'ok', requestId: 'req-a', checkpointId: 'cp2', fingerprint: 'fp-a', status: 'SUCCESS', nativeObservation: { width: 27.75, evidencePath: 'attempts/ok/result.json' }, evidence: [{ path: 'attempts/ok/result.json', sha256: 'e1' }], acceptance: 'ACCEPTED' },
    { id: 'failed', requestId: 'req-b', checkpointId: 'cp2', fingerprint: 'fp-b', status: 'FAILED', evidence: [{ path: 'attempts/failed/result.json', sha256: 'e2' }], acceptance: 'REJECTED' },
  ],
  evidenceFiles: [
    { path: 'attempts/ok/result.json', sha256: 'e1' },
    { path: 'attempts/failed/result.json', sha256: 'e2' },
  ],
};

test('inventory identifies checkpoint-only files and preserves unknown change state', () => {
  const inventory = projectInventory(facts);
  assert.equal(inventory.base, facts.checkpoint.base);
  assert.equal(inventory.files.find((f) => f.path === 'unrelated.txt').declaration, null);
  assert.equal(inventory.files.find((f) => f.path === 'target.json').freshness, 'CURRENT');
  assert.equal(inventory.changedPaths, 'UNKNOWN');
});

test('graph expands recursive dependencies and reports undeclared dependency gaps', () => {
  const graph = projectGraph(facts);
  assert.deepEqual(graph.closure('target.json'), { paths: ['renderer.mjs', 'target.json'], unknownPaths: [] });
  const amended = { ...facts, declarations: [facts.declarations[0], { path: 'renderer.mjs', kind: 'renderer', sha256: 'r1', dependencies: ['missing.mjs'] }] };
  assert.deepEqual(projectGraph(amended).closure('target.json').unknownPaths, ['missing.mjs']);
  assert.equal(graph.nodes.find((n) => n.path === 'target.json').freshness, 'CURRENT');
});

test('graph treats checkpoint file leaves and directories as known terminal dependencies', () => {
  const withProvider = { ...facts, declarations: [...facts.declarations, { path: 'bundle.json', kind: 'target', sha256: 'b1', dependencies: ['source/provider'] }],
    checkpoint: { ...facts.checkpoint, files: [...facts.checkpoint.files, { path: 'bundle.json', sha256: 'b1', size: 2, mode: '100644' }] } };
  const closure = projectGraph(withProvider).closure('bundle.json');
  assert.deepEqual(closure, { paths: ['bundle.json', 'source/provider'], unknownPaths: [] });
  assert.equal(projectGraph(withProvider).edges.find((e) => e.to === 'source/provider').known, true);
});

test('lineage exposes freshness, request arguments, and acceptance separately', () => {
  const lineage = projectLineage(facts);
  assert.equal(lineage.attempts[0].freshness, 'CURRENT');
  assert.equal(lineage.attempts[0].acceptance, 'ACCEPTED');
  assert.deepEqual(lineage.attempts[0].nativeObservation, { width: 27.75, evidencePath: 'attempts/ok/result.json' });
  assert.deepEqual(lineage.attempts[1].request.args, { width: 9 });
});

test('comparison covers exact executable queries without selecting arbitrary winners', () => {
  const compared = compareModels(facts, [
    { target: 'badge-width', args: { width: 8 }, selectedTicks: ['S7'], path: 'target.json' },
    { target: 'badge-width', args: { width: 9 }, selectedTicks: ['S7'], path: 'target.json' },
    { target: 'badge-width', args: { width: 10 }, selectedTicks: ['S7'], path: 'target.json' },
  ]);
  assert.deepEqual(compared.results.map((r) => r.answers.lineage.execution), ['SUCCEEDED', 'FAILED', 'UNKNOWN']);
  assert.equal(compared.results[0].answers.humanAcceptance, 'ACCEPTED');
  assert.equal(compared.results[0].answers.lineage.priorAttempts[0].nativeObservation.width, 27.75);
  assert.equal(compared.results[0].answers.inventory.freshness, 'CURRENT');
  assert.equal(compared.results[0].answers.graph.closure.paths.includes('target.json'), true);
});

test('an unrelated checkpoint edit does not stale target evidence, but an evidence edit does', () => {
  const edited = { ...facts, checkpoint: { ...facts.checkpoint, files: facts.checkpoint.files.map((f) => f.path === 'unrelated.txt' ? { ...f, sha256: 'u2' } : f) } };
  assert.equal(projectLineage(edited).attempts[0].freshness, 'CURRENT');
  const evidenceEdited = { ...facts, evidenceFiles: facts.evidenceFiles.map((f) => f.path === 'attempts/ok/result.json' ? { ...f, sha256: 'e3' } : f) };
  assert.equal(projectLineage(evidenceEdited).attempts[0].freshness, 'STALE_EVIDENCE');
});

test('acceptance conflicts remain ambiguous and duplicate declarations do not silently choose', () => {
  const conflict = { ...facts, attempts: [...facts.attempts, { ...facts.attempts[0], id: 'revoked', acceptance: 'REJECTED' }] };
  assert.equal(projectLineage(conflict).acceptance('req-a'), 'AMBIGUOUS');
  const duplicate = { ...facts, declarations: [...facts.declarations, { ...facts.declarations[1] }] };
  assert.equal(projectInventory(duplicate).files.find((f) => f.path === 'renderer.mjs').freshness, 'UNKNOWN');
  assert.deepEqual(projectGraph(duplicate).closure('target.json').unknownPaths, ['renderer.mjs']);
});

test('a changed target fingerprint does not inherit older execution or human acceptance', () => {
  const changed = { ...facts, requests: facts.requests.map((r) => r.id === 'req-a' ? { ...r, fingerprint: 'fp-new' } : r) };
  const result = compareModels(changed, [{ target: 'badge-width', args: { width: 8 }, selectedTicks: ['S7'], fingerprint: 'fp-new' }]).results[0];
  assert.equal(result.answers.lineage.execution, 'UNKNOWN');
  assert.equal(result.answers.humanAcceptance, 'UNKNOWN');
  assert.deepEqual(result.joins.attemptIds, ['ok']);
  assert.equal(result.answers.lineage.priorAttempts[0].freshness, 'STALE_TARGET');
});

test('an explicit fingerprint resolves same-argument requests when only one request owns it', () => {
  const prior = { ...facts.requests[0], id: 'req-a-old', fingerprint: 'fp-old' };
  const current = { ...facts.requests[0], id: 'req-a-current', fingerprint: 'fp-a' };
  const scenario = { ...facts, requests: [prior, current], attempts: [...facts.attempts, { ...facts.attempts[0], id: 'ok-current', requestId: 'req-a-current' }] };
  const result = compareModels(scenario, [{ target: 'badge-width', args: { width: 8 }, selectedTicks: ['S7'], fingerprint: 'fp-a' }]).results[0];
  assert.equal(result.joins.uniqueRequest, 'req-a-current');
  assert.deepEqual(result.joins.attemptIds, ['ok-current']);
});
