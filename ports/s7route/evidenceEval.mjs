#!/usr/bin/env node
/**
 * Judging the S7 evidence (node-only; outside the store, it reads testimony). Three commands:
 *
 *   collect --specimen S --attempt ID --dir DIR [--weights FILE]
 *       ports/s7route/evidenceRun.mjs on one course: tk.s7.cellEvidence and its renders under DIR/S/, and DIR/S/summary.json:
 *       the table, Sam's basket per hole (testimony, BasketPoint within 12 px: judging only), both rule sets' ends, route lengths
 *       (R1) and judged totals, the timings. --weights: the evidence sibling run with those weights (a LOCO fold's).
 *   train --dir DIR [--courses golden,heritage,townelake,lenard,alex] [--features a,b] [--l2 X]
 *       the feature set and L2 penalty chosen on the dev testimony alone (SELECTION: the lowest leave-one-course-out held-out log
 *       loss), the logistic fitted leave-one-course-out (cells of the default's neighbourhoods, y = Sam's basket),
 *       each held-out course's picks by the evidence ranking vs the default's vs Sam's; then the fit on all of them (the weights
 *       EVIDENCE_WEIGHTS carries). Writes DIR/train.json.
 *   validate --dir DIR
 *       the validation views (no testimony): Sam's calls and the cross-view labels (laneEval.mjs KNOWN; a Full / Lazy view's route
 *       length in R1 within 15 % of the Capture view's), for the default and the evidence sibling. Writes DIR/validate.json.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runEvidence, EVIDENCE_VARIANT } from './evidenceRun.mjs';
import { samBasketsOf } from './routeSpace.mjs';
import { S7_DEFAULT } from './match.mjs';
import { FEATURES, EVIDENCE_WEIGHTS, zOf, logSigmoid } from './evidenceSpace.mjs';
import { fitLogistic, picksOf, top1Of } from './evidenceModel.mjs';
import { KNOWN } from './laneEval.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
export const DEV_TESTIMONY = Object.freeze(['golden', 'heritage', 'townelake', 'lenard', 'alex']);
const lengthR1 = (V, R1) => (V?.length > 1 ? Math.round(V.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - V[i][0], p[1] - V[i][1]), 0) / R1 * 100) / 100 : null);
const T = (j) => (j ? { agree: j.totals.agree, judged: j.totals.judged, bendsHit: j.totals.bendsHit, bendsMissed: j.totals.bendsMissed, extraBends: j.totals.extraBends, notAgreeing: j.totals.notAgreeing } : null);

export function collect({ specimen, attempt, dir, weights = null, attemptsRoot = ROOT }) {
  const out = join(dir, specimen);
  // no persistent cache (the evidence Parts hold planes; the disk is the limit) and only the changed holes' crops written
  const r = runEvidence({ specimen, attempt, attemptsRoot, outDir: out, weights, cas: false, renders: 'changed' });
  const table = r.evidence, sam = samBasketsOf(r.holePaths, table.baskets.map((b) => b.point));
  const holes = (s) => Object.fromEntries(Object.entries(s.solve.holes).map(([h, v]) => [h, { end: v.end, bends: Math.max(0, (v.verts?.length ?? 2) - 2), lengthR1: lengthR1(v.verts, table.R1Px), verts: v.verts }]));
  const summary = { specimen, attempt, R1Px: table.R1Px, widthPx: table.widthPx, weights: weights ?? EVIDENCE_WEIGHTS, labels: Object.fromEntries(Object.entries(sam.byHole).map(([h, v]) => [h, v.basket])),
    default: { holes: holes(r.base), judged: T(r.base.judged) }, sibling: { holes: holes(r.sibling), judged: T(r.sibling.judged) }, timingsMs: r.timingsMs, emits: table.emits, renders: r.renders,
    table: { ...table, rows: table.rows.map((x) => (x.cells ? { ...x, cells: x.cells.map(({ route, ...c }) => c), tracks: undefined } : x)), backTracks: undefined } };
  writeFileSync(join(out, 'summary.json'), JSON.stringify(summary) + '\n');
  return summary;
}

const load = (dir) => Object.fromEntries(readdirSync(dir).filter((d) => existsSync(join(dir, d, 'summary.json'))).map((d) => [d, JSON.parse(readFileSync(join(dir, d, 'summary.json'), 'utf8'))]));
const cellRows = (s) => s.table.rows.flatMap((r) => (r.cells ?? []).filter(() => s.labels[r.hole] !== undefined && s.labels[r.hole] !== null).map((c) => ({ readings: c.readings, y: c.k === s.labels[r.hole], hole: r.hole, k: c.k })));
/** Per course: picks of the default and of the evidence ranking against Sam's basket (holes with a label). */
function picksTally(s, weights) {
  const ev = picksOf(s.table, weights), rows = [];
  for (const r of s.table.rows) {
    const lab = s.labels[r.hole]; if (lab === undefined || lab === null) continue;
    const d = s.default.holes[r.hole]?.end ?? null, e = r.claimed !== undefined ? r.claimed : ev[r.hole];
    rows.push({ hole: r.hole, sam: lab, default: d, evidence: e, claimed: r.claimed !== undefined, candidates: r.cells?.length ?? 0, samAmongCandidates: r.claimed !== undefined || (r.cells ?? []).some((c) => c.k === lab) });
  }
  return { holes: rows.length, defaultRight: rows.filter((x) => x.default === x.sam).length, evidenceRight: rows.filter((x) => x.evidence === x.sam).length, changed: rows.filter((x) => x.default !== x.evidence).map((x) => `${x.hole}: ${x.default} -> ${x.evidence} (Sam ${x.sam})`), bent: rows.filter((x) => !x.claimed).length, samAmongCandidates: rows.filter((x) => x.samAmongCandidates).length };
}

/**
 * The candidate feature sets and penalties the dev selection compares (stated before the fit): every perspective; without the
 * route-level sensors that re-read the backbone's route (edge, region, B*); the backbone with the meeting only; the tracks (the
 * backbone, the forward lanes, basket backwards by the follower, the meeting); the backbone alone.
 */
export const SELECTION = Object.freeze({
  sets: Object.freeze({ all: FEATURES, noSensors: ['backbone', 'laneFwd', 'followFwd', 'laneBack', 'followBack', 'meet'], backboneMeet: ['backbone', 'meet'], tracks: ['backbone', 'laneFwd', 'followBack', 'meet'], backbone: ['backbone'] }),
  l2: Object.freeze([0.3, 1, 3])
});
const heldOutLogLoss = (all, dev, features, l2) => {
  let ll = 0, n = 0;
  for (const held of dev) {
    const w = fitLogistic(dev.filter((c) => c !== held).flatMap((c) => cellRows(all[c])), { features, l2 });
    for (const r of cellRows(all[held])) { const z = zOf(r.readings, w); ll -= r.y ? logSigmoid(z) : logSigmoid(-z); n++; }
  }
  return { logLoss: n ? ll / n : null, cells: n };
};
/** Model selection on the dev testimony only: the feature set and penalty with the lowest leave-one-course-out held-out log loss. */
export function selectModel(all, dev) {
  const grid = [];
  for (const [name, features] of Object.entries(SELECTION.sets)) for (const l2 of SELECTION.l2) grid.push({ name, features, l2, ...heldOutLogLoss(all, dev, features, l2) });
  grid.sort((a, b) => a.logLoss - b.logLoss);
  return { best: grid[0], grid: grid.map((g) => ({ set: g.name, l2: g.l2, heldOutLogLoss: Math.round(g.logLoss * 10000) / 10000, cells: g.cells })) };
}

export function train(dir, courses = DEV_TESTIMONY, { l2: l2Given, features: fGiven } = {}) {
  const all = load(dir), dev = courses.filter((c) => all[c]);
  const sel = selectModel(all, dev), features = fGiven ?? sel.best.features, l2 = l2Given ?? sel.best.l2;
  const folds = dev.map((held) => {
    const rows = dev.filter((c) => c !== held).flatMap((c) => cellRows(all[c])), w = fitLogistic(rows, { features, l2 });
    const s = all[held], lab = (h) => s.labels[h];
    return { held, trainCells: rows.length, weights: w, picks: picksTally(s, w), cellTop1: top1Of(s.table, w, lab), backboneOnlyTop1: top1Of(s.table, { bias: 0, backbone: 1 }, lab) };
  });
  const full = fitLogistic(dev.flatMap((c) => cellRows(all[c])), { features, l2 });
  const allFeatures = fitLogistic(dev.flatMap((c) => cellRows(all[c])), { features: FEATURES, l2 });
  const sum = (k) => folds.reduce((a, f) => a + f.picks[k], 0);
  const result = { selection: sel.grid, features, l2, allFeatures, folds, loco: { holes: sum('holes'), defaultRight: sum('defaultRight'), evidenceRight: sum('evidenceRight'), bentHoles: sum('bent'), cellTop1: folds.reduce((a, f) => a + f.cellTop1.top1, 0), cellHoles: folds.reduce((a, f) => a + f.cellTop1.holes, 0), backboneTop1: folds.reduce((a, f) => a + f.backboneOnlyTop1.top1, 0) }, full,
    fullPicks: Object.fromEntries(Object.entries(all).map(([c, s]) => [c, picksTally(s, full)])) };
  writeFileSync(join(dir, 'train.json'), JSON.stringify(result, null, 1) + '\n');
  return result;
}

/** The cross-view labels and Sam's calls on the validation views, for one solve per view (key: 'default' or 'sibling'). */
export function crossView(all, key) {
  const rows = [];
  for (const [view, s] of Object.entries(all)) {
    const cap = view.replace(/(Full|Lazy)$/, 'Capture');
    if (cap === view || !all[cap]) continue;
    for (const [h, v] of Object.entries(s[key].holes)) { const b = all[cap][key].holes[h]; if (v.lengthR1 > 0 && b?.lengthR1 > 0) rows.push({ view, hole: h, here: v.lengthR1, capture: b.lengthR1, agree: Math.abs(v.lengthR1 - b.lengthR1) / b.lengthR1 <= 0.15 }); }
  }
  return { compared: rows.length, agree: rows.filter((r) => r.agree).length, disagree: rows.filter((r) => !r.agree).map((r) => `${r.view} ${r.hole}: ${r.here} vs ${r.capture} R1`) };
}
export function validate(dir) {
  const all = Object.fromEntries(Object.entries(load(dir)).filter(([, s]) => !Object.keys(s.labels).length && !DEV_TESTIMONY.includes(s.specimen) && !/^(northpark|lenard\d)$/.test(s.specimen)));
  const known = [];
  for (const [view, calls] of Object.entries(KNOWN)) for (const kind of ['right', 'wrong']) for (const [h, why] of Object.entries(calls[kind] ?? {})) {
    const s = all[view]; if (!s) continue;
    const d = s.default.holes[h], e = s.sibling.holes[h];
    known.push({ view, hole: h, call: kind, why, defaultBasket: d?.end ?? null, evidenceBasket: e?.end ?? null, same: d?.end === e?.end && JSON.stringify(d?.verts) === JSON.stringify(e?.verts), defaultR1: d?.lengthR1, evidenceR1: e?.lengthR1 });
  }
  const changed = Object.fromEntries(Object.entries(all).map(([v, s]) => [v, Object.keys(s.default.holes).filter((h) => s.default.holes[h].end !== s.sibling.holes[h]?.end).map((h) => `${h}: ${s.default.holes[h].end} -> ${s.sibling.holes[h]?.end}`)]));
  const result = { views: Object.keys(all), known, crossView: { default: crossView(all, 'default'), sibling: crossView(all, 'sibling') }, changed, timingsMs: Object.fromEntries(Object.entries(all).map(([v, s]) => [v, s.timingsMs])) };
  writeFileSync(join(dir, 'validate.json'), JSON.stringify(result, null, 1) + '\n');
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
  const cmd = process.argv[2], dir = arg('--dir');
  if (!dir || !['collect', 'train', 'validate'].includes(cmd)) { console.error('usage: node ports/s7route/evidenceEval.mjs collect|train|validate --dir DIR [...]'); process.exit(2); }
  mkdirSync(dir, { recursive: true });
  if (cmd === 'collect') {
    const s = collect({ specimen: arg('--specimen'), attempt: arg('--attempt'), dir, weights: arg('--weights') ? JSON.parse(readFileSync(arg('--weights'), 'utf8')) : null, attemptsRoot: arg('--attempts-root') ?? ROOT });
    const ch = Object.keys(s.default.holes).filter((h) => s.default.holes[h].end !== s.sibling.holes[h]?.end);
    console.log(`${s.specimen}: ${s.emits.cells} cells, ${s.emits.meets}/${s.emits.meetCells} meet; default ${s.timingsMs.default} ms, evidence ${s.timingsMs.cellEvidence} ms; ${S7_DEFAULT} ${s.default.judged ? `${s.default.judged.agree}/${s.default.judged.judged} bends ${s.default.judged.bendsHit}/${s.default.judged.bendsMissed}/${s.default.judged.extraBends}` : '-'}; ${EVIDENCE_VARIANT} ${s.sibling.judged ? `${s.sibling.judged.agree}/${s.sibling.judged.judged} bends ${s.sibling.judged.bendsHit}/${s.sibling.judged.bendsMissed}/${s.sibling.judged.extraBends}` : '-'}; changed ${ch.join(', ') || 'none'}`);
  } else if (cmd === 'train') {
    const r = train(dir, arg('--courses') ? arg('--courses').split(',') : DEV_TESTIMONY, { l2: arg('--l2') ? Number(arg('--l2')) : undefined, features: arg('--features') ? arg('--features').split(',') : undefined });
    for (const f of r.folds) console.log(`held out ${f.held}: picks right default ${f.picks.defaultRight}/${f.picks.holes}, evidence ${f.picks.evidenceRight}/${f.picks.holes}; cell top-1 ${f.cellTop1.top1}/${f.cellTop1.holes} (backbone alone ${f.backboneOnlyTop1.top1}); changed ${f.picks.changed.join('; ') || 'none'}`);
    console.log(`LOCO: ${JSON.stringify(r.loco)}`);
    console.log(`selection (dev LOCO held-out log loss): ${r.selection.map((g) => `${g.set}@${g.l2} ${g.heldOutLogLoss}`).join(', ')}`);
    console.log(`full fit, ${r.features.join(' + ')}, L2 ${r.l2} (${r.full.fit.n} cells, ${r.full.fit.positives} positive, log loss ${r.full.fit.logLoss}): ${['bias', ...r.features].map((f) => `${f} ${r.full[f].toFixed(3)}`).join(', ')}`);
    console.log(`every perspective, L2 ${r.l2}: ${['bias', ...FEATURES].map((f) => `${f} ${r.allFeatures[f].toFixed(3)}`).join(', ')}`);
  } else {
    const r = validate(dir);
    console.log(JSON.stringify({ known: r.known.map((k) => `${k.view} ${k.hole} (${k.call}): default ${k.defaultBasket}, evidence ${k.evidenceBasket}${k.same ? ' (same route)' : ''}`), crossView: { default: `${r.crossView.default.agree}/${r.crossView.default.compared}`, sibling: `${r.crossView.sibling.agree}/${r.crossView.sibling.compared}` }, changed: r.changed }, null, 1));
  }
}
