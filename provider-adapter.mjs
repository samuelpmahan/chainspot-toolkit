import { execFile } from 'node:child_process';
import { access, lstat, readdir, realpath } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);

function inside(base, target) {
  const rel = path.relative(base, target);
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel));
}

function resolveInside(base, value, label) {
  if (typeof value !== 'string' || !value) throw new TypeError(`${label} is required`);
  const resolved = path.resolve(base, value);
  if (!inside(base, resolved)) throw new Error(`${label} must resolve within forkRoot`);
  return resolved;
}

async function exists(file, label) {
  try { await access(file); } catch { throw new Error(`${label} does not exist: ${file}`); }
}

async function checkRealContainment(baseReal, file, label) {
  const actual = await realpath(file);
  if (!inside(baseReal, actual)) throw new Error(`${label} resolves outside forkRoot`);
}

/** Execute the existing width probe against the supplied isolated fork. */
export async function runProvider({ forkRoot, providerPath, scriptPath, args: target, sourceRowPath }) {
  if (typeof forkRoot !== 'string' || !forkRoot) throw new TypeError('forkRoot is required');
  if (!target || typeof target !== 'object') throw new TypeError('args with stem, badgeId, teeId, and mode are required');
  const { stem, badgeId, teeId, mode } = target;
  if (stem !== 'IMG_5641' || badgeId !== 'badge-9' || teeId !== 'tee-7') {
    throw new Error('unsupported target; only IMG_5641/badge-9/tee-7 is in scope');
  }
  if (!['baseline', 'heading'].includes(mode)) throw new Error('mode must be "baseline" or "heading"');
  const base = path.resolve(forkRoot);
  await exists(base, 'forkRoot');
  const baseReal = await realpath(base);
  const provider = resolveInside(base, providerPath, 'providerPath');
  const script = resolveInside(base, scriptPath, 'scriptPath');
  await Promise.all([exists(provider, 'providerPath'), exists(script, 'scriptPath')]);
  await Promise.all([checkRealContainment(baseReal, provider, 'providerPath'), checkRealContainment(baseReal, script, 'scriptPath')]);
  const cliArgs = [script, provider, stem, badgeId, teeId];
  let row;
  if (mode === 'heading') {
    row = resolveInside(base, sourceRowPath, 'sourceRowPath');
    await exists(row, 'sourceRowPath');
    await checkRealContainment(baseReal, row, 'sourceRowPath');
    cliArgs.push('--s5-axis', row);
  }
  const outputDir = path.resolve(path.dirname(script), 'width-probe', `${stem}-${badgeId}${mode === 'heading' ? '-s5-axis' : ''}`);
  if (!inside(base, outputDir)) throw new Error('expected output directory must resolve within forkRoot');
  try {
    await lstat(outputDir);
    throw new Error(`expected output directory already exists: ${path.relative(base, outputDir)}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  let status = 'completed', exitCode = 0, stdout = '', stderr = '';
  try {
    ({ stdout, stderr } = await execFileAsync(process.execPath, cliArgs, {
      cwd: base,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    }));
  } catch (error) {
    status = 'failed';
    exitCode = Number.isInteger(error.code) ? error.code : 1;
    stdout = error.stdout ?? '';
    stderr = error.stderr ?? '';
  }
  const outputs = [];
  if (inside(base, outputDir)) {
    try {
      for (const name of await readdir(outputDir)) outputs.push(path.relative(base, path.join(outputDir, name)));
    } catch { /* A failed provider may not have produced evidence. */ }
  }
  return { status, exitCode, stdout, stderr, outputs: outputs.sort() };
}
