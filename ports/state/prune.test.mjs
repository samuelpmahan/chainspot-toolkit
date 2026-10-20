import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, linkSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prune } from './prune.mjs';

const KEEP = 'attempt-1000-aaaa', OLD = 'attempt-2000-bbbb', FRESH = 'attempt-3000-cccc';
const NOW = Date.parse('2026-10-20T21:00:00Z');

function tree() {
  const root = mkdtempSync(join(tmpdir(), 'prune-')), stages = join(root, 'attempts', 'stages');
  const put = (p, text = 'x', bytes = 1) => { mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(p, text.repeat(bytes)); return p; };
  put(join(root, 'docs/evidence/dev-s1s4/ATTEMPTS'), `heritage ${KEEP}\n`);
  put(join(root, 'docs/evidence/notes/old.md'), `see ${OLD} and run-2026-10-19T01-00-00-000Z`);
  const out = (id) => join(stages, id, 'fork', 'stage-output');
  // kept attempt: S7 has an older complete run, a cited run, and a newer interrupted one; S4 has two complete runs
  put(join(out(KEEP), 's7trace/run-2026-10-19T01-00-00-000Z/cmp.fn.Hole.trace.json'), '{}');   // cited in docs/evidence
  put(join(out(KEEP), 's7trace/run-2026-10-19T02-00-00-000Z/s7trace.flipbook.html'), 'a', 1000);   // superseded: deleted
  put(join(out(KEEP), 's7trace/run-2026-10-19T03-00-00-000Z/cmp.fn.Hole.trace.json'), '{}');   // latest complete
  put(join(out(KEEP), 's7trace/run-2026-10-19T04-00-00-000Z/s7trace.frames.json'), '[]');      // latest (interrupted)
  put(join(out(KEEP), 's4recover/run-2026-10-19T00-30-00-000Z/cmp.fn.Tee.recover.json'), '{}');
  put(join(out(KEEP), 's4recover/run-2026-10-19T05-00-00-000Z/cmp.fn.Tee.recover.json'), '{}');
  put(join(out(KEEP), 'early/s3.pxc.bin'), 'b', 500);
  // an old attempt and its record: deleted; a big file hardlinked into the kept attempt frees nothing
  const big = put(join(out(OLD), 'early/s3.pxc.bin'), 'c', 4000);
  linkSync(big, join(out(KEEP), 'early/shared.bin'));
  put(join(out(OLD), 's6straight/run-2026-10-18T01-00-00-000Z/s6straight.flipbook.html'), 'd', 2000);
  put(join(stages, `${OLD}.json`), '{}');
  // a fresh attempt (another agent's validation course): kept whole
  put(join(out(FRESH), 's6straight/run-2026-10-20T20-00-00-000Z/s6straight.flipbook.html'), 'e', 100);
  const old = (NOW - 48 * 3600e3) / 1000, fresh = (NOW - 3600e3) / 1000;
  const touch = (p, t) => { for (const e of readdirSync(p, { withFileTypes: true })) if (e.isDirectory()) touch(join(p, e.name), t); else utimesSync(join(p, e.name), t, t); utimesSync(p, t, t); };
  touch(join(stages, OLD), old); utimesSync(join(stages, `${OLD}.json`), old, old); touch(join(stages, KEEP), old); touch(join(stages, FRESH), fresh);
  return { root, stages, out };
}

test('prune keeps the ATTEMPTS and fresh attempts, and in them the latest, latest complete and cited runs', () => {
  const { root, stages, out } = tree();
  try {
    const dry = prune({ root, dryRun: true, now: NOW });
    assert.deepEqual(dry.keptAttempts.map((k) => k.id).sort(), [KEEP, FRESH].sort());
    assert.deepEqual(dry.removedAttempts.map((r) => r.id), [OLD]);
    assert.deepEqual(dry.evidenceNamed, [OLD], 'a deleted attempt the evidence cites is reported');
    const s7 = dry.runs.find((r) => r.dir.endsWith('s7trace')), s4 = dry.runs.find((r) => r.dir.endsWith('s4recover'));
    assert.deepEqual(s7.keep, ['run-2026-10-19T01-00-00-000Z', 'run-2026-10-19T03-00-00-000Z', 'run-2026-10-19T04-00-00-000Z']);
    assert.deepEqual(s7.remove, ['run-2026-10-19T02-00-00-000Z']);
    assert.deepEqual(s4.remove, ['run-2026-10-19T00-30-00-000Z']);
    assert.ok(!dry.runs.some((r) => r.attempt === FRESH), 'a single run is never pruned');
    // bytes on disk: the old attempt's flipbook (2000 B) + record (2 B) + the superseded S7 flipbook (1000 B) + the
    // superseded S4 cmp (2 B); its 4000 B PxC is hardlinked into the kept attempt, so deleting it frees nothing
    assert.equal(dry.bytes, 2000 + 2 + 1000 + 2);
    assert.ok(existsSync(join(stages, OLD)) && existsSync(join(out(KEEP), 's7trace/run-2026-10-19T02-00-00-000Z')), 'a dry run deletes nothing');

    const real = prune({ root, now: NOW });
    assert.equal(real.bytes, dry.bytes);
    assert.ok(!existsSync(join(stages, OLD)) && !existsSync(join(stages, `${OLD}.json`)));
    assert.deepEqual(readdirSync(join(out(KEEP), 's7trace')).sort(), s7.keep);
    assert.deepEqual(readdirSync(join(out(KEEP), 's4recover')), ['run-2026-10-19T05-00-00-000Z']);
    assert.equal(statSync(join(out(KEEP), 'early/shared.bin')).size, 4000, 'the kept link still holds its bytes');
    assert.ok(existsSync(join(out(FRESH), 's6straight/run-2026-10-20T20-00-00-000Z')));
    assert.equal(prune({ root, dryRun: true, now: NOW }).bytes, 0, 'a second prune has nothing to do');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
