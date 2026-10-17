/**
 * Node filesystem sink for the fg runtime (node-only; the browser-safe
 * core never imports this file).
 *
 * Same contract as fg/sinks.mjs createMemorySink: putArtifact writes the
 * bytes to <dir>/<id><ext> (ids may contain '/' to make subdirectories,
 * which is what scopeSink's branch prefixes become on disk) and returns a
 * ref whose uri is the path relative to `relativeTo` (default: dir), the
 * same relative-path convention runEarly's `artifacts/s1/...` refs use.
 * readArtifact re-reads the file from disk, so ctx.artifact's rehash after
 * write is a real round trip through the filesystem, exactly the check the
 * inline FG blocks perform by hand today.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { sha256Hex } from './canon.mjs';

const EXT = { json: '.json', rgba: '.rgba.bin' };

export function createFileSink(dir, { relativeTo = dir } = {}) {
  const paths = new Map();
  const artifacts = [];
  const pathFor = (id, kind) => {
    if (!/^[\w.\-/]+$/.test(id) || id.split('/').some((seg) => seg === '..' || seg === ''))
      throw new Error(`file sink: artifact id ${JSON.stringify(id)} is not a safe relative path`);
    return join(dir, id + (EXT[kind] ?? (kind.endsWith('json') ? '.json' : '.bin')));
  };
  return {
    artifacts,
    putArtifact(kind, id, bytes, dims) {
      if (paths.has(id)) throw new Error(`file sink: artifact ${id} already put`);
      const path = pathFor(id, kind);
      if (existsSync(path)) throw new Error(`file sink: ${path} already exists; refusing to overwrite evidence`);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, bytes);
      paths.set(id, path);
      const ref = {
        id, kind, sha256: sha256Hex(bytes), bytes: bytes.length,
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
