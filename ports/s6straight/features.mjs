#!/usr/bin/env node
/**
 * The S6 feature-space map (Sam, 2026-10-18: "you're trying to enumerate harnessable signal and understand the feature
 * space"). For one attempt it produces tk.s6.pairFeatures and, per feature column, shows where Sam's straight holes, Sam's
 * bent holes and every other candidate pair sit:
 *
 *   node ports/s6straight/features.mjs --specimen golden --attempt ATTEMPT_ID [--out DIR]
 *
 * Writes <out> (default attempts/stages/<id>/fork/stage-output/s6straight/features-<ISO time>/):
 *   features.report.json   per feature: unit, per group (Sam straight true pair, Sam bent true pair, other candidates of the
 *                          judged holes) n / median / min / max / values, the separation of straight from bent (median gap,
 *                          AUC, overlap count), and every length also normalised by R1 (the C1 ring radius of this image)
 *   features.render.svg    (+ .png when ImageMagick is present) one strip per feature: the values of Sam's straight holes
 *                          (green), Sam's bent holes (red) at their true pair, and the other candidates (grey), hole numbers
 *                          labelled, medians ticked; the axis spans the true pairs, a candidate outside it sits at the edge
 *   instrumentation.json   the store's profile (the scoring Calculations' time, per family)
 * and prints the separation table. Testimony is optional and impeachable: this reports where its holes fall, never
 * acceptance. The true pair of an annotated hole = the pair whose tee is within 8 px of Sam's tee for that hole and whose
 * basket is within 12 px of his basket (the one match rule per kind, AGENTS.md).
 *
 * Definitions (all per course):
 *   AUC      the probability that a Sam-straight value exceeds a Sam-bent value (ties count half): 0.5 = no separation,
 *            1 or 0 = every straight above or below every bent
 *   overlap  the number of true-pair values (straight and bent) inside the intersection of the two groups' [min, max]
 *            ranges: 0 = perfectly separable by one threshold
 *   R1       px, the C1 ring radius of this image (tk.s6.pathMask r1Px); a length divided by it is scale-free (LOCAL -> GLOBAL check)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { profileSummary } from '../../fg/profile.mjs';
import { canonicalJson } from '../../fg/canon.mjs';
import { loadS6Inputs, buildS6Store } from './run.mjs';
import { HOLE_STRAIGHT_SLOT } from './holeStraight.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const r3 = (v) => (v == null ? null : Math.round(v * 1000) / 1000);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const GROUPS = Object.freeze(['straight', 'bent', 'other']);

const groupStats = (items) => {
  const v = items.map((x) => x.value);
  return { n: v.length, median: r3(median(v)), min: v.length ? r3(Math.min(...v)) : null, max: v.length ? r3(Math.max(...v)) : null, items: items.map((x) => ({ hole: x.hole, value: r3(x.value) })) };
};

/** Straight vs bent: the median gap, AUC and the overlap count (definitions above). */
export function separation(straight, bent) {
  const S = straight.map((x) => x.value), B = bent.map((x) => x.value);
  if (!S.length || !B.length) return { medianGap: null, auc: null, overlapCount: null, note: !S.length ? 'no Sam-straight true pair has this feature' : 'no Sam-bent true pair has this feature' };
  let win = 0; for (const s of S) for (const b of B) win += s > b ? 1 : s === b ? 0.5 : 0;
  const lo = Math.max(Math.min(...S), Math.min(...B)), hi = Math.min(Math.max(...S), Math.max(...B));
  const overlapCount = lo > hi ? 0 : [...S, ...B].filter((v) => v >= lo && v <= hi).length;
  return { medianGap: r3(median(S) - median(B)), auc: r3(win / (S.length * B.length)), overlapCount };
}

/** The columns of the table that are numbers per row (not vectors, not conditions). */
export const scalarColumns = (table) => Object.keys(table.columns).filter((c) => table.rows.some((r) => typeof r[c] === 'number'));

/** Which table rows are Sam's true pairs. Returns { truth: Map(rowKey -> { hole, bent }), judgedHoles: Set(holeId), missing: [...] }. */
export function truePairs(table, testimony) {
  const truth = new Map(), judged = new Map(), missing = [];
  for (const h of table.holes.filter((x) => x.pair)) {
    const t = testimony.holes.find((x) => String(x.hole) === String(h.pair.hole));
    if (!t || dist(h.pair.tee.center, t.tee) > HOLE_STRAIGHT_SLOT.teeMatchPx) continue;
    judged.set(h.id, { hole: String(t.hole), bent: t.bent });
    const k = table.baskets.map((b) => ({ b, e: dist(b.point, t.basket) })).filter((x) => x.e <= HOLE_STRAIGHT_SLOT.basketMatchPx).sort((a, b) => a.e - b.e)[0];
    if (k) truth.set(`${h.id}|${k.b.index}`, { hole: String(t.hole), bent: t.bent }); else missing.push({ hole: String(t.hole), bent: t.bent, why: `no S2/S4 basket within ${HOLE_STRAIGHT_SLOT.basketMatchPx} px of Sam's basket` });
  }
  return { truth, judged, missing };
}

export function featureReport(table, testimony, r1Px) {
  const { truth, judged, missing } = testimony ? truePairs(table, testimony) : { truth: new Map(), judged: new Map(), missing: [] };
  const features = scalarColumns(table).map((c) => {
    const items = { straight: [], bent: [], other: [] };
    for (const r of table.rows) {
      if (typeof r[c] !== 'number') continue;
      const t = truth.get(`${r.hole}|${r.basket}`);
      if (t) items[t.bent ? 'bent' : 'straight'].push({ hole: t.hole, value: r[c] });
      else if (judged.has(r.hole)) items.other.push({ hole: judged.get(r.hole).hole, value: r[c] });
    }
    const unit = table.columns[c].unit, isLength = unit.startsWith('px');
    const g = Object.fromEntries(GROUPS.map((k) => [k, groupStats(items[k])]));
    const sep = separation(items.straight, items.bent);
    const normalised = isLength && r1Px ? { r1Px: r3(r1Px), straightMedianOfR1: r3(g.straight.median / r1Px), bentMedianOfR1: r3(g.bent.median / r1Px), otherMedianOfR1: r3(g.other.median / r1Px), medianGapOfR1: sep.medianGap == null ? null : r3(sep.medianGap / r1Px) } : null;
    return { feature: c, family: table.columns[c].family, unit, isLength, groups: g, separation: sep, normalised };
  });
  return { schema: 'nctk-s6-feature-report@1', r1Px: r3(r1Px), pairsCount: table.rows.length, holesCount: table.holes.length, basketsCount: table.baskets.length,
    samStraightCount: [...truth.values()].filter((t) => !t.bent).length, samBentCount: [...truth.values()].filter((t) => t.bent).length, samMissingTruePair: missing, features };
}

// ------------------------------------------------------------------ the render

const COL = Object.freeze({ straight: '#1b9e77', bent: '#d95f02', other: '#9a9a9a', ink: '#222', rule: '#ddd', bg: '#fff' });
export function featureSvg(report, { title, note }) {
  const left = 330, right = 40, plotW = 760, rowH = 54, top = 92, W = left + plotW + right;
  const feats = report.features.filter((f) => f.groups.straight.n + f.groups.bent.n > 0);
  const H = top + feats.length * rowH + 20;
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Helvetica, Arial, sans-serif">`, `<rect width="${W}" height="${H}" fill="${COL.bg}"/>`,
    `<text x="12" y="22" font-size="16" font-weight="bold" fill="${COL.ink}">${esc(title)}</text>`, `<text x="12" y="40" font-size="11" fill="${COL.ink}">${esc(note)}</text>`];
  const key = [[COL.straight, `Sam straight hole, true pair (${report.samStraightCount})`], [COL.bent, `Sam bent hole, true pair (${report.samBentCount})`], [COL.other, 'other candidates of the judged holes (a candidate outside the axis sits at its edge)']];
  let lx = 16; key.forEach(([c, t]) => { out.push(`<circle cx="${lx + 5}" cy="58" r="5" fill="${c}"/>`, `<text x="${lx + 14}" y="62" font-size="11" fill="${COL.ink}">${esc(t)}</text>`); lx += 14 + t.length * 5.6 + 24; });
  out.push(`<text x="12" y="80" font-size="10" fill="#555">one strip per feature (raw column of tk.s6.pairFeatures, its unit under the name); medians ticked; AUC = P(straight value &gt; bent value); overlap = true-pair values in the shared range of both groups</text>`);
  feats.forEach((f, i) => {
    const y0 = top + i * rowH, cy = y0 + 30, g = f.groups, tv = [...g.straight.items, ...g.bent.items].map((x) => x.value);
    let lo = Math.min(...tv), hi = Math.max(...tv); if (hi - lo < 1e-9) { lo -= 0.5; hi += 0.5; } const pad = (hi - lo) * 0.06; lo -= pad; hi += pad;
    const X = (v) => left + ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * plotW;
    out.push(`<line x1="${left}" y1="${y0 + 4}" x2="${left + plotW}" y2="${y0 + 4}" stroke="${COL.rule}"/>`,
      `<text x="12" y="${y0 + 20}" font-size="12" font-weight="bold" fill="${COL.ink}">${esc(f.feature)}</text>`, `<text x="12" y="${y0 + 33}" font-size="9" fill="#555">${esc(f.unit.slice(0, 62))}</text>`,
      `<text x="12" y="${y0 + 46}" font-size="10" fill="${COL.ink}">AUC ${f.separation.auc ?? '-'}  overlap ${f.separation.overlapCount ?? '-'}  median gap ${f.separation.medianGap ?? '-'}${f.normalised ? ` (${f.normalised.medianGapOfR1} R1)` : ''}</text>`,
      `<line x1="${left}" y1="${cy}" x2="${left + plotW}" y2="${cy}" stroke="${COL.rule}"/>`,
      `<text x="${left}" y="${y0 + 14}" font-size="9" fill="#555">${esc(r3(lo))}</text>`, `<text x="${left + plotW}" y="${y0 + 14}" font-size="9" fill="#555" text-anchor="end">${esc(r3(hi))}</text>`);
    for (const [k, lane] of [['other', 0], ['straight', -9], ['bent', 9]]) {
      const items = g[k].items; if (k === 'other') items.forEach((it) => { const clipped = it.value < lo || it.value > hi; out.push(`<circle cx="${X(it.value)}" cy="${cy + ((Math.abs(Math.round(it.value * 977)) % 9) - 4)}" r="1.8" fill="${COL.other}" fill-opacity="${clipped ? 0.9 : 0.45}"${clipped ? ` stroke="#333" stroke-width="0.5"` : ''}/>`); });
      else items.forEach((it, j) => { const x = X(it.value); out.push(`<circle cx="${x}" cy="${cy + lane}" r="4.5" fill="${COL[k]}" fill-opacity="0.85"/>`, `<text x="${x}" y="${cy + lane + (k === 'straight' ? -7 : 15)}" font-size="8" text-anchor="middle" fill="${COL[k]}">${esc(it.hole)}</text>`); });
      if (k !== 'other' && g[k].median != null) out.push(`<line x1="${X(g[k].median)}" y1="${cy + lane - 9}" x2="${X(g[k].median)}" y2="${cy + lane + 9}" stroke="${COL[k]}" stroke-width="2.5"/>`);
    }
  });
  out.push('</svg>');
  return out.join('\n');
}

// ------------------------------------------------------------------ the run

export async function runFeatureReport({ attempt, specimen, outDir = null, root = ROOT }) {
  const loaded = loadS6Inputs({ attempt, specimen, root });
  const out = outDir ?? join(loaded.out, 's6straight', `features-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  const { store, instrumentation } = buildS6Store({ loaded, attempt, specimen, root });
  const table = store.get('tk.s6.pairFeatures'), r1Px = store.get('tk.s6.pathMask')?.r1Px ?? null;
  const T = loaded.values['testimony.source.holes'], testimony = T.path ? T : null;
  const report = { specimen, attempt, testimony: testimony ? { path: T.path, rule: T.rule, complete: T.complete } : null, ...featureReport(table, testimony, r1Px),
    course: { hallwayWidthPx: table.header.course.hallwayWidthPx, padLengthPx: table.header.course.padLengthPx, alpha: table.header.alpha } };
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'features.report.json'), canonicalJson(report) + '\n');
  const doc = instrumentation();
  writeFileSync(join(out, 'instrumentation.json'), JSON.stringify(doc) + '\n');
  const svgPath = join(out, 'features.render.svg'), pngPath = join(out, 'features.render.png');
  writeFileSync(svgPath, featureSvg(report, { title: `${specimen} S6 feature space: Sam's straight vs bent holes, true pair vs other candidates`, note: `attempt ${attempt}; ${report.pairsCount} candidate pairs (${report.holesCount} holes x ${report.basketsCount} baskets); R1 ${report.r1Px} px; ${testimony ? `testimony ${T.path}` : 'no testimony: blind'}` }));
  const conv = spawnSync('convert', [svgPath, pngPath], { encoding: 'utf8' });
  return { out, report, profile: profileSummary(doc), svg: svgPath, png: conv.status === 0 && existsSync(pngPath) ? pngPath : null };
}

export function printReport(report) {
  const f = (v) => (v == null ? '-' : String(v)), pad = (s, n) => String(s).padEnd(n), rpad = (s, n) => String(s).padStart(n);
  console.log(`\n${report.specimen}: ${report.pairsCount} candidate pairs, R1 ${f(report.r1Px)} px; Sam straight ${report.samStraightCount} / bent ${report.samBentCount} true pairs${report.samMissingTruePair.length ? `; no candidate basket for Sam's hole(s) ${report.samMissingTruePair.map((m) => m.hole).join(', ')}` : ''}`);
  if (!report.testimony) { console.log('  no testimony: nothing to separate'); return; }
  console.log(`  ${pad('feature', 44)}${rpad('straight med', 13)}${rpad('bent med', 10)}${rpad('other med', 10)}${rpad('AUC', 7)}${rpad('overlap', 8)}${rpad('gap/R1', 8)}   unit`);
  for (const x of report.features.filter((y) => y.groups.straight.n + y.groups.bent.n > 0)) {
    const g = x.groups;
    console.log(`  ${pad(x.feature, 44)}${rpad(`${f(g.straight.median)} [${g.straight.n}]`, 13)}${rpad(`${f(g.bent.median)} [${g.bent.n}]`, 10)}${rpad(f(g.other.median), 10)}${rpad(f(x.separation.auc), 7)}${rpad(f(x.separation.overlapCount), 8)}${rpad(f(x.normalised?.medianGapOfR1), 8)}   ${x.unit.split(' (')[0]}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
  if (!args.attempt || !args.specimen) { console.error('usage: node ports/s6straight/features.mjs --specimen golden --attempt ATTEMPT_ID [--out DIR]'); process.exit(2); }
  const r = await runFeatureReport({ attempt: args.attempt, specimen: args.specimen, outDir: args.out ?? null });
  printReport(r.report);
  console.log(`\nreport ${join(r.out, 'features.report.json')}\nrender ${r.png ?? r.svg}`);
  console.log(r.profile.slice(0, 6).map((p) => `${p.calculation}: ${p.calls}x ${p.totalMs} ms`).join('\n'));
}
