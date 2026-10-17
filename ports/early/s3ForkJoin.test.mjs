/**
 * Evidence-backed check of the S3 fn.Tee.findFamily fork-join on the golden
 * specimen (lane s3-findfamily-forkjoin ON). Skips, naming the command, when
 * no such Attempt is retained. Expected on golden (observed, recorded here
 * as the regression expectation, not as acceptance):
 *   pinned     18 members, 15 agree with Sam's annotation, 3 impostors
 *              (baseline tees 16, 17, 18: the SAT button and map lettering)
 *   structural 15 members, all 15 agree
 *   join       15 matched by contracts/tee.pose@1 at zero pose distance,
 *              3 only-in-pinned, 0 only-in-structural; one crop frame each
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { withAttempt } from '../../scripts/golden-attempt.mjs';

const FILES = ['stage-output/early/artifacts/s3forkjoin/cmp.fn.Tee.findFamily.json', 'stage-output/early/fg/s3.findfamily-forkjoin.frames.json', 'stage-output/early/run.receipt.json'];

test('golden findFamily fork-join reproduces the expected precision split', (t) => {
  const attempt = withAttempt(t, FILES, { lanes: ['s3-findfamily-forkjoin'] });
  if (!attempt) return;
  const { value } = JSON.parse(readFileSync(attempt.path(FILES[0]), 'utf8'));
  assert.equal(value.contract.address, 'contracts/tee.pose@1');
  assert.deepEqual([value.branches.pinned.members, value.branches.pinned.agrees, value.branches.pinned.disagrees], [18, 15, 3]);
  assert.deepEqual([value.branches.structural.members, value.branches.structural.agrees, value.branches.structural.disagrees], [15, 15, 0]);
  assert.deepEqual([value.counts.matched, value.counts['only.pinned'], value.counts['only.structural']], [15, 3, 0]);
  assert.ok(value.matched.every((r) => r.pinned.verdict === 'agrees' && r.structural.verdict === 'agrees' && r.pairs.every((p) => p.centerDistPx === 0 && p.angleDiffDeg === 0)));
  assert.ok(value.only.pinned.every((r) => r.pinned.verdict === 'disagrees'));
  assert.match(value.acceptance, /^UNKNOWN/);
  const frames = JSON.parse(readFileSync(attempt.path(FILES[1]), 'utf8'));
  assert.equal(frames.filter((f) => f.fg === 'cmp.fn.Tee.findFamily' && f.parts.some((p) => p.kind === 'raster' && p.data?.png)).length, 3);
  const receipt = JSON.parse(readFileSync(attempt.path(FILES[2]), 'utf8'));
  assert.equal(receipt.experiments.branches.S3FJ.comparison.sha256, JSON.parse(readFileSync(attempt.path(FILES[0]), 'utf8')).sha256);
});
