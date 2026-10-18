#!/usr/bin/env node
/**
 * Proof that the matching rules over tk.s6.pairFeatures give the verdicts the self-contained implementations gave:
 *
 *   node ports/s6straight/run.mjs --specimen X --attempt ID --out OLD     (run at the commit before the split)
 *   node ports/s6straight/run.mjs --specimen X --attempt ID --out NEW
 *   node ports/s6straight/matching.prove.mjs --old OLD --new NEW [--evidence]
 *
 * Diffs every variant's straight.json pair by pair: verdict, basket, condition (and with --evidence the whole row), and
 * the variant-level fields (rule, laneNotRun, threshold, assignment). Prints one line per variant and every difference.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson } from '../../fg/canon.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? true : all[i + 1]]] : acc), []));
const read = (dir, impl) => JSON.parse(readFileSync(join(dir, 'artifacts', 'fn.Hole.straight', impl, 'straight.json'), 'utf8'));

export function diffVariants(a, b, { evidence = true } = {}) {
  const out = [], byPair = new Map(b.verdicts.map((v) => [v.pair, v]));
  for (const v of a.verdicts) {
    const w = byPair.get(v.pair);
    if (!w) { out.push({ pair: v.pair, what: 'missing in new' }); continue; }
    const key = (x) => (evidence ? canonicalJson(x) : canonicalJson({ verdict: x.verdict, basket: x.basket?.name ?? null, condition: x.condition }));
    if (key(v) !== key(w)) out.push({ pair: v.pair, hole: v.hole, old: `${v.verdict} ${v.basket?.name ?? ''} ${v.condition ?? ''}`.trim(), new: `${w.verdict} ${w.basket?.name ?? ''} ${w.condition ?? ''}`.trim(), evidenceOnly: key({ verdict: v.verdict, basket: v.basket?.name ?? null, condition: v.condition }) === key({ verdict: w.verdict, basket: w.basket?.name ?? null, condition: w.condition }) });
  }
  if (a.verdicts.length !== b.verdicts.length) out.push({ what: `pairs ${a.verdicts.length} vs ${b.verdicts.length}` });
  for (const k of ['rule', 'laneNotRun', 'counts']) if (canonicalJson(a[k]) !== canonicalJson(b[k])) out.push({ what: `${k} differs` });
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!args.old || !args.new) { console.error('usage: node ports/s6straight/matching.prove.mjs --old DIR --new DIR [--evidence false]'); process.exit(2); }
  let total = 0;
  for (const impl of readdirSync(join(args.old, 'artifacts', 'fn.Hole.straight')).sort()) {
    if (!existsSync(join(args.new, 'artifacts', 'fn.Hole.straight', impl))) { console.log(`${impl}: missing in new`); total++; continue; }
    const d = diffVariants(read(args.old, impl), read(args.new, impl), { evidence: args.evidence !== 'false' });
    total += d.length;
    console.log(`${impl.padEnd(14)} ${read(args.old, impl).verdicts.length} pairs, ${d.length} differences${d.length ? '\n' + d.map((x) => '   ' + JSON.stringify(x)).join('\n') : ''}`);
  }
  process.exit(total ? 1 : 0);
}
