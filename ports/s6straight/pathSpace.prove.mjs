#!/usr/bin/env node
/**
 * Proof that fn.q.path.* is the SAME math as the graduated Python evidence (docs/evidence/s7main teebadge.py, track.py,
 * contrast.py, course.py; docs/evidence/s7edge calibc.py), number for number, on one attempt (node-only).
 *
 *   node ports/s6straight/pathSpace.prove.mjs --attempt ID --dump DIR
 *
 * DIR holds the Python's own intermediates on the same attempt (teebadge.json, mask.bin from s7main course.py;
 * calibc.json, mask-edge.bin from s7edge course.py): written by the evidence scripts unchanged plus a dump. Two proofs:
 *   math  the JS queries given the Python's mask and inputs reproduce its widths, edge pairs, contrasts, pass fractions
 *   mask  the JS mask built from the board's OWNED pixel lists (px.baskets, px.badges, px.tees.refined; ownedPx) equals
 *         course.py's MASK, and R1 from ringRadiusOf equals course.py _r1
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadAttemptParts } from '../s4recover/run.mjs';
import { ownedPx, forEach } from '../../fg/pxset.mjs';
import { lumOf, profileAt, edgePairOf, stationContrastAt, arange, percentile, pathMaskOf, spriteMaskOf, ringRadiusOf } from './pathSpace.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const L = loadAttemptParts({ attempt: args.attempt, specimen: 'golden' });
const raster = L.board.get('px.image.cropped'), W = raster.widthPx, H = raster.heightPx;
const tb = JSON.parse(readFileSync(join(args.dump, 'teebadge.json'), 'utf8')), cb = JSON.parse(readFileSync(join(args.dump, 'calibc.json'), 'utf8'));
const pyMask = new Uint8Array(readFileSync(join(args.dump, 'mask.bin'))), pyMaskEdge = new Uint8Array(readFileSync(join(args.dump, 'mask-edge.bin')));
const maxAbs = (a, b) => a.reduce((m, x, i) => Math.max(m, Math.abs(x - b[i])), 0);
const median = (xs) => percentile(xs, 50);
const maxAbsN = (a, ok, b) => { let m = 0; for (let i = 0; i < a.length; i++) { if (b[i] == null && Number.isNaN(a[i])) continue; if (b[i] == null || Number.isNaN(a[i])) return Infinity; m = Math.max(m, Math.abs(a[i] - b[i])); } return m; };
const report = { attempt: args.attempt };

// ---- math proof: the Python mask as the mask Part
const ctx = (mask) => ({ lum: lumOf(raster), W, H, mask, raster });
function teebadge(c) {
  return tb.rows.filter((r) => r.usable).map((r) => {
    const P = profileAt(c, r.S, r.phi, 2, r.stop); let best = null;
    for (const Wg of arange(18, 60, 1)) { const e = edgePairOf(P, Wg, { tolW: 0.75, latLim: 3 }); if (e && (!best || e.score > best.score)) best = e; }
    const ts = arange(2, r.stop, 1), sc = stationContrastAt(c, r.S, r.phi, ts, best.wPx), m = [];
    for (let k = 0; k < ts.length; k++) if (sc.okl[k] && sc.okr[k]) m.push(Math.min(sc.cl[k], sc.cr[k]));
    return { hole: r.hole, w: best.wPx, c: best.cPx, score: best.score, visible: m.length, contrastMedian: median(m), contrastP10: percentile(m, 10), P, sc, py: r };
  });
}
const cmpRows = (rows) => ({
  segments: rows.length,
  widthMaxDiffPx: Math.max(...rows.map((x) => Math.abs(x.w - x.py.w))), centreMaxDiffPx: Math.max(...rows.map((x) => Math.abs(x.c - x.py.c))),
  scoreMaxDiff: Math.max(...rows.map((x) => Math.abs(x.score - x.py.score))), visibleDiffCount: rows.filter((x) => x.visible !== x.py.visible).length,
  contrastMedianMaxDiffLum: Math.max(...rows.map((x) => Math.abs(x.contrastMedian - x.py.contrastMedian))),
  profileMaxDiffLum: Math.max(...rows.map((x) => maxAbs(Array.from(x.P.prof).map((v, i) => (Number.isNaN(v) ? 0 : v)), x.py.prof.map((v) => v ?? 0)))),
  okProfileDiffCount: rows.reduce((n, x) => n + Array.from(x.P.ok).filter((v, i) => v !== x.py.okProf[i]).length, 0),
  stationContrastMaxDiffLum: Math.max(...rows.map((x) => Math.max(maxAbsN(x.sc.cl, x.sc.okl, x.py.cl), maxAbsN(x.sc.cr, x.sc.okr, x.py.cr)))),
  courseWidthPx: median(rows.filter((x) => Math.abs(Math.round(x.c * 100) / 100) <= 3).map((x) => Math.round(x.w * 100) / 100)), pythonCourseWidthPx: tb.widthPx
});
report.teebadgeWithPythonMask = cmpRows(teebadge(ctx(pyMask)));

function calibc(c) {
  const ts = arange(cb.t0, cb.t1, 1); let on = [], off = [], diff = 0;
  for (const p of cb.pads) {
    const one = (phi) => { const sc = stationContrastAt(c, p.S0, phi, ts, cb.Wc), m = []; for (let k = 0; k < ts.length; k++) if (sc.okl[k] && sc.okr[k]) m.push(Math.min(sc.cl[k], sc.cr[k])); return m; };
    const o = one(p.phi); diff = Math.max(diff, o.length === p.on.length ? maxAbs(o, p.on) : Infinity); on.push(...o);
    [25, -25].forEach((dd, k) => { const f = one(p.phi + (dd * Math.PI) / 180); diff = Math.max(diff, f.length === p.off[k].length ? maxAbs(f, p.off[k]) : Infinity); off.push(...f); });
  }
  return { onCount: on.length, offCount: off.length, onPassFrac: on.filter((v) => v > 8).length / on.length, offPassFrac: off.filter((v) => v > 8).length / off.length,
    pythonOnPassFrac: cb.onPass, pythonOffPassFrac: cb.offPass, pythonOnCount: cb.onCount, pythonOffCount: cb.offCount, contrastMaxDiffLum: diff };
}
report.edgeTestWithPythonMask = calibc(ctx(pyMaskEdge));

// ---- mask proof: from the board's owned pixel lists
const lists = [];
for (const k of L.board.get('px.baskets')) lists.push(collect(ownedPx(W, H, k)));
for (const b of L.board.get('px.badges')) lists.push(collect(ownedPx(W, H, b)));
for (const t of L.values['px.tees.refined']) lists.push(collect(ownedPx(W, H, t)));
function collect(set) { const px = []; forEach(set, (i) => px.push(i)); return px; }
const bpsEvidence = tb.bp;   // course.py BasketPoint (DELTA from its spoke solve)
const jsMask = pathMaskOf(raster, lists, bpsEvidence);
const dm = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) if ((a[i] ? 1 : 0) !== (b[i] ? 1 : 0)) d++; return d; };
report.mask = { r1Px: jsMask.r1Px, pythonR1Px: tb.R1, maskedCount: jsMask.maskedCount, pythonMaskedCount: pyMask.reduce((a, b) => a + b, 0), diffPx: dm(jsMask.mask, pyMask) };
const sprite = spriteMaskOf(W, H, lists).sprite;
report.mask.r1PxS7edgeRange = ringRadiusOf(lumOf(raster), sprite, W, H, bpsEvidence, { rs: [10, 110, 0.5] });
report.teebadgeWithBoardMask = cmpRows(teebadge(ctx(jsMask.mask)));
console.log(JSON.stringify(report, null, 1));
