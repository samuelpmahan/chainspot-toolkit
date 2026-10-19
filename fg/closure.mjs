/**
 * Code keys from module closures (node-only).
 *
 * A Calculation's code key defaults to the digest of its `calculate` source (fg/store.mjs), which misses a change in
 * a module that source calls. A runner sets a stronger key from the closure: the modules reachable from an entry by
 * following relative static and dynamic imports, each by the sha of its bytes. Used as a store `codeSalt`
 * (createPartStore) and as an implementation's `code` (fg/discover.mjs), so the persistent cache (fg/cas.mjs) can
 * never serve a result computed by older code.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = resolve(import.meta.dirname, '..');

/**
 * The modules a run can reach from its entries, by following relative static and dynamic imports (the recipe closure
 * copies whole directories, so a test file or a renderer nobody imports would otherwise make every cell stale).
 * Moved here from ports/state/matrix.mjs, which re-exports it.
 */
export function reachableModules(root, entries) {
  const seen = new Set(), todo = [...entries];
  while (todo.length) {
    const rel = todo.pop(); if (seen.has(rel) || !existsSync(join(root, rel))) continue; seen.add(rel);
    const src = readFileSync(join(root, rel), 'utf8');
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const target = join(rel, '..', m[1]).replace(/^\.\//, '');
      todo.push(target.replace(/\\/g, '/'));
    }
  }
  return seen;
}

const fileSha = new Map();   // absolute path -> sha256 of its bytes, once per process (a module does not change mid-run)
const shaOfFile = (abs) => { if (!fileSha.has(abs)) fileSha.set(abs, createHash('sha256').update(readFileSync(abs)).digest('hex')); return fileSha.get(abs); };

/** sha256 over the sorted (path, sha of bytes) of every module reachable from `entries` (paths relative to root, or absolute). */
export function closureSha(entries, { root = ROOT } = {}) {
  const rels = entries.map((e) => (resolve(e) === e ? relative(root, e) : e).replace(/\\/g, '/'));
  const files = [...reachableModules(root, rels)].filter((rel) => existsSync(join(root, rel))).sort();
  const h = createHash('sha256');
  for (const rel of files) h.update(`${rel}\0${shaOfFile(join(root, rel))}\n`);
  return h.digest('hex');
}

/** The modules of a closure, for a report. */
export const closureFiles = (entries, { root = ROOT } = {}) => [...reachableModules(root, entries)].sort();
