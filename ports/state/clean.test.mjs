import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clean, listedAnywhere } from './prune.mjs';

// 2026-10-21: a lane cleaning up "every attempt newer than my first run" deleted the main checkout's dev attempts. clean
// deletes only attempts this checkout created (createdBy.checkout), never one an ATTEMPTS file lists, never an unmarked one.
test('pxc clean: only the attempts this checkout created and no ATTEMPTS file lists', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'pxc-clean-'))), stages = join(root, 'attempts', 'stages');
  try {
    mkdirSync(stages, { recursive: true }); mkdirSync(join(root, 'docs', 'evidence', 'dev-s1s4'), { recursive: true });
    const make = (id, createdBy) => { mkdirSync(join(stages, id, 'fork'), { recursive: true }); writeFileSync(join(stages, id, 'fork', 'x.bin'), 'x'); writeFileSync(join(stages, `${id}.json`), JSON.stringify(createdBy === undefined ? {} : { createdBy: { checkout: createdBy } })); };
    make('attempt-1-aaaa', root);            // mine, unlisted: deleted
    make('attempt-2-bbbb', root);            // mine, listed in ATTEMPTS: kept
    make('attempt-3-cccc', '/elsewhere');    // another checkout's: untouched
    make('attempt-4-dddd', undefined);       // no createdBy (older than the field): untouched
    writeFileSync(join(root, 'docs', 'evidence', 'dev-s1s4', 'ATTEMPTS'), 'golden attempt-2-bbbb\n');
    const dry = clean({ root, dryRun: true });
    assert.deepEqual(dry.removed, ['attempt-1-aaaa']); assert.ok(existsSync(join(stages, 'attempt-1-aaaa')), 'a dry run deletes nothing');
    const r = clean({ root });
    assert.deepEqual(r.removed, ['attempt-1-aaaa']); assert.deepEqual(r.kept.map((k) => k.id), ['attempt-2-bbbb']);
    assert.ok(!existsSync(join(stages, 'attempt-1-aaaa')) && !existsSync(join(stages, 'attempt-1-aaaa.json')));
    for (const id of ['attempt-2-bbbb', 'attempt-3-cccc', 'attempt-4-dddd']) assert.ok(existsSync(join(stages, id)), id);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// 2026-10-22: the validation attempts were listed in no ATTEMPTS file, so a retest's prune would have deleted them.
test('the validation ATTEMPTS file protects its attempts too', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'pxc-keep-')));
  try {
    mkdirSync(join(root, 'docs', 'evidence', 'validation-s7'), { recursive: true });
    writeFileSync(join(root, 'docs', 'evidence', 'validation-s7', 'ATTEMPTS'), 'seatacFull attempt-5-eeee\n');
    assert.ok(listedAnywhere(root).has('attempt-5-eeee'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
