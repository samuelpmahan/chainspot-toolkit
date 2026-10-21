/**
 * An early run that ends in a data condition (S1 read no badges, S2 found no baskets) records it in run.receipt.json with the
 * stages it did not run. Every later runner reads it first and, when its stage is one of those, records "not run" the same
 * way instead of failing on the Parts that were never produced (AGENTS: data conditions are recorded results, never throws).
 * S2 'no baskets' stops nothing: S3 runs on the pinned px tee bounds and the rest record what they lack.
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

/**
 * Whether a runner's stage is among those a condition did not run: 'S3 association' is S3's; export needs every stage.
 * S2 'no baskets' runs S3 and everything after it (Sam, 2026-10-21: "let the tee detection run anyway"), so its notRun is empty.
 */
export function stageNotRun(condition, stage) {
  const key = stage === 'export' ? null : stage.split(' ')[0];
  return key ? condition.notRun.includes(key) : condition.notRun.length > 0;
}

/** For a runner's CLI: when the attempt's early run ended in a condition this stage cannot run past, print the recorded not-run result and exit 0. */
export function exitOnEarlyCondition({ root, attempt, specimen, stage }) {
  const c = earlyConditionOf(root, attempt);
  if (!c || !stageNotRun(c, stage)) return;
  console.log(JSON.stringify({ specimen, attempt, stage, notRun: `${stage} not run: ${c.stage} ${c.result}`, condition: c }, null, 1));
  process.exit(0);
}
