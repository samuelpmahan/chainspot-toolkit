import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runProvider } from './provider-adapter.mjs';

const target = mode => ({ stem: 'IMG_5641', badgeId: 'badge-9', teeId: 'tee-7', mode });

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'provider-adapter-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const provider = path.join(root, 'provider');
  await mkdir(provider);
  await writeFile(path.join(provider, 'package.json'), '{}');
  const script = path.join(root, 'width-probe.mjs');
  await writeFile(script, `
    import { mkdirSync, writeFileSync } from 'node:fs';
    import { dirname, resolve } from 'node:path';
    const [provider, stem, badge, tee, flag, row] = process.argv.slice(2);
    if (provider !== ${JSON.stringify(provider)} || stem !== 'IMG_5641' || badge !== 'badge-9' || tee !== 'tee-7') process.exit(31);
    if (flag === '--s5-axis' && (!row || row.endsWith('missing.json'))) process.exit(32);
    const out = resolve(dirname(new URL(import.meta.url).pathname), 'width-probe', 'IMG_5641-badge-9' + (flag === '--s5-axis' ? '-s5-axis' : ''));
    mkdirSync(out, { recursive: true });
    writeFileSync(resolve(out, 'evidence.json'), JSON.stringify({ provider, stem, badge, tee, flag: flag || null, row: row || null }));
    console.log('probe stdout');
    console.error('probe stderr');
  `);
  const row = path.join(root, 'rows.json');
  await writeFile(row, '{}');
  return { root, provider, script, row };
}

test('runs baseline probe and returns captured streams and fork-relative evidence paths', async t => {
  const f = await fixture(t);
  const result = await runProvider({ forkRoot: f.root, providerPath: 'provider', scriptPath: 'width-probe.mjs', args: target('baseline') });
  assert.deepEqual({ status: result.status, exitCode: result.exitCode, stdout: result.stdout.trim(), stderr: result.stderr.trim() },
    { status: 'completed', exitCode: 0, stdout: 'probe stdout', stderr: 'probe stderr' });
  assert.deepEqual(result.outputs, ['width-probe/IMG_5641-badge-9/evidence.json']);
  const evidence = JSON.parse(await readFile(path.join(f.root, result.outputs[0]), 'utf8'));
  assert.equal(evidence.flag, null);
});

test('passes the sealed row only for heading mode', async t => {
  const f = await fixture(t);
  const result = await runProvider({ forkRoot: f.root, providerPath: 'provider', scriptPath: 'width-probe.mjs', args: target('heading'), sourceRowPath: 'rows.json' });
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.outputs, ['width-probe/IMG_5641-badge-9-s5-axis/evidence.json']);
  const evidence = JSON.parse(await readFile(path.join(f.root, result.outputs[0]), 'utf8'));
  assert.equal(evidence.flag, '--s5-axis');
  assert.equal(evidence.row, path.join(f.root, 'rows.json'));
});

test('rejects missing inputs and paths escaping the fork before execution', async t => {
  const f = await fixture(t);
  await assert.rejects(runProvider({ forkRoot: f.root, providerPath: '../outside', scriptPath: 'width-probe.mjs', args: target('baseline') }), /within forkRoot/);
  await assert.rejects(runProvider({ forkRoot: f.root, providerPath: 'provider', scriptPath: 'missing.mjs', args: target('baseline') }), /does not exist/);
  await assert.rejects(runProvider({ forkRoot: f.root, providerPath: 'provider', scriptPath: 'width-probe.mjs', args: target('heading'), sourceRowPath: 'missing.json' }), /does not exist/);
  await assert.rejects(runProvider({ forkRoot: f.root, providerPath: 'provider', scriptPath: 'width-probe.mjs', args: { ...target('baseline'), badgeId: 'badge-8' } }), /unsupported target/);
  await assert.rejects(runProvider({ forkRoot: f.root, providerPath: 'provider', scriptPath: 'width-probe.mjs', args: { ...target('baseline'), mode: 'other' } }), /mode must/);
});

test('rejects symlinked inputs that resolve outside the fork', async t => {
  const f = await fixture(t);
  const outside = await mkdtemp(path.join(os.tmpdir(), 'provider-outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  const externalProvider = path.join(outside, 'provider');
  await mkdir(externalProvider);
  await symlink(externalProvider, path.join(f.root, 'provider-link'));
  await assert.rejects(runProvider({ forkRoot: f.root, providerPath: 'provider-link', scriptPath: 'width-probe.mjs', args: target('baseline') }), /resolves outside forkRoot/);
});

test('refuses a pre-existing output directory to prevent stale evidence attribution', async t => {
  const f = await fixture(t);
  const outputDir = path.join(path.dirname(f.script), 'width-probe', 'IMG_5641-badge-9');
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, 'old.json'), '{}');
  await assert.rejects(runProvider({ forkRoot: f.root, providerPath: 'provider', scriptPath: 'width-probe.mjs', args: target('baseline') }), /already exists/);
});
