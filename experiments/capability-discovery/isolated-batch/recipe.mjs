/** Default-OFF synthetic byte-sum composition. Caller owns immutable snapshots/cache values. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createPartStore, registerQueries } from '../probes/root-inventory/source/fg/store.mjs';
import { enumerableBoard } from '../enumerable-board/board.mjs';

// Actual complete local import closure, including the query/helper/bridge code in this module.
// Snapshot data is NOT salt: all batches use the same executable source bytes.
const files = ['recipe.mjs', '../enumerable-board/board.mjs',
  ...['store.mjs', 'canon.mjs', 'pxset.mjs', 'render.mjs', 'png.mjs', 'alpha/alphaRender.mjs']
    .map(path => `../probes/root-inventory/source/fg/${path}`),
  '../probes/root-inventory/source/contracts/alpha.profile@1.mjs'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const closureParts = Object.freeze(files.map(path => Object.freeze({
  path, sha256: sha(readFileSync(new URL(path, import.meta.url)))
})));
export const codeSalt = sha(JSON.stringify(closureParts));
const ROOT = 'tk.lab12.upload.bytes', LEAF = 'tk.lab12.upload.summary';
const QUERY = 'fn.q.lab12.byteSum', SUM = 'fn.lab12.upload.sum';
const BATCH = 'tk.lab12.batch.summary', AGGREGATE = 'fn.lab12.batch.sum';
const slots = Object.freeze(Array.from({ length: 6 }, (_, i) => `tk.lab12.upload${i + 1}.summary`));
const byteSum = ({ a }) => ({ value: [...a].reduce((sum, byte) => sum + byte, 0), unit: 'byte-value sum' });

/** Six trusted Uint8Array roots; never mutate their bytes/backings or cached results. */
export function isolatedBatch(uploads, { cache = new Map() } = {}) {
  if (!Array.isArray(uploads) || uploads.length !== 6 ||
      !uploads.every(value => value instanceof Uint8Array && value.constructor === Uint8Array))
    throw new TypeError('isolatedBatch requires exactly six Uint8Array snapshots');
  const leaves = uploads.map(bytes => {
    const provider = new Map([[ROOT, bytes]]);
    const store = createPartStore({ base: enumerableBoard(provider), cache, codeSalt });
    registerQueries(store, { [QUERY]: byteSum });
    store.register(SUM, { inParts: [ROOT], outParts: [LEAF], calls: [QUERY],
      calculate: io => {
        const answer = io.call(QUERY, { a: ROOT });
        return { [LEAF]: Object.freeze({ value: answer.value, unit: answer.unit }) };
      } });
    const answer = store.get(LEAF);
    const bridge = Object.freeze({ value: answer.value, unit: answer.unit,
      sourceKey: store.keyOf(ROOT), producerKey: store.keyOf(LEAF) });
    return Object.freeze({ bridge, calls: store.calls(),
      codeKeys: Object.freeze({ query: store.calculation(QUERY).code, leaf: store.calculation(SUM).code }) });
  });
  // New root store, not a branch: only explicit immutable bridge records cross the boundary.
  const provider = new Map(slots.map((address, i) => [address, leaves[i].bridge]));
  const store = createPartStore({ base: enumerableBoard(provider), cache, codeSalt });
  store.register(AGGREGATE, { inParts: slots, outParts: [BATCH], calls: [],
    calculate: io => {
      const values = Object.freeze(slots.map(address => io.in(address).value));
      return { [BATCH]: Object.freeze({ values, value: values.reduce((sum, value) => sum + value, 0),
        unit: 'byte-value sum', count: 6, countUnit: 'uploads' }) };
    } });
  const summary = store.get(BATCH);
  return Object.freeze({ summary, leaves: Object.freeze(leaves), codeSalt,
    aggregate: Object.freeze({ key: store.keyOf(BATCH), calls: store.calls(), codeKey: store.calculation(AGGREGATE).code }) });
}
