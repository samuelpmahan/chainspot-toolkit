import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeSignatureDescriptor, hashSignatureDescriptor, matchSignatures } from '../../fg/queries/identity.mjs';

// ChainSpot's courseSignature.ts (bare clone main) run under bun on the same inputs: fixtures/make/identity_ts.ts. The port
// equals it operation for operation: descriptors and hashes byte for byte, fits to 1e-9 (relative) on every one of the
// 22 x 22 matches (six dev courses and lenard1-5 read through the store, ChainSpot's synthetic courses, an unrelated layout).
const F = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'identity-ts.fixture.json'), 'utf8'));
const close = (a, b) => (a === b) || Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

test('descriptors and hashes equal the TS on every input', () => {
  for (const [n, input] of Object.entries(F.inputs)) {
    const d = computeSignatureDescriptor(input);
    assert.deepEqual(d, F.descriptors[n], `descriptor ${n}`);
    assert.equal(d.ok ? hashSignatureDescriptor(d) : null, F.hashes[n], `hash ${n}`);
  }
});

test('matchSignatures equals the TS on every ordered pair (matched, rms, confidence, holes, model, transform)', () => {
  let n = 0, matched = 0;
  for (const [key, want] of Object.entries(F.matches)) {
    const [a, b] = key.split('|'), got = matchSignatures(F.inputs[a], F.inputs[b], { kinds: ['badge', 'basket'] });
    assert.equal(got.matched, want.matched, key);
    assert.ok(close(Number.isFinite(got.normalizedRms) ? got.normalizedRms : null, want.normalizedRms) || (got.normalizedRms === Infinity && want.normalizedRms === null), `${key} rms ${got.normalizedRms} vs ${want.normalizedRms}`);
    assert.ok(close(got.confidence, want.confidence), key);
    assert.deepEqual(got.usedHoleNumbers, want.usedHoleNumbers, key); assert.deepEqual(got.droppedHoleNumbers, want.droppedHoleNumbers, key); assert.equal(got.model, want.model, key);
    if (want.coefficients) got.transform.coefficients.forEach((c, i) => assert.ok(close(c, want.coefficients[i]), `${key} coefficient ${i}`));
    else assert.equal(got.transform, null, key);
    n++; if (want.matched) matched++;
  }
  assert.equal(n, 484); assert.ok(matched > 22, 'the fixture holds real matches, not only rejections');
});

test("ChainSpot's own test cases hold on the port: affine fallback, outlier pruning, overlap gates", () => {
  assert.equal(matchSignatures(F.inputs['syn11'], F.inputs['syn11-affine']).model, 'affine');
  assert.ok(matchSignatures(F.inputs['syn12'], F.inputs['syn12-corrupt']).droppedHoleNumbers.includes(1));
  assert.equal(matchSignatures(F.inputs['syn18'], F.inputs['syn5']).matched, false);
  assert.equal(matchSignatures(F.inputs['syn18'], F.inputs['unrelated']).matched, false);
  assert.deepEqual(computeSignatureDescriptor(F.inputs['degenerate']), { ok: false, reason: 'degenerate-spread' });
});
