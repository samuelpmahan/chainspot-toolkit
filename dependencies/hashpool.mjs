/**
 * sha256 of many files on every core: worker threads each read whole files and hash them (the same readFileSync +
 * createHash('sha256') as facts.sha, so the digests are identical). Small sets are hashed inline; the pool is
 * created on first need and unref'd, so it never keeps a process alive.
 */
import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const SOURCE = `
const { parentPort } = require('node:worker_threads');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
parentPort.on('message', ({ id, paths }) => {
  const out = paths.map(path => {
    try { const bytes = readFileSync(path); return { sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length }; }
    catch (error) { return { error: error.code ?? String(error) }; }
  });
  parentPort.postMessage({ id, out });
});`;
const one = path => { try { const b = readFileSync(path); return { sha256: createHash('sha256').update(b).digest('hex'), size: b.length }; } catch (e) { return { error: e.code ?? String(e) }; } };

let pool = null, nextId = 0;
const waiting = new Map();
function workers() {
  if (pool) return pool;
  const n = Math.max(1, Math.min(4, availableParallelism()));
  pool = Array.from({ length: n }, () => {
    const w = new Worker(SOURCE, { eval: true });
    w.unref();
    w.pending = 0;
    w.on('message', ({ id, out }) => { const done = waiting.get(id); waiting.delete(id); if (--w.pending === 0) w.unref(); done(out); });
    return w;
  });
  return pool;
}

/** Start the workers now (they boot while the caller does other work); returns immediately. */
export function warmHashPool() { workers(); }

/** [{sha256,size} | {error}] for each absolute path, in order; `sizes` (bytes) balance the workers. */
export async function hashFiles(paths, sizes = null) {
  const bytes = sizes ? sizes.reduce((a, b) => a + b, 0) : Infinity;
  if (paths.length < 4 || bytes < 8e6) return paths.map(one);   // spreading small work costs more than it saves
  const ws = workers(), lanes = ws.map(() => []), load = ws.map(() => 0);
  // greedy by size (largest first) so no worker gets all the big rasters
  const order = paths.map((p, i) => i).sort((a, b) => (sizes?.[b] ?? 0) - (sizes?.[a] ?? 0));
  for (const i of order) { let k = 0; for (let j = 1; j < ws.length; j++) if (load[j] < load[k]) k = j; lanes[k].push(i); load[k] += sizes?.[i] ?? 1; }
  const result = new Array(paths.length);
  await Promise.all(lanes.map((idx, k) => idx.length && new Promise(resolve => {
    const id = nextId++;
    waiting.set(id, out => { out.forEach((r, j) => { result[idx[j]] = r; }); resolve(); });
    if (ws[k].pending++ === 0) ws[k].ref();   // a job in flight keeps the process alive; an idle pool does not
    ws[k].postMessage({ id, paths: idx.map(i => paths[i]) });
  })));
  return result;
}
