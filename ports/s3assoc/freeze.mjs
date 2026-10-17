#!/usr/bin/env node
/**
 * Frozen S3 association baseline (Sam, 2026-10-17: "freeze it").
 *
 *   node ports/s3assoc/freeze.mjs --specimen golden --attempt ID --write   record baselines/s3assoc/<specimen>.json
 *   node ports/s3assoc/freeze.mjs --specimen golden --attempt ID           check a run against it (exit 1 on drift)
 *
 * Per hole (the badge label, never a list index): the tee centre, the signed ray towards the badge, z, and the 3-point
 * straight test (tee, badge, BasketPoint). A check compares geometry, not bytes: the pairing through contracts/s5.pair@1
 * (same badge, tee centre within 2 px, ray within 2 deg), the 3-point verdict and its BasketPoint (within 2 px).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import pair from '../../contracts/s5.pair@1.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const r2 = (v) => Math.round(v * 100) / 100;

export function baselineOf(assoc, attemptRoot) {
  const kj = JSON.parse(readFileSync(join(attemptRoot, 'early', 'artifacts', 's2', 'px.baskets.json'), 'utf8')).baskets;
  const bp = (i) => { const k = kj.find((b, j) => (b.index ?? j) === i); return [r2(k.bbox[0] + 22.5 + 0.34), r2(k.bbox[1] + 71 + 0.73)]; };
  const holes = {};
  for (const r of assoc.rows) {
    if (!r.best) continue;
    const th = (r.thDeg * Math.PI) / 180, s = r.best.sense;
    holes[r.best.badge] = {
      teeCenter: r.center, u: [r2(Math.cos(th) * s), r2(Math.sin(th) * s)], badgeLabel: r.best.badge, z: r.best.z, latPx: r.best.latPx, verdict: r.verdict,
      straight3: r.straight3 ? { verdict: r.straight3.verdict, basketPoint: bp(r.straight3.basket), tlsMaxPx: r.straight3.tlsMaxPx } : null
    };
  }
  return { schema: 'nctk-s3-association-baseline@1', specimen: assoc.specimen, frozenFrom: assoc.attempt, template: assoc.template,
    rule: 'pairing identity contracts/s5.pair@1; 3-point verdict equal and BasketPoint within 2 px', holes };
}

export function checkAgainst(base, cur) {
  const diffs = [];
  for (const [hole, b] of Object.entries(base.holes)) {
    const c = cur.holes[hole];
    if (!c) { diffs.push({ hole, what: 'hole lost its tee' }); continue; }
    const cmp = pair.equal(b, c);
    if (!cmp.ok) diffs.push({ hole, what: 'pairing', ...cmp });
    const s0 = b.straight3, s1 = c.straight3;
    if ((s0?.verdict ?? null) !== (s1?.verdict ?? null)) diffs.push({ hole, what: '3-point verdict', was: s0?.verdict ?? null, now: s1?.verdict ?? null });
    else if (s0?.verdict === 'STRAIGHT' && Math.hypot(s0.basketPoint[0] - s1.basketPoint[0], s0.basketPoint[1] - s1.basketPoint[1]) > 2) diffs.push({ hole, what: 'straight basket', was: s0.basketPoint, now: s1.basketPoint });
  }
  for (const hole of Object.keys(cur.holes)) if (!base.holes[hole]) diffs.push({ hole, what: 'new hole association' });
  return diffs;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
  const specimen = arg('--specimen'), attempt = arg('--attempt');
  const attemptRoot = join(ROOT, 'attempts', 'stages', attempt, 'fork', 'stage-output');
  const assoc = JSON.parse(readFileSync(join(attemptRoot, 's3assoc', 'px.tees.association.json'), 'utf8'));
  const cur = baselineOf(assoc, attemptRoot), file = join(ROOT, 'baselines', 's3assoc', `${specimen}.json`);
  if (process.argv.includes('--write')) { mkdirSync(join(ROOT, 'baselines', 's3assoc'), { recursive: true }); writeFileSync(file, JSON.stringify(cur, null, 1)); console.log(`froze ${Object.keys(cur.holes).length} holes -> ${file}`); }
  else {
    if (!existsSync(file)) { console.error(`no baseline ${file}`); process.exit(2); }
    const diffs = checkAgainst(JSON.parse(readFileSync(file, 'utf8')), cur);
    console.log(JSON.stringify({ specimen, holes: Object.keys(cur.holes).length, drift: diffs }, null, 1));
    if (diffs.length) process.exitCode = 1;
  }
}
