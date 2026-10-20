/**
 * Wide testing in one command (Sam, 2026-10-20: "make wide testing easy, then make it easy to select a narrow version"):
 * every rule set of a profile on every course, one matrix of agreement with Sam's testimony, bends and time.
 *
 *   node ports/s7trace/sweep.mjs [--profile wide|quick|<comma list>] [--courses golden,heritage] [--out DIR]
 *
 * Each course is one S7 fork-join over the profile's variants (ports/s7trace/run.mjs), on the attempt in
 * docs/evidence/dev-s1s4/ATTEMPTS; the variants share every cached Part (route tables), so a rule set costs only what differs.
 * Narrow selection afterwards: ports/export/run.mjs --variant <one> (or --profile <list>).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runHoleTraceForkJoin } from './run.mjs';
import { profileOf } from '../s7route/match.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');

export async function sweep({ profile = 'quick', courses = null, out = null, root = ROOT } = {}) {
  const names = profileOf(profile);
  if (names.length < 2) names.push('pinned');   // a fork-join compares at least two implementations
  const attempts = readFileSync(join(root, 'docs/evidence/dev-s1s4/ATTEMPTS'), 'utf8').trim().split('\n').map((l) => l.split(' '))
    .filter(([c]) => !courses || courses.includes(c));
  const rows = [];
  for (const [course, attempt] of attempts) {
    const r = await runHoleTraceForkJoin({ attempt, specimen: course, outDir: out ? join(out, course) : null, root, only: names });
    for (const [variant, b] of Object.entries(r.comparison.branches)) {
      rows.push({ course, variant, accepted: variant === r.accepted, agree: b.judged ? `${b.agree}/${b.judged}` : `${b.reached} reach`,
        bends: b.judged ? `${b.bendsHit}/${b.bendsMissed}/${b.extraBends}` : '-', notAgreeing: (b.notAgreeing ?? []).join(' '), seconds: Math.round((r.timingsMs[variant] ?? 0) / 1000) });
    }
  }
  return { profile, variants: names, rows };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
  const r = await sweep({ profile: arg('--profile') ?? 'quick', courses: arg('--courses')?.split(',') ?? null, out: arg('--out') });
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`profile ${r.profile}: ${r.variants.join(', ')}\n`);
  console.log(`${pad('course', 11)}${pad('rule set', 32)}${pad('holes', 9)}${pad('bends h/m/x', 13)}${pad('s', 6)}not agreeing`);
  for (const x of r.rows) console.log(`${pad(x.course, 11)}${pad((x.accepted ? '-> ' : '   ') + x.variant, 32)}${pad(x.agree, 9)}${pad(x.bends, 13)}${pad(x.seconds, 6)}${x.notAgreeing}`);
  if (arg('--out')) { mkdirSync(arg('--out'), { recursive: true }); writeFileSync(join(arg('--out'), 'sweep.json'), JSON.stringify(r, null, 1) + '\n'); }
}
