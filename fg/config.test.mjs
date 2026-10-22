import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPartStore, PartStoreError } from './store.mjs';
import { resolveConfig, expandGrid, prng, declaredRows, knobPath, splitPath } from './config.mjs';

// a two-step pipeline with declared knobs: the outer step calls the inner one; the inner acts only in the outer's 'fine' mode
function pipeline() {
  const store = createPartStore({ name: 'args' }), seen = [];
  store.register('fn.q.t.inner', { args: { step: { default: 2, unit: 'count', note: 'the inner step', sweep: [1, 2, 4] } }, needs: { 'fn.q.t.outer': { mode: 'fine' } },
    calculate: (io) => { seen.push(io.args.step); return { value: io.args.x * io.args.step, unit: 'count' }; } });
  store.register('fn.q.t.outer', { calls: ['fn.q.t.inner'], args: { mode: { default: 'fine', unit: 'enum', values: ['fine', 'coarse'], note: 'which inner step' }, gain: { default: 0.05, unit: 'frac', note: 'a gate', validate: (v) => (v >= 0 && v < 1 ? null : 'must be in [0, 1)') } },
    calculate: (io) => ({ value: { mode: io.args.mode, gain: io.args.gain, inner: store.call('fn.q.t.inner', { x: 3 }).value, nested: io.nestedConfig }, unit: 'count' }) });
  return { store, seen };
}

test('declared args: the store fills defaults, a config overrides them for every nested call, a call\'s own argument wins', () => {
  const { store } = pipeline();
  assert.deepEqual(store.call('fn.q.t.outer', {}).value, { mode: 'fine', gain: 0.05, inner: 6, nested: '' });
  const v = store.call('fn.q.t.outer', { config: { 'fn.q.t.inner': { step: 4 }, 'fn.q.t.outer': { gain: 0.08 } } }).value;
  assert.deepEqual([v.gain, v.inner], [0.08, 12]);
  assert.match(v.nested, /fn\.q\.t\.inner/, 'the nested steps\' config is part of the outer answer\'s identity');
  // a config value equal to the default is no deviation
  assert.equal(store.call('fn.q.t.outer', { config: { 'fn.q.t.inner': { step: 2 } } }).value.nested, '');
  assert.equal(store.call('fn.q.t.outer', { gain: 0.03, config: { 'fn.q.t.outer': { gain: 0.08 } } }).value.gain, 0.03);
  // outside the call the config is gone
  assert.equal(store.call('fn.q.t.inner', { x: 1 }).value, 2);
});

test('declared args: a bad value or an unknown knob in a config is an integrity error; declaredArgs lists every knob', () => {
  const { store } = pipeline();
  assert.throws(() => store.call('fn.q.t.outer', { gain: 2 }), PartStoreError);
  assert.throws(() => store.call('fn.q.t.outer', { mode: 'medium' }), /must be one of/);
  assert.throws(() => store.call('fn.q.t.outer', { config: { 'fn.q.t.inner': { stp: 1 } } }), /not one of its declared args/);
  assert.throws(() => store.register('fn.q.t.bad', { args: { k: { default: 1, unit: 'furlongs', note: 'x' } }, calculate: () => ({ value: 1, unit: 'count' }) }), /needs a default, a unit/);
  const d = store.declaredArgs();
  assert.deepEqual(Object.keys(d), ['fn.q.t.inner', 'fn.q.t.outer']);
  assert.deepEqual(d['fn.q.t.inner'].needs, { 'fn.q.t.outer': { mode: 'fine' } });
  assert.deepEqual(declaredRows(d).map((r) => r.path), ['fn.q.t.inner#step', 'fn.q.t.outer#mode', 'fn.q.t.outer#gain']);
  assert.deepEqual(splitPath(knobPath('fn.q.t.outer', 'gain')), ['fn.q.t.outer', 'gain']);
});

test('the store keys a Calculation\'s cache on its resolved args and its nested config: two configs share exactly what they share', () => {
  const leafCalc = (io) => ({ value: io.args.n, unit: 'count' }), partCalc = (io) => ({ 'tk.t.part': io.call('fn.t.leaf', {}).value });
  const keyUnder = (config) => {
    const store = createPartStore({ name: 'keys' });
    store.register('fn.t.leaf', { args: { n: { default: 1, unit: 'count', note: 'n' } }, calculate: leafCalc });
    store.register('fn.t.part', { outParts: ['tk.t.part'], calls: ['fn.t.leaf'], calculate: partCalc });
    store.call('fn.t.part', config ? { config } : undefined);
    return { key: store.calls().find((e) => e.calculation === 'fn.t.part').key, value: store.get('tk.t.part') };
  };
  const none = keyUnder(null);
  assert.equal(keyUnder({ 'fn.t.leaf': { n: 1 } }).key, none.key, 'a config that names the default keys as no config');
  assert.equal(keyUnder({ 'fn.t.other': { n: 3 } }).key, none.key, 'a knob of a Calculation it never calls is not in its key');
  const two = keyUnder({ 'fn.t.leaf': { n: 2 } });
  assert.notEqual(two.key, none.key); assert.equal(two.value, 2);
});

test('a Part produced on first need is produced under no config', () => {
  const store = createPartStore({ name: 'lazy' });
  store.register('fn.t.leaf', { args: { n: { default: 1, unit: 'count', note: 'n' } }, calculate: (io) => ({ value: io.args.n, unit: 'count' }) });
  store.register('fn.t.lazy', { outParts: ['tk.t.lazy'], calls: ['fn.t.leaf'], calculate: (io) => ({ 'tk.t.lazy': io.call('fn.t.leaf', {}).value }) });
  store.register('fn.q.t.reader', { args: { m: { default: 0, unit: 'count', note: 'm' } }, calculate: () => ({ value: store.get('tk.t.lazy'), unit: 'count' }) });
  assert.equal(store.call('fn.q.t.reader', { config: { 'fn.t.leaf': { n: 7 } } }).value, 1);
});

test('resolveConfig: canonical resolved knobs of the active Calculations, a stable hash, the sparse diff, and loud errors', () => {
  const { store } = pipeline(), d = store.declaredArgs();
  const a = resolveConfig(d, {}), b = resolveConfig(d, { 'fn.q.t.inner': { step: 2 } }), c = resolveConfig(d, { 'fn.q.t.outer': { gain: 0.08 }, 'fn.q.t.inner': { step: 4 } });
  assert.equal(a.hash, b.hash); assert.deepEqual(b.sparse, {});
  assert.notEqual(a.hash, c.hash); assert.deepEqual(c.sparse, { 'fn.q.t.inner': { step: 4 }, 'fn.q.t.outer': { gain: 0.08 } });
  assert.match(a.hash, /^[0-9a-f]{64}$/);
  // needs: in the coarse mode the inner step is inactive, so its knobs are not in the canonical form, and setting one is an error
  const coarse = resolveConfig(d, { 'fn.q.t.outer': { mode: 'coarse' } });
  assert.deepEqual(Object.keys(coarse.canonical), ['fn.q.t.outer']);
  assert.match(resolveConfig(d, { 'fn.q.t.outer': { mode: 'coarse' }, 'fn.q.t.inner': { step: 4 } }).errors.join(), /acts only when/);
  assert.equal(resolveConfig(d, { 'fn.q.t.outer': { mode: 'coarse' }, 'fn.q.t.inner': { step: 4 } }, { lenient: true }).hash, coarse.hash);
  assert.match(resolveConfig(d, { 'fn.q.t.nope': {} }).errors.join(), /declares no args/);
  assert.match(resolveConfig(d, { 'fn.q.t.outer': { gian: 1 } }).errors.join(), /has no knob 'gian'/);
  assert.match(resolveConfig(d, { 'fn.q.t.outer': { gain: 1.5 } }).errors.join(), /must be in/);
});

test('expandGrid: the product, a seeded subsample, cross axes, duplicates merged by hash, inactive knobs merged', () => {
  const { store } = pipeline(), d = store.declaredArgs();
  const g = expandGrid(d, { axes: [{ knob: 'fn.q.t.outer#mode', values: ['fine', 'coarse'] }, { knob: 'fn.q.t.inner#step' }], cross: [{ knob: 'fn.q.t.outer#gain', values: [0.05, 0.08] }] });
  assert.equal(g.product, 12);
  // coarse x every step is one config per gain (the inner step is inactive there); fine x 3 steps x 2 gains = 6; plus the base = fine/2/0.05
  assert.equal(g.configs.length, 8);
  assert.ok(g.duplicates >= 4);
  const s = (seed) => expandGrid(d, { axes: [{ knob: 'fn.q.t.inner#step' }, { knob: 'fn.q.t.outer#gain', values: [0.01, 0.02, 0.03, 0.04] }], sample: { n: 3, seed } });
  assert.deepEqual(s(5).configs.map((c) => c.hash), s(5).configs.map((c) => c.hash));
  assert.equal(s(5).sampled, 3); assert.equal(s(5).product, 12);
  assert.throws(() => expandGrid(d, { axes: [{ knob: 'fn.q.t.inner#steps' }] }), /no declared knob/);
  assert.throws(() => expandGrid(d, { axes: [{ knob: 'fn.q.t.inner#step', values: [1.5] }] }), /integer/);
  assert.equal(prng(3)(), prng(3)());
});
