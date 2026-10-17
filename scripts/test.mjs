#!/usr/bin/env node
/**
 * Run the tracked test suite only: `node scripts/test.mjs [node --test flags]`.
 * A bare `node --test` at the root would also pick up the test copies inside
 * attempts/stages/*\/fork; this runs exactly the git-tracked *.test.mjs files
 * (falling back to a walk that skips attempts/ and node_modules/ outside git).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
let files;
try {
  files = execFileSync('git', ['ls-files', '*.test.mjs'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
} catch {
  files = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (['attempts', 'node_modules', '.git'].includes(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.test.mjs')) files.push(relative(root, path));
    }
  })(root);
}
const result = spawnSync(process.execPath, ['--test', ...process.argv.slice(2), ...files.sort()], { cwd: root, stdio: 'inherit' });
process.exitCode = result.status ?? 1;
