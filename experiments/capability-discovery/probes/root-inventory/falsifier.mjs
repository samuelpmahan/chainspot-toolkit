import assert from 'node:assert/strict';
import { instrumentedStore } from './source/fg/profile.mjs';
import { registerQueries } from './source/fg/store.mjs';

export function invoke({ cache, pixels, shape = 'addresses', constant = 7, explicitInput = false }) {
  const pxc = new Map([['px.image.cropped', { widthPx: 1, heightPx: 1, rgba: new Uint8Array(pixels) }]]);
  const adapter = { has: a => pxc.has(a), get: a => pxc.get(a), addresses: [...pxc.keys()] };
  const base = shape === 'Map' ? pxc : Object.freeze({ ...adapter,
    ...(shape === 'keys' ? { keys: () => pxc.keys() } : {}),
    ...(shape === 'incompleteKeys' ? { keys: () => [][Symbol.iterator]() } : {}),
  });
  const { store } = instrumentedStore({ base, cache, codeSalt: 'same-closure' });
  store.constant('fn.test.roots', { 'tk.sameConstant': { constant } });
  registerQueries(store, { 'fn.q.test.total': ({ image }) => ({
    value: Array.from(image.rgba).reduce((a, b) => a + b, 0), unit: 'gray-level',
  }) });
  store.register('fn.test.indirect', { inParts: explicitInput ? ['px.image.cropped'] : [],
    outParts: ['tk.total'], calls: ['fn.q.test.total'],
    calculate: io => ({ 'tk.total': io.call('fn.q.test.total', { image: 'px.image.cropped' }).value }),
  });
  const value = store.get('tk.total'), entry = store.calls().find(x => x.calculation === 'fn.test.indirect');
  return { value, pixelKey: store.keyOf('px.image.cropped'), producerKey: entry.key, cached: Boolean(entry.cached) };
}

export function runFalsifiers() {
  const cases = [];
  for (const shape of ['addresses', 'Map', 'keys', 'incompleteKeys']) {
    const cache = new Map();
    const first = invoke({ cache, pixels: [1, 2, 3], shape });
    const same = invoke({ cache, pixels: [1, 2, 3], shape });
    const changed = invoke({ cache, pixels: [9, 9, 9], shape });
    const changedConstant = invoke({ cache, pixels: [9, 9, 9], shape, constant: 8 });
    const unsafe = ['addresses', 'incompleteKeys'].includes(shape);
    assert.equal(first.value, 6); assert.equal(same.cached, true);
    assert.notEqual(first.pixelKey, changed.pixelKey);
    assert.equal(changed.value, unsafe ? 6 : 27); assert.equal(changed.cached, unsafe);
    assert.equal(changedConstant.value, 27); assert.equal(changedConstant.cached, false);
    cases.push({ shape, first, same, changed, changedConstant, expectedChangedValue: 27 });
  }
  const cache = new Map();
  invoke({ cache, pixels: [1, 2, 3], explicitInput: true });
  const explicitInput = invoke({ cache, pixels: [9, 9, 9], explicitInput: true });
  const cold = invoke({ pixels: [9, 9, 9] });
  assert.equal(explicitInput.value, 27); assert.equal(explicitInput.cached, false);
  assert.equal(cold.value, 27); assert.equal(cold.cached, false);
  return { schema: 'w6-root-repropack@1', sourceRef: '49255331791b1245cf0f9cd699816175f94e70f2',
    cases, controls: { explicitInput, noSharedCache: cold },
    claim: 'Synthetic same-constant changed-pixel cache collision; no current cross-course poisoning established.' };
}
if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1])
  console.log(JSON.stringify(runFalsifiers(), null, 2));
