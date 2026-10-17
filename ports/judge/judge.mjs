#!/usr/bin/env node
/**
 * Judge an attempt against Sam's testimony, with named confusion counts instead of "x/y".
 *
 *   node ports/judge/judge.mjs --specimen golden --attempt ID [--json]
 *
 * Per stage it reports N found, TP / FN / FP (each NAMED: candidate -> hole), and for association
 * N associated correctly / incorrectly / not associated. Agreement only; acceptance stays Sam's.
 * FP is only judged where Sam annotated every hole (complete testimony); otherwise detections that
 * match no annotated hole are "unjudged", never counted as errors.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadTestimony } from './testimony.mjs';
import { nameCandidates } from '../../fg/names.mjs';
import { basketPoint } from '../../fg/s2/fg.s2.basketInvariants.observe.fg.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
export const MATCH_PX = Object.freeze({ basket: 12, tee: 8 });   // px: a detection IS the annotated sprite within this distance
const r2 = (v) => Math.round(v * 100) / 100;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** One-to-one match of detections to annotated points (closest pairs first) within maxPx. */
function match(dets, truth, maxPx) {
  const pairs = [];
  dets.forEach((d, i) => truth.forEach((t) => { const e = dist(d.point, t.point); if (e <= maxPx) pairs.push({ i, hole: t.hole, e }); }));
  pairs.sort((a, b) => a.e - b.e);
  const usedD = new Set(), usedT = new Set(), tp = [];
  for (const p of pairs) if (!usedD.has(p.i) && !usedT.has(p.hole)) { usedD.add(p.i); usedT.add(p.hole); tp.push(p); }
  return { tp, unmatchedDets: dets.map((d, i) => i).filter((i) => !usedD.has(i)), unmatchedTruth: truth.map((t) => t.hole).filter((h) => !usedT.has(h)) };
}

function detectionStage(kind, dets, T, truthPoint, maxPx) {
  const truth = [...T.holes.values()].map((h) => ({ hole: h.hole, point: truthPoint(h) }));
  const m = match(dets, truth, maxPx);
  const errs = m.tp.map((p) => p.e);
  return {
    found: dets.length,
    annotated: truth.length,
    TP: m.tp.length, FN: m.unmatchedTruth.length, FP: T.complete ? m.unmatchedDets.length : null, unjudged: T.complete ? 0 : m.unmatchedDets.length,
    tp: m.tp.map((p) => `${dets[p.i].name} = ${kind} ${p.hole} (${r2(p.e)} px)`),
    fn: m.unmatchedTruth.map((h) => `${kind} ${h}`),
    fp: T.complete ? m.unmatchedDets.map((i) => dets[i].name) : [],
    errorPx: errs.length ? { median: r2(errs.sort((a, b) => a - b)[Math.floor(errs.length / 2)]), max: r2(Math.max(...errs)) } : null,
    matchWithinPx: maxPx, holeOfDetection: new Map(m.tp.map((p) => [p.i, p.hole]))
  };
}

export function judgeAttempt({ specimen, attempt, root = ROOT }) {
  const T = loadTestimony(specimen, root);
  if (!T) return { specimen, attempt, testimony: null, note: 'no testimony: nothing is judged' };
  const out = join(root, 'attempts', 'stages', attempt, 'fork', 'stage-output');
  const A = join(out, 'early', 'artifacts');
  const report = { specimen, attempt, testimony: { file: T.file, annotatedHoles: T.annotated, complete: T.complete }, stages: {} };

  // S1: badges are read, not located against testimony; judge the label set Sam's hole numbers imply.
  const badges = JSON.parse(readFileSync(join(A, 's1', 'px.badges.json'), 'utf8')).badges;
  const labels = badges.map((b) => Number(b.label));
  report.stages.S1 = { found: badges.length, labelsPresent: T.annotated.filter((h) => labels.includes(h)).length, labelsMissing: T.annotated.filter((h) => !labels.includes(h)).map((h) => `Badge ${h}`),
    duplicates: [...new Set(labels.filter((l, i) => labels.indexOf(l) !== i))].map((h) => `Badge ${h}`) };

  // S2: baskets, BasketPoint vs Sam's basket points.
  const kj = JSON.parse(readFileSync(join(A, 's2', 'px.baskets.json'), 'utf8')).baskets;
  const kNames = nameCandidates('Basket', kj, (k) => basketPoint(k.bbox));
  const S2 = detectionStage('Basket', kj.map((k, i) => ({ name: kNames[i], point: basketPoint(k.bbox) })), T, (h) => h.basket, MATCH_PX.basket);
  delete S2.holeOfDetection; report.stages.S2 = S2;

  // S3: visible tees (S3 structural fix), pad centre vs Sam's tee point.
  const tf = join(A, 's3fix', 'px.tees.refined.json');
  if (existsSync(tf)) {
    const tees = JSON.parse(readFileSync(tf, 'utf8')).tees;
    const tNames = nameCandidates('Tee', tees, (t) => t.center);
    const S3 = detectionStage('Tee', tees.map((t, i) => ({ name: tNames[i], point: t.center })), T, (h) => h.tee, MATCH_PX.tee);
    const holeOfTee = S3.holeOfDetection; delete S3.holeOfDetection; report.stages.S3 = S3;
    // Why each FN: Sam marks an occluded pad at the centroid of its VISIBLE part, so test the pad's footprint, not the point:
    // if any owned sprite px (badge px + mute, basket px + shell) lies within half the pad diagonal of Sam's point, the pad is
    // (partly) hidden and S4 recovers it; otherwise it was fully visible and S3 missed it.
    const W = JSON.parse(readFileSync(join(A, 's1', 'px.badges.json'), 'utf8')).image.widthPx;
    const owned = new Set([...badges.flatMap((b) => [...b.px, ...b.mute.px]), ...kj.flatMap((k) => [...k.px, ...(k.shell?.blackPx ?? [])])]);
    const fam = join(A, 's3fix', 'px.tees.family-refined.json');
    const model = existsSync(fam) ? JSON.parse(readFileSync(fam, 'utf8')).model : null;
    const R = model ? Math.hypot(model.major.median, model.minor.median) / 2 : 15;
    const under = ([x, y]) => { for (let dy = -Math.ceil(R); dy <= R; dy++) for (let dx = -Math.ceil(R); dx <= R; dx++) if (dx * dx + dy * dy <= R * R && owned.has(Math.round(y + dy) * W + Math.round(x + dx))) return true; return false; };
    S3.fn = S3.fn.map((t) => { const h = T.holes.get(Number(t.split(' ')[1])); return `${t} (${under(h.tee) ? 'pad touches a sprite, (partly) hidden: S4' : 'fully visible: S3 missed it'})`; });

    // S3 association (ports/s3assoc): each TP tee's badge vs its true hole.
    const af = join(out, 's3assoc', 'px.tees.association.json');
    if (existsSync(af)) {
      const rows = JSON.parse(readFileSync(af, 'utf8')).rows;
      const correct = [], incorrect = [], none = [];
      rows.forEach((r, i) => {
        const truth = holeOfTee.get(i); if (truth == null) return;
        const said = r.best ? Number(r.best.badge) : null, name = tNames[i];
        if (said == null) none.push(`${name} (is Tee ${truth})`);
        else if (said === truth) correct.push(`${name} -> Badge ${said}`);
        else incorrect.push(`${name} -> Badge ${said}, is Tee ${truth}`);
      });
      report.stages.S3association = { judgedTees: correct.length + incorrect.length + none.length, associatedCorrectly: correct.length, associatedIncorrectly: incorrect.length, notAssociated: none.length,
        unjudgedTees: rows.length - (correct.length + incorrect.length + none.length), correct, incorrect, none };

      // S5 0-bend holes: the 3-point straight test vs Sam's bent/straight, and the straight basket vs Sam's basket.
      const s = { TP: [], FP: [], FN: [], TN: [], wrongBasket: [] };
      rows.forEach((r, i) => {
        const hole = holeOfTee.get(i), h = T.holes.get(hole); if (!h || !r.best || Number(r.best.badge) !== hole) return;
        const straight = r.straight3?.verdict === 'STRAIGHT';
        if (straight && !h.bent) { s.TP.push(`Hole ${hole}`); const k = kj[r.straight3.basket]; if (k && dist(basketPoint(k.bbox), h.basket) > MATCH_PX.basket) s.wrongBasket.push(`Hole ${hole} -> ${kNames[r.straight3.basket]}`); }
        else if (straight && h.bent) s.FP.push(`Hole ${hole}`);
        else if (!straight && !h.bent) s.FN.push(`Hole ${hole} (${kj.some((k) => dist(basketPoint(k.bbox), h.basket) <= MATCH_PX.basket) ? 'its basket is in S2' : 'its basket is missing from S2: S4'})`);
        else s.TN.push(`Hole ${hole}`);
      });
      report.stages.S5straight = { judgedHoles: s.TP.length + s.FP.length + s.FN.length + s.TN.length, TP: s.TP.length, FP: s.FP.length, FN: s.FN.length, TN: s.TN.length,
        straightWithWrongBasket: s.wrongBasket.length, tp: s.TP, fp: s.FP, fn: s.FN, wrongBasket: s.wrongBasket,
        note: 'TP = straight called straight; FP = bent called straight (the hallway must reject); FN = straight called bent (sent to pathfinding, safe); TN = bent called bent' };
    }
  }
  return report;
}

export function formatReport(r) {
  if (!r.testimony) return `${r.specimen}: ${r.note}`;
  const L = [`${r.specimen} (${r.attempt}); testimony ${r.testimony.file}: holes ${r.testimony.complete ? 'all 18' : r.testimony.annotatedHoles.join(', ')} annotated`];
  const s1 = r.stages.S1; L.push(`  S1 badges: ${s1.found} found; annotated hole labels present ${s1.labelsPresent}, missing [${s1.labelsMissing.join(', ')}], duplicate [${s1.duplicates.join(', ')}]`);
  for (const [k, kind] of [['S2', 'baskets'], ['S3', 'visible tees']]) {
    const s = r.stages[k]; if (!s) continue;
    L.push(`  ${k} ${kind}: ${s.found} found; TP ${s.TP} / FN ${s.FN} / FP ${s.FP ?? 'unjudged'}${s.unjudged ? ` (${s.unjudged} unjudged: hole not annotated)` : ''}; error median ${s.errorPx?.median} px, max ${s.errorPx?.max} px (match within ${s.matchWithinPx} px)`);
    if (s.fn.length) L.push(`      FN: ${s.fn.join(', ')}`);
    if (s.fp.length) L.push(`      FP: ${s.fp.join(', ')}`);
  }
  const a = r.stages.S3association;
  if (a) { L.push(`  S3 association: ${a.judgedTees} judged tees; associated correctly ${a.associatedCorrectly}, incorrectly ${a.associatedIncorrectly}, not associated ${a.notAssociated}${a.unjudgedTees ? `; ${a.unjudgedTees} tees unjudged` : ''}`);
    if (a.incorrect.length) L.push(`      incorrect: ${a.incorrect.join('; ')}`); if (a.none.length) L.push(`      not associated: ${a.none.join('; ')}`); }
  const s5 = r.stages.S5straight;
  if (s5) { L.push(`  S5 3-point straight test: ${s5.judgedHoles} judged holes; TP ${s5.TP} / FP ${s5.FP} / FN ${s5.FN} / TN ${s5.TN}; straight with wrong basket ${s5.straightWithWrongBasket}`);
    if (s5.fp.length) L.push(`      FP (bent called straight): ${s5.fp.join(', ')}`); if (s5.fn.length) L.push(`      FN (straight called bent): ${s5.fn.join(', ')}`); if (s5.wrongBasket.length) L.push(`      wrong basket: ${s5.wrongBasket.join(', ')}`); }
  return L.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
  const r = judgeAttempt({ specimen: arg('--specimen'), attempt: arg('--attempt') });
  console.log(process.argv.includes('--json') ? JSON.stringify(r, null, 1) : formatReport(r));
}
