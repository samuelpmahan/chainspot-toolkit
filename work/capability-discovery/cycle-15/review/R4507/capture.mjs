/** Independent review capture only; no provider imports or producer execution. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const root = '/workspace/scratch/86659bbafcce/chainspot-discovery-lab';
const own = '/workspace/scratch/86659bbafcce/lab15/S3/R4507';
const saved = join(root, 'work/capability-discovery/cycle-14/evidence/E4412/green');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const expected = JSON.parse(readFileSync('/workspace/scratch/86659bbafcce/lab15/S1/E4507/green/source-pins.before.json'));
const pins = () => expected.map(({ path }) => ({ path, sha256: sha(readFileSync(join(root, path))) }));
if (JSON.stringify(pins()) !== JSON.stringify(expected)) throw new Error('Reviewed source/input identity changed');
const env = { ...process.env };
delete env.LAB15_INSPECTOR_ARM;
delete env.LAB15_ARCHIVE_CAPTURE;
function capture(name, argv, timeoutMs, maxBufferBytes) {
  const directory = join(own, name);
  mkdirSync(directory);
  const write = (name, bytes) => writeFileSync(join(directory, name), bytes, { flag: 'wx' });
  const before = pins();
  write('source-pins.before.json', JSON.stringify(before, null, 2) + '\n');
  const started = new Date().toISOString();
  const result = spawnSync(process.execPath, argv, { cwd: root, env, timeout: timeoutMs, maxBuffer: maxBufferBytes });
  const ended = new Date().toISOString();
  const streams = {};
  for (const [name, bytes] of [['stdout.txt', result.stdout ?? Buffer.alloc(0)], ['stderr.txt', result.stderr ?? Buffer.alloc(0)]]) {
    write(name, bytes);
    streams[name] = { bytes: bytes.length, sha256: sha(bytes) };
  }
  const after = pins();
  write('source-pins.after.json', JSON.stringify(after, null, 2) + '\n');
  const execution = { executable: process.execPath, nodeVersion: process.version, argv, cwd: root,
    environment: { LAB15_INSPECTOR_ARM: null, LAB15_ARCHIVE_CAPTURE: null }, started, ended,
    timeoutMs, maxBufferBytes, status: result.status, signal: result.signal, error: result.error?.message ?? null,
    sourcePinsUnchanged: JSON.stringify(before) === JSON.stringify(after), streams };
  write('execution.json', JSON.stringify(execution, null, 2) + '\n');
  console.log(JSON.stringify({ directory, ...execution }));
  if (result.status !== 0 || !execution.sourcePinsUnchanged || result.error) throw new Error('Independent capture failed; no rerun');
}
capture('focused', ['--test', join(root, 'experiments/capability-discovery/ranked-inspector/inspector.test.mjs')], 20000, 5242880);
capture('cli-A', [join(root, 'experiments/capability-discovery/ranked-inspector/cli.mjs'),
  '--runtime', join(saved, 'runtime.json'), '--artifacts', saved, '--label', 'desired-bridge-A',
  '--format', 'json', '--out', join(own, 'cli-A/report')], 5000, 1048576);
