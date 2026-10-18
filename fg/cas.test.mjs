import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, truncateSync, utimesSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serialize, deserialize } from 'node:v8';
import { createCas, casStats, casPrune, CasIntegrityError } from './cas.mjs';
import { createPartStore } from './store.mjs';
import { closureSha } from './closure.mjs';
import { instrumentedStore } from './profile.mjs';

const tmp = () => mkdtempSync(join(tmpdir(), 'cas-test-'));
const K = (n) => n.toString(16).padStart(64, '0');
const files = (dir) => readdirSync(dir, { recursive: true }).filter((f) => f.endsWith('.v8'));

test('round trip: typed arrays, Maps, -0 and shared references survive the disk; entries are sharded by the first 2 hex chars', () => {
  const dir = tmp(), shared = { n: 1 };
  const entry = { result: { 'tk.a': { px: new Uint8Array([1, 2, 255]), f: new Float64Array([0.5, -0]), m: new Map([[1, 'x']]), a: shared, b: shared, z: -0 } }, elapsedMs: 12.5 };
  createCas({ root: dir }).set(K(0xab), entry);
  assert.deepEqual(files(dir), [join('00', `${K(0xab)}.v8`)], 'sharded by the first two hex characters');
  const fresh = createCas({ root: dir });   // another process: nothing in the front
  assert.equal(fresh.has(K(0xab)), true);
  const got = fresh.get(K(0xab));
  assert.ok(got.result['tk.a'].px instanceof Uint8Array); assert.deepEqual([...got.result['tk.a'].px], [1, 2, 255]);
  assert.ok(got.result['tk.a'].f instanceof Float64Array); assert.ok(Object.is(got.result['tk.a'].f[1], -0)); assert.ok(Object.is(got.result['tk.a'].z, -0));
  assert.equal(got.result['tk.a'].m.get(1), 'x'); assert.equal(got.result['tk.a'].a, got.result['tk.a'].b, 'shared reference preserved');
  assert.equal(got.elapsedMs, 12.5);
  assert.equal(fresh.counters().loadedFromDisk, 1);
});

test('atomic write: no partial or tmp file is left behind, and a write never exposes a half file', () => {
  const dir = tmp(), cas = createCas({ root: dir });
  for (let i = 0; i < 20; i++) cas.set(K(i * 0x1010101), { result: { x: new Uint8Array(100000).fill(i) }, elapsedMs: i });
  const all = readdirSync(dir, { recursive: true });
  assert.equal(all.filter((f) => f.endsWith('.tmp')).length, 0, 'every tmp file was renamed');
  assert.equal(files(dir).length, 20);
  // a crashed writer leaves only a .tmp file, which is never read as an entry
  mkdirSync(join(dir, 'ff'), { recursive: true }); writeFileSync(join(dir, 'ff', `${K(0xff)}.v8.123.abc.tmp`), 'half');
  assert.equal(createCas({ root: dir }).has(K(0xff)), false);
});

test('integrity: a file whose stored key is not its name throws; a missing, truncated or garbled file is a miss and is rewritten', () => {
  const dir = tmp(), cas = createCas({ root: dir });
  cas.set(K(1), { result: 1, elapsedMs: 1 }); cas.set(K(2), { result: 2, elapsedMs: 2 });
  const file = (k) => join(dir, k.slice(0, 2), `${k}.v8`);
  // integrity failure: key 1's bytes under key 3's name
  mkdirSync(join(dir, '00'), { recursive: true }); writeFileSync(file(K(3)), readFileSync(file(K(1))));
  assert.throws(() => createCas({ root: dir }).has(K(3)), CasIntegrityError);
  assert.throws(() => createCas({ root: dir }).get(K(3)), /stores key/);
  // a truncated file is a miss
  truncateSync(file(K(2)), 10);
  const c2 = createCas({ root: dir });
  assert.equal(c2.has(K(2)), false); assert.equal(c2.get(K(2)), undefined); assert.equal(c2.counters().corruptMisses, 2);
  // garbled bytes are a miss; a missing file is a miss
  writeFileSync(file(K(4)), Buffer.from('not a v8 stream'));
  assert.equal(createCas({ root: dir }).has(K(4)), false);
  assert.equal(createCas({ root: dir }).has(K(5)), false);
  // the miss is recomputed and written over the corrupt file
  c2.set(K(2), { result: 2, elapsedMs: 2 });
  assert.equal(createCas({ root: dir }).get(K(2)).result, 2);
  // a key that is not a content key is refused
  assert.throws(() => cas.has('../../etc/passwd'), CasIntegrityError);
});

test('a value v8 cannot serialize stays in the front and is counted, not thrown', () => {
  const cas = createCas({ root: tmp() });
  cas.set(K(7), { result: { f() {} }, elapsedMs: 1 });
  assert.equal(cas.has(K(7)), true); assert.equal(cas.counters().unserializable, 1);
});

test('shared across stores: a second store (a new process) is served every cached Calculation; code change misses', () => {
  const dir = tmp();
  const run = (cas, { codeSalt = null, bump = 0 } = {}) => {
    const store = createPartStore({ base: { has: (a) => a === 'px.n', get: () => new Uint8Array([3, 1, 2]) }, cache: cas, codeSalt });
    let ran = 0;
    store.register('fn.sort', { inParts: ['px.n'], outParts: ['tk.sorted'], calculate: (io) => { ran++; return { 'tk.sorted': { v: Uint8Array.from(io.in('px.n')).sort(), bump } }; } });
    return { got: store.get('tk.sorted'), ran, calls: store.calls() };
  };
  const a = run(createCas({ root: dir })), b = run(createCas({ root: dir }));
  assert.equal(a.ran, 1); assert.equal(b.ran, 0, 'served from disk'); assert.equal(b.calls[0].cached, true);
  assert.deepEqual([...b.got.v], [1, 2, 3]); assert.ok(b.got.v instanceof Uint8Array);
  assert.ok(b.calls[0].computedMs >= 0, 'a hit is charged what it cost to compute');
  assert.equal(run(createCas({ root: dir }), { codeSalt: 'closure-v2' }).ran, 1, 'a codeSalt (module closure) changes every key');
  assert.equal(run(createCas({ root: dir }), { codeSalt: 'closure-v2' }).ran, 0);
  assert.equal(run(createCas({ root: dir }), { bump: 1 }).ran, 0, 'unsalted keys keep their old meaning');
});

test('root inputs are keyed by content: two attempt directories with byte-identical boards share every cache entry', () => {
  const root = tmp(), cacheDir = join(root, 'cas');
  const board = () => new Map([['px.image.cropped', { widthPx: 4, heightPx: 2, data: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]) }], ['px.badges', [{ label: 1, px: [1, 2, 3] }]]]);
  const attempt = (id) => { const d = join(root, 'attempts', 'stages', id, 'fork', 'stage-output', 'early'); mkdirSync(d, { recursive: true }); writeFileSync(join(d, 's3.pxc.bin'), serialize([...board()])); return join(d, 's3.pxc.bin'); };
  const open = (bin, cas, laneOutputs) => {
    const pxc = new Map(deserialize(readFileSync(bin)));   // exactly how a runner loads its board
    const { store } = instrumentedStore({ name: 'x', base: Object.freeze({ has: (a) => pxc.has(a), get: (a) => pxc.get(a) }), cache: cas });
    store.constant('fn.tk.x.laneOutputs', laneOutputs);
    store.register('fn.tk.x.sum', { inParts: ['px.image.cropped', 'px.badges', 'tk.x.lane'], outParts: ['tk.x.sum'], calculate: (io) => ({ 'tk.x.sum': { s: io.in('px.image.cropped').data.reduce((p, q) => p + q, 0) + io.in('px.badges')[0].px.length + io.in('tk.x.lane').k } }) });
    store.register('fn.tk.x.twice', { inParts: ['tk.x.sum'], outParts: ['tk.x.twice'], calculate: (io) => ({ 'tk.x.twice': io.in('tk.x.sum').s * 2 }) });
    store.get('tk.x.twice');
    return { calls: store.calls().filter((c) => c.outParts.length && c.calculation !== 'fn.tk.x.laneOutputs'), keys: store.keyspace() };
  };
  const a = attempt('attempt-A'), b = attempt('attempt-B');
  assert.notEqual(a, b);
  const first = open(a, createCas({ root: cacheDir }), { 'tk.x.lane': { k: 5 } });
  const second = open(b, createCas({ root: cacheDir }), { 'tk.x.lane': { k: 5 } });
  assert.ok(first.calls.length >= 2 && first.calls.every((c) => !c.cached));
  assert.ok(second.calls.every((c) => c.cached), 'every Calculation of the second attempt was a hit');
  assert.deepEqual(second.keys.map((k) => k.key), first.keys.map((k) => k.key), 'the same keys on both attempts');
  // one changed pixel is another key
  const board2 = board(); board2.get('px.image.cropped').data[0] = 9;
  const bin = join(root, 'changed.bin'); writeFileSync(bin, serialize([...board2]));
  assert.ok(open(bin, createCas({ root: cacheDir }), { 'tk.x.lane': { k: 5 } }).calls.every((c) => !c.cached));
});

test('size report and prune: counts bytes, prunes by last use, removes stray tmp files, keeps what was used', () => {
  const dir = tmp(), cas = createCas({ root: dir });
  cas.set(K(1), { result: new Uint8Array(1000), elapsedMs: 1 }); cas.set(K(2), { result: new Uint8Array(10), elapsedMs: 1 });
  const st = casStats({ root: dir });
  assert.equal(st.entries, 2); assert.ok(st.bytes > 1000); assert.equal(st.largest[0].key, K(1).slice(0, 12));
  const old = new Date(Date.now() - 10 * 86400000);
  utimesSync(join(dir, '00', `${K(1)}.v8`), old, old);
  const pr = casPrune({ root: dir, days: 5 });
  assert.equal(pr.removed, 1); assert.equal(pr.kept, 1);
  assert.equal(createCas({ root: dir }).has(K(1)), false); assert.equal(createCas({ root: dir }).has(K(2)), true);
  assert.throws(() => casPrune({ root: dir, days: -1 }));
});

test('closure sha: a change in an imported module changes the key; an unrelated module does not', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'a.mjs'), "import { b } from './b.mjs';\nexport const a = b;\n");
  writeFileSync(join(dir, 'b.mjs'), 'export const b = 1;\n'); writeFileSync(join(dir, 'c.mjs'), 'export const c = 1;\n');
  const s1 = closureSha(['a.mjs'], { root: dir });
  assert.equal(closureSha(['a.mjs'], { root: dir }), s1);
  const fresh = (name) => { const d = tmp(); for (const f of ['a', 'b', 'c']) writeFileSync(join(d, `${f}.mjs`), readFileSync(join(dir, `${f}.mjs`))); return d; };
  const d2 = fresh(); writeFileSync(join(d2, 'c.mjs'), 'export const c = 2;\n');
  assert.equal(closureSha(['a.mjs'], { root: d2 }), s1, 'c.mjs is not imported by a.mjs');
  const d3 = fresh(); writeFileSync(join(d3, 'b.mjs'), 'export const b = 2;\n');
  assert.notEqual(closureSha(['a.mjs'], { root: d3 }), s1, 'b.mjs is imported by a.mjs');
});
