/**
 * Legacy byte layouts shared by the S1-S3 FunctionalGuarantees (not an FG
 * file: discovery only loads *.fg.mjs; moved here from fg/s1/ when S2 and
 * S3 were ported onto the same mechanism).
 *
 * The FGs were ported out of inline blocks in ports/early/runEarly.mjs, and
 * their artifacts keep the inline layout (pretty JSON in insertion order,
 * the receipt's { id, kind, path, sha256, bytes, dims? } entries) so every
 * reader of artifacts/s1..s3fix/*.json is unchanged. Those bytes were not
 * written with fg/canon.mjs, so the port reproduces the inline helpers here
 * instead of using the fg defaults:
 *
 *   prettyJsonBytes   artifacts are JSON.stringify(value, null, 2) + '\n' in
 *                     insertion order (canonicalJson sorts keys, no indent)
 *   legacyPlain       typed arrays to arrays, KEY ORDER KEPT, undefined to
 *                     null (canon.plain sorts keys)
 *   legacyCanon       the assembly block's own canonical form, whose sha256
 *                     is receipted (witnesses.reexecution.canonicalSha256);
 *                     unlike canonicalJson it serializes a typed array as an
 *                     object with sorted string keys and keeps undefined
 *                     values as null, so it cannot be swapped for canon
 *   legacyArtifact    the receipt's artifact entry { id, kind, path, sha256,
 *                     bytes, dims? }, with dims in the caller's own key order
 *                     (the fg entry carries canonical, key-sorted dims)
 */
import { utf8 } from './canon.mjs';

export const prettyJsonBytes = (value) => utf8(JSON.stringify(value, null, 2) + '\n');

export const legacyPlain = (value) => ArrayBuffer.isView(value) ? [...value]
  : Array.isArray(value) ? value.map(legacyPlain)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, legacyPlain(v)]))
  : value ?? null;

export const legacyCanon = (value) => Array.isArray(value) ? `[${value.map(legacyCanon).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${legacyCanon(value[k])}`).join(',')}}`
  : JSON.stringify(value) ?? 'null';

export const legacyArtifact = (entry, dims) =>
  ({ id: entry.id, kind: entry.kind, path: entry.uri, sha256: entry.sha256, bytes: entry.bytes, ...(dims ? { dims } : {}) });

export const unionOf = (lists) => {
  const set = new Set();
  for (const list of lists) for (const pixel of list) set.add(pixel);
  return set;
};

export const intersectCount = (a, b) => {
  let n = 0;
  for (const pixel of a) if (b.has(pixel)) n++;
  return n;
};

/** The bytes of a typed array (a px list), for fn.tk.sha256. */
export const viewBytes = (typed) => new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);

/** Count pixels whose alpha is zero in an RGBA raster. */
export const zeroAlphaCount = (rgba) => {
  let n = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] === 0) n++;
  return n;
};
