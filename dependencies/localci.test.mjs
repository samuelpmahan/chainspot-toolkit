import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

// 2026-10-21: four validation runs forked side by side into an empty content store and two failed with ENOENT on the link
// (a bad or missing object was deleted before its rewrite). Four processes fork the same new files at once, three times.
test('forks side by side into one empty content store: every fork links every file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'localci-race-'));
  try {
    const files = [];
    for (let i = 0; i < 30; i++) {
      const b = randomBytes(200000 + i), path = `f${i}.bin`;
      writeFileSync(join(dir, path), b, { flag: 'wx' }); files.push({ path, sha256: createHash('sha256').update(b).digest('hex'), size: b.length, mode: 0o644 });
    }
    writeFileSync(join(dir, 'files.json'), JSON.stringify(files));
    const mod = new URL('./localci.mjs', import.meta.url).href;
    const fork = (id) => new Promise((resolve) => {
      const code = `const { materializeFork } = await import(${JSON.stringify(mod)}); const files = JSON.parse((await import('node:fs')).readFileSync(${JSON.stringify(join(dir, 'files.json'))}, 'utf8'));
        try { await materializeFork(${JSON.stringify(dir)}, { files }, ${JSON.stringify(join(dir, 'fork-'))} + ${JSON.stringify(id)}, { objects: ${JSON.stringify(join(dir, 'objects-'))} + ${JSON.stringify(id.split('-')[0])} }); console.log('ok'); } catch (e) { console.log('FAIL ' + (e.code ?? e.message)); }`;
      const p = spawn(process.execPath, ['--input-type=module', '-e', code]); let out = '';
      p.stdout.on('data', (d) => { out += d; }); p.on('close', () => resolve(out.trim()));
    });
    for (let round = 0; round < 3; round++) {
      const outs = await Promise.all([1, 2, 3, 4].map((k) => fork(`${round}-${k}`)));
      assert.deepEqual(outs, ['ok', 'ok', 'ok', 'ok'], `round ${round}: ${outs.join(', ')}`);
      for (const f of files) for (let k = 1; k <= 4; k++) assert.equal(createHash('sha256').update(readFileSync(join(dir, `fork-${round}-${k}`, f.path))).digest('hex'), f.sha256);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
