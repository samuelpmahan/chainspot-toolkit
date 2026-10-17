/**
 * Node filesystem sink for the fg runtime (node-only; the browser-safe
 * core never imports this file).
 *
 * Same contract as fg/sinks.mjs createMemorySink: putArtifact writes the
 * bytes to <dir>/<path> when the caller names a path, else <dir>/<id><ext>
 * (ids and paths may contain '/' to make subdirectories,
 * which is what scopeSink's branch prefixes become on disk) and returns a
 * ref whose uri is the path relative to `relativeTo` (default: dir), the
 * same relative-path convention runEarly's `artifacts/s1/...` refs use.
 * readArtifact re-reads the file from disk, so ctx.artifact's rehash after
 * write is a real round trip through the filesystem, exactly the check the
 * inline FG blocks performed by hand. Hashing is node:crypto (this file is
 * node-only anyway): equal to canon.sha256Hex byte for byte and far faster
 * on the 10 MB S1 rasters; runners pass nodeSha256 as runGuarantees' hash.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

export const nodeSha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const safe = (rel) => /^[\w.\-/]+$/.test(rel) && !rel.split('/').some((seg) => seg === '..' || seg === '');

const EXT = { json: '.json', rgba: '.rgba.bin' };

export function createFileSink(dir, { relativeTo = dir } = {}) {
  const paths = new Map();
  const artifacts = [];
  const pathFor = (id, kind, path) => {
    if (path !== undefined) {
      if (typeof path !== 'string' || !safe(path)) throw new Error(`file sink: artifact path ${JSON.stringify(path)} is not a safe relative path`);
      return join(dir, path);
    }
    if (!safe(id)) throw new Error(`file sink: artifact id ${JSON.stringify(id)} is not a safe relative path`);
    return join(dir, id + (EXT[kind] ?? (kind.endsWith('json') ? '.json' : '.bin')));
  };
  return {
    artifacts,
    putArtifact(kind, id, bytes, dims, options) {
      if (paths.has(id)) throw new Error(`file sink: artifact ${id} already put`);
      const path = pathFor(id, kind, options?.path);
      if (existsSync(path)) throw new Error(`file sink: ${path} already exists; refusing to overwrite evidence`);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, bytes);
      paths.set(id, path);
      const ref = {
        id, kind, sha256: nodeSha256(bytes), bytes: bytes.length,
        uri: relative(relativeTo, path).split(sep).join('/'), ...(dims ? { dims } : {})
      };
      artifacts.push(ref);
      return ref;
    },
    readArtifact(id) {
      const path = paths.get(id);
      return path ? new Uint8Array(readFileSync(path)) : undefined;
    }
  };
}
