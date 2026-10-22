#!/usr/bin/env node
/**
 * Runner for the first-leg check (node-only; judging: it reads testimony): tk.s7.firstLegCheck on a completed attempt, S7 only.
 *
 *   node ports/s7route/firstLegRun.mjs --specimen golden --attempt ID [--attempts-root DIR] [--out DIR] [--variants a,b]
 *
 * The store is the S7 runner's (ports/s7route/evidenceRun.mjs evidenceStore) plus the first legs (firstLegs.mjs). Writes under
 * <out> (default <repo>/attempts/s7firstlegs/<specimen>/run-<ISO time>/): tk.s7.firstLegCheck.json and one crop per violating route
 * (tk.s7.firstLegCheck.<source><hole>.png). --variants: rule sets solved on the same store and judged (testimony) beside it.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { RENDER_PART } from '../../fg/store.mjs';
import { canonicalJson } from '../../fg/canon.mjs';
import { imageFiles } from '../../fg/node-flipbook.mjs';
import { evidenceStore, solveOn } from './evidenceRun.mjs';
import { RULE_SETS } from './match.mjs';
import { registerFirstLegs, FIRST_LEG_CHECK_PART } from './firstLegs.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');

export function runFirstLegs({ specimen, attempt, attemptsRoot = ROOT, root = ROOT, outDir = null, variants = [], write = true }) {
  const { store, document, holePaths } = evidenceStore({ specimen, attempt, attemptsRoot, root, cas: false });
  registerFirstLegs(store);
  const out = outDir ?? join(root, 'attempts', 's7firstlegs', specimen, `run-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  // the variants first (each timed on its own: the check reads the default's solve after them, from the store)
  const solves = Object.fromEntries(variants.map((v) => { const t0 = performance.now(), s = solveOn(store, holePaths, RULE_SETS[v], v); return [v, { ...s, ms: performance.now() - t0 }]; }));
  const check = store.get(FIRST_LEG_CHECK_PART);
  const renders = [];
  if (write) {
    mkdirSync(out, { recursive: true });
    const { emits, ...value } = check;
    writeFileSync(join(out, `${FIRST_LEG_CHECK_PART}.json`), canonicalJson({ specimen, attempt, ...value }) + '\n');
    const r = store.call(RENDER_PART, { a: FIRST_LEG_CHECK_PART, deflate: (b) => deflateSync(b) }).value, images = imageFiles(out);
    for (const p of r.parts) if (p.kind === 'raster' && p.data?.png) { const name = `${FIRST_LEG_CHECK_PART}.${p.address.split('#')[1]}.png`; images.alias(images.png(p.data.png).src, name); renders.push(join(out, name)); }
  }
  return { out, check, solves, renders, doc: document(), store, holePaths };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
  const specimen = arg('--specimen'), attempt = arg('--attempt');
  if (!specimen || !attempt) { console.error('usage: node ports/s7route/firstLegRun.mjs --specimen golden --attempt ID [--attempts-root DIR] [--out DIR] [--variants a,b]'); process.exit(2); }
  const r = runFirstLegs({ specimen, attempt, attemptsRoot: arg('--attempts-root') ?? ROOT, outDir: arg('--out'), variants: arg('--variants') ? arg('--variants').split(',') : [] });
  const viol = (src) => r.check.routes.filter((x) => x.source === src && x.violations.length).map((x) => `${x.hole}${x.basket ? ` (${x.basket})` : ''}: ${x.violations.map((v) => `leg ${v.leg + 1} ${v.kind} ${v.of}`).join(', ')}`);
  console.log(JSON.stringify({ out: r.out, totals: r.check.totals, testimony: viol('testimony'), default: viol('default'), renders: r.renders.length,
    variants: Object.fromEntries(Object.entries(r.solves).map(([v, s]) => [v, { ms: Math.round(s.ms), judged: s.judged ? `${s.judged.totals.agree}/${s.judged.totals.judged} bends ${s.judged.totals.bendsHit}/${s.judged.totals.bendsMissed}/${s.judged.totals.extraBends}` : null }])) }, null, 1));
}
