import test from 'node:test';
import assert from 'node:assert/strict';
import { runStationEvidence, inspectStationRequest, syntheticDeclarations, planSyntheticQueries, verifySourceClosure } from './recipe.mjs';

// All tests in this file are NON-CV. No valid enabled producer is invoked.
test('disabled call does not inspect other fields or create any query rows', async () => {
  let inspected = 0;
  const input = { enabled: false, get comparisons() { inspected++; throw Error('must not read'); } };
  const result = await runStationEvidence(input);
  assert.equal(result.valueTrace.status, 'DISABLED');
  assert.equal(inspected, 0);
  assert.equal(result.valueTrace.counts.attemptedPATH, 0);
  assert.deepEqual(result.valueTrace.queryTrace, []);
  assert.equal(result.valueTrace.sourceBinding, null);
  assert.deepEqual(result.sidecar.calculationLog, []);
});

test('enabled accessor and nonboolean enabled reject without reading other properties', async () => {
  let reads = 0;
  const input = Object.defineProperty({}, 'enabled', { get() { reads++; return true; }, enumerable: true });
  for (const value of [input, { enabled: 'true' }]) {
    const { valueTrace } = await runStationEvidence(value);
    assert.equal(valueTrace.status, 'NOT_EXECUTED');
    assert.equal(valueTrace.error.code, 'INVALID_REQUEST');
    assert.equal(valueTrace.counts.attemptedPATH, 0);
  }
  assert.equal(reads, 0);
});

test('empty, sparse, extra and accessor request shapes are rejected before source reads', () => {
  const base = { schema: 'cycle05-registered-station-request@1', enabled: true, protocolId: 'synthetic8', protocolSha256: '3b7f1d2b166c759997c73f820c433ff653c84114e83c28af62c68ec003967ff5', comparisons: [] };
  for (const value of [base, { ...base, comparisons: new Array(8) }, { ...base, extra: true }, Object.defineProperty({ ...base }, 'comparisons', { get() { throw Error('must not run'); }, enumerable: true })]) {
    const out = inspectStationRequest(value);
    assert.equal(out.status, 'NOT_EXECUTED');
    assert.equal(out.error.code, 'INVALID_REQUEST');
    assert.deepEqual(out.plannedQueries, []);
  }
});

test('unadmitted protocol cannot enable a source import or call', async () => {
  const { valueTrace } = await runStationEvidence({ schema: 'cycle05-registered-station-request@1', enabled: true, protocolId: 'lenard5-extension', protocolSha256: '0'.repeat(64), comparisons: [] });
  assert.equal(valueTrace.error.code, 'PROTOCOL_MISMATCH');
  assert.equal(valueTrace.counts.attemptedPATH, 0);
  assert.equal(valueTrace.sourceBinding, null);
});

test('zero bytes with a declared frozen digest fail actual input hashing', () => {
  const declarations = syntheticDeclarations();
  const comparisons = declarations.map(d => ({ ...d, rgba: new Uint8Array(491520), mask: { data: new Uint8Array(122880), sha256: d.mask.sha256 } }));
  const out = inspectStationRequest({ schema: 'cycle05-registered-station-request@1', enabled: true, protocolId: 'synthetic8', protocolSha256: '3b7f1d2b166c759997c73f820c433ff653c84114e83c28af62c68ec003967ff5', comparisons });
  assert.equal(out.status, 'NOT_EXECUTED');
  assert.equal(out.error.code, 'INPUT_HASH_MISMATCH');
  assert.deepEqual(out.plannedQueries, []);
});

test('fixed query plan is32 actual Part-address requests with exact insertion order', () => {
  const plan = planSyntheticQueries();
  assert.equal(plan.length, 32);
  assert.deepEqual(plan.slice(0,4).map(p => p.query), ['fn.q.path.profile', 'fn.q.path.edgePair', 'fn.q.path.stationContrast', 'fn.q.path.loss']);
  assert.deepEqual(Object.keys(plan[0].rawArgs), ['raster','mask','originPx','phiRad','t0Px','t1Px','stepPx','lat0Px']);
  assert.deepEqual(plan[0].rawArgs, { raster: 'px.image.cropped', mask: 'tk.s6.pathMask', originPx: [192,160], phiRad: 0, t0Px: -8, t1Px: 8, stepPx: 1, lat0Px: 0 });
  assert.deepEqual(plan[1].rawArgs.minOk, { count: 8, ofStations: 0.2 });
  assert.equal(plan[0].widthPx, null);
  assert.equal(plan[1].widthPx, 30);
  assert.equal(plan[20].comparisonId, 'normalOffsetPlus6');
  assert.deepEqual(plan[20].rawArgs.originPx, [192,166]);
  assert.deepEqual(plan[31].rawArgs, { raster: 'px.image.cropped', mask: 'tk.s6.pathMask', originPx: [192,160], phiRad: 0, t0Px: -8, t1Px: 8, stepPx: 1, widthPx: 30, profile: null, threshold: null, tauLum: 8 });
  plan[0].rawArgs.originPx[0] = 999;
  assert.equal(planSyntheticQueries()[0].rawArgs.originPx[0], 192);
});

test('exact nine-module hashing is read-only and imports no algorithm', () => {
  const check = verifySourceClosure();
  assert.equal(check.entries.length, 9);
  assert.equal(check.verified, true);
  assert.ok(check.entries.every(e => e.expectedSha256 === e.actualSha256));
});
