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
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadTestimony } from './testimony.mjs';
import { nameCandidates } from '../../fg/names.mjs';
import { basketPoint } from '../../fg/s2/fg.s2.basketInvariants.observe.fg.mjs';
import { ringsForBaskets, HolePath, occludersOf } from '../../fg/scene/parts.mjs';
import { judgeStraight } from '../s6straight/guarantees.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
export const MATCH_PX = Object.freeze({ basket: 12, tee: 8 });
/** px, hallway width per course measured from tee->badge segments (docs/evidence/s7main) */
const hallwayWidth = { golden: 41.58, lenard: 35.75, townelake: 36.83, heritage: 31.03, alex: 33.60 };   // px: a detection IS the annotated sprite within this distance
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
    matchWithinPx: maxPx, holeOfDetection: new Map(m.tp.map((p) => [p.i, p.hole])),
    // the same verdicts as data (one row per hole or unmatched detection), for the inspector and any other render
    rows: [
      ...m.tp.map((p) => ({ hole: p.hole, expected: truth.find((t) => t.hole === p.hole).point, detection: dets[p.i], errorPx: r2(p.e), verdict: dets[p.i].name.startsWith('S4 ') ? 'recoveredTP' : 'TP' })),
      ...m.unmatchedTruth.map((h) => ({ hole: h, expected: truth.find((t) => t.hole === h).point, detection: null, errorPx: null, verdict: 'FN' })),
      ...m.unmatchedDets.map((i) => ({ hole: null, expected: null, detection: dets[i], errorPx: null, verdict: !T.complete ? 'unjudged' : dets[i].name.startsWith('S4 ') ? 'recoveredFP' : 'FP' }))
    ].sort((a, b) => (a.hole ?? 99) - (b.hole ?? 99))
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
  const S2 = detectionStage('Basket', kj.map((k, i) => ({ name: kNames[i], point: basketPoint(k.bbox), bbox: k.bbox })), T, (h) => h.basket, MATCH_PX.basket);
  const S2hole = S2.holeOfDetection; delete S2.holeOfDetection; report.stages.S2 = S2;

  // S3: visible tees (S3 structural fix), pad centre vs Sam's tee point.
  const tf = join(A, 's3fix', 'px.tees.refined.json');
  if (existsSync(tf)) {
    const tees = JSON.parse(readFileSync(tf, 'utf8')).tees;
    const tNames = nameCandidates('Tee', tees, (t) => t.center);
    const S3 = detectionStage('Tee', tees.map((t, i) => ({ name: tNames[i], point: t.center, bbox: t.bbox, angleRad: t.angleRad })), T, (h) => h.tee, MATCH_PX.tee);
    const holeOfTee = S3.holeOfDetection; delete S3.holeOfDetection; report.stages.S3 = S3;
    // Why each FN, by name: every scene Part that crosses the pad footprint (half the pad diagonal around Sam's point;
    // Sam marks an occluded pad at the centroid of its VISIBLE part). Opaque sprites by their pixel sets, translucent
    // C1S / C2D rings (baselines/scene/<course>.rings.json) and HolePath tee-badge segments by geometry.
    const W = JSON.parse(readFileSync(join(A, 's1', 'px.badges.json'), 'utf8')).image.widthPx;
    const fam = join(A, 's3fix', 'px.tees.family-refined.json');
    const model = existsSync(fam) ? JSON.parse(readFileSync(fam, 'utf8')).model : null;
    const R = model ? Math.hypot(model.major.median, model.minor.median) / 2 : 15;
    const basketName = (i) => (S2hole.has(i) ? `Basket ${S2hole.get(i)}` : kNames[i]);
    const ownedPx = new Map([...badges.map((b) => [`Badge ${b.label}`, new Set([...b.px, ...b.mute.px])]), ...kj.map((k, i) => [basketName(i), new Set([...k.px, ...(k.shell?.blackPx ?? [])])]),
      ...tees.map((t, i) => [holeOfTee.has(i) ? `Tee ${holeOfTee.get(i)}` : tNames[i], new Set(t.px ?? [])])]);
    const ringFile = join(root, 'baselines', 'scene', `${specimen}.rings.json`);
    const parts = existsSync(ringFile) ? ringsForBaskets(kj.map((k, i) => ({ name: basketName(i), point: basketPoint(k.bbox) })), JSON.parse(readFileSync(ringFile, 'utf8'))) : [];
    const af0 = join(out, 's3assoc', 'px.tees.association.json');
    if (existsSync(af0)) {
      const rows0 = JSON.parse(readFileSync(af0, 'utf8'));
      const bc = new Map(badges.map((b) => [String(b.label), [b.bbox[0] + (b.bbox[2] - 1) / 2, b.bbox[1] + (b.bbox[3] - 1) / 2]]));
      for (const r of rows0.rows) if (r.best && Array.isArray(r.center) && bc.has(r.best.badge)) parts.push(HolePath({ name: `HolePath ${r.best.badge} (tee-badge segment)`, vertices: [r.center, bc.get(r.best.badge)], widthPx: hallwayWidth[specimen] ?? 30 }));
    }
    // Rings of baskets S2 never found cannot come from the pipeline yet (S4 recovers them); the judge may still name them
    // from Sam's basket point, labelled as such, so a miss is never blamed on S3 for a ring nobody has modelled.
    const unrecovered = existsSync(ringFile) ? ringsForBaskets([...T.holes.values()].filter((h) => !kj.some((k) => dist(basketPoint(k.bbox), h.basket) <= MATCH_PX.basket))
      .map((h) => ({ name: `Basket ${h.hole} [not in S2; Sam's point]`, point: h.basket })), JSON.parse(readFileSync(ringFile, 'utf8'))) : [];
    const occl = (pt) => occludersOf(pt, R, { parts: [...parts, ...unrecovered], ownedPx, widthPx: W });
    S3.occluders = {};
    S3.fn = S3.fn.map((t) => {
      const h = T.holes.get(Number(t.split(' ')[1])), hits = occl(h.tee).filter((o) => o.name !== t);
      S3.occluders[t] = hits;
      const opaque = hits.filter((o) => o.opaque), clear = hits.length === 0;
      const why = clear ? 'nothing crosses it: S3 missed a clear pad' : opaque.length ? `partly hidden by ${opaque.map((o) => `${o.name} (${Math.round(o.fraction * 100)}%)`).join(', ')}; owner: S4 recovery` : `crossed only by translucent ${hits.map((o) => `${o.name} (${Math.round(o.fraction * 100)}%)`).join(', ')}; owner: S3 must see through them`;
      return `${t} (${why})`;
    });

    // S3 association (ports/s3assoc): each TP tee's badge vs its true hole.
    const af = join(out, 's3assoc', 'px.tees.association.json');
    if (existsSync(af)) {
      const rows = JSON.parse(readFileSync(af, 'utf8')).rows;
      const correct = [], incorrect = [], none = [], assocRows = [];
      const badgeCenter = new Map(badges.map((b) => [Number(b.label), [b.bbox[0] + (b.bbox[2] - 1) / 2, b.bbox[1] + (b.bbox[3] - 1) / 2]]));
      rows.forEach((r, i) => {
        const truth = holeOfTee.get(i), said = r.best ? Number(r.best.badge) : null, name = tNames[i];
        const verdict = truth == null ? 'unjudged' : said == null ? 'none' : said === truth ? 'right' : 'wrong';
        assocRows.push({ hole: truth ?? null, name, point: r.center, said, saidCenter: said != null ? badgeCenter.get(said) ?? null : null, truthCenter: truth != null ? badgeCenter.get(truth) ?? null : null, verdict, best: r.best ?? null });
        if (truth == null) return;
        if (said == null) none.push(`${name} (is Tee ${truth})`);
        else if (said === truth) correct.push(`${name} -> Badge ${said}`);
        else incorrect.push(`${name} -> Badge ${said}, is Tee ${truth}`);
      });
      report.stages.S3association = { judgedTees: correct.length + incorrect.length + none.length, associatedCorrectly: correct.length, associatedIncorrectly: incorrect.length, notAssociated: none.length,
        unjudgedTees: rows.length - (correct.length + incorrect.length + none.length), correct, incorrect, none, rows: assocRows };

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

  // S4 recovery, judged by the same rule as S2/S3 (one match radius per kind), on the union with what S2/S3 found.
  // Baskets: S2 + the accepted S4 proposals that are not an S2 basket (basket-bridge). Tees: S3 + each fn.Tee.recover
  // branch (ports/s4recover, latest run); a recovered tee carries the hole it was recovered for, judged as association.
  const bridgeFile = join(out, 'basket-bridge', 'basket-recovery.part.json');
  if (existsSync(bridgeFile)) {
    const rec = (JSON.parse(readFileSync(bridgeFile, 'utf8')).comparisons?.accepted ?? []).filter((d) => d.classification !== 'existing-s2-exact').map((d) => d.semanticBbox);
    const rNames = nameCandidates('Basket', rec, (b) => basketPoint(b)).map((n) => `S4 ${n}`);
    const dets = [...kj.map((k, i) => ({ name: kNames[i], point: basketPoint(k.bbox), bbox: k.bbox })), ...rec.map((b, i) => ({ name: rNames[i], point: basketPoint(b), bbox: b }))];
    const S4b = detectionStage('Basket', dets, T, (h) => h.basket, MATCH_PX.basket); delete S4b.holeOfDetection;
    S4b.recovered = rec.length; S4b.recoveredTP = S4b.tp.filter((s) => s.startsWith('S4 ')); S4b.recoveredFP = S4b.fp.filter((s) => s.startsWith('S4 '));
    report.stages.S4baskets = S4b;
  }
  const s4dir = join(out, 's4recover'), tf4 = join(A, 's3fix', 'px.tees.refined.json');
  const runs = existsSync(s4dir) ? readdirSync(s4dir).filter((d) => d.startsWith('run-')).sort() : [];
  if (runs.length && existsSync(tf4)) {
    const tees = JSON.parse(readFileSync(tf4, 'utf8')).tees, tNames = nameCandidates('Tee', tees, (t) => t.center);
    const base = join(s4dir, runs.at(-1), 'artifacts', 'fn.Tee.recover');
    report.stages.S4tees = { run: runs.at(-1), branches: {} };
    for (const branch of readdirSync(base).sort()) {
      const R = JSON.parse(readFileSync(join(base, branch, 'recovered.json'), 'utf8')).recovered ?? [];
      const rNames = nameCandidates('Tee', R, (t) => t.center).map((n) => `S4 ${n}`);
      const dets = [...tees.map((t, i) => ({ name: tNames[i], point: t.center, bbox: t.bbox, angleRad: t.angleRad })),
        ...R.map((t, i) => ({ name: rNames[i], point: t.center, corners: t.corners ?? null, forHole: t.hole, rule: t.rule, confidence: t.confidence ?? null, visibleFrameFrac: t.evidence?.visibleFrameFrac ?? null }))];
      const s = detectionStage('Tee', dets, T, (h) => h.tee, MATCH_PX.tee);
      const holeOf = s.holeOfDetection; delete s.holeOfDetection;
      const assoc = { correct: [], incorrect: [], unjudged: [] };
      R.forEach((t, i) => {
        const truth = holeOf.get(tees.length + i);
        if (truth == null) return;
        (Number(t.hole) === truth ? assoc.correct : assoc.incorrect).push(`${rNames[i]} for Hole ${t.hole}${Number(t.hole) === truth ? '' : `, is Tee ${truth}`} (${r2(dist(t.center, T.holes.get(truth).tee))} px)`);
      });
      report.stages.S4tees.branches[branch] = { ...s, recovered: R.length, recoveredTP: s.tp.filter((x) => x.startsWith('S4 ')), recoveredFP: s.fp.filter((x) => x.startsWith('S4 ')),
        recoveredForHoleCorrectly: assoc.correct.length, recoveredForWrongHole: assoc.incorrect.length, association: assoc };
    }
  }
  // S6 straight vs bent (ports/s6straight, latest run): every fn.Hole.straight variant's verdict per tee-badge pair, judged by
  // the one rule the fork-join's testimony guarantee applies (judgeStraight: tee 8 px, basket 12 px; Sam's bent = corridorBends).
  const s6dir = join(out, 's6straight'), s6runs = existsSync(s6dir) ? readdirSync(s6dir).filter((d) => d.startsWith('run-')).sort() : [];
  if (s6runs.length) {
    const run = join(s6dir, s6runs.at(-1)), base = join(run, 'artifacts', 'fn.Hole.straight');
    const cmpFile = join(run, 'cmp.fn.Hole.straight.json'), cmp = existsSync(cmpFile) ? JSON.parse(readFileSync(cmpFile, 'utf8')) : null;
    const holes = [...T.holes.values()].map((h) => ({ hole: String(h.hole), tee: h.tee, basket: h.basket, bends: h.bends ?? [], bent: h.bent }));
    report.stages.S6straight = { run: s6runs.at(-1), accepted: cmp?.accepted ?? null, acceptRule: cmp?.acceptRule ?? null, variants: {} };
    for (const variant of existsSync(base) ? readdirSync(base).sort() : []) {
      const f = join(base, variant, 'straight.json'); if (!existsSync(f)) continue;
      const doc = JSON.parse(readFileSync(f, 'utf8')), j = judgeStraight(doc.verdicts ?? [], holes);
      const named = (o) => j.rows.filter((r) => r.outcome === o).map((r) => `Hole ${r.hole} (${r.tee}${r.verdict === 'unknown' ? ', unknown' : ''})`);
      report.stages.S6straight.variants[variant] = { laneNotRun: Boolean(doc.laneNotRun), ...j.totals,
        tp: named('TP'), fp: named('FP'), fn: named('FN'), tn: named('TN'), wrongBasket: j.rows.filter((r) => r.outcome === 'TP' && !r.basketAgrees).map((r) => `Hole ${r.hole} -> ${r.basketSaid}`),
        rows: j.rows.map((r) => ({ hole: r.hole === null ? null : Number(r.hole), pair: r.pair, tee: r.tee, source: r.source, verdict: r.verdict, truthBent: r.truthBent ?? null, truthBends: r.truthBends ?? null,
          basketSaid: r.basketSaid, basketSaidPoint: r.basketSaidPoint, basketTruthPoint: r.basketTruthPoint ?? null, basketErrorPx: r.basketErrorPx ?? null, outcome: r.outcome, pass: r.pass, why: r.why ?? r.condition ?? null })),
        note: 'TP straight called straight; FP bent called straight; FN straight not called straight (bent or unknown); TN bent not called straight' };
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
  const b4 = r.stages.S4baskets;
  if (b4) { L.push(`  S4 baskets (S2 + ${b4.recovered} recovered): TP ${b4.TP} / FN ${b4.FN} / FP ${b4.FP ?? 'unjudged'}; recovered TP [${b4.recoveredTP.join(', ')}], recovered FP [${b4.recoveredFP.join(', ')}]`);
    if (b4.fn.length) L.push(`      FN: ${b4.fn.join(', ')}`); }
  const t4 = r.stages.S4tees;
  if (t4) for (const [b, s] of Object.entries(t4.branches)) {
    L.push(`  S4 tees, ${b} (S3 + ${s.recovered} recovered): TP ${s.TP} / FN ${s.FN} / FP ${s.FP ?? 'unjudged'}; recovered for the right hole ${s.recoveredForHoleCorrectly}, wrong hole ${s.recoveredForWrongHole}; recovered FP [${s.recoveredFP.join(', ')}]`);
    if (s.fn.length) L.push(`      FN: ${s.fn.join(', ')}`); if (s.association.incorrect.length) L.push(`      wrong hole: ${s.association.incorrect.join('; ')}`);
  }
  const s6 = r.stages.S6straight;
  if (s6) for (const [n, v] of Object.entries(s6.variants)) {
    L.push(`  S6 straight vs bent, ${n}${s6.accepted === n ? ' (accepted)' : ''}${v.laneNotRun ? ' [lane not run]' : ''}: ${v.judgedPairs} judged pairs; TP ${v.TP} / FP ${v.FP} / FN ${v.FN} / TN ${v.TN}; straight with wrong basket ${v.straightWithWrongBasket}${v.unjudged ? `; ${v.unjudged} unjudged` : ''}`);
    if (!v.laneNotRun) { if (v.fp.length) L.push(`      FP (bent called straight): ${v.fp.join(', ')}`); if (v.fn.length) L.push(`      FN (straight not called straight): ${v.fn.join(', ')}`); if (v.wrongBasket.length) L.push(`      wrong basket: ${v.wrongBasket.join(', ')}`); }
  }
  return L.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
  const r = judgeAttempt({ specimen: arg('--specimen'), attempt: arg('--attempt') });
  console.log(process.argv.includes('--json') ? JSON.stringify(r, null, 1) : formatReport(r));
}
