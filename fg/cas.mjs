/**
 * The persistent cache: a content-addressed, on-disk { has, get, set } for createPartStore({ cache }) (node-only).
 *
 * Sam, 2026-10-18: "Being able to instantly rerun any little change to scoring or matching over every hole on every
 * course allows principled refined tuning." The store's cache key is the sha256 of { fn, code, args, inputs }
 * (fg/store.mjs), so an entry is valid forever for exactly that key: nothing is ever invalidated, a changed input or
 * code simply keys to another file. This module only keeps the entries across processes.
 *
 *   const cas = createCas({ root: 'attempts/cas' })   // default root: <repo>/attempts/cas (gitignored)
 *   createPartStore({ cache: cas })
 *
 *   one file per key, sharded by the first 2 hex characters:   <root>/ab/abcdef....v8
 *   value                  node:v8 serialize of { key, entry } through the PxC codec (fg/pxcCodec.mjs: typed arrays
 *                          bitpacked / rightsized / deduped on write, unpacked on read; Maps, Sets, -0 and shared
 *                          references survive; entry is the store's { result, elapsedMs }); plain-v8 entries still read
 *   write                  tmp file in the shard + rename: a reader sees the whole file or none of it
 *   read                   lazy, once per key and process (the in-memory front); a read touches the file's mtime, so
 *                          `prune --older-than` removes what nothing has used
 *   a missing, truncated or unreadable file         a MISS (the call is computed and the file rewritten)
 *   a file whose stored key differs from its name   an INTEGRITY failure: throws CasIntegrityError (AGENTS.md: only
 *                          integrity checks stop a run)
 *   a value v8 cannot serialize (a function)        stays in the front only; counted in stats().unserializable
 */
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, readdirSync, statSync, unlinkSync, utimesSync, rmdirSync } from 'node:fs';
import { serialize, deserialize } from './pxcCodec.mjs';   // node:v8 with packed typed arrays
import { join, resolve } from 'node:path';

export const CAS_DIR = 'attempts/cas';
const KEY = /^[0-9a-f]{16,128}$/;
const EXT = '.v8';

export class CasIntegrityError extends Error {
  constructor(message, options) { super(message, options); this.name = 'CasIntegrityError'; }
}

export function createCas({ root, repoRoot = resolve(import.meta.dirname, '..'), touch = true } = {}) {
  const dir = resolve(root ?? join(repoRoot, CAS_DIR));
  const front = new Map();   // key -> entry, loaded or written in this process
  const counters = { hits: 0, misses: 0, writes: 0, loadedFromDisk: 0, unserializable: 0, corruptMisses: 0 };
  const fileOf = (key) => {
    if (typeof key !== 'string' || !KEY.test(key)) throw new CasIntegrityError(`cas: '${key}' is not a content key (lowercase hex)`);
    return join(dir, key.slice(0, 2), `${key}${EXT}`);
  };

  // read and verify one file; undefined = miss
  const load = (key) => {
    const file = fileOf(key);
    let bytes;
    try { bytes = readFileSync(file); } catch { return undefined; }            // missing / unreadable: a miss
    let doc;
    try { doc = deserialize(bytes); } catch { counters.corruptMisses++; return undefined; }   // truncated / garbled: a miss
    if (!doc || typeof doc !== 'object' || typeof doc.key !== 'string') { counters.corruptMisses++; return undefined; }
    if (doc.key !== key) throw new CasIntegrityError(`cas: ${file} stores key ${doc.key}, not ${key}: the cache is corrupt (delete the file)`);
    if (touch) { try { const t = new Date(); utimesSync(file, t, t); } catch { /* read-only store: no touch */ } }
    counters.loadedFromDisk++;
    return doc.entry;
  };

  const cas = {
    dir,
    has(key) {
      if (front.has(key)) { counters.hits++; return true; }
      const entry = load(key);
      if (entry === undefined) { counters.misses++; return false; }
      front.set(key, entry); counters.hits++;
      return true;
    },
    get(key) {
      if (front.has(key)) return front.get(key);
      const entry = load(key);
      if (entry !== undefined) front.set(key, entry);
      return entry;
    },
    set(key, entry) {
      const file = fileOf(key);
      const had = front.has(key);
      front.set(key, entry);
      if (had && existsSync(file)) return cas;   // already persisted (content-addressed: same key, same value)
      let bytes;
      try { bytes = serialize({ key, entry }); } catch { counters.unserializable++; return cas; }
      const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
      for (let attempt = 0; ; attempt++) {
        try { mkdirSync(join(dir, key.slice(0, 2)), { recursive: true }); writeFileSync(tmp, bytes); break; }
        catch (error) { if (attempt || error.code !== 'ENOENT') throw error; }   // a prune removed the empty shard between mkdir and write: once more
      }
      renameSync(tmp, file);   // atomic
      counters.writes++;
      return cas;
    },
    /** This process's counters (not the disk's: see casStats). */
    counters: () => ({ ...counters, front: front.size })
  };
  return cas;
}

/** Every entry file under root: { key, file, bytes, mtimeMs }, plus stray tmp files. */
function walk(dir) {
  const out = { entries: [], tmp: [] };
  if (!existsSync(dir)) return out;
  for (const shard of readdirSync(dir, { withFileTypes: true })) {
    if (!shard.isDirectory()) continue;
    for (const f of readdirSync(join(dir, shard.name))) {
      const file = join(dir, shard.name, f);
      let st; try { st = statSync(file); } catch { continue; }
      if (f.endsWith(EXT)) out.entries.push({ key: f.slice(0, -EXT.length), file, bytes: st.size, mtimeMs: st.mtimeMs });
      else if (f.endsWith('.tmp')) out.tmp.push({ file, bytes: st.size, mtimeMs: st.mtimeMs });
    }
  }
  return out;
}

/** The size report: entries, bytes, age range, the biggest entries. */
export function casStats({ root, repoRoot = resolve(import.meta.dirname, '..') } = {}) {
  const dir = resolve(root ?? join(repoRoot, CAS_DIR));
  const { entries, tmp } = walk(dir);
  const bytes = entries.reduce((s, e) => s + e.bytes, 0);
  const times = entries.map((e) => e.mtimeMs);
  return {
    dir, entries: entries.length, bytes, megabytes: Math.round(bytes / 1048576 * 100) / 100,
    strayTmpFiles: tmp.length,
    oldestUsedAt: times.length ? new Date(Math.min(...times)).toISOString() : null,
    newestUsedAt: times.length ? new Date(Math.max(...times)).toISOString() : null,
    largest: [...entries].sort((a, b) => b.bytes - a.bytes).slice(0, 5).map((e) => ({ key: e.key.slice(0, 12), bytes: e.bytes }))
  };
}

/** Remove entries not used (written or read) for `days` days, and stray tmp files from a crashed writer. */
export function casPrune({ root, repoRoot = resolve(import.meta.dirname, '..'), days, now = Date.now() } = {}) {
  if (!(days >= 0)) throw new Error('casPrune: days must be a number >= 0');
  const dir = resolve(root ?? join(repoRoot, CAS_DIR)), cutoff = now - days * 86400000;
  const { entries, tmp } = walk(dir);
  let removed = 0, freed = 0;
  for (const e of [...entries, ...tmp]) {
    if (e.mtimeMs >= cutoff) continue;
    try { unlinkSync(e.file); removed++; freed += e.bytes; } catch { /* raced with another process: gone is fine */ }
  }
  for (const shard of existsSync(dir) ? readdirSync(dir) : []) { try { rmdirSync(join(dir, shard)); } catch { /* not empty */ } }
  return { dir, removed, freedBytes: freed, kept: entries.length + tmp.length - removed };
}
