import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clean, prune, listedAnywhere } from './prune.mjs';

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

// 2026-10-22: S7 grid sweeps (attempts/sweeps/<id>, ports/s7trace/gridSweep.mjs) are cleaned like attempts: clean deletes the sweeps
// this checkout created, prune the sweeps nothing modified for H hours; a sweep whose id docs/evidence names is kept by both.
test('pxc clean and prune: attempts/sweeps, keeping the sweeps docs/evidence cites', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'pxc-sweeps-'))), sweeps = join(root, 'attempts', 'sweeps');
  try {
    mkdirSync(join(root, 'docs', 'evidence', 's7sweep'), { recursive: true });
    const make = (id, checkout) => { mkdirSync(join(sweeps, id, 'cells', 'golden'), { recursive: true }); writeFileSync(join(sweeps, id, 'sweep.json'), JSON.stringify({ id, createdBy: { checkout } })); writeFileSync(join(sweeps, id, 'cells', 'golden', 'h.json'), '{}'); };
    make('mine-1', root); make('mine-cited', root); make('theirs-1', '/elsewhere');
    writeFileSync(join(root, 'docs', 'evidence', 's7sweep', 'README.md'), 'results: attempts/sweeps/mine-cited/results.md\n');
    const dry = clean({ root, dryRun: true });
    assert.deepEqual(dry.sweepsRemoved, ['mine-1']); assert.ok(existsSync(join(sweeps, 'mine-1')));
    assert.deepEqual(dry.sweepsKept.map((k) => k.id), ['mine-cited']);
    const p = prune({ root, dryRun: true, hours: 0 });
    assert.deepEqual(p.sweepsRemoved, ['mine-1', 'theirs-1']);
    assert.deepEqual(prune({ root, dryRun: true, hours: 12 }).sweepsRemoved, [], 'a sweep modified in the last 12 h is kept');
    const r = clean({ root });
    assert.deepEqual(r.sweepsRemoved, ['mine-1']);
    assert.ok(!existsSync(join(sweeps, 'mine-1')) && existsSync(join(sweeps, 'mine-cited')) && existsSync(join(sweeps, 'theirs-1')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
