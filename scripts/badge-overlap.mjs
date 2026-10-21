#!/usr/bin/env node
/**
 * Digit templates by overlap (Sam, 2026-10-21: "Overlapping may give a more precise shape to everything"), compared with
 * the fixed templates, for both digit readers (B+W digit, coverage digit).
 *
 *   node scripts/badge-overlap.mjs [--validation FILE] [--report out.json]
 *
 * Instances: every digit glyph on an image, found as the reader's own cells (badgeDigitCellSpans) of every badge, named by
 * that reader's read with the fixed templates; anchored at the glyph's coverage centroid (sub-pixel, the badge's LOCAL
 * levels). fn.q.sprite.overlap (fg/queries/sprite.mjs) overlaps the instances of one digit at factor 4 (4 x 4 cells per
 * px, bright polarity, LOCAL levels per instance, re-registered by up to 0.5 px); digitTemplateFromFine turns the
 * super-resolved mean into a reader template. The glyph window is 18 x 26 px: badge glyphs are screen-fixed sprites
 * (DOCTRINE), about 15 x 21 px of ink, and the gap to a neighbouring digit (5-6 px) keeps it out of the window.
 *
 * Variants per reader:
 *   fixed    the vendored templates (on dev: re-baked without the scored course, as in badge-calibration.mjs)
 *   prior    carried overlap templates: every instance on the dev courses (on dev: the other five), pooled per digit
 *   image    LOCAL overlap templates: this image's own instances of each digit, LEAVING OUT the badge being read; a digit
 *            with no other instance on the image falls back to the prior
 * Every badge is read (no abstention); P is the shipped calibration's confidence, fitted on fixed-template features, so
 * for the overlap variants it is indicative only. The reference is the board's S1 read.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { deserialize } from 'node:v8';
import { join, resolve } from 'node:path';
import { spriteOverlap, poolOverlaps } from '../fg/queries/sprite.mjs';
import { devSprites } from './badge-coverage-sources.mjs';
import { bakeDigits, bakeCoverageDigits } from '../source/provider/scripts/generate-badge-glyph-templates.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const dist = (p) => require(join(ROOT, 'source/provider/packages/alg/dist/detectors/threeFactor', p));
const DG = dist('digits/badgeDigitTemplateMath.js'), CD = dist('digits/badgeCoverageDigitMath.js'), C = dist('digits/badgeCoverageTemplateMath.js');
const K = dist('digits/badgeReaderCalibration.js');
const { BADGE_DIGIT_TEMPLATES } = dist('features/g1.badgeDigitTemplate.js');
const { BADGE_COVERAGE_DIGIT_TEMPLATES } = dist('features/g1.badgeCoverageDigit.js');
const { HOLE_LABELS } = dist('digits/holeLabels.js');

const WINDOW = Object.freeze({ width: 18, height: 26, anchorAt: [8.5, 12.5] });   // px (screen-fixed glyph sprite)
const FACTOR = 4, REFINE_PX = 0.5;
// px per sample of the readers' 96 x 72 badge grid on a dev badge (55 x 42 px: the median badge sprite)
const SAMPLE_PX = Object.freeze([55 / DG.BADGE_DIGIT_SAMPLE.widthPx, 42 / DG.BADGE_DIGIT_SAMPLE.heightPx]);
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const DEV = readFileSync(join(ROOT, 'docs/evidence/dev-s1s4/ATTEMPTS'), 'utf8').trim().split('\n').map((l) => l.split(' '));
const VALIDATION = arg('--validation') ? readFileSync(arg('--validation'), 'utf8').trim().split('\n').map((l) => l.split(' ')) : [];
const r3 = (v) => Math.round(v * 1000) / 1000;
const median = (v) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[(s.length - 1) >> 1] : null; };

const READERS = {
  digitBW: {
    table: (bmp, body, T) => DG.badgeDigitScoreTable(bmp, body, T),
    fromFine: (f) => f.mask, key: 'mask'
  },
  coverageDigit: {
    table: (bmp, body, T) => CD.badgeCoverageDigitScoreTable(bmp, body, T),
    fromFine: (f) => f.coverage, key: 'coverage'
  }
};
const readOf = (table) => {
  const mean = (cells) => (cells ? cells.reduce((a, c) => a + Math.max(...c), 0) / cells.length : -Infinity);
  const cells = mean(table.two) > mean(table.one) ? table.two : table.one;
  return cells ? Number(cells.map((c) => c.indexOf(Math.max(...c))).join('')) : null;
};
/** The best label of the vocabulary (as badge-calibration.mjs), its features and P. */
function verdict(reader, table) {
  const joint = (L) => { const ds = [...String(L)].map(Number), cells = ds.length === 1 ? table.one : table.two; return cells && cells.length === ds.length ? ds.reduce((a, d, i) => a + cells[i][d], 0) / ds.length : -Infinity; };
  const top = HOLE_LABELS.reduce((a, L) => (joint(L) > joint(a) ? L : a), HOLE_LABELS[0]);
  const x = K.digitLabelFeatures(table, top);
  return { label: top, p: K.readerProbability(reader, x), digitMargin: x[1], layoutMargin: x[2] };
}

function board(attempt) {
  const pxc = new Map(deserialize(readFileSync(join(ROOT, 'attempts/stages', attempt, 'fork/stage-output/early/s3.pxc.bin'))));
  const image = pxc.get('localImage'), { topPx } = pxc.get('viewport');
  const bmp = { width: image.width, height: image.height, data: image.data };
  const source = { widthPx: image.width, heightPx: image.height, rgba: image.data };
  const badges = pxc.get('badges').map((b) => { const [x, y, w, h] = b.bbox; return { detId: b.detId, bboxPx: b.bbox, reference: b.label == null ? null : Number(b.label), body: { xPx: x + w / 2, yPx: y + h / 2 - topPx, widthPx: w, heightPx: h } }; });
  return { bmp, source, badges };
}

/** Each badge's digit glyphs as overlap instances: { badge, digit, anchor }, named by the reader's fixed read. */
function instances(B, reader, Tfixed) {
  const out = [];
  B.badges.forEach((b, k) => {
    const read = readOf(READERS[reader].table(B.bmp, b.body, Tfixed));
    if (read == null) return;
    const ds = [...String(read)].map(Number), spans = CD.badgeDigitCellSpans(B.bmp, b.body);
    const cells = spans && (ds.length === 1 ? spans.one : spans.two);
    if (!cells || cells.length !== ds.length) return;
    const lv = C.coverageLevels(B.bmp, b.body), span = Math.max(1, lv.glyphLum - lv.plateLum);
    ds.forEach((d, i) => {
      const [xa, xb] = cells[i], [ya, yb] = spans.rows;
      let sx = 0, sy = 0, sw = 0;
      for (let y = Math.ceil(ya); y <= Math.floor(yb); y++) for (let x = Math.floor(xa) - 1; x <= Math.ceil(xb) + 1; x++) {
        const o = (y * B.bmp.width + x) * 4, c = Math.max(0, Math.min(1, ((B.bmp.data[o] + B.bmp.data[o + 1] + B.bmp.data[o + 2]) / 3 - lv.plateLum) / span));
        sx += c * x; sy += c * y; sw += c;
      }
      if (sw > 0) out.push({ badge: k, digit: d, anchor: [sx / sw, sy / sw] });
    });
  });
  return out;
}

const overlapOf = (source, inst) => spriteOverlap({ source, instances: inst.map((i) => ({ anchor: i.anchor })), window: WINDOW, factor: FACTOR, polarity: 'bright', refinePx: REFINE_PX });
function templatesFrom(overlaps, reader) {
  const T = [];
  for (const [digit, o] of Object.entries(overlaps)) {
    const f = CD.digitTemplateFromFine(o.mean, o.fineWidth, o.fineHeight, FACTOR, SAMPLE_PX);
    if (f) T.push({ digit: Number(digit), from: `overlap of ${o.memberCount}`, [READERS[reader].key]: READERS[reader].fromFine(f) });
  }
  return T;
}

function fixedFor(exclude) {
  if (!exclude) return { digitBW: BADGE_DIGIT_TEMPLATES, coverageDigit: BADGE_COVERAGE_DIGIT_TEMPLATES };
  const rasters = Object.fromEntries(Object.entries(devSprites({ exclude: [exclude] })).map(([l, c]) => [l, c.raster]));
  return { digitBW: bakeDigits(rasters, { quiet: true }).shippedDigits, coverageDigit: bakeCoverageDigits(rasters, { quiet: true }).shippedCoverageDigits };
}

// ---- run -------------------------------------------------------------------------------------------------------
const boards = Object.fromEntries([...DEV, ...VALIDATION].map(([c, a]) => [c, board(a)]));
const fixed = Object.fromEntries([...DEV.map(([c]) => [c, fixedFor(c)]), ['__all', fixedFor(null)]]);
const report = { window: WINDOW, factor: FACTOR, refinePx: REFINE_PX, readers: {} };
for (const reader of Object.keys(READERS)) {
  // per-course instances of every digit, each named by the reader's fixed read (on dev: fixed templates without the course)
  const inst = {};
  for (const [c] of [...DEV, ...VALIDATION]) inst[c] = instances(boards[c], reader, (fixed[c] ?? fixed.__all)[reader]);
  const perDigit = (list) => { const m = {}; for (const i of list) (m[i.digit] ??= []).push(i); return m; };
  const devOverlaps = Object.fromEntries(DEV.map(([c]) => [c, Object.fromEntries(Object.entries(perDigit(inst[c])).map(([d, l]) => [d, overlapOf(boards[c].source, l)]))]));
  const priorFor = (exclude) => {
    const pooled = {};
    for (let d = 0; d <= 9; d++) { const os = DEV.filter(([c]) => c !== exclude && devOverlaps[c][d]).map(([c]) => devOverlaps[c][d]); if (os.length) pooled[d] = poolOverlaps(os); }
    return pooled;
  };
  const table = {};
  for (const [course] of [...DEV, ...VALIDATION]) {
    const isDev = DEV.some(([c]) => c === course), B = boards[course];
    const Tfixed = (isDev ? fixed[course] : fixed.__all)[reader];
    const prior = priorFor(isDev ? course : null), Tprior = templatesFrom(prior, reader);
    const byDigit = perDigit(inst[course]);
    const rows = B.badges.map((b, k) => {
      // LOCAL: this image's other badges' instances of each digit; the prior where it has none
      const local = {};
      for (let d = 0; d <= 9; d++) { const others = (byDigit[d] ?? []).filter((i) => i.badge !== k); local[d] = others.length ? overlapOf(B.source, others) : prior[d]; }
      const Timage = templatesFrom(Object.fromEntries(Object.entries(local).filter(([, o]) => o)), reader);
      const v = (T) => verdict(reader, READERS[reader].table(B.bmp, b.body, T));
      return { detId: b.detId, bboxPx: b.bboxPx, reference: b.reference, fixed: v(Tfixed), prior: v(Tprior), image: v(Timage),
        localDigits: Object.fromEntries(Object.entries(byDigit).map(([d, l]) => [d, l.filter((i) => i.badge !== k).length])) };
    });
    const sum = (key) => ({ read: rows.length, flagged: rows.filter((r) => r[key].p < K.READER_P_STAR).length, wrong: rows.filter((r) => r.reference != null && r[key].label !== r.reference).length,
      medianDigitMargin: r3(median(rows.map((r) => r[key].digitMargin))), minDigitMargin: r3(Math.min(...rows.map((r) => r[key].digitMargin))) });
    table[course] = { badges: rows.length, fixed: sum('fixed'), prior: sum('prior'), image: sum('image'), rows };
    console.log(`${reader.padEnd(13)} ${course.padEnd(19)} ${['fixed', 'prior', 'image'].map((k) => `${k} ${table[course][k].flagged}/${table[course][k].wrong} m ${table[course][k].medianDigitMargin}/${table[course][k].minDigitMargin}`).join(' | ')}`);
  }
  report.readers[reader] = table;
}
if (arg('--report')) writeFileSync(arg('--report'), JSON.stringify(report));
