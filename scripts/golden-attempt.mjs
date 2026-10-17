/**
 * Test support: find retained run evidence instead of hard-coding Attempt IDs.
 *
 * findAttempt(files, {specimen, lanes}) returns the latest PASS stage Attempt for
 * that specimen and exact lane set whose fork still holds every requested file
 * with the hash its Attempt record retained, or null. withAttempt() wraps that for
 * node:test: when nothing qualifies it skips the test, naming the commands to run.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { STAGE_SOURCES } from '../recipes/closure.mjs';

export const REPO = resolve(import.meta.dirname, '..');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function findAttempt(files, { specimen = 'golden', lanes = [], root = REPO } = {}) {
  const folder = join(root, 'attempts/stages');
  if (!existsSync(folder)) return null;
  const wanted = [...lanes].sort().join(',');
  const names = readdirSync(folder).filter((name) => /^attempt-.*\.json$/.test(name)).sort().reverse();
  for (const name of names) {
    let record;
    try { record = JSON.parse(readFileSync(join(folder, name), 'utf8')); } catch { continue; }
    if (record.schema !== 'nctk-stage-attempt@1' || record.execution !== 'PASS') continue;
    if (record.request?.sourcePath !== STAGE_SOURCES[specimen]) continue;
    if ([...(record.request.lanes ?? [])].sort().join(',') !== wanted) continue;
    const fork = `attempts/stages/${record.id}/fork`;
    const evidence = new Map((record.evidence ?? []).map((entry) => [entry.path, entry.sha256]));
    const found = files.every((file) => {
      const path = `${fork}/${file}`;
      return evidence.has(path) && existsSync(join(root, path)) && sha(readFileSync(join(root, path))) === evidence.get(path);
    });
    if (found) return { attemptId: record.id, fork: join(root, fork), path: (file) => join(root, fork, file) };
  }
  return null;
}

export function runCommand({ specimen = 'golden', lanes = [], until = 3 } = {}) {
  const args = `--recipe recipes/chainspot-s0-s7.json --specimen ${specimen} --until ${until}${lanes.length ? ` --lanes ${lanes.join(',')}` : ''}`;
  return `node toolkit.mjs neat ${args} && node toolkit.mjs run ${args}`;
}

/** Returns the Attempt, or marks the test skipped (with the command to create one) and returns null. */
export function withAttempt(t, files, options = {}) {
  const attempt = findAttempt(files, options);
  if (!attempt) t.skip(`no ${options.specimen ?? 'golden'} attempt with ${files.join(', ')}; run: ${runCommand(options)}`);
  return attempt;
}
