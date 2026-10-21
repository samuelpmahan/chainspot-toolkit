#!/usr/bin/env node
/**
 * Perturbation test for the frozen S3 association (is it good enough?): perturb every pad's centre and angle and every
 * badge centre by Gaussian errors of increasing size, re-run fn.Tee.associate, and count per hole how often the frozen
 * answer changes: the badge (contracts/s5.pair@1), the 3-point straight verdict, the straight hole's BasketPoint.
 * "Good enough" = no hole changes at the measured error; the margin is the largest error at which no hole changes in
 * >= 99% of draws.
 *
 *   node ports/s3assoc/perturb.mjs --specimen golden --attempt ID [--draws 200]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { associate } from './associate.mjs';


const ROOT = resolve(import.meta.dirname, '..', '..');
/** deterministic Gaussian (mulberry32 + Box-Muller) so a rerun reproduces the table */
function rng(seed) { let a = seed >>> 0; const u = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; return () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u()); }

/** angle sigma (deg) x position sigma (px) grid; 0.6 px per point ~ the calibrated 0.85 px pad + badge combined */
export const LEVELS = Object.freeze([
  { thDeg: 0.1, px: 0.6 }, { thDeg: 0.25, px: 0.6 }, { thDeg: 0.5, px: 0.6 }, { thDeg: 1.0, px: 0.6 },
  { thDeg: 0.5, px: 1.2 }, { thDeg: 1.0, px: 1.2 }, { thDeg: 2.0, px: 1.2 }, { thDeg: 2.0, px: 2.4 }, { thDeg: 4.0, px: 2.4 }
]);

export function perturbRun({ assoc, attemptRoot, draws = 200, levels = LEVELS, seed = 1 }) {
  const A = join(attemptRoot, 'early', 'artifacts');
  const bj = JSON.parse(readFileSync(join(A, 's1', 'px.badges.json'), 'utf8')).badges;
  const kj = JSON.parse(readFileSync(join(A, 's2', 'px.baskets.json'), 'utf8')).baskets;
  const badges0 = bj.map((b) => ({ label: String(b.label), center: [b.bbox[0] + (b.bbox[2] - 1) / 2, b.bbox[1] + (b.bbox[3] - 1) / 2], sizePx: [b.bbox[2], b.bbox[3]] }));
  const baskets = kj.map((k, i) => ({ index: k.index ?? i, bbox: k.bbox }));
  const tees0 = assoc.rows.map((r) => ({ label: r.tee, center: r.center, thRad: (r.thDeg * Math.PI) / 180, sigmaThRad: (r.pose.sigmaRaw.thDeg * Math.PI) / 180 }));
  // Compare DECISIONS per tee (not perturbed coordinates): its badge (= hole), the 3-point verdict, the straight basket.
  const decide = (rows) => Object.fromEntries(rows.map((r) => [r.tee, { badge: r.best?.badge ?? null, straight: r.straight3?.verdict ?? null, basket: r.straight3?.verdict === 'STRAIGHT' ? r.straight3.basket : null }]));
  const base = decide(associate({ tees: tees0, badges: badges0, baskets, padLengthPx: assoc.template.L, padWidthPx: assoc.template.W })), g = rng(seed);
  const holeOf = (tee) => base[tee].badge ?? `tee@${assoc.rows.find((r) => r.tee === tee).center.map(Math.round).join(',')}`;
  return levels.map((lv) => {
    const changed = {};
    for (let d = 0; d < draws; d++) {
      const tees = tees0.map((t) => ({ ...t, center: [t.center[0] + lv.px * g(), t.center[1] + lv.px * g()], thRad: t.thRad + ((lv.thDeg * Math.PI) / 180) * g() }));
      const badges = badges0.map((b) => ({ ...b, center: [b.center[0] + lv.px * g(), b.center[1] + lv.px * g()] }));
      const cur = decide(associate({ tees, badges, baskets, padLengthPx: assoc.template.L, padWidthPx: assoc.template.W }));
      for (const [tee, b] of Object.entries(base)) {
        const c = cur[tee], hole = holeOf(tee);
        if (c.badge !== b.badge) changed[`${hole}:badge -> ${c.badge}`] = (changed[`${hole}:badge -> ${c.badge}`] ?? 0) + 1;
        else if (c.straight !== b.straight) changed[`${hole}:straight ${b.straight} -> ${c.straight}`] = (changed[`${hole}:straight ${b.straight} -> ${c.straight}`] ?? 0) + 1;
        else if (c.basket !== b.basket) changed[`${hole}:straight basket`] = (changed[`${hole}:straight basket`] ?? 0) + 1;
      }
    }
    const worst = Object.entries(changed).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ hole: k.split(':')[0], what: k.split(':')[1], fraction: Math.round((n / draws) * 1000) / 1000 }));
    return { thetaSigmaDeg: lv.thDeg, positionSigmaPx: lv.px, draws, holesChanging: new Set(worst.filter((w) => w.fraction > 0.01).map((w) => w.hole)).size, worst };
  });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
  const specimen = arg('--specimen'), attempt = arg('--attempt'), draws = Number(arg('--draws') ?? 200);
  const attemptRoot = join(ROOT, 'attempts', 'stages', attempt, 'fork', 'stage-output');
  const assoc = JSON.parse(readFileSync(join(attemptRoot, 's3assoc', 'px.tees.association.json'), 'utf8'));
  const table = perturbRun({ assoc, attemptRoot, draws });
  writeFileSync(join(attemptRoot, 's3assoc', 'perturbation.json'), JSON.stringify({ specimen, units: { thetaSigmaDeg: 'deg (1 sigma per pad)', positionSigmaPx: 'px (1 sigma per pad and badge centre, per axis)', fraction: 'fraction of draws' }, table }, null, 1));
  console.log(JSON.stringify({ specimen, table: table.map((t) => ({ th: t.thetaSigmaDeg, px: t.positionSigmaPx, holesChanging: t.holesChanging, worst: t.worst.slice(0, 3).map((w) => `hole ${w.hole} ${w.what} ${w.fraction}`) })) }));
}
