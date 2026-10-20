/**
 * Node writer for a run's renders (node-only; the browser-safe flipbook core, fg/flipbook.mjs, never imports it).
 *
 * Every image a run renders is written ONCE, as a file, and everything else references it (Sam, 2026-10-20: "WHAT IS
 * CREATING AN ENTIRE GIGABYTE????"). Before, one heritage S7 run held each raster Part three times as base64 (in
 * frames.json, in the flipbook's embedded frame stream, in an inline <img>) next to a PNG file of the same render, and
 * every flipbook and SVG embedded the 4.5 MB source image again as a 6 MB data URL (twice in an SVG that set both href
 * and xlink:href).
 *
 *   const images = imageFiles(dir)        content-addressed image files under <dir>/img/: one file per distinct image
 *   images.png(base64 | bytes)            -> 'img/<sha16>.png': the PNG repacked (same pixels, fewer bytes), written once
 *   images.background(bg)                 -> { ...bg, src: 'img/<sha16>.<ext>' }: bg.path is hardlinked (no new bytes),
 *                                            else the bytes of its data: URL are written once
 *   images.alias(rel, name)               <dir>/<name> as a hardlink to an image file: a stable name, no new bytes
 *   externalImages(frames, images)        the frames with every inline raster PNG (data.png) replaced by its file
 *                                         (data.src, data.pngSha256); nothing else in a frame changes
 *   writeFlipbook(dir, base, frames, o)   <dir>/<base>.frames.json and <dir>/<base>.flipbook.html, both referencing img/
 *   repackPng(bytes)                      the same pixels in fewer bytes (fg/png.mjs writes filter 0, often stored)
 *   decodePng(bytes)                      { width, height, channels, pixels }: the identity check for repackPng
 *   inlineFlipbook(html, dir)             one self-contained page again (every img/ reference as a data: URL), made on
 *                                         demand for sharing a single file (`node scripts/pxc.mjs flipbook --inline`)
 *
 * A run directory stays self-contained: it can be moved or zipped together with its img/ folder.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, linkSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { framesJson, renderFlipbook } from './flipbook.mjs';

export const IMAGE_DIR = 'img';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const extOf = (b) => (b[0] === 0x89 && b[1] === 0x50 ? 'png' : b[0] === 0xff && b[1] === 0xd8 ? 'jpg' : 'bin');
const MIME = { png: 'image/png', jpg: 'image/jpeg', bin: 'application/octet-stream' };

/** Hardlink when possible (same filesystem: zero new bytes), else copy. */
function linkOrCopy(from, to) {
  if (existsSync(to)) return;
  mkdirSync(dirname(to), { recursive: true });
  try { linkSync(from, to); } catch { copyFileSync(from, to); }
}

// ------------------------------------------------------------------------------------------------ PNG

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (bytes) => { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); out.write(type, 4, 'latin1'); Buffer.from(data.buffer, data.byteOffset, data.length).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function chunks(bytes) {
  const out = [];
  for (let o = 8; o + 12 <= bytes.length;) { const len = bytes.readUInt32BE(o); out.push({ type: bytes.toString('latin1', o + 4, o + 8), data: bytes.subarray(o + 8, o + 8 + len) }); o += 12 + len; }
  return out;
}
const predictor = (f, a, b, c) => {
  if (f === 1) return a;
  if (f === 2) return b;
  if (f === 3) return (a + b) >> 1;
  if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
  return 0;
};

/**
 * The same pixels in fewer bytes. An 8-bit RGB or RGBA, non-interlaced PNG with no ancillary chunks whose rows are all
 * filter 0 (what fg/png.mjs writes) is re-filtered row by row (the PNG spec's minimum sum of absolute differences) and
 * deflated (zlib level 6: level 9 costs 4x the time for 1 % on a heritage S7 render). Anything else, or a repack that
 * is not smaller, comes back unchanged. Deterministic: the same pixels always give the same bytes, so the same file.
 */
export function repackPng(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(SIG)) return bytes;
  const cs = chunks(bytes), ihdr = cs[0]?.type === 'IHDR' ? cs[0].data : null;
  if (!ihdr || cs.some((c) => !['IHDR', 'IDAT', 'IEND'].includes(c.type))) return bytes;
  const width = ihdr.readUInt32BE(0), height = ihdr.readUInt32BE(4), bpp = ihdr[9] === 2 ? 3 : ihdr[9] === 6 ? 4 : 0;
  if (!bpp || ihdr[8] !== 8 || ihdr[12] !== 0) return bytes;
  let raw;
  try { raw = inflateSync(Buffer.concat(cs.filter((c) => c.type === 'IDAT').map((c) => c.data))); } catch { return bytes; }
  const stride = width * bpp, line = stride + 1;
  if (raw.length !== height * line) return bytes;
  for (let y = 0; y < height; y++) if (raw[y * line] !== 0) return bytes;
  const out = Buffer.alloc(raw.length), zero = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const row = raw.subarray(y * line + 1, (y + 1) * line), up = y ? raw.subarray((y - 1) * line + 1, y * line) : zero;
    let best = 0, bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      let sum = 0;
      for (let i = 0; i < stride && sum < bestSum; i++) {
        const v = (row[i] - predictor(f, i >= bpp ? row[i - bpp] : 0, up[i], i >= bpp ? up[i - bpp] : 0)) & 0xff;
        sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) { bestSum = sum; best = f; }
    }
    const d = out.subarray(y * line, (y + 1) * line);
    d[0] = best;
    for (let i = 0; i < stride; i++) d[1 + i] = (row[i] - predictor(best, i >= bpp ? row[i - bpp] : 0, up[i], i >= bpp ? up[i - bpp] : 0)) & 0xff;
  }
  const packed = Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(out, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
  return packed.length < bytes.length ? packed : bytes;
}

/** The decoded pixels of an 8-bit RGB or RGBA non-interlaced PNG (any filters): the identity check for repackPng. */
export function decodePng(input) {
  const bytes = Buffer.from(input), cs = chunks(bytes), ihdr = cs[0].data;
  const width = ihdr.readUInt32BE(0), height = ihdr.readUInt32BE(4), bpp = ihdr[9] === 2 ? 3 : 4, stride = width * bpp;
  const raw = inflateSync(Buffer.concat(cs.filter((c) => c.type === 'IDAT').map((c) => c.data))), px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = px.subarray(y * stride, (y + 1) * stride), up = y ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) row[i] = (src[i] + predictor(f, i >= bpp ? row[i - bpp] : 0, up ? up[i] : 0, up && i >= bpp ? up[i - bpp] : 0)) & 0xff;
  }
  return { width, height, channels: bpp, pixels: px };
}

// ------------------------------------------------------------------------------------------------ image files

const fromBase64 = (s) => Buffer.from(s, 'base64');
const dataUrlBytes = (src) => { const m = /^data:[^;,]+;base64,(.*)$/s.exec(src ?? ''); return m ? fromBase64(m[1]) : null; };

/** Content-addressed image files under <dir>/img/; every path returned is relative to dir (what the pages reference). */
export function imageFiles(dir) {
  const root = join(dir, IMAGE_DIR), written = new Map();
  const put = (bytes) => {
    const ext = extOf(bytes), name = `${sha(bytes).slice(0, 16)}.${ext}`, rel = `${IMAGE_DIR}/${name}`;
    if (!written.has(rel)) {
      const abs = join(root, name);
      if (!existsSync(abs)) { mkdirSync(root, { recursive: true }); writeFileSync(abs, bytes); }
      written.set(rel, bytes.length);
    }
    return rel;
  };
  return {
    dir, written,
    /** a PNG (base64 or bytes), repacked, written once: its path relative to dir and the sha256 of its file */
    png(input) {
      const bytes = repackPng(typeof input === 'string' ? fromBase64(input) : input);
      return { src: put(bytes), sha256: sha(bytes), bytes: bytes.length };
    },
    /** a flipbook / SVG background: the source image hardlinked from bg.path, else the bytes of its data: URL */
    background(bg) {
      if (!bg) return null;
      const { path, ...rest } = bg;
      if (path && existsSync(path)) {
        const source = readFileSync(path), rel = `${IMAGE_DIR}/${sha(source).slice(0, 16)}.${extOf(source)}`;
        linkOrCopy(path, join(dir, rel)); written.set(rel, 0);
        return { ...rest, src: rel };
      }
      const bytes = dataUrlBytes(rest.src);
      return bytes ? { ...rest, src: put(bytes) } : rest;
    },
    /** <dir>/<name> as a hardlink to an image already written: a stable file name, no new bytes */
    alias(rel, name) { linkOrCopy(join(dir, rel), join(dir, name)); return join(dir, name); }
  };
}

/** The frames with every inline raster PNG written once as a file: data.png -> data.src (+ data.pngSha256). */
export function externalImages(frames, images) {
  return frames.map((f) => ({
    ...f,
    parts: (f.parts ?? []).map((p) => {
      if (p.kind !== 'raster' || typeof p.data?.png !== 'string') return p;
      const { png, ...rest } = p.data, file = images.png(png);
      return { ...p, data: { ...rest, src: file.src, pngSha256: file.sha256 } };
    })
  }));
}

/**
 * A run's flipbook: <dir>/<base>.frames.json (the frame stream, images by reference) and <dir>/<base>.flipbook.html
 * (the same stream once, its images and background as img/ files). Returns the paths and the frames as written.
 */
export function writeFlipbook(dir, base, frames, { background = null, images = imageFiles(dir), ...options } = {}) {
  mkdirSync(dir, { recursive: true });
  const slim = externalImages(frames, images);
  const framesPath = join(dir, `${base}.frames.json`), flipbookPath = join(dir, `${base}.flipbook.html`);
  writeFileSync(framesPath, framesJson(slim) + '\n');
  writeFileSync(flipbookPath, renderFlipbook(slim, { ...options, background: images.background(background) }));
  return { frames: framesPath, flipbook: flipbookPath, written: slim, images };
}

/** One self-contained page: every img/<file> the flipbook references becomes a data: URL (for sharing a single file). */
export function inlineFlipbook(html, dir) {
  const cache = new Map();
  return html.replace(new RegExp(`${IMAGE_DIR}/[0-9a-f]{16}\\.(png|jpg|bin)`, 'g'), (rel, ext) => {
    if (!cache.has(rel)) { const abs = join(dir, rel); cache.set(rel, existsSync(abs) ? `data:${MIME[ext]};base64,${readFileSync(abs).toString('base64')}` : rel); }
    return cache.get(rel);
  });
}
