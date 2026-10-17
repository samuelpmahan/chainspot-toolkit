#!/usr/bin/env node
/**
 * Attention packet over a real golden attempt (node-only; reads attempts,
 * writes only to --out).
 *
 *   node fg/attention/run.mjs --base <attempt dir> [--assembly <attempt dir>]
 *        [--stream <stream.M1.json>] [--model M1] [--raster <rgba.bin>]
 *        [--testimony <annotation.json>] --out <dir>
 *        [--perStep 6] [--maxPages 40] [--pad 8] [--maxSide 96] [--minSide 40]
 *
 * --stream reuses a Δ stream from fg/delta/run.mjs (else it is built from
 * the attempts). --raster defaults to <base>/.../artifacts/s1/badgePx.rgba.bin
 * (the S1 subtraction raster: alpha marks badge px, RGB is the canonical
 * picture). --testimony is an annotation in the SOURCE frame; canonical
 * y = source y - crop.upperRowsRemoved from the base receipt. Without it the
 * packet is BLIND (no testimony in ranking or pages).
 *
 * --answers <file> joins a vision agent's answers (see crossverify.mjs) and
 * writes attention-answers.json.
 *
 * Writes: attention.json (manifest), attention.html (fg/flipbook, one page
 * per region), regions/<rank>-<id>/{context,raw,before,after,delta,focus?,exemplar?,strip}.png.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync, crc32 } from 'node:zlib';
import { loadEvidence } from '../delta/evidence.mjs';
import { MODELS } from '../delta/models.mjs';
import { renderFlipbook } from '../flipbook.mjs';
import { analyze, overlaysFor, toPacket, framesFor, contextWindow, exemplarFor, focusOf } from './packet.mjs';
import { drawCrop, hstack } from './render.mjs';
import { crossVerify } from './crossverify.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const early = (d) => join(d, 'fork/stage-output/early');
const num = (k, d) => (args[k] !== undefined ? Number(args[k]) : d);

export function encodePng({ width, height, rgb }) {
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) Buffer.from(rgb.buffer, rgb.byteOffset + y * width * 3, width * 3).copy(raw, y * (1 + width * 3) + 1);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function laneStatusOf(...receipts) {
  const out = {};
  for (const R of receipts) for (const b of Object.values(R?.experiments?.branches ?? {})) if (b.lane) out[b.lane] = { status: b.status ?? null, oracle: b.oracle ?? null };
  return out;
}

export function testimonyPoints(annotation, upperRowsRemoved) {
  const points = [];
  for (const h of annotation.holes ?? []) {
    if (h.tee) points.push({ kind: 'tee', id: `hole${h.number}.tee`, x: h.tee.xPx, y: h.tee.yPx - upperRowsRemoved });
    if (h.basket) points.push({ kind: 'basket', id: `hole${h.number}.basket`, x: h.basket.xPx, y: h.basket.yPx - upperRowsRemoved });
  }
  return { points, frame: 'canonical', upperRowsRemoved };
}

async function main() {
  const out = args.out;
  if (!out || !args.base) throw new Error('usage: --base <attempt> [--assembly <attempt>] [--stream f] [--testimony f] --out <dir>');
  mkdirSync(out, { recursive: true });
  const baseDir = early(args.base);
  const R = JSON.parse(readFileSync(join(baseDir, 'run.receipt.json'), 'utf8'));
  const RA = args.assembly ? JSON.parse(readFileSync(join(early(args.assembly), 'run.receipt.json'), 'utf8')) : null;
  const model = MODELS.find((m) => m.id === (args.model ?? 'M1'));
  const t0 = Date.now();
  const stream = args.stream ? JSON.parse(readFileSync(args.stream, 'utf8')) : model.build(loadEvidence({ baseDir, assemblyDir: args.assembly ? early(args.assembly) : null }));
  const rasterPath = args.raster ?? join(baseDir, 'artifacts/s1/badgePx.rgba.bin');
  const rgba = readFileSync(rasterPath);
  const raster = { width: stream.frame.width, height: stream.frame.height, rgba };
  if (rgba.length !== raster.width * raster.height * 4) throw new Error(`raster ${rasterPath}: ${rgba.length} B, expected ${raster.width * raster.height * 4}`);
  const testimony = args.testimony ? testimonyPoints(JSON.parse(readFileSync(args.testimony, 'utf8')), R.crop.upperRowsRemoved) : null;

  const A = analyze(model, stream, { laneStatus: laneStatusOf(R, RA), testimony, perStep: num('perStep', 6), maxPages: num('maxPages', 40), pad: num('pad', 8), maxSide: num('maxSide', 96), minSide: num('minSide', 40) });
  const packet = toPacket(A, {
    model: model.id, base: args.base, assembly: args.assembly ?? null, stream: args.stream ?? null, raster: rasterPath,
    testimony: args.testimony ? { path: args.testimony, frame: 'source; canonical y = source y - ' + R.crop.upperRowsRemoved, use: 'ranking + comparison column only' } : null,
    frame: stream.frame, scale: 3
  });

  const regionsDir = join(out, 'regions');
  if (existsSync(regionsDir)) rmSync(regionsDir, { recursive: true });
  const images = {};
  for (const r of A.regions.filter((x) => x.page)) {
    const ov = overlaysFor(r, A.fold, stream.frame);
    const cw = contextWindow(r.window, stream.frame);
    const ex = exemplarFor(r.subject, A.fold.scene, stream.frame);
    const fo = focusOf(r, A.fold, stream.frame);
    const panels = {
      context: drawCrop(raster, cw, [{ kind: 'box', bbox: r.window, color: [255, 220, 0] }], { scale: 1 }),
      raw: drawCrop(raster, r.window, []), before: drawCrop(raster, r.window, ov.before), after: drawCrop(raster, r.window, ov.after), delta: drawCrop(raster, r.window, ov.delta),
      ...(fo ? { focus: drawCrop(raster, fo.window, ov.delta.map((o) => (o.kind === 'px' ? { ...o, alpha: Math.min(o.alpha, 0.35), edge: true } : o)), { scale: fo.scale }) } : {}),
      ...(ex ? { exemplar: drawCrop(raster, ex.window, []) } : {})
    };
    const dir = join(regionsDir, `${String(r.rank).padStart(3, '0')}-${r.id.replace(/[@,]/g, '_')}`);
    mkdirSync(dir, { recursive: true });
    const files = {};
    for (const [name, im] of Object.entries(panels)) { writeFileSync(join(dir, `${name}.png`), encodePng(im)); files[name] = join(dir, `${name}.png`); }
    const pr = packet.regions.find((x) => x.id === r.id);
    pr.context = cw;
    if (ex) pr.exemplar = ex;
    if (fo) pr.focus = fo;
    const s = hstack(Object.values(panels));
    const png = encodePng(s);
    writeFileSync(join(dir, 'strip.png'), png);
    files.strip = join(dir, 'strip.png');
    images[r.id] = { width: s.width, height: s.height, png: png.toString('base64') };
    pr.images = files;
  }
  writeFileSync(join(out, 'attention.json'), JSON.stringify(packet, null, 1));
  if (args.answers) {
    const answers = JSON.parse(readFileSync(args.answers, 'utf8'));
    const cv = crossVerify(packet, answers);
    writeFileSync(join(out, 'attention-answers.json'), JSON.stringify({ answeredBy: answers.answeredBy ?? null, answersFrom: args.answers, packet: join(out, 'attention.json'), ...cv }, null, 1));
    console.log('cross-verify', JSON.stringify(cv.summary));
  }
  writeFileSync(join(out, 'attention.html'), renderFlipbook(framesFor(packet, images), { title: `Attention: ${packet.stats.pages} regions where the Δ changed something${testimony ? ' (testimony in ranking)' : ' (blind)'}` }));
  console.log(JSON.stringify({ ...packet.stats, ms: Date.now() - t0, out }, null, 0));
  for (const r of packet.regions.slice(0, num('show', 12))) console.log(`#${r.rank} ${r.score} ${r.id} ${r.subject} | ${r.what.slice(0, 2).join(' | ')} | Q: ${r.question?.kind}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
