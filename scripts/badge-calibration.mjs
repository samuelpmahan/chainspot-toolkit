#!/usr/bin/env node
/**
 * Learned abstention for the four badge readers (Sam, 2026-10-21: "There's no good reason for something a
 * perceptron did 75 years ago to not be automatic").
 *
 *   node scripts/badge-calibration.mjs --labels DIR [--write] [--report out.json]
 *
 * DIR holds truth-<course>.json ({detId: label}) for the validation boards: their S1 reads, checked by eye.
 *
 * 1. Honest scores. Every dev badge is scored by readers whose templates come from the OTHER five dev courses
 *    (leave one course out): the coverage and B+W digit templates are re-baked per held-out course with the
 *    baker's own functions (source/provider/scripts/generate-badge-glyph-templates.mjs) from devSprites({exclude}).
 *    The binary reader's templates are old-stuff rasters (no dev course in them). The per-digit reader's logistic
 *    model is the provider's, as pinned; its training data is not in this repo, so its dev scores may be optimistic.
 *    Validation courses are scored with the shipped (all-dev) templates; they are never a source.
 * 2. Per reader, a logistic regression (a perceptron with a sigmoid) learns P(the label is right | features of
 *    that label): its score, its margin over the best OTHER label, and for the digit reader the layout margin.
 *    Examples per badge: the reader's top label (right or wrong) and a HARD NEGATIVE, the best label once the
 *    true one is removed from the vocabulary (what a confident wrong read looks like). Trained with course-level
 *    cross-validation (5 dev courses in, 1 out) for every reported number; the shipped weights are fitted on all 6.
 * 3. A reader reads when P >= P_STAR and abstains otherwise. P_STAR is one number for every reader, from a stated
 *    cost: a wrong label costs COST_WRONG abstentions (an abstention is a visible gap that S4 and the course
 *    bijection can fill; a wrong label silently sends S4-S7 after the wrong hole). Read iff (1 - P) * COST_WRONG < 1.
 * 4. Joint assignment per full view (labels exactly 1..N, N = badges found): confident reads (P >= P_STAR) are
 *    fixed first (a conflict between two confident reads goes to the min-cost assignment); the remaining badges
 *    are re-scored against the labels still free (margins over free labels only) and assigned one-to-one by
 *    assignMinCost (ports/s7route/match.mjs) at cost -log P, a badge abstaining at -log P_STAR. It fills gaps;
 *    it never changes a confident read except to settle a conflict, and it reports every change.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { deserialize } from 'node:v8';
import { join, resolve } from 'node:path';
import { devSprites } from './badge-coverage-sources.mjs';
import { bakeCoverage, bakeDigits, bakeCoverageDigits } from '../source/provider/scripts/generate-badge-glyph-templates.mjs';
import { assignMinCost } from '../ports/s7route/match.mjs';
import { measureDev, synthesize } from './badge-synthesis.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const dist = (p) => require(join(ROOT, 'source/provider/packages/alg/dist/detectors/threeFactor', p));
const B = dist('digits/badgeGlyphTemplateMath.js'), C = dist('digits/badgeCoverageTemplateMath.js'), DG = dist('digits/badgeDigitTemplateMath.js');
const { HOLE_LABELS } = dist('digits/holeLabels.js');
const K = dist('digits/badgeReaderCalibration.js');
const CD = dist('digits/badgeCoverageDigitMath.js');
const { BADGE_COVERAGE_DIGIT_TEMPLATES } = dist('features/g1.badgeCoverageDigit.js');
const { BADGE_GLYPH_TEMPLATES } = dist('features/g1.badgeGlyphTemplate.js');
const { BADGE_COVERAGE_TEMPLATES } = dist('features/g1.badgeCoverageTemplate.js');
const { BADGE_DIGIT_TEMPLATES } = dist('features/g1.badgeDigitTemplate.js');
const CAL_PATH = join(ROOT, 'source/provider/packages/alg/src/detectors/threeFactor/assets/badge-reader-calibration.json');

export const COST_WRONG = 100;   // abstentions one wrong label is worth (stated, not fitted)
export const P_STAR = 1 - 1 / COST_WRONG;   // 0.99
const FIXED = { minScore: 0.58, minMargin: 0.045 };   // the borrowed constants, for the baseline rows
const READERS = ['binary', 'digitBW', 'coverage', 'coverageDigit', 'perDigit'];
const FEATURES = { binary: ['dice', 'margin'], digitBW: ['minDigitDice', 'minDigitMargin', 'layoutMargin'], coverage: ['ncc', 'margin'], coverageDigit: ['minDigitNcc', 'minDigitMargin', 'layoutMargin'], perDigit: ['geoMeanDigitProb', 'posteriorMargin'] };
const ST = join(ROOT, 'attempts/stages');
const median = (v) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[(s.length - 1) >> 1] : null; };
const r3 = (v) => Math.round(v * 1000) / 1000;
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const DEV = readFileSync(join(ROOT, 'docs/evidence/dev-s1s4/ATTEMPTS'), 'utf8').trim().split('\n').map((l) => l.split(' '));
// validation boards: `--validation FILE` lines "course attempt"; their reference is the board's S1 read (checked by eye)
const VALIDATION = arg('--validation') ? readFileSync(arg('--validation'), 'utf8').trim().split('\n').map((l) => l.split(' ')) : [];

// ---- per-label scores of each reader ----------------------------------------------------------------------
/** For one badge: what each reader's per-label features are computed from (badgeReaderCalibration.ts). */
function readerScores(bitmap, body, badge, T) {
  const binMask = B.normalizeBadgeGlyphMask(bitmap, body);
  const bin = new Map(HOLE_LABELS.map((L) => [L, binMask ? B.bestMaskScore(binMask, T.binary.find((t) => t.label === L).mask, 1) : 0]));
  const covN = C.normalizeBadgeCoverage(bitmap, body);
  const cov = new Map(HOLE_LABELS.map((L) => [L, covN ? C.bestCoverageScore(covN, T.coverage.find((t) => t.label === L).coverage, 1) : -1]));
  const table = DG.badgeDigitScoreTable(bitmap, body, T.digit);
  const joint = new Map(HOLE_LABELS.map((L) => { const ds = [...String(L)].map(Number), cells = ds.length === 1 ? table.one : table.two;
    return [L, cells && cells.length === ds.length ? ds.reduce((a, d, i) => a + cells[i][d], 0) / ds.length : -1]; }));
  const covTable = CD.badgeCoverageDigitScoreTable(bitmap, body, T.covDigit);
  const covJoint = new Map(HOLE_LABELS.map((L) => { const ds = [...String(L)].map(Number), cells = ds.length === 1 ? covTable.one : covTable.two;
    return [L, cells && cells.length === ds.length ? ds.reduce((a, d, i) => a + cells[i][d], 0) / ds.length : -2]; }));
  const digitScores = (badge.digits ?? []).map((d) => d.scores);
  const lik = new Map(HOLE_LABELS.map((L) => [L, String(L).length === digitScores.length ? [...String(L)].reduce((p, d, i) => p * (digitScores[i][+d] ?? 0), 1) : 0]));
  return { bin, cov, table, joint, covTable, covJoint, digitScores, lik };
}

/** Features of label L for one reader over the vocabulary `others`: the provider's own definitions. */
function featuresOf(reader, R, L, others) {
  if (reader === 'binary') return K.templateLabelFeatures((k) => R.bin.get(k), L, others);
  if (reader === 'coverage') return K.templateLabelFeatures((k) => R.cov.get(k), L, others);
  if (reader === 'digitBW') return K.digitLabelFeatures(R.table, L, others);
  if (reader === 'coverageDigit') return K.digitLabelFeatures(R.covTable, L, others);
  return K.perDigitLabelFeatures(R.digitScores, L, others);
}
const scalar = (reader, R, L) => (reader === 'binary' ? R.bin.get(L) : reader === 'coverage' ? R.cov.get(L) : reader === 'digitBW' ? R.joint.get(L) : reader === 'coverageDigit' ? R.covJoint.get(L) : R.lik.get(L));
const topOf = (reader, R, labels) => labels.reduce((a, L) => (scalar(reader, R, L) > scalar(reader, R, a) ? L : a), labels[0]);

/** The reader's own verdict at the fixed (borrowed) thresholds. */
/** Each reader's own verdict at its fixed (borrowed) thresholds, from the provider classifiers themselves. */
function fixedVerdicts(bitmap, body, T, n, s1Label) {
  const bin = B.classifyNormalizedGlyph(B.normalizeBadgeGlyphMask(bitmap, body), T.binary);
  const cov = C.classifyNormalizedCoverage(C.normalizeBadgeCoverage(bitmap, body), T.coverage);
  const dig = DG.classifyBadgeDigitsAgainstTemplates(bitmap, body, T.digit, n);
  const cd = CD.readCoverageDigits(CD.badgeCoverageDigitScoreTable(bitmap, body, T.covDigit));
  return { binary: bin.label ?? null, coverage: cov.label ?? null, digitBW: dig.label == null ? null : Number(dig.label), coverageDigit: cd == null ? null : Number(cd), perDigit: s1Label == null ? null : Number(s1Label) };
}

// ---- logistic regression (a perceptron with a sigmoid) ----------------------------------------------------
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
  // back to raw feature units: P = sigmoid(bias + sum weight_j * x_j)
  const weights = w.map((wj, j) => wj / sd[j]), bias = b - w.reduce((a, wj, j) => a + (wj * mu[j]) / sd[j], 0);
  return { weights, bias };
}
/** The examples hold one hard negative per badge, so the fit sees right:wrong at about 1:1; real reads are right far
 * more often. Bayes moves the logit from the training odds to the real odds of a top read being right, estimated by the
 * rule of succession on the out-of-course top reads: (right + 1) / (wrong + 1). */
function fitCalibrated(ex) {
  const m = fit(ex.map((e) => e.x), ex.map((e) => e.y));
  const n1 = ex.filter((e) => e.y === 1).length, n0 = ex.length - n1;
  const right = ex.filter((e) => e.kind === 'top' && e.y === 1).length, wrong = ex.filter((e) => e.kind === 'top' && e.y === 0).length;
  return { ...m, priorShift: Math.log((right + 1) / (wrong + 1)) - Math.log(n1 / n0) };
}
const logit = (m, x) => m.bias + x.reduce((a, v, j) => a + v * m.weights[j], 0);
const probMix = (m, x) => sigmoid(logit(m, x));
const prob = (m, x) => sigmoid(logit(m, x) + (m.priorShift ?? 0));

// ---- collect -------------------------------------------------------------------------------------------------
function templatesFor(exclude) {
  if (!exclude) return { binary: BADGE_GLYPH_TEMPLATES, coverage: BADGE_COVERAGE_TEMPLATES, digit: BADGE_DIGIT_TEMPLATES, covDigit: BADGE_COVERAGE_DIGIT_TEMPLATES };
  const sprites = devSprites({ exclude: [exclude] }), rasters = Object.fromEntries(Object.entries(sprites).map(([l, c]) => [l, c.raster]));
  const { coverageTemplates } = bakeCoverage(rasters, { quiet: true });
  const { shippedDigits } = bakeDigits(rasters, { quiet: true });
  const { shippedCoverageDigits } = bakeCoverageDigits(rasters, { quiet: true });
  return { binary: BADGE_GLYPH_TEMPLATES, coverage: coverageTemplates, digit: shippedDigits, covDigit: shippedCoverageDigits };
}
/** "A black plate inside a white box", LOCAL to the badge. mid = midway between the badge's own plate and glyph levels
 * (coverageLevels over the inset). White box: on each of the four sides, over the middle half of the side (clear of the
 * rounded corners), the brightest of the outer 3 px has its median above mid. Black plate: more than half the inset is
 * below mid. */
function plateInWhiteBox(bitmap, body) {
  const lv = C.coverageLevels(bitmap, body), mid = (lv.plateLum + lv.glyphLum) / 2;
  const x0 = Math.round(body.xPx - body.widthPx / 2), y0 = Math.round(body.yPx - body.heightPx / 2), W = body.widthPx, H = body.heightPx;
  const lumAt = (x, y) => { const o = (Math.max(0, Math.min(bitmap.height - 1, y0 + y)) * bitmap.width + Math.max(0, Math.min(bitmap.width - 1, x0 + x))) * 4; return (bitmap.data[o] + bitmap.data[o + 1] + bitmap.data[o + 2]) / 3; };
  const side = (n, at) => median(Array.from({ length: Math.ceil(n / 2) }, (_, k) => Math.max(...[0, 1, 2].map((d) => at(Math.floor(n / 4) + k, d)))));
  const sides = [side(W, (k, d) => lumAt(k, d)), side(W, (k, d) => lumAt(k, H - 1 - d)), side(H, (k, d) => lumAt(d, k)), side(H, (k, d) => lumAt(W - 1 - d, k))];
  const inset = [];
  for (let y = Math.ceil(0.16 * H); y < Math.floor(0.84 * H); y++) for (let x = Math.ceil(0.14 * W); x < Math.floor(0.86 * W); x++) inset.push(lumAt(x, y));
  const plateShare = inset.filter((v) => v < mid).length / inset.length;
  return { pass: sides.every((v) => v > mid) && plateShare > 0.5, mid: r3(mid), sides: sides.map(r3), plateShare: r3(plateShare) };
}
function collect(course, attempt, T, labels = null) {
  const board = new Map(deserialize(readFileSync(join(ST, attempt, 'fork/stage-output/early/s3.pxc.bin'))));
  const image = board.get('localImage'), { topPx } = board.get('viewport'), badges = board.get('badges');
  const bitmap = { width: image.width, height: image.height, data: image.data };
  return badges.map((b) => {
    const [x, y, w, h] = b.bbox, body = { xPx: x + w / 2, yPx: y + h / 2 - topPx, widthPx: w, heightPx: h };
    const truth = labels ? labels[b.detId] : b.label;
    // the reference is S1's per-digit read under 1..27 (dev: on the board; validation: the lane's run, checked by eye)
    return { course, attempt, detId: b.detId, bboxPx: b.bbox, truth: truth == null ? null : Number(truth), plateBox: plateInWhiteBox(bitmap, body), R: readerScores(bitmap, body, b, T), fixed: fixedVerdicts(bitmap, body, T, badges.length, truth), badge: b };
  });
}


function examples(rows, reader) {
  const out = [];
  for (const r of rows) {
    if (r.truth == null) continue;
    const top = topOf(reader, r.R, HOLE_LABELS);
    out.push({ x: featuresOf(reader, r.R, top, HOLE_LABELS), y: top === r.truth ? 1 : 0, kind: 'top', course: r.course, truth: r.truth, label: top });
    const rest = HOLE_LABELS.filter((L) => L !== r.truth), imp = topOf(reader, r.R, rest);
    out.push({ x: featuresOf(reader, r.R, imp, rest), y: 0, kind: 'hard-negative', course: r.course, truth: r.truth, label: imp });
  }
  return out;
}

/** Per image: confident reads fixed, the rest assigned one-to-one over the free labels 1..N. */
function bijection(rows, reader, model) {
  const N = rows.length, labels = HOLE_LABELS.filter((L) => L <= N);
  const verdict = rows.map((r) => { const top = topOf(reader, r.R, HOLE_LABELS); const p = prob(model, featuresOf(reader, r.R, top, HOLE_LABELS)); return { top, p, label: p >= P_STAR ? top : null }; });
  const fixed = new Map(), conflicts = [];
  verdict.forEach((v, i) => { if (v.label != null && v.label <= N) { if (fixed.has(v.label)) conflicts.push(v.label); else fixed.set(v.label, i); } });
  const final = verdict.map((v) => ({ ...v, assigned: null, how: null }));
  for (const L of new Set(conflicts)) {   // two confident reads of one label: settle by the assignment over those badges only
    const who = verdict.map((v, i) => (v.label === L ? i : -1)).filter((i) => i >= 0);
    who.forEach((i) => { final[i].label = null; final[i].how = 'conflict'; });
    fixed.delete(L);
  }
  for (const [L, i] of fixed) { final[i].assigned = L; final[i].how = 'confident'; }
  // Rounds: assign the open badges to the free labels one-to-one (cost -log P, margins over the free labels; abstaining
  // costs -log P_STAR); a pair is accepted when its P, with the labels the assignment gives the OTHER open badges
  // removed from its competitors, reaches P_STAR. Accepted pairs become fixed; repeat until nothing new is accepted.
  for (let round = 0; round < 10; round++) {
    const free = labels.filter((L) => ![...final].some((f) => f.assigned === L)), open = rows.map((_, i) => i).filter((i) => final[i].assigned == null);
    if (!open.length || !free.length) break;
    const P = open.map((i) => free.map((L) => prob(model, featuresOf(reader, rows[i].R, L, free))));
    const cost = P.map((row) => [...row.map((p) => -Math.log(Math.max(p, 1e-12))), ...open.map(() => -Math.log(P_STAR))]);
    const pairs = assignMinCost(cost).filter(([, j]) => j < free.length);
    const taken = new Map(pairs.map(([a, j]) => [open[a], free[j]]));
    let accepted = 0;
    for (const [i, L] of taken) {
      const rivals = free.filter((K) => K === L || ![...taken].some(([o, M]) => o !== i && M === K));
      const p = prob(model, featuresOf(reader, rows[i].R, L, rivals));
      if (p >= P_STAR) { final[i].assigned = L; final[i].how = 'filled'; final[i].p = p; accepted++; }
    }
    if (!accepted) break;
  }
  return final;
}

/** No abstention (Sam, 2026-10-21): every badge gets every reader's best label with its P; P < P_STAR is a flag. The
 * one-to-one assignment over 1..N (cost -log P of each label read as the reader would read it) is a cross-check. */
function readAll(rows, reader, m) {
  const N = rows.length, labels = HOLE_LABELS.filter((L) => L <= N);
  const reads = rows.map((r) => { const top = topOf(reader, r.R, HOLE_LABELS), x = featuresOf(reader, r.R, top, HOLE_LABELS); return { detId: r.detId, label: top, p: r3(prob(m, x)), margin: r3(x[1]) }; });
  const cost = rows.map((r) => labels.map((L) => -Math.log(Math.max(1e-12, prob(m, featuresOf(reader, r.R, L, HOLE_LABELS))))));
  const assigned = new Map(assignMinCost(cost).map(([i, j]) => [i, labels[j]]));
  reads.forEach((v, i) => { v.assigned = assigned.get(i) ?? null; v.crossCheck = v.assigned === v.label ? 'agrees' : 'conflicts'; v.flag = v.p < P_STAR; v.wrong = rows[i].truth != null && v.label !== rows[i].truth; });
  return { badges: N, flagged: reads.filter((v) => v.flag).length, wrong: reads.filter((v) => v.wrong).length, wrongFlagged: reads.filter((v) => v.wrong && v.flag).length,
    agrees: reads.filter((v) => v.crossCheck === 'agrees').length, conflicts: reads.filter((v) => v.crossCheck === 'conflicts').length, reads };
}

// ---- run -----------------------------------------------------------------------------------------------------
const report = { costWrong: COST_WRONG, pStar: P_STAR, readers: {} };
const devRows = {}, synRows = {}, looT = {};
for (const [course, attempt] of DEV) { looT[course] = templatesFor(course); devRows[course] = collect(course, attempt, looT[course]); }
// synthetic 1..27 composed from each dev course's own sprites, scored with the templates that leave that course out
// (the same out-of-course scoring as its real badges); the per-digit reader cannot read a crop and takes none
const SYN = process.argv.includes('--synthetic') ? Number(process.argv[process.argv.indexOf('--synthetic') + 1]) : 0;
if (SYN) for (const [course, attempt] of DEV) {
  const M = measureDev([[course, attempt]]);
  synRows[course] = synthesize(M, HOLE_LABELS, SYN, [...course].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0).map((s, k) => ({
    course, detId: `syn-${s.label}-${k}`, truth: s.label, synthetic: true, R: readerScores(s.raster, s.body, { digits: [] }, looT[course]), badge: null }));
}
const trainRows = (c, reader) => [...examples(devRows[c], reader), ...(reader === 'perDigit' ? [] : examples(synRows[c] ?? [], reader))];
const valRows = {};
for (const [course, attempt] of VALIDATION)
  valRows[course] = collect(course, attempt, templatesFor(null));

// Diagnosis (dev only): each reader's top-read features on real 1..18, synthetic 1..18, synthetic 1x (10..19) and
// synthetic 2x (20..27), and the share P >= P_STAR under a model fitted on the real dev badges alone.
const diagnosis = {};
if (SYN) for (const reader of READERS.filter((r) => r !== 'perDigit')) {
  const realOnly = fitCalibrated(DEV.flatMap(([c]) => examples(devRows[c], reader)));
  const groups = { 'real 1..18': DEV.flatMap(([c]) => devRows[c]), 'synthetic 1..9': [], 'synthetic 10..19': [], 'synthetic 20..27': [] };
  for (const [c] of DEV) for (const r of synRows[c]) groups[r.truth <= 9 ? 'synthetic 1..9' : r.truth <= 19 ? 'synthetic 10..19' : 'synthetic 20..27'].push(r);
  groups['real 1..9'] = groups['real 1..18'].filter((r) => r.truth <= 9); groups['real 10..18'] = groups['real 1..18'].filter((r) => r.truth >= 10);
  diagnosis[reader] = Object.fromEntries(Object.entries(groups).map(([g, rows]) => {
    const f = rows.map((r) => { const top = topOf(reader, r.R, HOLE_LABELS); return { x: featuresOf(reader, r.R, top, HOLE_LABELS), right: top === r.truth }; });
    const q = (j, t) => r3([...f.map((e) => e.x[j])].sort((a, b) => a - b)[Math.floor(t * (f.length - 1))]);
    return [g, { n: f.length, topRight: f.filter((e) => e.right).length, features: FEATURES[reader].map((name, j) => `${name} p10 ${q(j, 0.1)} p50 ${q(j, 0.5)}`), readUnderRealOnlyModel: f.filter((e) => prob(realOnly, e.x) >= P_STAR).length }];
  }));
}
report.diagnosis = diagnosis;

const shipped = {};
for (const reader of READERS) {
  const cv = [];   // out-of-course predictions on dev
  const perCourse = {};
  for (const [held] of DEV) {
    const train = DEV.filter(([c]) => c !== held).flatMap(([c]) => trainRows(c, reader));
    const model = fitCalibrated(train);
    for (const e of examples(devRows[held], reader)) cv.push({ ...e, p: prob(model, e.x), pMix: probMix(model, e.x) });
    perCourse[held] = { model, rows: devRows[held] };
  }
  const all = DEV.flatMap(([c]) => trainRows(c, reader));
  const model = fitCalibrated(all);
  shipped[reader] = { features: FEATURES[reader], ...model, trainedOn: { courses: DEV.map(([c]) => c), badges: DEV.reduce((a, [c]) => a + devRows[c].length, 0), syntheticBadges: reader === 'perDigit' ? 0 : DEV.reduce((a, [c]) => a + (synRows[c]?.length ?? 0), 0), syntheticPerLabelPerCourse: reader === 'perDigit' ? 0 : SYN, examples: all.length, rightTops: all.filter((e) => e.y === 1).length, wrongTops: all.filter((e) => e.kind === 'top' && e.y === 0).length, hardNegatives: all.filter((e) => e.kind === 'hard-negative').length },
    outOfCourse: { maxImpostorP: r3(Math.max(...cv.filter((x) => x.y === 0).map((x) => x.p))), impostorsAtPStar: cv.filter((x) => x.y === 0 && x.p >= P_STAR).length, of: cv.filter((x) => x.y === 0).length, unit: 'dev hard negatives and wrong tops, scored by the fold that left their course out' } };
  const table = {};
  const summarize = (course, rows, m) => {
    const fixedReads = rows.map((r) => r.fixed[reader]);
    const bij = bijection(rows, reader, m);
    const tops = rows.map((r) => { const top = topOf(reader, r.R, HOLE_LABELS); return { top, p: prob(m, featuresOf(reader, r.R, top, HOLE_LABELS)) }; });
    const count = (reads) => ({ read: reads.filter((v) => v != null).length, abstained: reads.filter((v) => v == null).length, wrong: reads.filter((v, i) => v != null && rows[i].truth != null && Number(v) !== rows[i].truth).length });
    return { course, badges: rows.length, fixed: count(fixedReads), learned: count(tops.map((t) => (t.p >= P_STAR ? t.top : null))), bijection: count(bij.map((b) => b.assigned)),
      pMedian: r3(median(tops.map((t) => t.p))), pMin: r3(Math.min(...tops.map((t) => t.p))),
      filled: bij.map((b, i) => (b.how === 'filled' ? { detId: rows[i].detId, truth: rows[i].truth, top: b.top, pTop: r3(b.p ?? 0), assigned: b.assigned } : null)).filter(Boolean),
      changed: rows.map((r, i) => ({ detId: r.detId, bboxPx: r.bboxPx, truth: r.truth, fixed: fixedReads[i], learned: tops[i].p >= P_STAR ? tops[i].top : null, p: r3(tops[i].p), final: bij[i].assigned, how: bij[i].how })).filter((c) => (c.fixed ?? null) !== (c.final ?? null)),
      conflicts: bij.filter((b) => b.how === 'conflict').length,
      overrides: bij.filter((b, i) => b.label != null && b.assigned != null && b.assigned !== b.label).length,
      readAll: readAll(rows, reader, m) };
  };
  for (const [course] of DEV) table[course] = summarize(course, devRows[course], perCourse[course].model);
  for (const [course] of VALIDATION) table[course] = summarize(course, valRows[course], model);
  // reliability on the out-of-course dev predictions (tops and hard negatives)
  // reliability on the out-of-course dev predictions: the 1:1 training mix (tops and hard negatives, before the prior shift)
  const bins = [[0, 0.1], [0.1, 0.5], [0.5, 0.9], [0.9, 1.0001]].map(([lo, hi]) => { const e = cv.filter((x) => x.pMix >= lo && x.pMix < hi); return { bin: `${lo}-${Math.min(hi, 1)}`, n: e.length, meanP: e.length ? r3(e.reduce((a, x) => a + x.pMix, 0) / e.length) : null, observed: e.length ? r3(e.filter((x) => x.y === 1).length / e.length) : null }; });
  report.readers[reader] = { features: FEATURES[reader], shipped: shipped[reader], reliability: bins, maxImpostorP: r3(Math.max(...cv.filter((x) => x.y === 0).map((x) => x.p))), impostorsAtPStar: cv.filter((x) => x.y === 0 && x.p >= P_STAR).map((x) => ({ course: x.course, truth: x.truth, read: x.label, kind: x.kind, p: r3(x.p), x: x.x.map(r3) })), minRightTopP: r3(Math.min(...cv.filter((x) => x.y === 1).map((x) => x.p))), table };
}

// every badge with every reader's read, for the renders and the report
report.badges = [...DEV.map(([c]) => [c, devRows[c]]), ...VALIDATION.map(([c]) => [c, valRows[c]])].flatMap(([course, rows]) => rows.map((r, i) => ({
  course, attempt: r.attempt, detId: r.detId, bboxPx: r.bboxPx, reference: r.truth, plateBox: r.plateBox,
  reads: Object.fromEntries(READERS.map((reader) => { const v = report.readers[reader].table[course].readAll.reads[i]; return [reader, { label: v.label, p: v.p, margin: v.margin, flag: v.flag, crossCheck: v.crossCheck }]; }))
})));
report.plateBoxFailures = report.badges.filter((b) => !b.plateBox.pass).length;

if (process.argv.includes('--write')) {
  const asset = {
    schema: 'badgeReaderCalibration@1',
    note: 'P(label right | features) = sigmoid(bias + priorShift + sum weights_j * features_j) per reader (features: digits/badgeReaderCalibration.ts); priorShift moves the 1:1 training odds (one hard negative per badge) to the out-of-course odds of a top read being right, (right + 1) / (wrong + 1); a reader reads when P >= pStar. Fitted by scripts/badge-calibration.mjs (toolkit) on out-of-course dev scores (templates re-baked without the scored course), with one hard negative per badge (the best label once the true one is removed). The provider never trains at run time.',
    costWrong: COST_WRONG, pStar: P_STAR, rule: 'read iff (1 - P) * costWrong < 1: one wrong label costs costWrong abstentions',
    readers: shipped
  };
  writeFileSync(CAL_PATH, JSON.stringify(asset, null, '\t') + '\n');
}
const out = process.argv.includes('--report') ? process.argv[process.argv.indexOf('--report') + 1] : null;
if (out) writeFileSync(out, JSON.stringify(report, null, 1));
for (const [reader, d] of Object.entries(diagnosis)) {
  console.log(`\ndiagnosis ${reader}:`);
  for (const [g, v] of Object.entries(d)) console.log(`  ${g.padEnd(17)} n ${v.n} top right ${v.topRight} | ${v.features.join(' | ')} | read under real-only model ${v.readUnderRealOnlyModel}`);
}
for (const reader of READERS) {
  const R = report.readers[reader];
  console.log(`\n${reader}: weights ${R.shipped.weights.map(r3).join(', ')} bias ${r3(R.shipped.bias)} prior shift ${r3(R.shipped.priorShift)}; out-of-course max impostor P ${R.maxImpostorP}, min right-top P ${R.minRightTopP}; reliability ${R.reliability.map((b) => `${b.bin}: n ${b.n} P ${b.meanP} obs ${b.observed}`).join(' | ')}`);
  for (const t of Object.values(R.table)) console.log(`  ${t.course.padEnd(19)} ${t.badges} | fixed ${t.fixed.read}/${t.fixed.abstained}/${t.fixed.wrong} | learned ${t.learned.read}/${t.learned.abstained}/${t.learned.wrong} | +bijection ${t.bijection.read}/${t.bijection.abstained}/${t.bijection.wrong} | P med ${t.pMedian} min ${t.pMin}${t.filled.length ? ` | filled ${t.filled.map((f) => `${f.truth}->${f.assigned}(top ${f.top})`).join(' ')}` : ''}${t.conflicts ? ` | conflicts ${t.conflicts}` : ''}${t.overrides ? ` | OVERRIDES ${t.overrides}` : ''}`);
}
