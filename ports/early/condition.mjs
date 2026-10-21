/**
 * An early run that ends in a data condition (S1 read no badges, S2 found no baskets) records it in run.receipt.json with the
 * stages it did not run. Every later runner reads it first and records "not run" the same way, instead of failing on the
 * Parts that were never produced (AGENTS: data conditions are recorded results, never throws).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The early receipt's condition ({ stage, result, detail }, with notRun), or null when the run had none. */
export function earlyConditionOf(root, attempt) {
  const p = join(root, 'attempts', 'stages', attempt, 'fork', 'stage-output', 'early', 'run.receipt.json');
  if (!existsSync(p)) return null;
  const r = JSON.parse(readFileSync(p, 'utf8'));
  return r.condition ? { ...r.condition, notRun: r.notRun ?? [], counts: r.counts ?? null } : null;
}

/** For a runner's CLI: when the attempt's early run ended in a condition, print the recorded not-run result and exit 0. */
export function exitOnEarlyCondition({ root, attempt, specimen, stage }) {
  const c = earlyConditionOf(root, attempt);
  if (!c) return;
  console.log(JSON.stringify({ specimen, attempt, stage, notRun: `${stage} not run: ${c.stage} ${c.result}`, condition: c }, null, 1));
  process.exit(0);
}
