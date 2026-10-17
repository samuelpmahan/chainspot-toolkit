import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { differences, inventory } from './facts.mjs';

test('the selected checkpoint inventories docs/replay unchanged and a missing file changes state', async (t) => {
  const root=dirname(fileURLToPath(import.meta.url));
  if(!existsSync(join(root,'attempts/checkpoint.json')))
    return t.skip('no legacy checkpoint attempts/checkpoint.json; run: node toolkit.mjs neat --files targets/s7-baseline.json,targets/s7-heading.json');
  const pointer=JSON.parse(await readFile(join(root,'attempts/checkpoint.json')));
  const checkpoint=JSON.parse(await readFile(join(root,pointer.path)));
  const current=await inventory(root), scoped=new Set(checkpoint.files.map(f=>f.path));
  const selected=current.filter(f=>scoped.has(f.path));
  assert.deepEqual(differences(checkpoint.files,selected),[]);
  for (const path of ['README.md','REVIEW.md','replay.mjs']) assert.ok(selected.some(f=>f.path===path),path);
  const missing=selected.filter(f=>f.path!=='README.md');
  assert.deepEqual(differences(checkpoint.files,missing).map(x=>x.path),['README.md']);
});
