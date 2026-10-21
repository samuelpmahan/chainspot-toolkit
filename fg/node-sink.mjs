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
 *
 * An rgba artifact is a view: the run's one image with alpha zeroed on a pixel set (badgePx, muted, counters, basketPx,
 * remaining, teePx, refinedPx, eliminatedPx). So the sink writes the image's RGB once, content-addressed
 * (<dir>/img/<sha256 of the RGB, 16 hex>.rgb, 3 B/px), and the artifact file as a view of it: RGBA_VIEW_MAGIC, then
 * the PxC codec's bytes of { schema, base, baseSha256, length, alpha } (alpha: a {0,255} plane bitpacks to 1 bit/px).
 * The ref (sha256, bytes, uri) is that of the RGBA bytes the caller put, exactly as before, and every reader gets
 * those bytes back through readArtifactBytes (old raw .rgba.bin files read unchanged).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { serialize, deserialize } from './pxcCodec.mjs';

export const nodeSha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const safe = (rel) => /^[\w.\-/]+$/.test(rel) && !rel.split('/').some((seg) => seg === '..' || seg === '');

const EXT = { json: '.json', rgba: '.rgba.bin' };
export const RGBA_VIEW_MAGIC = Buffer.from('NCTKRGBAVIEW1\n');
const VIEW_SCHEMA = 'nctk-rgba-view@1';

/** Write RGBA bytes at file as a view of their RGB, stored once under imgDir. */
function writeRgbaView(file, bytes, imgDir) {
  const n = bytes.length / 4, rgb = new Uint8Array(3 * n), alpha = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 3) { const g = 4 * i; rgb[j] = bytes[g]; rgb[j + 1] = bytes[g + 1]; rgb[j + 2] = bytes[g + 2]; alpha[i] = bytes[g + 3]; }
  const baseSha256 = nodeSha256(rgb), base = join(imgDir, `${baseSha256.slice(0, 16)}.rgb`);
  if (!existsSync(base)) { mkdirSync(imgDir, { recursive: true }); writeFileSync(base, rgb); }
  const doc = { schema: VIEW_SCHEMA, base: relative(dirname(file), base).split(sep).join('/'), baseSha256, length: bytes.length, alpha };
  writeFileSync(file, Buffer.concat([RGBA_VIEW_MAGIC, serialize(doc)]));
}

/**
 * The bytes an artifact was put with: an rgba view decoded against its RGB base (whose hash is checked), else the file
 * as written (json, or an old raw .rgba.bin). Every reader of an rgba artifact reads through here.
 */
export function readArtifactBytes(file) {
  const bytes = readFileSync(file);
  if (bytes.length < RGBA_VIEW_MAGIC.length || !bytes.subarray(0, RGBA_VIEW_MAGIC.length).equals(RGBA_VIEW_MAGIC)) return new Uint8Array(bytes);
  const doc = deserialize(bytes.subarray(RGBA_VIEW_MAGIC.length));
  if (doc?.schema !== VIEW_SCHEMA) throw new Error(`${file}: not an ${VIEW_SCHEMA}`);
  const baseFile = resolve(dirname(file), doc.base), rgb = readFileSync(baseFile);
  if (nodeSha256(rgb) !== doc.baseSha256) throw new Error(`${file}: its RGB base ${baseFile} does not hash to ${doc.baseSha256}`);
  const n = doc.length / 4, out = new Uint8Array(doc.length), { alpha } = doc;
  if (rgb.length !== 3 * n || alpha.length !== n) throw new Error(`${file}: base or alpha size does not match ${doc.length} B`);
  for (let i = 0, j = 0; i < n; i++, j += 3) { const g = 4 * i; out[g] = rgb[j]; out[g + 1] = rgb[j + 1]; out[g + 2] = rgb[j + 2]; out[g + 3] = alpha[i]; }
  return out;
}

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
      if (kind === 'rgba' && bytes.length > 0 && bytes.length % 4 === 0) writeRgbaView(path, bytes, join(dir, 'img'));
      else writeFileSync(path, bytes);
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
      return path ? readArtifactBytes(path) : undefined;
    }
  };
}
