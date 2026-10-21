#!/usr/bin/env node
/**
 * The UDisc header glyph templates (fg/header/udisc-header-templates.json), made from the TRAINING headers through the same
 * path the reader takes (fn.q.header.band -> glyphs -> vectors on a PxC store), and the read thresholds calibrated on them.
 *
 *   node scripts/header-templates.mjs [--check]     (--check: rebuild in memory and compare with the committed asset)
 *
 * Training (non-validation only; labels read by eye by the lead, verified by eye on the band crops):
 *   HeritagePark-full, Lenard-full and Lenard-1..5, NorthPark-full, TowneLake-full, TheRec-L/-R, therecThrown, dashs5612,
 *   dashs5613 (= the Dash round overview), dashs-udisc-capture-3/-4. Every digit except 0 appears; 0 has no template, so a 0
 *   must come out unread. Two layouts (spaced bullets; the tighter one on newer screenshots), one glyph size (capH 50 px).
 * The band search covers the top half of each training image (the reader searches S0's removed rows; S0 is not run here).
 *
 * Template of a class = the mean of its instances' template-frame vectors (the reader's own sampling), so a template and a read
 * differ only by the glyph. fn.q.sprite.overlap was considered for sharpening from repeats: the training glyphs are
 * pixel-identical renders (leave-one-image-out NCC 1.000 for every instance), so there is nothing to sharpen at this size, and
 * the earlier badge measurement (docs/evidence/badge-calibration/overlap-templates.json) found super-resolved templates read
 * worse through a reader's own sampling. Not applied.
 *
 * Calibration (all on training):
 *   impostor   leave-one-CLASS-out: each instance scored against every template but its own class's; the highest score is
 *              what a glyph with no template (a 0) can reach.
 *   scaled     every training header resampled (area) to 0.64, 0.75, 0.86, 0.914, 0.963 and 1.1 x (other phones, other glyph
 *              sizes), read against the templates: the lowest own-class score and the lowest margin.
 *   scoreMin  = midpoint of the impostor max and the scaled own-class min; marginMin = half the scaled margin min.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { createPartStore, registerQueries } from '../fg/store.mjs';
import { registerHeaderQueries, ncc, FRAME, GAP_SPLIT, BAND } from '../fg/queries/header.mjs';
import { rasterOfPng } from '../fg/header/raster.mjs';

const ROOT = resolve(import.meta.dirname, '..');
export const TEMPLATE_ASSET = 'fg/header/udisc-header-templates.json';
const HERITAGE = '18 Holes • Par 58 • 5511 ft', LENARD = '18 Holes • Par 54 • 5493 ft', THEREC = '9 Holes • Par 27 • 2175 ft', DASHS = '18 Holes • Par 54 • 3612 ft';
export const TRAINING = Object.freeze([
  ['specimens/dev/HeritagePark-full.png', HERITAGE],
  ['specimens/dev/Lenard-full.png', LENARD], ...[1, 2, 3, 4, 5].map((i) => [`specimens/dev/Lenard-${i}.png`, LENARD]),
  ['specimens/dev/NorthPark-full.png', '18 Holes • Par 55 • 5891 ft'],
  ['specimens/dev/TowneLake-full.png', '18 Holes • Par 57 • 5881 ft'],
  ['specimens/captures/therec/TheRec-L.png', THEREC], ['specimens/captures/therec/TheRec-R.png', THEREC], ['specimens/wide/therecThrown.png', THEREC],
  ['specimens/wide/dashs5612.png', DASHS], ['specimens/wide/dashs5613.png', DASHS],
  ['specimens/demo/dashs-udisc-capture-3.png', DASHS], ['specimens/demo/dashs-udisc-capture-4.png', DASHS]
]);
const SCALES = Object.freeze([0.64, 0.75, 0.86, 0.914, 0.963, 1.1]);
const SCALED_FROM = Object.freeze(['specimens/dev/HeritagePark-full.png', 'specimens/dev/Lenard-full.png', 'specimens/dev/NorthPark-full.png', 'specimens/captures/therec/TheRec-L.png', 'specimens/wide/dashs5612.png']);
const r4 = (v) => Math.round(v * 1e4) / 1e4, r3 = (v) => Math.round(v * 1e3) / 1e3;

/** Area-weighted resample of the top `rows` rows of a raster by factor s (pure; a stand-in for another phone's render). */
export function resampleTop({ widthPx: W, heightPx: H, rgba }, rows, s) {
  const w = Math.round(W * s), h = Math.round(Math.min(rows, H) * s), out = new Uint8Array(w * h * 4);
  const spans = (n, N) => Array.from({ length: n }, (_, o) => { const a = o / s, b = Math.min(N, (o + 1) / s), r = []; for (let i = Math.floor(a); i < Math.ceil(b); i++) r.push([i, Math.min(b, i + 1) - Math.max(a, i)]); return r; });
  const xs = spans(w, W), ys = spans(h, Math.min(rows, H));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const acc = [0, 0, 0, 0]; let tot = 0;
    for (const [yy, wy] of ys[y]) for (const [xx, wx] of xs[x]) { const p = (yy * W + xx) * 4, k = wx * wy; tot += k; for (let c = 0; c < 4; c++) acc[c] += rgba[p + c] * k; }
    for (let c = 0; c < 4; c++) out[(y * w + x) * 4 + c] = Math.round(acc[c] / tot);
  }
  return { widthPx: w, heightPx: h, rgba: out };
}

/** The template-frame vectors of one raster's header through the store's queries, or why there are none. */
function headerVectors(store, address, rows) {
  const band = store.call('fn.q.header.band', { image: address, rows }).value;
  if (!band.found) return { condition: band.condition };
  const glyphs = store.call('fn.q.header.glyphs', { image: address, band }).value;
  return { band, glyphs, vectors: store.call('fn.q.header.vectors', { image: address, band }).value };
}

export function buildTemplates(root = ROOT) {
  const store = createPartStore({ name: 'header-templates' });
  registerHeaderQueries(store, registerQueries);
  const rasters = new Map(), training = [], instances = [];
  for (const [path, label] of TRAINING) {
    const bytes = readFileSync(join(root, path)), raster = rasterOfPng(bytes), address = `train.${path}`;
    rasters.set(path, raster);
    store.constant(`fn.train.${path}`, { [address]: raster });
    const chars = [...label.replace(/ /g, '')], r = headerVectors(store, address, raster.heightPx >> 1);
    const row = { path, sha256: createHash('sha256').update(bytes).digest('hex'), label, glyphs: r.glyphs?.glyphs.length ?? 0, capHPx: r.glyphs?.line.capHPx ?? null,
      tokens: r.glyphs ? r.glyphs.tokens.map((t) => t.glyphs.length).join(',') : null, used: false, condition: r.condition ?? null };
    const wantTokens = label.split(' ').map((w) => [...w].length).join(',');
    if (r.vectors && chars.length === r.vectors.length && row.tokens === wantTokens) {
      row.used = true;
      r.vectors.forEach((v, k) => instances.push({ path, ch: chars[k], v }));
    } else row.condition ??= `segmentation does not match the label: ${row.glyphs} glyphs in tokens ${row.tokens}, expected ${chars.length} in ${wantTokens}`;
    training.push(row);
  }
  const classes = [...new Set(instances.map((i) => i.ch))].sort();
  const meanOf = (members) => { const v = new Float64Array(members[0].v.length); for (const m of members) for (let k = 0; k < v.length; k++) v[k] += m.v[k] / members.length; return v; };
  const templates = Object.fromEntries(classes.map((c) => [c, meanOf(instances.filter((i) => i.ch === c))]));
  // leave-one-image-out own score; leave-one-class-out impostor
  let looOwnMin = 1, looMarginMin = 1, impostorMax = -1, impostorAt = null;
  for (const path of new Set(instances.map((i) => i.path))) {
    const t = Object.fromEntries(classes.map((c) => { const m = instances.filter((i) => i.ch === c && i.path !== path); return [c, m.length ? meanOf(m) : null]; }));
    for (const i of instances.filter((x) => x.path === path)) {
      if (!t[i.ch]) continue;
      const own = ncc(i.v, t[i.ch]), other = Math.max(...classes.filter((c) => c !== i.ch && t[c]).map((c) => ncc(i.v, t[c])));
      looOwnMin = Math.min(looOwnMin, own); looMarginMin = Math.min(looMarginMin, own - other);
    }
  }
  for (const i of instances) for (const c of classes) if (c !== i.ch) { const s = ncc(i.v, templates[c]); if (s > impostorMax) { impostorMax = s; impostorAt = `${i.ch} scored as ${c} (${i.path})`; } }
  // scaled renders
  let scaledOwnMin = 1, scaledMarginMin = 1, scaledWrong = 0, scaledGlyphs = 0; const scaled = [];
  for (const path of SCALED_FROM) {
    const label = TRAINING.find(([p]) => p === path)[1], chars = [...label.replace(/ /g, '')], src = rasters.get(path);
    for (const s of SCALES) {
      const address = `scaled.${path}@${s}`, raster = resampleTop(src, src.heightPx >> 1, s);
      store.constant(`fn.${address}`, { [address]: raster });
      const r = headerVectors(store, address, raster.heightPx);
      if (!r.vectors || r.vectors.length !== chars.length) { scaled.push({ path, scale: s, condition: r.condition ?? `${r.vectors?.length} glyphs, expected ${chars.length}` }); continue; }
      let own = 1, margin = 1, wrong = 0;
      r.vectors.forEach((v, k) => {
        const sc = classes.map((c) => [c, ncc(v, templates[c])]).sort((a, b) => b[1] - a[1]), o = sc.find((x) => x[0] === chars[k])[1], other = sc.find((x) => x[0] !== chars[k])[1];
        own = Math.min(own, o); margin = Math.min(margin, o - other); if (sc[0][0] !== chars[k]) wrong++;
      });
      scaledOwnMin = Math.min(scaledOwnMin, own); scaledMarginMin = Math.min(scaledMarginMin, margin); scaledWrong += wrong; scaledGlyphs += chars.length;
      scaled.push({ path, scale: s, capHPx: r.glyphs.line.capHPx, ownMin: r3(own), marginMin: r3(margin), wrong });
    }
  }
  const scoreMin = r3((impostorMax + scaledOwnMin) / 2), marginMin = r3(scaledMarginMin / 2);
  return {
    schema: 'nctk-udisc-header-templates@1', builtBy: 'scripts/header-templates.mjs', frame: FRAME, gapSplitCapH: GAP_SPLIT, band: BAND,
    read: { scoreMin, marginMin, rule: 'read when NCC to the best class >= scoreMin and its margin over the best other class >= marginMin; else unread (?)' },
    calibration: {
      unit: 'NCC -1..1; margin = own-class NCC - best other-class NCC',
      looOwnMin: r4(looOwnMin), looMarginMin: r4(looMarginMin), impostorMax: r4(impostorMax), impostorAt,
      scaledOwnMin: r4(scaledOwnMin), scaledMarginMin: r4(scaledMarginMin), scaledWrong, scaledGlyphs, scales: SCALES, scaled,
      sharpening: 'fn.q.sprite.overlap not applied: the training glyphs are pixel-identical renders (looOwnMin above), nothing to sharpen at this size'
    },
    training,
    classes: Object.fromEntries(classes.map((c) => [c, { members: instances.filter((i) => i.ch === c).length, vector: [...templates[c]].map(r4) }]))
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const asset = buildTemplates();
  const text = JSON.stringify(asset, (k, v) => (k === 'vector' ? `@@${JSON.stringify(v)}@@` : v), 1).replace(/"@@(.*?)@@"/g, '$1') + '\n';
  if (process.argv.includes('--check')) {
    const same = readFileSync(join(ROOT, TEMPLATE_ASSET), 'utf8') === text;
    console.log(same ? `${TEMPLATE_ASSET} is current` : `${TEMPLATE_ASSET} differs from a rebuild`); process.exit(same ? 0 : 1);
  }
  writeFileSync(join(ROOT, TEMPLATE_ASSET), text);
  const c = asset.calibration;
  console.log(JSON.stringify({ wrote: TEMPLATE_ASSET, classes: Object.keys(asset.classes).join(''), members: Object.values(asset.classes).reduce((s, x) => s + x.members, 0), read: asset.read,
    looOwnMin: c.looOwnMin, impostorMax: c.impostorMax, impostorAt: c.impostorAt, scaledOwnMin: c.scaledOwnMin, scaledMarginMin: c.scaledMarginMin, scaledWrong: c.scaledWrong,
    training: asset.training.map((t) => `${t.path.split('/').pop()}: ${t.used ? 'used' : t.condition}`) }, null, 1));
}
