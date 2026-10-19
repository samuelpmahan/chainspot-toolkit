import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SAVED = resolve(ROOT, 'work/capability-discovery/cycle-14/evidence/E4412/green');
const RUNTIME = join(SAVED, 'runtime.json');
const ARCHIVE = resolve(ROOT, 'work/capability-discovery/cycle-14/render/E4413/render.mjs');
const CLI = fileURLToPath(new URL('./cli.mjs', import.meta.url));
const archiveArm = process.env.LAB15_INSPECTOR_ARM === 'archive';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function temporary(t) {
  const directory = mkdtempSync(join(tmpdir(), 'lab15-inspector-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function invoke(out, format = 'json') {
  const argv = [archiveArm ? ARCHIVE : CLI, '--runtime', RUNTIME, '--artifacts', SAVED,
    '--label', 'desired-bridge-A', '--format', format, '--out', out];
  const result = spawnSync(process.execPath, argv, { cwd: ROOT, encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 });
  if (process.env.LAB15_ARCHIVE_CAPTURE) {
    const directory = process.env.LAB15_ARCHIVE_CAPTURE;
    for (const [name, bytes] of [['archive.stdout.txt', result.stdout ?? ''], ['archive.stderr.txt', result.stderr ?? '']])
      writeFileSync(join(directory, name), bytes, { flag: 'wx' });
    writeFileSync(join(directory, 'archive.execution.json'), JSON.stringify({ executable: process.execPath,
      argv, cwd: ROOT, status: result.status, signal: result.signal, error: result.error?.message ?? null }, null, 2) + '\n', { flag: 'wx' });
  }
  return result;
}

// Break caught: ignoring supplied saved paths (archive) or missing portable CLI output.
test('supplied saved capture is inspected into a fresh caller-selected directory', t => {
  const directory = temporary(t), out = join(directory, 'json');
  const result = invoke(out);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, `portable saved inspection must exit0; stderr=${result.stderr}`);
  assert.equal(result.stderr, '');
  const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'));
  assert.equal(report.status, 'admitted-nonempty');
  assert.deepEqual(report.rows.map(row => row.pairId), ['fixture-a1', 'fixture-a3', 'fixture-a2', 'fixture-b1']);
  assert.equal(report.payload.groups[0].rows[2].raw.supportMean, 0.4);
  const original = readFileSync(join(out, 'report.json'));
  assert.notEqual(invoke(out).status, 0, 'existing output directory must not be overwritten');
  assert.deepEqual(readFileSync(join(out, 'report.json')), original);
  const tsvOut = join(directory, 'tsv');
  assert.equal(invoke(tsvOut, 'tsv').status, 0);
  const tsv = readFileSync(join(tsvOut, 'report.tsv'), 'utf8');
  assert.match(tsv, /admitted-nonempty/);
  assert.match(tsv, /fixture-badge-a\tfixture-a3\t0\.6\t0\.8\t2/);
});

if (!archiveArm) {
  const api = () => import('./inspector.mjs');

  // Break caught: fallback to ranked/json, dropped nested fields, reordered losing rows.
  test('admitted payload and explicit display projection preserve saved A/B/A2 bytes', async t => {
    const { inspect } = await api();
    const want = [
      ['desired-bridge-A', 'artifact-03-0.json', ['fixture-a1', 'fixture-a3', 'fixture-a2', 'fixture-b1']],
      ['desired-bridge-B', 'artifact-04-0.json', ['fixture-a1', 'fixture-a2', 'fixture-a3', 'fixture-b1']],
      ['desired-bridge-A2', 'artifact-05-0.json', ['fixture-a1', 'fixture-a3', 'fixture-a2', 'fixture-b1']]
    ];
    for (const [recordLabel, file, ids] of want) {
      const result = inspect({ runtimePath: RUNTIME, artifactDir: SAVED, recordLabel });
      assert.equal(result.status, 'admitted-nonempty');
      assert.deepEqual(result.payload, JSON.parse(readFileSync(join(SAVED, file), 'utf8')));
      assert.deepEqual(result.rows.map(row => row.pairId), ids);
      assert.deepEqual(result.payload.groups[0].rows[0].raw.teeLeg,
        { endpointId: 'fixture-end', geodesic: 0, path: [], reachable: true });
      assert.equal(result.payload.groups[0].rows[0].factors.zfit, 0.5);
      assert.match(result.projectionLimit, /subset/);
    }
    const directory = temporary(t), saved = JSON.parse(readFileSync(RUNTIME, 'utf8'));
    saved.records[3].ranked = [{ bad: 'never a payload source' }];
    writeFileSync(join(directory, 'runtime.json'), JSON.stringify(saved));
    const result = inspect({ runtimePath: join(directory, 'runtime.json'), artifactDir: SAVED, recordLabel: 'desired-bridge-A' });
    assert.deepEqual(result.rows.map(row => row.pairId), want[0][2]);
  });

  // FIRST-GREEN consumer-shape characterization, NOT native-produced empty evidence.
  // Break caught: missing saved bytes or OFF artifact absence falsely becomes empty.
  test('unavailable saved evidence stays distinct from synthetic admitted-empty evidence', async t => {
    const { inspect } = await api();
    const directory = temporary(t);
    for (const result of [
      inspect({ runtimePath: RUNTIME, artifactDir: directory, recordLabel: 'desired-bridge-A' }),
      inspect({ runtimePath: RUNTIME, artifactDir: SAVED, recordLabel: 'off-control-A' })
    ]) {
      assert.equal(result.status, 'unavailable'); assert.equal(result.payload, null); assert.deepEqual(result.rows, []);
    }
    const saved = JSON.parse(readFileSync(RUNTIME, 'utf8'));
    const record = saved.records[3];
    const bytes = Buffer.from('{"schema":"lab14-ranked-alternatives@1","groups":[]}');
    const ref = { ...record.artifacts[0].ref, sha256: hash(bytes) };
    record.label = 'synthetic-consumer-empty';
    record.artifacts = [{ ref, bytesBase64: bytes.toString('base64'), json: JSON.parse(bytes) }];
    record.receipts[0].artifacts = [ref];
    record.pcr.ticks[0].testimony = record.receipts[0];
    // PCR header is synthetic provenance only; no runResultId is recomputed or claimed native.
    record.pcr.runResultId = 'synthetic-consumer-shape-not-native-execution';
    saved.records = [record];
    writeFileSync(join(directory, 'runtime.json'), JSON.stringify(saved));
    writeFileSync(join(directory, 'artifact-00-0.json'), bytes);
    const empty = inspect({ runtimePath: join(directory, 'runtime.json'), artifactDir: directory, recordLabel: record.label });
    assert.equal(empty.status, 'admitted-empty');
    assert.deepEqual(empty.payload.groups, []); assert.deepEqual(empty.rows, []);
  });

  // FIRST-GREEN custody checks. Break caught: exposing rows before saved evidence association passes.
  test('mismatched bytes, captured JSON, receipt and PCR testimony are incompatible', async t => {
    const { inspect } = await api();
    const directory = temporary(t);
    const cases = ['bytes', 'json', 'receipt', 'pcr', 'kind'];
    for (const mismatch of cases) {
      const folder = join(directory, mismatch); mkdirSync(folder);
      const saved = JSON.parse(readFileSync(RUNTIME, 'utf8')), record = saved.records[3];
      if (mismatch === 'json') record.artifacts[0].json = { schema: 'foreign', groups: [] };
      if (mismatch === 'receipt') record.receipts[0].artifacts = [];
      if (mismatch === 'pcr') record.pcr.ticks[0].testimony.actualProduces = [];
      if (mismatch === 'kind') record.artifacts[0].ref.kind = 'measurementTable';
      writeFileSync(join(folder, 'runtime.json'), JSON.stringify(saved));
      writeFileSync(join(folder, 'artifact-03-0.json'), readFileSync(join(SAVED,
        mismatch === 'bytes' ? 'artifact-04-0.json' : 'artifact-03-0.json')));
      const result = inspect({ runtimePath: join(folder, 'runtime.json'), artifactDir: folder, recordLabel: 'desired-bridge-A' });
      assert.equal(result.status, 'incompatible', mismatch);
      assert.equal(result.payload, null); assert.deepEqual(result.rows, []);
    }
  });
}
