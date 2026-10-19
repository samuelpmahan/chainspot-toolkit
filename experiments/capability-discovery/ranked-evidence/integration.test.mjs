import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { ARTIFACT, SCHEMA, OP, INPUT, OUTPUT, freeze, loadNative, run, series,
  assertAlternativeChange, writeRuntimeReport } from './fixture.mjs';

let native;
const arm = process.env.LAB14_RANKED_ARM ?? 'baseline';
before(() => { assert.ok(['baseline', 'bridge'].includes(arm)); native = loadNative(); });
after(writeRuntimeReport);

// Independent complete-row oracle; no comparator, ranker, or production serializer.
function expectedRow(suffix, badge, score, supportMean, rank) {
  return { raw: {
    pairId: `fixture-${suffix}`, badgeId: `fixture-badge-${badge}`,
    teeId: `fixture-tee-${suffix}`, basketId: `fixture-basket-${suffix}`,
    teeLeg: { endpointId: 'fixture-end', geodesic: 0, path: [], reachable: true },
    basketLeg: { endpointId: 'fixture-end', geodesic: 0, path: [], reachable: true },
    supportMean, supportMin: 0, supportedFraction: 0, worstWindowMean: 0,
    weakSpanCount: 0, weakSpanLongestPx: 0, pathLengthPx: 0, straightDistancePx: 0,
    efficiency: 1, endpointSupportTee: 0, endpointSupportBasket: 0, failureReason: null
  }, score, rank, factors: { alignment: 0.5, zone: 0.5, simplePath: 0.5,
    teeOrientation: 0.5, badgeFraction: 0.5, collinearity: 0.5,
    basketIdentity: 0.5, recoveredPrior: 0.5, zfit: 0.5 } };
}
const expectedA = [
  { badgeId: 'fixture-badge-a', rows: [expectedRow('a1', 'a', 0.9, 0.5, 1),
    expectedRow('a3', 'a', 0.6, 0.8, 2), expectedRow('a2', 'a', 0.6, 0.4, 3)] },
  { badgeId: 'fixture-badge-b', rows: [expectedRow('b1', 'b', 0.8, 0.5, 1)] }
];
const expectedB = [
  { badgeId: 'fixture-badge-a', rows: [expectedRow('a1', 'a', 0.9, 0.5, 1),
    expectedRow('a2', 'a', 0.65, 0.4, 2), expectedRow('a3', 'a', 0.6, 0.8, 3)] },
  { badgeId: 'fixture-badge-b', rows: [expectedRow('b1', 'b', 0.8, 0.5, 1)] }
];
const expected = [expectedA, expectedB, expectedA];

function assertRanked(results) {
  results.forEach((result, index) => {
    assert.deepEqual(result.ranked, expected[index], 'full ranked values/order differ from hand oracle');
    assert.equal(result.receipts.length, 1);
    const tick = result.receipts[0];
    assert.equal(tick.opId, OP);
    assert.deepEqual(tick.actualConsumes, [INPUT]);
    assert.deepEqual(tick.actualProduces, [OUTPUT]);
    assert.deepEqual(tick.writes, [{ address: OUTPUT, kind: 'new-address' }]);
    assert.deepEqual(tick.frozenCalculations.map(calculation => calculation.address), ['fn.rankTeeBasketPairsByBadge']);
    assert.deepEqual(tick.probes, []);
    assert.equal(result.pcr.runResultIdentityScope, 'tick-testimony-and-materializations');
    assert.deepEqual(result.ranked.map(group => group.rows[0].raw.pairId), ['fixture-a1', 'fixture-b1']);
  });
}

// Break caught: changing ranking source values/order or adding a default materialization.
test('existing OFF control preserves full loser-change ranking and disclosed opaque identity', () => {
  const results = series(native, native.runtime, 'off-control');
  assertRanked(results);
  results.forEach(result => assert.equal(result.artifacts.length, 0));
  assert.equal(results[0].pcr.runResultId, results[1].pcr.runResultId);
  assert.equal(results[0].pcr.runResultId, results[2].pcr.runResultId);
});

// Break caught: absent/lossy bridge, reordered or dropped raw/factor fields, winner-only evidence.
// Baseline intentionally reaches the desired missing-artifact assertion, not a missing import.
test('desired capability: complete losing alternatives reach materialization and PCR identity', async () => {
  let runtime = native.runtime;
  if (arm === 'bridge') {
    const { withRankedEvidence } = await import('./adapter.mjs');
    assert.equal(withRankedEvidence(native.runtime), native.runtime, 'adapter must default OFF');
    assert.equal(withRankedEvidence(native.runtime, { enabled: false }), native.runtime);
    runtime = withRankedEvidence(native.runtime, { enabled: true });
  }
  const results = series(native, runtime, `desired-${arm}`);
  assertRanked(results);
  assertAlternativeChange(results);
  results.forEach((result, index) => assert.deepEqual(result.artifacts[0].json,
    { schema: SCHEMA, groups: expected[index] }, 'artifact must retain every full ordered row'));
  if (arm === 'bridge') {
    const off = series(native, native.runtime, 'off-after-bridge');
    assertRanked(off);
    off.forEach(result => assert.equal(result.artifacts.length, 0));
    assert.equal(off[0].pcr.runResultId, off[1].pcr.runResultId);
    assert.equal(off[0].pcr.runResultId, off[2].pcr.runResultId);
  }
});

// Test-only deliberately lossy projection: never a replacement producer or product extractor.
test('winner-only real-sink counterexample fails the same losing-alternative identity oracle', () => {
  const runtime = { ...native.runtime, artifactExtractors: { ...native.runtime.artifactExtractors,
    [OP]: board => [{ kind: 'candidateSet', id: ARTIFACT, bytes: new TextEncoder().encode(JSON.stringify({
      schema: SCHEMA, groups: [...board.get(OUTPUT)].map(([badgeId, rows]) => ({ badgeId, rows: rows.slice(0, 1) }))
    })) }] } };
  const results = series(native, runtime, 'winner-only');
  assertRanked(results);
  assert.throws(() => assertAlternativeChange(results), error => error.code === 'ERR_ASSERTION' &&
    error.message.includes('losing alternatives must change artifact identity'));
});

// FIRST-GREEN boundary characterization: supports consumer shape/missingness, not new RED evidence.
test('existing empty/single/lexical-tie and missing-input boundaries stay explicit', () => {
  assert.deepEqual(run(native, freeze([]), native.runtime, 'empty').ranked, []);
  const single = expectedRow('single', 'only', 0.6, 0.5, 0);
  assert.deepEqual(run(native, freeze([single]), native.runtime, 'single').ranked,
    [{ badgeId: 'fixture-badge-only', rows: [expectedRow('single', 'only', 0.6, 0.5, 1)] }]);
  const tied = freeze([expectedRow('tie-z', 'tie', 0.6, 0.5, 0), expectedRow('tie-a', 'tie', 0.6, 0.5, 0)]);
  assert.deepEqual(run(native, tied, native.runtime, 'lexical-tie').ranked,
    [{ badgeId: 'fixture-badge-tie', rows: [expectedRow('tie-a', 'tie', 0.6, 0.5, 1), expectedRow('tie-z', 'tie', 0.6, 0.5, 2)] }]);
  assert.throws(() => run(native, undefined, native.runtime, 'missing-input'), /read missing address 'assignment\.scoredPairs'/);
});
