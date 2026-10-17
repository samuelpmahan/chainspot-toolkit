/**
 * Tests for the FG runtime (fg/guarantee.mjs, fg/registry.mjs, fg/sinks.mjs,
 * fg/node-sink.mjs, fg/canon.mjs) on the synthetic board in
 * fg/fixtures/board.mjs:
 *   1. canon: the pure-JS sha256 equals node:crypto byte for byte.
 *   2. Two toy FGs, the second requiring the first and gating against its
 *      record, run in topological order and hold; records have the uniform
 *      shape; frames carry hashes and receipt slices.
 *   3. A failing check raises a named GuaranteeFailure carrying the failed
 *      record and the frames reached; a gate against the required record
 *      fails the downstream FG by name.
 *   4. Record and frame bytes are identical across two independent runs.
 *   5. Lane gating: dormant with the lane off (transitively), held with it on.
 *   6. Wiring errors: cycles and missing requires throw.
 *   7. The node file sink round-trips through disk and refuses overwrites.
 *   8. The browser-safe core imports no node:* module.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalJson, sha256Hex } from './canon.mjs';
import { defineGuarantee, GuaranteeFailure, recordJson, runGuarantee } from './guarantee.mjs';
import { orderGuarantees, runGuarantees } from './registry.mjs';
import { createMemorySink } from './sinks.mjs';
import { createFileSink } from './node-sink.mjs';
import { toyBoard, rect } from './fixtures/board.mjs';
import blobsFg from './fixtures/fgs/fg.toy.blobs.materialize.fg.mjs';
import familyFg from './fixtures/fgs/fg.toy.family.materialize.fg.mjs';
import experimentalFg from './fixtures/fgs/lanes/fg.toy.family.experimental.fg.mjs';
import bySize from './fixtures/impl/fn.toy.findFamily/bySize.mjs';

const guarantees = [familyFg, blobsFg, experimentalFg];
const boardWithFamily = (options) => { const board = toyBoard(options); bySize(board); return board; };

test('pure-JS sha256 matches node:crypto across block boundaries', () => {
  for (const len of [0, 1, 55, 56, 63, 64, 65, 127, 128, 1000]) {
    const bytes = new Uint8Array(len).map((_, i) => (i * 31 + 7) & 255);
    assert.equal(sha256Hex(bytes), createHash('sha256').update(bytes).digest('hex'), `len ${len}`);
  }
  assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(canonicalJson({ b: 1, a: [new Uint8Array([2, 3])], c: undefined }), '{"a":[[2,3]],"b":1}');
  assert.throws(() => canonicalJson({ s: new Set([1]) }), /Map\/Set/);
});

test('two FGs run in requires order; the second gates against the first record', () => {
  const sink = createMemorySink();
  const { records, frames, timings } = runGuarantees({ guarantees, board: boardWithFamily(), sink });
  assert.deepEqual(Object.keys(records), ['fg.toy.blobs.materialize', 'fg.toy.family.materialize', 'fg.toy.family.experimental']);
  const base = records['fg.toy.blobs.materialize'];
  assert.deepEqual(Object.keys(base), ['guarantee', 'status', 'reason', 'guards', 'requires', 'lane', 'totals', 'checks', 'witnesses', 'artifacts', 'frames', 'blobIds']);
  assert.equal(base.status, 'held');
  assert.deepEqual(base.totals, { blobCount: 4, pxUnion: 23 });
  assert.deepEqual(base.checks.map((c) => [c.name, c.ok]), [['guarded:px.blobs', true], ['everyBlobHasPx', true], ['pxInBounds', true]]);
  assert.deepEqual(base.witnesses, [{ name: 'unionByBitmap', ok: true, detail: { count: 23 } }]);
  assert.equal(base.artifacts.length, 1);
  assert.equal(base.artifacts[0].rehashed, true);
  assert.equal(base.artifacts[0].sha256, sha256Hex(sink.readArtifact('px.blobs')));
  const fam = records['fg.toy.family.materialize'];
  assert.equal(fam.status, 'held');
  assert.deepEqual(fam.members, ['a', 'b', 'c']);
  assert.deepEqual(fam.totals, { memberCount: 3, memberPx: 21 });
  // frames: 2 from materialize, 1 from family; hashed parts; receipt slices partition the verdicts
  assert.equal(frames.length, 3);
  assert.deepEqual(frames.map((f) => [f.fg, f.seq]), [['fg.toy.blobs.materialize', 0], ['fg.toy.blobs.materialize', 1], ['fg.toy.family.materialize', 0]]);
  assert.deepEqual(frames[0].receipt.checks.map((c) => c.name), ['guarded:px.blobs', 'everyBlobHasPx', 'pxInBounds']);
  assert.deepEqual(frames[0].receipt.witnesses.map((c) => c.name), ['unionByBitmap']);
  assert.deepEqual(frames[1].receipt, { checks: [], witnesses: [] });
  assert.ok(frames.every((f) => f.parts.every((p) => /^[0-9a-f]{64}$/.test(p.sha256))));
  assert.equal(frames[1].parts[0].ref, 'memory://px.blobs');
  assert.deepEqual(frames[2].verdicts.map((v) => [v.name, v.ok]), [['a', true], ['b', true], ['c', true], ['d', false]]);
  assert.deepEqual(timings.map((t) => t.guarantee), ['fg.toy.blobs.materialize', 'fg.toy.family.materialize']);
  assert.ok(!recordJson(records).includes('elapsed'));
});

test('a failing check raises a named GuaranteeFailure with the failed record and frames', () => {
  const board = toyBoard({ extra: [{ id: 'e', px: [] }] });
  bySize(board);
  let error;
  try { runGuarantees({ guarantees, board }); } catch (e) { error = e; }
  assert.ok(error instanceof GuaranteeFailure);
  assert.equal(error.name, 'GuaranteeFailure');
  assert.equal(error.guarantee, 'fg.toy.blobs.materialize');
  assert.deepEqual(error.failed, ['everyBlobHasPx']);
  assert.match(error.message, /^fg\.toy\.blobs\.materialize FunctionalGuarantee failed: failed: everyBlobHasPx/);
  assert.equal(error.record.status, 'failed');
  assert.deepEqual(error.record.checks.find((c) => c.name === 'everyBlobHasPx').detail, { empty: ['e'] });
  assert.equal(error.frames.length, 2, 'frames reached before the verdict still render');
  assert.deepEqual(Object.keys(error.records), ['fg.toy.blobs.materialize'], 'the run stops at the failed FG');
});

test('a downstream gate against the required record fails by name', () => {
  const board = toyBoard();
  board.set('px.blobs.family', { rule: 'bogus', members: ['a', 'zz'] });
  assert.throws(() => runGuarantees({ guarantees, board }), (e) =>
    e instanceof GuaranteeFailure && e.guarantee === 'fg.toy.family.materialize'
    && e.failed.includes('membersAreMaterializedBlobs')
    && e.record.checks.find((c) => c.name === 'membersAreMaterializedBlobs').detail.unknown[0] === 'zz'
    && e.records['fg.toy.blobs.materialize'].status === 'held');
});

test('fail(), a throwing run, a missing guarded Part and a throwing witness are all named failures', () => {
  const sink = createMemorySink();
  const board = toyBoard();
  const failing = defineGuarantee({ id: 'fg.toy.fails', guards: ['px.blobs'], run: (ctx) => ctx.fail('opaque Part') });
  assert.throws(() => runGuarantee(failing, { board, sink }), { name: 'GuaranteeFailure', reason: 'opaque Part' });
  const throwing = defineGuarantee({ id: 'fg.toy.throws', guards: ['px.blobs'], run: () => { throw new TypeError('bug'); } });
  assert.throws(() => runGuarantee(throwing, { board, sink }), (e) => e.reason === 'run threw: bug' && e.cause instanceof TypeError);
  const missing = defineGuarantee({ id: 'fg.toy.missing', guards: ['px.nothing'], run: () => assert.fail('must not run') });
  assert.throws(() => runGuarantee(missing, { board, sink }), (e) => e.failed[0] === 'guarded:px.nothing');
  const witness = defineGuarantee({ id: 'fg.toy.witness', guards: ['px.blobs'], run: (ctx) => { ctx.witness('w', () => { throw new Error('diverged'); }); return {}; } });
  assert.throws(() => runGuarantee(witness, { board, sink }), (e) => e.record.witnesses[0].detail.error === 'diverged');
});

test('record and frame bytes are deterministic across two runs', () => {
  const once = () => {
    const { records, frames } = runGuarantees({ guarantees, board: boardWithFamily(), sink: createMemorySink() });
    return [recordJson(records), canonicalJson(frames)];
  };
  assert.deepEqual(once(), once());
});

test('lane-gated FG is dormant with its lane off and held with it on', () => {
  const off = runGuarantees({ guarantees, board: boardWithFamily() });
  assert.equal(off.records['fg.toy.family.experimental'].status, 'dormant');
  assert.equal(off.records['fg.toy.family.experimental'].reason, 'lane toy-lane is OFF');
  const on = runGuarantees({ guarantees, board: boardWithFamily(), lanes: ['toy-lane'] });
  assert.equal(on.records['fg.toy.family.experimental'].status, 'held');
  // a dependant of a dormant FG is dormant too
  const child = defineGuarantee({ id: 'fg.toy.child', guards: ['px.blobs'], requires: ['fg.toy.family.experimental'], run: () => assert.fail('must not run') });
  const chained = runGuarantees({ guarantees: [...guarantees, child], board: boardWithFamily() });
  assert.equal(chained.records['fg.toy.child'].reason, 'requires dormant fg.toy.family.experimental');
  // only= pulls in transitive requires
  const only = runGuarantees({ guarantees, board: boardWithFamily(), only: ['fg.toy.family.materialize'] });
  assert.deepEqual(Object.keys(only.records), ['fg.toy.blobs.materialize', 'fg.toy.family.materialize']);
});

test('wiring errors throw: cycles, missing requires, duplicates', () => {
  const g = (id, requires) => defineGuarantee({ id, guards: ['px.x'], requires, run: () => ({}) });
  assert.throws(() => orderGuarantees([g('fg.a.x', ['fg.b.x']), g('fg.b.x', ['fg.a.x'])]), /requires cycle fg\.a\.x -> fg\.b\.x -> fg\.a\.x/);
  assert.throws(() => orderGuarantees([g('fg.a.x', ['fg.nope.x'])]), /requires fg\.nope\.x, which is not registered/);
  assert.throws(() => orderGuarantees([g('fg.a.x', []), g('fg.a.x', [])]), /duplicate/);
  assert.throws(() => defineGuarantee({ id: 'px.bad', guards: ['px.x'], run() {} }), /not an fg\.\* id/);
});

test('node file sink round-trips through disk and refuses to overwrite', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fg-sink-'));
  try {
    const sink = createFileSink(dir);
    const { records } = runGuarantees({ guarantees, board: boardWithFamily(), sink });
    const [artifact] = records['fg.toy.blobs.materialize'].artifacts;
    assert.equal(artifact.uri, 'px.blobs.json');
    assert.equal(artifact.rehashed, true);
    assert.equal(sha256Hex(readFileSync(join(dir, artifact.uri))), artifact.sha256);
    assert.throws(() => createFileSink(dir).putArtifact('blob-set-json', 'px.blobs', new Uint8Array(1)), /refusing to overwrite/);
    assert.throws(() => sink.putArtifact('json', '../escape', new Uint8Array(1)), /not a safe relative path/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the browser-safe core imports no node:* module', () => {
  for (const file of ['canon.mjs', 'guarantee.mjs', 'registry.mjs', 'forkjoin.mjs', 'sinks.mjs', 'flipbook.mjs']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.ok(!/from\s+['"]node:|import\(\s*['"]node:/.test(source), `${file} imports node:*`);
    for (const [, dep] of source.matchAll(/from\s+'\.\/([\w-]+\.mjs)'/g))
      assert.ok(!['node-sink.mjs', 'discover.mjs'].includes(dep), `${file} imports node-only ${dep}`);
  }
});
