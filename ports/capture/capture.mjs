/**
 * S0 takes a capture (node-only runner side of fg/stitch/capture.calc.mjs). A capture is 1..N screenshot tiles of ONE course,
 * declared by a manifest `specimens/captures/<name>.capture.json`:
 *   { "format": "chainspot.capture", "version": 1, "course": "...", "tiles": [{ "path": "specimens/...png", "sha256": "..." }] }
 * A plain image path is a capture of one tile and is not touched: nothing here runs, S0 decodes the file as before (a single
 * tile is a no-op). For N >= 2 the capture store (createPartStore, profiled into the run's instrumentation) produces:
 *   tk.source.captureManifest   fn.tk.source.captureManifest   the manifest; every tile's bytes checked against its sha256
 *   tk.source.captureTiles      fn.tk.source.captureTiles      per tile: the pinned S0 gateway (decode + chrome crop) and S1
 *                                                              gateway (badges), read as { name, crop, gray, badges } (source px)
 *   tk.source.capture           fn.tk.source.stitch            the placement record (fg/stitch/capture.calc.mjs)
 *   tk.source.courseRaster      fn.tk.source.stitch            the course raster (RGBA) and its owner plane
 *   tk.source.header            fn.tk.source.captureHeader     every tile's UDisc header bar read, and whether the tiles agree
 *   tk.source.coursePng         fn.tk.source.coursePng         the course raster's PNG bytes (RGBA, zlib stored), the bytes every
 *                                                              legacy reader of the run's source file decodes
 * runCapture writes course.png and capture.json beside the run's early outputs and returns the decode S0 uses (the course
 * raster from memory, identical to decoding course.png) and the course path the rest of the run reads.
 */
import { createHash } from 'node:crypto';
import { crc32, deflateSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { createPartStore, registerQueries } from '../../fg/store.mjs';
import { STITCH_QUERIES, lumaOf } from '../../fg/queries/stitch.mjs';
import { STITCH_CALCULATION } from '../../fg/stitch/capture.calc.mjs';
import { registerHeaderQueries } from '../../fg/queries/header.mjs';
import { CAPTURE_HEADER_CALCULATION, HEADER_TEMPLATES } from '../../fg/header/header.calc.mjs';
import { badgePointsOf } from '../identity/identitySpace.mjs';

export const CAPTURE_FORMAT = 'chainspot.capture';
export const COURSE_RASTER = 'early/capture/course.png';   // relative to a run's stage-output: the course raster's bytes
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const isCaptureManifest = (path) => /\.capture\.json$/i.test(String(path));

/** The file a run's source reads as: the course raster for a capture (written by runCapture), else the source itself. */
export const courseSourceOf = (fork, sourcePath) => (isCaptureManifest(sourcePath) ? join(fork, 'stage-output', COURSE_RASTER) : join(fork, sourcePath));

export function readManifest(root, manifestPath) {
  const m = JSON.parse(readFileSync(resolve(root, manifestPath), 'utf8'));
  if (m.format !== CAPTURE_FORMAT || m.version !== 1 || !Array.isArray(m.tiles) || !m.tiles.length) throw new Error(`${manifestPath}: not a ${CAPTURE_FORMAT} v1 manifest with tiles`);
  return m;
}

/** RGBA PNG (colour type 6, 8 bit, filter 0 per row, zlib level 0: stored, fast): deterministic for the same pixels and zlib. */
export function encodePngRgba({ widthPx, heightPx, rgba }) {
  const raw = Buffer.alloc((widthPx * 4 + 1) * heightPx);
  for (let y = 0; y < heightPx; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * widthPx * 4, widthPx * 4).copy(raw, y * (widthPx * 4 + 1) + 1);
  const crc = (buf) => crc32(buf);
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(widthPx, 0); ihdr.writeUInt32BE(heightPx, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 0 })), chunk('IEND', Buffer.alloc(0))]);
}

/** One tile through the pinned S0 (crop) and S1 (badges) gateways: what the capture is placed from. */
async function readTile({ root, tile, dist, decodeNodeFile }) {
  const path = resolve(root, tile.path), s0 = await dist('stages/S0/contract').stageContract.execute({ source: path, inputLabel: basename(path), decode: decodeNodeFile });
  const s1 = await dist('stages/S1/contract').stageContract.execute({ source: path, inputLabel: basename(path), decode: decodeNodeFile, pxc: s0.pxc });
  const full = s1.pxc.get('px.source.fullImage'), canonical = s1.pxc.get('px.course.canonicalPixels'), badges = s1.pxc.get('px.badges');
  const upper = Number(/rowsRemoved: upper=(\d+)/.exec(s0.receiptText)?.[1] ?? 0);
  const crop = { xPx: 0, yPx: upper, widthPx: canonical.widthPx, heightPx: canonical.heightPx };
  const points = badgePointsOf(badges), widths = badges.map((b) => b.bbox[2]).sort((a, b) => a - b);
  return { name: basename(tile.path), path: tile.path, sha256: tile.sha256, widthPx: full.widthPx, heightPx: full.heightPx, rgba: full.rgba, crop, gray: lumaOf(full, crop),
    badges: points.badges.map((b) => ({ holeNumber: b.holeNumber, xPx: b.xPx, yPx: b.yPx + upper })), badgesLeftOut: points.leftOut, badgeWidthPx: widths.length ? widths[widths.length >> 1] : null };
}

export function createCaptureStore({ root, manifestPath, dist, decodeNodeFile, onCall = null }) {
  const store = createPartStore({ name: 'capture', onCall });
  registerQueries(store, STITCH_QUERIES);
  store.register('fn.tk.source.captureManifest', { outParts: ['tk.source.captureManifest'], note: 'the capture manifest; each tile\'s bytes checked against its sha256 (integrity: a mismatch stops the run)',
    calculate: () => {
      const m = readManifest(root, manifestPath);
      for (const t of m.tiles) { const got = sha256(readFileSync(resolve(root, t.path))); if (t.sha256 && got !== t.sha256) throw new Error(`capture tile ${t.path}: sha256 ${got} differs from the manifest's ${t.sha256}`); }
      return { 'tk.source.captureManifest': { path: manifestPath, ...m } };
    } });
  store.register('fn.tk.source.captureTiles', { inParts: ['tk.source.captureManifest'], outParts: ['tk.source.captureTiles'], note: 'per tile: the pinned S0 crop and S1 badges (source px)',
    calculate: async (io) => {
      const tiles = [];
      for (const tile of io.in('tk.source.captureManifest').tiles) tiles.push(await readTile({ root, tile, dist, decodeNodeFile }));
      return { 'tk.source.captureTiles': tiles };
    } });
  store.register(...STITCH_CALCULATION);
  // every tile's UDisc header (the rows each tile's S0 crop removed) and whether the tiles agree (fg/header/header.calc.mjs)
  registerHeaderQueries(store, registerQueries, { templates: HEADER_TEMPLATES });
  store.register(...CAPTURE_HEADER_CALCULATION);
  store.register('fn.tk.source.coursePng', { inParts: ['tk.source.courseRaster'], outParts: ['tk.source.coursePng'], note: 'the course raster as PNG bytes (RGBA; zlib stored)',
    calculate: (io) => { const bytes = encodePngRgba(io.in('tk.source.courseRaster')); return { 'tk.source.coursePng': { bytes, sha256: sha256(bytes), emits: { pngBytes: bytes.length } } }; } });
  return store;
}

/**
 * Run a capture: tiles -> course raster. Returns { store, capture, courseRaster, coursePath, decode, header }. `decode` is S0's decode:
 * the course raster from memory for coursePath (the same InputAsset decodeNodeFile gives for those bytes), any other path as before.
 */
export async function runCapture({ root, manifestPath, outDir, dist, decodeNodeFile, onCall = null }) {
  const store = createCaptureStore({ root, manifestPath, dist, decodeNodeFile, onCall });
  await store.call('fn.tk.source.captureTiles');
  const capture = store.get('tk.source.capture'), courseRaster = store.get('tk.source.courseRaster'), png = store.get('tk.source.coursePng'), header = store.get('tk.source.header');
  mkdirSync(outDir, { recursive: true });
  const coursePath = join(outDir, 'course.png');
  writeFileSync(coursePath, png.bytes);
  writeFileSync(join(outDir, 'capture.json'), JSON.stringify({ ...capture, emits: undefined, course: { path: coursePath, sha256: png.sha256, widthPx: courseRaster.widthPx, heightPx: courseRaster.heightPx } }, null, 2) + '\n');
  const asset = { imageId: png.sha256, widthPx: courseRaster.widthPx, heightPx: courseRaster.heightPx, rgba: courseRaster.rgba, sourceByteLength: png.bytes.length };
  const decode = async (path) => (resolve(path) === resolve(coursePath) ? asset : decodeNodeFile(path));
  return { store, capture, courseRaster, coursePath, decode, header };
}
