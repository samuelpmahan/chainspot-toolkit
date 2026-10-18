import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runStationEvidence } from './recipe.mjs';
import { createArtifactWriter, readSyntheticManifest } from './cli.mjs';
import { decodeBytes } from './codec.mjs';

test('exclusive writer binds original tagged bytes and refuses existing destinations', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'station-evidence-test-'));
  try {
    const out = join(parent, 'new');
    const writer = createArtifactWriter(out);
    assert.throws(() => createArtifactWriter(out));
    const result = await runStationEvidence();
    const manifest = writer.write(result);
    assert.equal(manifest.status, 'DISABLED');
    assert.equal(decodeBytes(Uint8Array.from(readFileSync(join(out, 'value-trace.json')))).status, 'DISABLED');
    assert.equal(decodeBytes(Uint8Array.from(readFileSync(join(out, 'timing-sidecar.json')))).calculationLog.length, 0);
    assert.equal(manifest.artifacts.length, 2);
    assert.ok(existsSync(join(out, 'artifact-manifest.json')));
    assert.throws(() => writer.write(result));
  } finally { rmSync(parent, { recursive: true, force: true }); }
});

test('missing stage manifest refuses before any producer', () => {
  assert.throws(() => readSyntheticManifest('/definitely-missing-station-manifest.json'));
});
