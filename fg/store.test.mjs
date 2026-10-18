/**
 * Tests for the PartStore (fg/store.mjs), the addressed store that replaced
 * the fg runtime's env side channel:
 *   1. reads resolve toolkit Parts and provider-board Parts uniformly; a
 *      toolkit Part is produced lazily, once, by the Calculation that
 *      declares it among its outParts, and records producedBy + inParts
 *   2. write-once: a second production, a shadowed provider address, a
 *      second producer for one address all throw by name
 *   3. a Calculation reads only its declared inParts and calls only its
 *      declared calls; an unresolvable address names itself
 *   4. every call is auto-instrumented: entry/exit order, nesting, declared
 *      Part traffic, timing, failures
 *   5. branches: provider reads never fall through to the parent's board;
 *      toolkit Parts and Calculations do; branch writes stay in the branch
 *   6. async producers and lazy: false producers
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPartStore, PartStoreError } from './store.mjs';
import { createBoard } from './fixtures/board.mjs';

test('toolkit and provider Parts resolve uniformly; lazy production records provenance', () => {
  const calls = [];
  const store = createPartStore({ base: createBoard([['px.image', { w: 4, h: 2 }]]), onCall: (e) => calls.push(e) });
  store.register('fn.tk.area', { inParts: ['px.image'], outParts: ['tk.area'], calculate: (io) => ({ 'tk.area': io.in('px.image').w * io.in('px.image').h }) });
  assert.equal(calls.length, 0, 'registration runs nothing');
  assert.equal(store.has('tk.area'), true);
  assert.equal(store.get('tk.area'), 8);
  assert.equal(store.get('tk.area'), 8);
  assert.equal(calls.length, 1, 'produced once');
  const prov = store.provenance('tk.area');
  assert.match(prov.key, /^[0-9a-f]{64}$/, 'a produced Part carries the key of the call that made it');
  assert.deepEqual(prov, { address: 'tk.area', producedBy: 'fn.tk.area', inParts: ['px.image'], key: prov.key, pointerTo: null, store: 'root' });
  const base = store.provenance('px.image');
  assert.deepEqual(base, { address: 'px.image', producedBy: 'provider-board', inParts: null, key: base.key, store: 'root' });
  assert.equal(store.has('tk.nothing'), false);
  assert.throws(() => store.get('tk.nothing'), (e) => e instanceof PartStoreError && /no Part at 'tk\.nothing'/.test(e.message));
  assert.deepEqual(store.manifest().parts, [{ address: 'tk.area', producedBy: 'fn.tk.area', inParts: ['px.image'], key: prov.key, pointerTo: null }]);
});

test('Parts are write-once and never shadow the provider board', () => {
  const store = createPartStore({ base: createBoard([['px.image', 1]]) });
  store.constant('fn.tk.a', { 'tk.a': 1 });
  assert.throws(() => store.register('fn.tk.a2', { outParts: ['tk.a'], calculate: () => ({}) }), /outPart 'tk\.a' is already declared by fn\.tk\.a/);
  assert.throws(() => store.register('fn.tk.shadow', { outParts: ['px.image'], calculate: () => ({}) }), /provider-board address/);
  assert.throws(() => store.register('fn.tk.a', { calculate: () => 1 }), /already registered/);
  assert.throws(() => store.register('tk.notfn', { calculate: () => 1 }), /not a fn\.\* Calculation address/);
  store.call('fn.tk.a');
  assert.throws(() => store.call('fn.tk.a'), /Part 'tk\.a' is write-once; fn\.tk\.a already produced it/);
  // a producer returning other outParts than it declared fails by name
  store.register('fn.tk.liar', { outParts: ['tk.b'], calculate: () => ({ 'tk.c': 1 }) });
  assert.throws(() => store.get('tk.b'), /fn\.tk\.liar returned outParts that differ from its declaration \(missing: tk\.b; undeclared: tk\.c\)/);
  assert.equal(store.has('tk.b'), false, 'a failed lazy production reads as absent');
});

test('a Calculation reads only its declared inParts and calls only its declared calls', () => {
  const store = createPartStore({ base: createBoard([['px.a', 1], ['px.b', 2]]) });
  store.register('fn.tk.peek', { inParts: ['px.a'], calculate: (io) => io.in('px.b') });
  assert.throws(() => store.call('fn.tk.peek'), /fn\.tk\.peek read 'px\.b', which is not among its declared inParts/);
  store.register('fn.tk.inner', { calculate: () => 'inner' });
  store.register('fn.tk.outer', { calculate: (io) => io.call('fn.tk.inner') });
  assert.throws(() => store.call('fn.tk.outer'), /fn\.tk\.outer called 'fn\.tk\.inner', which is not among its declared calls/);
  store.register('fn.tk.missing', { inParts: ['px.nope'], calculate: () => 1 });
  assert.throws(() => store.call('fn.tk.missing'), /fn\.tk\.missing: declared inPart 'px\.nope' is not on store root/);
  assert.throws(() => store.call('fn.tk.unregistered'), /Calculation 'fn\.tk\.unregistered' is not registered/);
  // the board view a provider function takes is exactly the inParts
  store.register('fn.tk.board', { inParts: ['px.a'], calculate: (io) => [io.board.has('px.a'), io.board.has('px.b'), io.board.get('px.a')] });
  assert.deepEqual(store.call('fn.tk.board'), [true, false, 1]);
  // a scoped view names who reached for what
  const view = store.scope({ who: 'fg.toy.x', reads: ['px.a'], calls: ['fn.tk.inner'] });
  assert.equal(view.get('px.a'), 1);
  assert.equal(view.call('fn.tk.inner'), 'inner');
  assert.throws(() => view.get('px.b'), /fg\.toy\.x read undeclared address 'px\.b' \(declare it in reads\)/);
  assert.throws(() => view.call('fn.tk.board'), /fg\.toy\.x called undeclared Calculation 'fn\.tk\.board' \(declare it in calls\)/);
});

test('every Calculation call is instrumented with entry/exit, nesting and declared Part traffic', () => {
  const log = [];
  const store = createPartStore({ base: createBoard([['px.a', 3]]), name: 'run', onCall: (e) => log.push(e) });
  store.register('fn.tk.double', { inParts: ['px.a'], outParts: ['tk.double'], calculate: (io) => ({ 'tk.double': io.in('px.a') * 2 }) });
  store.register('fn.tk.report', { inParts: ['tk.double'], calls: ['fn.tk.fmt'], calculate: (io) => io.call('fn.tk.fmt', { site: 'demo', v: io.in('tk.double') }) });
  store.register('fn.tk.fmt', { calculate: ({ args }) => `v=${args.v}` });
  store.register('fn.tk.boom', { calculate: () => { throw new Error('kaput'); } });
  assert.equal(store.call('fn.tk.report', undefined, { caller: 'fg.toy.report' }), 'v=6');
  assert.throws(() => store.call('fn.tk.boom'), /kaput/);
  const bySeq = [...log].sort((a, b) => a.seq - b.seq);
  assert.deepEqual(bySeq.map((e) => [e.seq, e.calculation, e.parent, e.depth, e.caller, e.status]), [
    [0, 'fn.tk.report', null, 0, 'fg.toy.report', 'ok'],
    [1, 'fn.tk.double', 0, 1, 'lazy:tk.double', 'ok'],
    [2, 'fn.tk.fmt', 0, 1, 'fn.tk.report', 'ok'],
    [3, 'fn.tk.boom', null, 0, null, 'threw']
  ]);
  assert.deepEqual(log.map((e) => e.seq), [1, 2, 0, 3], 'exit order: inner calls exit before their caller');
  assert.deepEqual([bySeq[1].inParts, bySeq[1].outParts], [['px.a'], ['tk.double']]);
  assert.equal(bySeq[2].site, 'demo');
  assert.equal(bySeq[3].error, 'kaput');
  assert.ok(log.every((e) => typeof e.elapsedMs === 'number' && e.store === 'run'));
});

test('a branch reads provider Parts only from its own board; toolkit Parts and Calculations through its parent', () => {
  const root = createPartStore({ base: createBoard([['px.live', 'live'], ['px.shared', 'root-board']]) });
  root.constant('fn.tk.source', { 'tk.source': 'S' });
  root.register('fn.tk.shout', { inParts: ['tk.source'], calculate: (io) => io.in('tk.source') + '!' });
  const branch = root.branch(createBoard([['px.shared', 'branch-board']]), { name: 'b1' });
  assert.equal(branch.get('px.shared'), 'branch-board');
  assert.equal(branch.has('px.live'), false, "the parent's live board is not the branch's");
  assert.equal(branch.get('tk.source'), 'S', 'toolkit Parts resolve through the parent');
  assert.equal(branch.call('fn.tk.shout'), 'S!', 'Calculations resolve through the parent');
  branch.register('fn.slot', { inParts: ['px.shared'], outParts: ['px.slot.out'], calculate: (io) => ({ 'px.slot.out': io.in('px.shared') }) });
  branch.call('fn.slot');
  assert.equal(branch.get('px.slot.out'), 'branch-board');
  assert.equal(root.has('px.slot.out'), false, 'branch writes stay in the branch');
  assert.equal(root.registered('fn.slot'), false);
  assert.deepEqual(branch.provenance('tk.source').store, 'root');
});

test('async producers resolve through call; lazy: false producers run only when called', async () => {
  const store = createPartStore();
  store.register('fn.tk.async', { outParts: ['tk.later'], calculate: async () => ({ 'tk.later': 42 }) });
  assert.throws(() => store.get('tk.later'), /asynchronous; call it explicitly/);
  const fresh = createPartStore();
  fresh.register('fn.tk.async', { outParts: ['tk.later'], calculate: async () => ({ 'tk.later': 42 }) });
  assert.deepEqual(await fresh.call('fn.tk.async'), { 'tk.later': 42 });
  assert.equal(fresh.get('tk.later'), 42);
  let ran = 0;
  fresh.register('fn.tk.gateway', { outParts: ['tk.captured'], lazy: false, calculate: ({ args }) => { ran++; return { 'tk.captured': args[0] }; } });
  assert.equal(fresh.has('tk.captured'), false);
  assert.throws(() => fresh.get('tk.captured'), /has not been produced yet .* runs only when called explicitly/);
  assert.equal(ran, 0, 'a read never invokes an explicit-only producer');
  fresh.call('fn.tk.gateway', ['run']);
  assert.equal(fresh.get('tk.captured'), 'run');
});

test('every Calculation call carries the measures its output emits (Parts and capabilities alike)', () => {
  const log = [];
  const store = createPartStore({ name: 'emits', onCall: (e) => log.push(e) });
  store.register('fn.t.count', { outParts: ['t.counted'], calculate: () => ({ 't.counted': { value: 3, emits: { items: 3 } } }) });
  store.register('fn.t.search', { calculate: (io) => ({ best: io.args.k, emits: { poses: 7 * io.args.k } }) });
  store.get('t.counted'); store.call('fn.t.search', { k: 2 });
  assert.deepEqual(log.map((e) => [e.calculation, e.emits]), [['fn.t.count', { items: 3 }], ['fn.t.search', { poses: 14 }]]);
});

test('the keyspace: variants are addresses, a pointer names the accepted one, keys follow content and code', () => {
  const board = createBoard([['px.sizes', [3, 9, 4]], ['px.raster', { rgba: new Uint8Array([1, 2, 3, 4]), widthPx: 1, heightPx: 1 }]]);
  const store = createPartStore({ base: board });
  let ran = 0;
  store.register('fn.pick@big', { inParts: ['px.sizes'], outParts: ['px.picked@big'], code: 'big', calculate: (io) => { ran++; return { 'px.picked@big': io.in('px.sizes').filter((x) => x > 3) }; } });
  store.register('fn.pick@all', { inParts: ['px.sizes'], outParts: ['px.picked@all'], code: 'all', calculate: (io) => { ran++; return { 'px.picked@all': io.in('px.sizes') }; } });
  assert.deepEqual(store.variants('px.picked'), ['px.picked@all', 'px.picked@big'], 'declared variants are listed before they are produced');
  assert.deepEqual(store.get('px.picked@big'), [9, 4]);
  store.point('px.picked', 'px.picked@big', { by: 'cmp.fn.pick' });
  assert.deepEqual(store.get('px.picked'), [9, 4], 'get follows the pointer');
  assert.equal(store.provenance('px.picked').pointerTo, 'px.picked@big');
  assert.throws(() => store.point('px.picked', 'px.picked@all'), /already written/);
  assert.notEqual(store.keyOf('px.picked@big'), store.keyOf('px.picked@all'), 'different code, different key');
  assert.equal(store.keyOf('px.picked'), store.keyOf('px.picked@big'), 'a pointer has its target\'s key');
  assert.ok(store.keyspace().every((k) => /^[0-9a-f]{64}$/.test(k.key)));
  // a raster is keyed by its bytes: the same bytes in a different buffer give the same key
  const again = createPartStore({ base: createBoard([['px.raster', { rgba: new Uint8Array([1, 2, 3, 4]), widthPx: 1, heightPx: 1 }]]) });
  assert.equal(again.keyOf('px.raster'), store.keyOf('px.raster'));
});

test('the cache: the same call on the same inputs is served, not computed; a changed input or code recomputes', () => {
  const cache = new Map();
  let ran = 0;
  const make = (sizes, code = 'v1') => {
    const store = createPartStore({ base: createBoard([['px.sizes', sizes]]), cache });
    store.register('fn.pick', { inParts: ['px.sizes'], outParts: ['px.picked'], code, calculate: (io) => { ran++; return { 'px.picked': { px: io.in('px.sizes').filter((x) => x > 3), emits: { kept: 2 } } }; } });
    return store;
  };
  const a = make([3, 9, 4]); a.get('px.picked');
  const b = make([3, 9, 4]); assert.deepEqual(b.get('px.picked').px, [9, 4]);
  assert.equal(ran, 1, 'the second store was served from the cache');
  const served = b.calls().find((e) => e.calculation === 'fn.pick');
  assert.equal(served.cached, true); assert.deepEqual(served.emits, { kept: 2, cached: 1 }); assert.equal(served.key, a.calls().find((e) => e.calculation === 'fn.pick').key);
  assert.equal(b.provenance('px.picked').key, a.provenance('px.picked').key);
  const c = make([3, 9, 5]); c.get('px.picked'); assert.equal(ran, 2, 'a changed input recomputes');
  const d = make([3, 9, 4], 'v2'); d.get('px.picked'); assert.equal(ran, 3, 'changed code recomputes');
  // a constant is keyed by its value, so two runs with different values never share a cached Part
  const e1 = createPartStore({ cache }); e1.constant('fn.c', { 'tk.c': 1 }); const e2 = createPartStore({ cache }); e2.constant('fn.c', { 'tk.c': 2 });
  assert.equal(e2.get('tk.c'), 2);
});
