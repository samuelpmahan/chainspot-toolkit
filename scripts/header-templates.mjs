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
 * Learned confidence (Sam: no silent abstention, no borrowed thresholds; as scripts/badge-calibration.mjs):
 *   examples   leave one image out: every glyph of a training header, and of its renders resampled (area) to 0.64, 0.75,
 *              0.86, 0.914, 0.963, 1.04 and 1.1 x (other phones' glyph sizes), scored against templates made from the OTHER
 *              images; its top read (right or wrong) and one hard negative (its best class once its own is removed: what a
 *              glyph whose class has no template looks like). Features [NCC score, margin over the best other class].
 *   model      logistic regression P(read right | features); prior odds 9:1 that a glyph has a template (9 of the 10 digit
 *              classes; see PRIOR_ODDS), not the training reads' 1010:0, which no glyph without a template could challenge.
 *   decision   every glyph keeps its best read and P: P >= pStar (1 - 1 / costWrong, costWrong 100 as for the badges)
 *              read; 0.5 <= P < pStar read and flagged; P < 0.5 out of vocabulary (?), best read kept beside it.
 *   heldOut    per training image, its examples under the model fitted without it.
 * The status-bar clock (10:16, 10:26, 10:36 on dev and demo shots) was tested as a source of a 0 (fn.q.header.* on its
 * row, capH-normalised): its 1 2 3 6 read as themselves at NCC 0.93-0.95 against the header's templates, below the
 * header's own renders at other sizes (>= 0.98), and with 0.80-0.86 x the header's ink per capH^2 (a lighter weight).
 * Not the same weight: its 0 is not borrowed, so a header 0 stays out of vocabulary.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { createPartStore, registerQueries } from '../fg/store.mjs';
import { registerHeaderQueries, ncc, FRAME, GAP_SPLIT, BAND, glyphFeatures, glyphProbability, GLYPH_FEATURES } from '../fg/queries/header.mjs';
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
const SCALES = Object.freeze([0.64, 0.75, 0.86, 0.914, 0.963, 1.04, 1.1]);
export const COST_WRONG = 100;   // flags one wrong header number is worth (stated, as for the badge readers; not fitted)
export const P_STAR = 1 - 1 / COST_WRONG;   // 0.99
export const OOV_BELOW = 0.5;   // below it a read is likelier a hard negative (no template for its class) than right
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
  // scaled renders of five training headers (another phone's glyph size): more examples, from the same source images
  const scaled = [];
  for (const path of SCALED_FROM) {
    const label = TRAINING.find(([p]) => p === path)[1], chars = [...label.replace(/ /g, '')], src = rasters.get(path);
    for (const s of SCALES) {
      const address = `scaled.${path}@${s}`, raster = resampleTop(src, src.heightPx >> 1, s);
      store.constant(`fn.${address}`, { [address]: raster });
      const r = headerVectors(store, address, raster.heightPx);
      if (!r.vectors || r.vectors.length !== chars.length) { scaled.push({ path, scale: s, condition: r.condition ?? `${r.vectors?.length} glyphs, expected ${chars.length}` }); continue; }
      r.vectors.forEach((v, k) => instances.push({ path, scale: s, ch: chars[k], v }));
      scaled.push({ path, scale: s, capHPx: r.glyphs.line.capHPx, glyphs: chars.length });
    }
  }
  // examples, leave one image out: every glyph of image X (and of X's scaled renders) scored against templates made from the
  // OTHER images' original headers; its top read (right or wrong) and a hard negative (the best class once its own is removed:
  // what a glyph with no template looks like)
  const sources = [...new Set(instances.map((i) => i.path))], examples = [];
  for (const path of sources) {
    const own = instances.filter((i) => i.path === path), rest = instances.filter((i) => i.path !== path && i.scale == null);
    const t = Object.fromEntries(classes.map((c) => { const m = rest.filter((i) => i.ch === c); return [c, m.length ? meanOf(m) : null]; }).filter(([, v]) => v));
    for (const i of own) {
      if (!t[i.ch]) continue;
      const scores = Object.fromEntries(Object.entries(t).map(([c, v]) => [c, ncc(i.v, v)])), labels = Object.keys(scores);
      const top = labels.reduce((a, c) => (scores[c] > scores[a] ? c : a));
      examples.push({ path, scale: i.scale ?? 1, ch: i.ch, kind: 'top', read: top, y: top === i.ch ? 1 : 0, x: glyphFeatures(scores, top, labels) });
      const others = labels.filter((c) => c !== i.ch), hn = others.reduce((a, c) => (scores[c] > scores[a] ? c : a));
      examples.push({ path, scale: i.scale ?? 1, ch: i.ch, kind: 'hardNegative', read: hn, y: 0, x: glyphFeatures(scores, hn, others) });
    }
  }
  const model = fitCalibrated(examples);
  // honest numbers: each image's examples under the model fitted without that image
  const heldOut = sources.map((path) => {
    const m = fitCalibrated(examples.filter((e) => e.path !== path)), mine = examples.filter((e) => e.path === path);
    const P = (e) => glyphProbability(m, e.x), right = mine.filter((e) => e.kind === 'top' && e.y), neg = mine.filter((e) => !e.y);
    return { path, rightTops: right.length, wrongTops: mine.filter((e) => e.kind === 'top' && !e.y).length, minRightTopP: r4(Math.min(...right.map(P))), maxNegativeP: r4(Math.max(...neg.map(P))),
      rightFlagged: right.filter((e) => P(e) < P_STAR).length, negativesRead: neg.filter((e) => P(e) >= OOV_BELOW).length,
      negativesReadAs: [...new Set(neg.filter((e) => P(e) >= OOV_BELOW).map((e) => `${e.ch} as ${e.read}`))].sort() };
  });
  const range = (v) => [r4(Math.min(...v)), r4(Math.max(...v))];
  return {
    schema: 'nctk-udisc-header-templates@2', builtBy: 'scripts/header-templates.mjs', frame: FRAME, gapSplitCapH: GAP_SPLIT, band: BAND,
    read: { model: { features: GLYPH_FEATURES, weights: model.weights.map(r4), bias: r4(model.bias), priorShift: r4(model.priorShift) }, costWrong: COST_WRONG, pStar: P_STAR, oovBelow: OOV_BELOW,
      rule: 'every glyph is read as its best class, with P(right | NCC score, margin over the best other class) = sigmoid(bias + priorShift + weights . features). P >= pStar: read; oovBelow <= P < pStar: read and flagged (low confidence); P < oovBelow: the read looks like a hard negative (the best template of a glyph whose class has none), so the glyph is out of vocabulary (?), its best read kept beside it. pStar = 1 - 1 / costWrong (a wrong header number costs costWrong flags, the badge calibration\'s stated cost); oovBelow = 0.5, the decision boundary between a right read and a hard negative.' },
    calibration: {
      unit: 'score: NCC -1..1; margin = score - the best other class NCC; P: probability 0..1',
      examples: { top: examples.filter((e) => e.kind === 'top').length, hardNegative: examples.filter((e) => e.kind === 'hardNegative').length, wrongTops: examples.filter((e) => e.kind === 'top' && !e.y).length },
      rightTopScore: range(examples.filter((e) => e.kind === 'top' && e.y).map((e) => e.x[0])), hardNegativeScore: range(examples.filter((e) => !e.y).map((e) => e.x[0])),
      hardNegativeMax: (() => { const e = examples.filter((x) => !x.y).reduce((a, b) => (b.x[0] > a.x[0] ? b : a)); return `${e.ch} as ${e.read} at ${r4(e.x[0])} (${e.path}${e.scale !== 1 ? ` x${e.scale}` : ''})`; })(),
      heldOut, scales: SCALES, scaled,
      sharpening: 'fn.q.sprite.overlap not applied: the training glyphs are pixel-identical renders (leave-one-image-out NCC 1.000), nothing to sharpen at this size'
    },
    training,
    classes: Object.fromEntries(classes.map((c) => [c, { members: instances.filter((i) => i.ch === c && i.scale == null).length, vector: [...templates[c]].map(r4) }]))
  };
}

// ---- logistic regression (as scripts/badge-calibration.mjs: standardized features, L2 1e-3, gradient descent) ----------
const sigmoid = (z) => 1 / (1 + Math.exp(-z));
function fit(X, y) {
  const d = X[0].length, mu = Array(d).fill(0), sd = Array(d).fill(0);
  for (const x of X) x.forEach((v, j) => { mu[j] += v / X.length; });
  for (const x of X) x.forEach((v, j) => { sd[j] += (v - mu[j]) ** 2 / X.length; });
  for (let j = 0; j < d; j++) sd[j] = Math.sqrt(sd[j]) || 1;
  const Z = X.map((x) => x.map((v, j) => (v - mu[j]) / sd[j]));
  let w = Array(d).fill(0), b = 0;
  const lambda = 1e-3, lr = 0.5;
  for (let it = 0; it < 4000; it++) {
    const gw = Array(d).fill(0); let gb = 0;
    Z.forEach((z, i) => { const e = sigmoid(b + z.reduce((a, v, j) => a + v * w[j], 0)) - y[i]; gb += e / Z.length; z.forEach((v, j) => { gw[j] += (e * v) / Z.length; }); });
    w = w.map((wj, j) => wj - lr * (gw[j] + lambda * wj)); b -= lr * gb;
  }
  return { weights: w.map((wj, j) => wj / sd[j]), bias: b - w.reduce((a, wj, j) => a + (wj * mu[j]) / sd[j], 0) };
}
/**
 * One hard negative per glyph makes the training odds ~1:1. The badge calibration moves them to the odds of a top read being
 * right on its training reads; here that would be 1010:0, because every training glyph has its template by construction, and a
 * header that holds a 0 would be read with false confidence. The prior is stated instead: of the ten digit classes a header
 * number draws on, nine have templates, so a digit glyph has a template at odds 9:1 (PRIOR_ODDS); letters and the bullet are a
 * fixed vocabulary and fit the same prior conservatively.
 */
export const PRIOR_ODDS = 9;
function fitCalibrated(ex) {
  const m = fit(ex.map((e) => e.x), ex.map((e) => e.y));
  const n1 = ex.filter((e) => e.y === 1).length, n0 = ex.length - n1;
  return { ...m, priorShift: Math.log(PRIOR_ODDS) - Math.log(n1 / n0) };
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
  console.log(JSON.stringify({ wrote: TEMPLATE_ASSET, classes: Object.keys(asset.classes).join(''), members: Object.values(asset.classes).reduce((s, x) => s + x.members, 0), model: asset.read.model, pStar: asset.read.pStar,
    examples: c.examples, rightTopScore: c.rightTopScore, hardNegativeScore: c.hardNegativeScore, hardNegativeMax: c.hardNegativeMax,
    heldOut: c.heldOut.map((h) => `${h.path.split('/').pop()}: right ${h.rightTops} (min P ${h.minRightTopP}, ${h.rightFlagged} flagged), wrong tops ${h.wrongTops}, max negative P ${h.maxNegativeP} (${h.negativesRead} read)`),
    training: asset.training.map((t) => `${t.path.split('/').pop()}: ${t.used ? 'used' : t.condition}`) }, null, 1));
}
