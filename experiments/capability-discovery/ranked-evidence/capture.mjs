#!/usr/bin/env node
/** Exclusive, bounded capture; ordinary tooling, never a second operation executor. */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, verifyDependencies } from './fixture.mjs';

const args = process.argv.slice(2);
function option(name) {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) throw new Error(`required ${name}`);
  return args[index + 1];
}
const arm = option('--arm'), out = resolve(option('--out'));
if (!['baseline', 'bridge'].includes(arm)) throw new Error('arm must be baseline or bridge');
process.env.LAB14_DEPENDENCY_MANIFEST = resolve(option('--manifest'));
process.env.LAB14_DEPENDENCY_MANIFEST_SHA256 = option('--manifest-sha256');
verifyDependencies(); // no provider module is imported by this check
mkdirSync(out); // intentionally refuses existing output directory
const write = (name, bytes) => writeFileSync(resolve(out, name), bytes, { flag: 'wx' });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const here = fileURLToPath(new URL('.', import.meta.url));
const sourceFiles = ['fixture.mjs', 'integration.test.mjs', 'capture.mjs', 'README.md',
  ...(existsSync(resolve(here, 'adapter.mjs')) ? ['adapter.mjs'] : [])];
const sourcePins = () => sourceFiles.map(file => {
  const path = resolve(here, file), bytes = readFileSync(path);
  return { path, sha256: sha(bytes), bytes: bytes.length, mode: statSync(path).mode & 0o777 };
});
const before = sourcePins();
write('source-pins.before.json', JSON.stringify(before, null, 2) + '\n');
const argv = ['--test', resolve(here, 'integration.test.mjs')];
const startUTC = new Date().toISOString();
const child = spawnSync(process.execPath, argv, { cwd: ROOT, encoding: null,
  timeout: 20000, maxBuffer: 5 * 1024 * 1024,
  env: { ...process.env, LAB14_RANKED_ARM: arm, LAB14_RUNTIME_REPORT: resolve(out, 'runtime.json') } });
const endUTC = new Date().toISOString();
write('stdout.txt', child.stdout ?? Buffer.alloc(0));
write('stderr.txt', child.stderr ?? Buffer.alloc(0));
const after = sourcePins();
write('source-pins.after.json', JSON.stringify(after, null, 2) + '\n');
let postflightError = null;
try { verifyDependencies(); } catch (error) { postflightError = error.message; }
if (existsSync(resolve(out, 'runtime.json'))) {
  const report = JSON.parse(readFileSync(resolve(out, 'runtime.json'), 'utf8'));
  for (const [index, record] of report.records.entries()) {
    for (const [artifactIndex, artifact] of record.artifacts.entries())
      write(`artifact-${String(index).padStart(2, '0')}-${artifactIndex}.json`, Buffer.from(artifact.bytesBase64, 'base64'));
  }
}
const metadata = { schema: 'lab14-ranked-evidence-capture@1', arm, executable: process.execPath,
  nodeVersion: process.version, argv, cwd: ROOT, startUTC, endUTC,
  timeoutMs: 20000, maxBufferBytesPerStream: 5 * 1024 * 1024,
  exitCode: child.status, signal: child.signal, error: child.error?.message ?? null,
  dependencyManifest: process.env.LAB14_DEPENDENCY_MANIFEST,
  dependencyManifestSha256: process.env.LAB14_DEPENDENCY_MANIFEST_SHA256,
  sourcePinsUnchanged: JSON.stringify(before) === JSON.stringify(after), postflightError,
  stdout: { bytes: child.stdout?.length ?? 0, sha256: sha(child.stdout ?? Buffer.alloc(0)) },
  stderr: { bytes: child.stderr?.length ?? 0, sha256: sha(child.stderr ?? Buffer.alloc(0)) } };
write('execution.json', JSON.stringify(metadata, null, 2) + '\n');
console.log(JSON.stringify(metadata));
process.exitCode = metadata.sourcePinsUnchanged && !postflightError ? (child.status ?? 1) : 1;
