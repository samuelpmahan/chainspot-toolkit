#!/usr/bin/env node
/**
 * The graduation proof (AGENTS.md "prove identical output"): the JS port of docs/evidence/s7main/s3first.py, run on the
 * prototype's own inputs, against the recorded s3first-<course>.json. Same vertices within 1 px, same bend count, same
 * end (reached or not), same judge counts (the README judge: ends at Sam's basket, stays within W / 2 of his corridor).
 *
 *   node ports/s7trace/identity.mjs --specimen golden --attempt ID [--pads FILE] [--system]
 *
 * The prototype's inputs: the frozen S3 association (baselines/s3assoc/<course>.json), the pads it used (golden, alex:
 * an AA-fit pad file, --pads; elsewhere the S3 refined tees with the S3 family template) and its unrounded BasketPoint
 * offset (0.3445, 0.7264 px). --system runs the inputs the fork-join uses instead (the S3 association's AA pad poses,
 * DOCTRINE's BasketPoint offset 0.34, 0.73 px): the difference is an input change, reported, never hidden.
 */
import { readFileSync, existsSync } from 'node:fs';
import { deserialize } from '../../fg/pxcCodec.mjs';   // node:v8 with packed typed arrays
import { join, resolve } from 'node:path';
import { ownedPx } from '../../fg/pxset.mjs';
import { sceneOf, solveS3First, hallwayModel } from './s3first.mjs';
import { judgeTrace } from './hallway.mjs';
import { loadHolePaths } from './holePaths.mjs';
import { baselineOf } from '../s3assoc/freeze.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
export const PROTOTYPE_BASKET_POINT_OFFSET = Object.freeze([0.3444867494508058, 0.7263570296655334]);
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

export function identityRun({ specimen, attempt, padsFile = null, system = false, root = ROOT }) {
  const out = join(root, 'attempts', 'stages', attempt, 'fork', 'stage-output');
  const pxc = new Map(deserialize(readFileSync(join(out, 'early', 's3.pxc.bin'))));
  const raster = pxc.get('px.image.cropped'), W = raster.widthPx, H = raster.heightPx;
  const tees = readJson(join(out, 'early', 'artifacts', 's3fix', 'px.tees.refined.json')).tees;
  const ownedLists = [...pxc.get('px.baskets').map((k) => ownedPx(W, H, k).px), ...pxc.get('px.badges').map((b) => ownedPx(W, H, b).px), ...tees.map((t) => t.px)];
  let pads, template, padRule;
  if (system) { const J = readJson(join(out, 's3assoc', 'px.tees.association.json')); pads = J.rows.filter((r) => r.pose).map((r) => ({ label: r.tee, cx: r.pose.cx, cy: r.pose.cy, thDeg: r.pose.thDeg })); template = { L: J.template.L, W: J.template.W }; padRule = 'S3 association AA poses; tee ray = the frozen 2-decimal baselineOf ray (S7 itself reads it unrounded)'; }
  else if (padsFile) { const P = readJson(padsFile), rows = P.rows ?? P; pads = rows; template = { L: med(rows.map((p) => p.L)), W: med(rows.map((p) => p.W)) }; padRule = `AA-fit pads ${padsFile}`; }
  else { const m = readJson(join(out, 'early', 'artifacts', 's3fix', 'px.tees.family-refined.json')).model; template = { L: m.major.median, W: m.minor.median }; pads = tees.map((t) => ({ label: t.label, cx: t.center[0], cy: t.center[1], thDeg: t.angleRad * 180 / Math.PI })); padRule = 'S3 refined tees, S3 family template'; }
  const S = sceneOf({ raster, ownedLists, baskets: pxc.get('px.baskets'), badges: pxc.get('px.badges'), pads, template, ...(system ? {} : { basketPointOffset: PROTOTYPE_BASKET_POINT_OFFSET }) });
  // the prototype read the frozen baseline file; the system reads the live S3 association in the same shape
  const assoc = system ? baselineOf(readJson(join(out, 's3assoc', 'px.tees.association.json')), out).holes : readJson(join(root, 'baselines', 's3assoc', `${specimen}.json`)).holes;
  const model = hallwayModel(S, assoc);
  const r = solveS3First(S, assoc, { model });
  const paths = loadHolePaths(specimen, root);
  const judge = Object.fromEntries(Object.entries(r.holes).map(([h, rec]) => {
    const sam = paths.holes.find((p) => p.hole === String(h));
    return [h, sam && rec.end != null ? judgeTrace({ verts: rec.verts, endPoint: S.bp[rec.end] }, sam, r.widthPx) : sam ? { ok: false } : null];
  }));
  return { widthPx: r.widthPx, holes: r.holes, judge, padRule, basketPointOffset: system ? 'DOCTRINE (0.34, 0.73) px' : 'prototype (0.3445, 0.7264) px' };
}

/** Compare with the recorded prototype output: per hole same end, same bend count, vertices within 1 px; judge counts. */
export function compareRecorded(run, recorded, tolPx = 1) {
  const rec = new Map(recorded.holes.map((h) => [String(h.hole), h]));
  const rows = Object.keys(run.holes).sort((a, b) => a - b).map((h) => {
    const a = run.holes[h], b = rec.get(String(h)) ?? {}, va = a.verts ?? [], vb = b.verts ?? [];
    const sameN = va.length === vb.length, d = sameN ? Math.max(0, ...va.map((p, i) => Math.hypot(p[0] - vb[i][0], p[1] - vb[i][1]))) : null;
    const ja = run.judge[h]?.ok ?? null, jb = recorded.judge?.[h]?.ok ?? null;
    return { hole: Number(h), how: a.how, sameEnd: (a.end == null) === (b.end == null), sameBends: a.bends === b.bends, maxVertexDiffPx: d == null ? null : Math.round(d * 1000) / 1000, sameJudge: ja === jb,
      identical: (a.end == null) === (b.end == null) && a.bends === b.bends && d != null && d <= tolPx && ja === jb, agrees: ja };
  });
  const agree = (j) => Object.values(j ?? {}).filter((x) => x?.ok).length;
  return { widthPx: run.widthPx, recordedWidthPx: recorded.width, rows, identicalHoles: rows.filter((r) => r.identical).length, holes: rows.length,
    agreeWithSam: agree(run.judge), recordedAgreeWithSam: agree(recorded.judge), worstVertexDiffPx: Math.max(0, ...rows.map((r) => r.maxVertexDiffPx ?? 0)) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
  const specimen = arg('--specimen'), attempt = arg('--attempt');
  const recordedFile = join(ROOT, 'docs', 'evidence', 's7main', `s3first-${specimen}.json`);
  if (!specimen || !attempt || !existsSync(recordedFile)) { console.error('usage: node ports/s7trace/identity.mjs --specimen golden|lenard|townelake|heritage|alex --attempt ID [--pads FILE] [--system]'); process.exit(2); }
  const run = identityRun({ specimen, attempt, padsFile: arg('--pads'), system: process.argv.includes('--system') });
  const c = compareRecorded(run, readJson(recordedFile));
  console.log(`${specimen} (${run.padRule}; BasketPoint offset ${run.basketPointOffset}): W ${c.widthPx} px (recorded ${c.recordedWidthPx} px); ${c.identicalHoles}/${c.holes} holes identical (same end, same bend count, vertices within 1 px, same judge); worst vertex difference ${c.worstVertexDiffPx} px; agree with Sam ${c.agreeWithSam}/${c.holes} (recorded ${c.recordedAgreeWithSam})`);
  for (const r of c.rows) if (!r.identical) console.log(`  hole ${r.hole}: ${r.how}; same end ${r.sameEnd}, same bends ${r.sameBends}, max vertex diff ${r.maxVertexDiffPx} px, same judge ${r.sameJudge}`);
}
