import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { treeIdentity } from './provenance.mjs';

test('treeIdentity: paths and contents of the matching files only, in name order; any byte change re-keys it', () => {
  const d = mkdtempSync(join(tmpdir(), 'prov-'));
  try {
    mkdirSync(join(d, 'a')); writeFileSync(join(d, 'a', 'x.ts'), 'x'); writeFileSync(join(d, 'b.json'), '{}'); writeFileSync(join(d, 'note.md'), 'ignored');
    const h = treeIdentity(d, /\.(ts|json)$/);
    writeFileSync(join(d, 'note.md'), 'still ignored'); assert.equal(treeIdentity(d, /\.(ts|json)$/), h);
    writeFileSync(join(d, 'a', 'x.ts'), 'y'); assert.notEqual(treeIdentity(d, /\.(ts|json)$/), h);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
