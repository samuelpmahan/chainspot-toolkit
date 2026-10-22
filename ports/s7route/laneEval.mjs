#!/usr/bin/env node
/**
 * Does the lane cross-check flag real errors? (node-only; judging, outside the store). Runs ports/s7route/laneRun.mjs on every
 * course given, then per variant (four-lane, three-lane):
 *   dev (testimony)  the S7 default's route per hole judged against Sam's corridors (ports/s7trace/judgeBends.mjs: basket 12 px,
 *                    within W / 2 of his corridor; agreement, never acceptance), crossed with the cross-check's verdict:
 *                    of the flagged holes, how many does the default have wrong vs right; of the wrong ones, how many flagged
 *   validation       no testimony. Labels: the known calls (KNOWN below, docs/evidence/validation-s7/) and the ground-truth-free
 *                    cross-view check (a Full / Lazy view's default route length in R1 within 15 % of the same hole in the
 *                    course's Capture view; R1 is scale-free across the views)
 * Flags: 'basket' = the tracker entered another basket's C1 (basket-differs); 'transit' = the tee -> badge segment crosses a
 * basket (a skeleton contradiction: the tee's badge association); 'basketOrTransit'; 'any' = any verdict but agree.
 *   node ports/s7route/laneEval.mjs --courses FILE [--out DIR] [--attempts-root DIR]
 * FILE: lines `<specimen> <attempt>` (docs/evidence/dev-s1s4/ATTEMPTS, or a validation attempts list).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runLaneCrosscheck } from './laneRun.mjs';
import { judgeHoleTraces } from '../s7trace/judgeBends.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
/** The known calls on the validation views (docs/evidence/validation-s7/rerun-2026-10-21.md, sam-2026-10-21.md). */
export const KNOWN = Object.freeze({
  seatacFull: { wrong: { 16: 'the S7 default goes 5 bends to another basket, 1037 ft vs 368 ft in seatacCapture', 10: 'swapped with 11 (old and new)', 11: 'swapped with 10 (old and new)' } },
  beaverranchCapture: { right: { 4: 'Sam: Beaver 4/19 switched baskets (old); now right', 19: 'Sam: Beaver 4/19 (old); now right' } },
  coletocreekFull: { right: { 10: 'Sam: Colette 10/11 switch (old); now right', 11: 'Sam: 10/11 (old); now right', 18: 'Sam: 18 misses bends (old); now right' } },
  seatacCapture: { right: { 19: 'Sam: SeaTac H19 missing + misplaced bend (old); now right' } }
});
const VARIANTS = ['fourLane', 'threeLane'];
const flagged = (r, kind) => (kind === 'basket' ? r.verdict === 'basket-differs' : kind === 'transit' ? r.transitCrosses.length > 0
  : kind === 'basketOrTransit' ? r.verdict === 'basket-differs' || r.transitCrosses.length > 0 : r.verdict !== 'agree' && r.verdict !== 'no-default');
const KINDS = ['basket', 'transit', 'basketOrTransit', 'any'];

/** Per dev course: the default's route judged against Sam's corridors; -> { [hole]: { ok, why } } for judged holes. */
function judgeDefault(rows, holePaths, widthPx) {
  const traces = rows.map((r) => ({ hole: r.hole, path: r.defaultPath, status: r.defaultPath.length ? 'reached' : 'not traced', end: r.defaultPath.length ? { point: r.defaultPath.at(-1) } : null, bends: r.defaultPath.slice(1, -1) }));
  const j = judgeHoleTraces(traces, holePaths, { widthPx });
  return Object.fromEntries(j.rows.filter((x) => x.judged).map((x) => [x.hole, { ok: x.ok, why: x.why }]));
}
/** The tracker's own basket against Sam's (12 px), when it reached one. */
function judgeTrack(rows, holePaths) {
  const out = {};
  for (const r of rows) {
    const p = (holePaths.holes ?? []).find((x) => String(x.hole) === r.hole);
    if (!p?.basket || r.trackStop !== 'basket') continue;
    const e = r.trackPath.at(-1); out[r.hole] = Math.hypot(e[0] - p.basket[0], e[1] - p.basket[1]) < 12;
  }
  return out;
}

export function evaluate(results) {
  const courses = [];
  const byName = Object.fromEntries(results.map((r) => [r.specimen, r]));
  for (const res of results) {
    const x = res.crosscheck, label = {};
    let source = null;
    if (res.holePaths?.path) {   // dev: testimony
      const j = judgeDefault(x.variants.fourLane.rows, res.holePaths, x.widthPx);
      for (const [h, v] of Object.entries(j)) label[h] = { wrong: !v.ok, why: v.why, by: 'testimony' };
      source = 'testimony';
    } else {
      const capture = res.specimen.replace(/(Full|Lazy)$/, 'Capture');
      if (capture !== res.specimen && byName[capture]) {   // cross-view: route length in R1 vs the capture view's
        const cap = Object.fromEntries(byName[capture].crosscheck.variants.fourLane.rows.map((r) => [r.hole, r.defaultLengthR1]));
        for (const r of x.variants.fourLane.rows) { const a = r.defaultLengthR1, b = cap[r.hole]; if (a > 0 && b > 0) label[r.hole] = { wrong: Math.abs(a - b) / b > 0.15, why: `cross-view: ${a} R1 here vs ${b} R1 in ${capture}`, by: 'cross-view' }; }
        source = `cross-view vs ${capture}`;
      }
      for (const [h, why] of Object.entries(KNOWN[res.specimen]?.wrong ?? {})) label[h] = { wrong: true, why, by: 'known' };
      for (const [h, why] of Object.entries(KNOWN[res.specimen]?.right ?? {})) label[h] = { wrong: false, why, by: 'known' };
      if (!source && Object.keys(label).length) source = 'known calls';
    }
    const variants = {};
    for (const v of VARIANTS) {
      const rows = x.variants[v].rows, tj = res.holePaths?.path ? judgeTrack(rows, res.holePaths) : {};
      const cells = (kind) => {
        const L = rows.filter((r) => label[r.hole]), F = L.filter((r) => flagged(r, kind)), W = L.filter((r) => label[r.hole].wrong);
        return { labelled: L.length, wrong: W.length, flagged: F.length, flaggedWrong: F.filter((r) => label[r.hole].wrong).length, flaggedRight: F.filter((r) => !label[r.hole].wrong).length, wrongFlagged: W.filter((r) => flagged(r, kind)).length };
      };
      variants[v] = { totals: x.variants[v].totals, timeMs: res.timingsMs[v], ...Object.fromEntries(KINDS.map((k) => [k, cells(k)])),
        trackerAtSamsBasket: Object.keys(tj).length ? `${Object.values(tj).filter(Boolean).length}/${Object.keys(tj).length}` : null,
        rows: rows.map((r) => ({ hole: r.hole, verdict: r.verdict, trackStop: r.trackStop, trackBasket: r.trackBasket, defaultBasket: r.defaultBasket, lateralW: r.lateralW, transitCrosses: r.transitCrosses, label: label[r.hole] ?? null, trackerAtSamsBasket: tj[r.hole] ?? null })) };
    }
    courses.push({ specimen: res.specimen, attempt: res.attempt, widthPx: x.widthPx, R1Px: x.R1Px, labels: source, defaultMs: res.timingsMs.defaultRouteMatch, variants, renders: res.renders });
  }
  const sum = (set, v, kind) => { const c = set.map((x) => x.variants[v][kind]); const s = (k) => c.reduce((a, b) => a + b[k], 0); return { labelled: s('labelled'), wrong: s('wrong'), flagged: s('flagged'), flaggedWrong: s('flaggedWrong'), flaggedRight: s('flaggedRight'), wrongFlagged: s('wrongFlagged') }; };
  const totals = Object.fromEntries(VARIANTS.map((v) => [v, { ...Object.fromEntries(KINDS.map((k) => [k, sum(courses, v, k)])), timeMs: courses.reduce((a, c) => a + (c.variants[v].timeMs ?? 0), 0) }]));
  return { courses, totals };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
  const list = arg('--courses'), out = arg('--out') ?? join(ROOT, 'attempts', 's7lanes', `eval-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  if (!list) { console.error('usage: node ports/s7route/laneEval.mjs --courses FILE [--out DIR] [--attempts-root DIR]'); process.exit(2); }
  const pairs = readFileSync(list, 'utf8').split('\n').map((l) => l.trim().split(/\s+/)).filter((p) => p.length === 2 && !p[0].startsWith('#'));
  mkdirSync(out, { recursive: true });
  const results = pairs.map(([specimen, attempt]) => {
    const r = runLaneCrosscheck({ specimen, attempt, attemptsRoot: arg('--attempts-root') ?? ROOT, outDir: join(out, specimen), cas: false });
    console.error(`${specimen}: four-lane ${r.timingsMs.fourLane} ms, three-lane ${r.timingsMs.threeLane} ms; flagged ${r.crosscheck.variants.fourLane.totals.flagged} / ${r.crosscheck.variants.threeLane.totals.flagged}`);
    return { specimen, attempt, ...r };
  });
  const e = evaluate(results);
  writeFileSync(join(out, 'lane-eval.json'), JSON.stringify(e, null, 1) + '\n');
  const fmt = (c) => `${c.flaggedWrong} wrong / ${c.flaggedRight} right of ${c.flagged} flagged; ${c.wrongFlagged} of ${c.wrong} wrong flagged`;
  for (const c of e.courses) console.log(`${c.specimen} (W ${c.widthPx} px, R1 ${c.R1Px} px; labels: ${c.labels ?? 'none'}): ` + VARIANTS.map((v) => { const x = c.variants[v]; return `${v} ${x.timeMs} ms, agree ${x.totals.agree}/${x.totals.holes}, basket-differs ${x.totals.basketDiffers}, no-basket ${x.totals.noBasket}, route-differs ${x.totals.routeDiffers}${x.trackerAtSamsBasket ? `, tracker at Sam's basket ${x.trackerAtSamsBasket}` : ''}; any-flag ${fmt(x.any)}`; }).join(' | '));
  for (const v of VARIANTS) console.log(`TOTAL ${v}: ${KINDS.map((k) => `${k}-flag ${fmt(e.totals[v][k])}`).join('; ')}; ${e.totals[v].timeMs} ms`);
  console.log(join(out, 'lane-eval.json'));
}
