import assert from 'node:assert/strict';
import { test } from 'node:test';
import { layerLedger } from './layers.mjs';

// A 10x1 frame, all opaque. S1 owns px 0-1 with a mute fringe 0-3.
const frame = () => new Uint8ClampedArray(10 * 4).fill(255);
const s1 = { owned: new Set([0, 1]), muted: new Set([0, 1, 2, 3]) };

test('a disjoint layer balances by set arithmetic and raster recount', () => {
  const claimed = new Set([5, 6]);
  const { ledger, remainingRgba } = layerLedger({ width: 10, height: 1, rgba: frame(), s1, claimed, claimedVisits: 2 });
  assert.equal(ledger.remainingEnteringPx, 6);
  assert.equal(ledger.remainingLeavingPx, 4);
  assert.equal(ledger.rasterRecountHolds, true);
  assert.equal(ledger.explainedByMuteOverlap, false);
  assert.equal(ledger.muteFringeOverlapPx, 0);
  assert.equal([...remainingRgba].filter((_, i) => i % 4 === 3 && remainingRgba[i] === 0).length, 6);
});

test('px shared only with the S1 mute fringe are explained, and the recounted figure is carried forward', () => {
  const claimed = new Set([3, 4, 5]);
  const { ledger } = layerLedger({ width: 10, height: 1, rgba: frame(), s1, claimed, claimedVisits: 3 });
  assert.equal(ledger.rasterRecountHolds, false);
  assert.equal(ledger.muteFringeOverlapPx, 1);
  assert.equal(ledger.explainedByMuteOverlap, true);
  assert.equal(ledger.setArithmeticLeavingPx, 3);
  assert.equal(ledger.remainingLeavingPx, 4, 'what the next layer finds entering');
});

test('a stack layer: priors are named, and px shared with a prior OWNED set are never explained', () => {
  const priors = [{ name: 'S2Claimed', set: new Set([6, 7]) }];
  const ok = layerLedger({ width: 10, height: 1, rgba: frame(), s1, priors, claimed: new Set([8]), claimedVisits: 1 }).ledger;
  assert.deepEqual(Object.keys(ok.intersections), ['vsS1Owned', 'vsS1Muted', 'vsS2Claimed', 'vsPriorConsumed']);
  assert.equal(ok.s2ClaimedPx, 2);
  assert.equal(ok.priorConsumedUnionPx, 6);
  assert.equal(ok.remainingEnteringPx, 4);
  assert.equal(ok.rasterRecountHolds, true);
  const bad = layerLedger({ width: 10, height: 1, rgba: frame(), s1, priors, claimed: new Set([7, 8]), claimedVisits: 2 }).ledger;
  assert.equal(bad.rasterRecountHolds, false);
  assert.equal(bad.explainedByMuteOverlap, false);
  const ownedHit = layerLedger({ width: 10, height: 1, rgba: frame(), s1, claimed: new Set([1, 5]), claimedVisits: 2 }).ledger;
  assert.equal(ownedHit.explainedByMuteOverlap, false);
});
