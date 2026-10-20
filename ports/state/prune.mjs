/**
 * `node scripts/pxc.mjs prune [--dry-run] [--root DIR] [--hours H] [--json]`: free the disk that attempts and re-runs
 * pile up (heritage's dev attempt held 4 S6 runs, 3 S7 runs and 2 S4 and S5 runs; attempts/stages held 99 attempts,
 * 12 GB). Attempts are reproducible from the recipe (DOCTRINE: "the ReproducibleRecipe is the artifact"). Keep rule:
 *
 *   attempts   every attempt named in docs/evidence/dev-s1s4/ATTEMPTS, plus every attempt with anything modified in the
 *              last H hours (default 12: another agent may be running a course right now); every other attempt
 *              (its directory and its attempts/stages/<id>.json record) is deleted
 *   runs       inside a kept attempt, every directory of run-<ISO time>/ folders keeps
 *                - its latest run (what s5pair, s6straight, the judge and `pxc state` read: readdirSync(..).sort().at(-1)),
 *                - its latest COMPLETE run (one holding a cmp.*.json: `pxc state` reads the latest s7trace run with
 *                  cmp.fn.Hole.trace.json, so an interrupted newer run never hides it),
 *                - any run named in a file `pxc state` or the evidence reads: docs/evidence/** (frozen.json, judge and
 *                  s4r JSON, notes) and the attempt's <stage-output>/state/*,
 *              and deletes the rest
 *
 * Nothing outside attempts/stages is touched (attempts/cas has its own `pxc cas --prune-older-than`). Bytes are counted
 * per inode: a hardlinked file frees its bytes only when every link to it is deleted, so the total is what the disk
 * gets back. --dry-run deletes nothing and prints the same report.
 */
import { existsSync, lstatSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '..', '..');
export const ATTEMPTS_FILE = 'docs/evidence/dev-s1s4/ATTEMPTS';
const ATTEMPT = /^attempt-\d+-[0-9a-f]+$/;
const RUN = /^run-\d{4}-\d\d-\d\dT[\d-]+Z$/;

/** Every file and directory under p (lstat: symlinks are not followed). */
function walk(p, visit) {
  const st = lstatSync(p, { throwIfNoEntry: false });
  if (!st) return;
  visit(p, st);
  if (st.isDirectory()) for (const e of readdirSync(p)) walk(join(p, e), visit);
}
const newestMtime = (paths) => { let t = 0; for (const p of paths) walk(p, (_, st) => { if (st.mtimeMs > t) t = st.mtimeMs; }); return t; };

/** Run names (run-<ISO time>) that evidence and state files name: those runs are kept wherever they are. */
export function referencedRuns(root, stageOutputs = []) {
  const runs = new Set();
  const scan = (p) => walk(p, (f, st) => { if (st.isFile() && /\.(md|json|txt|mjs|py)$/.test(f) && st.size < 64e6) for (const m of readFileSync(f, 'utf8').matchAll(/run-\d{4}-\d\d-\d\dT[\d-]+Z/g)) runs.add(m[0]); });
  scan(join(root, 'docs', 'evidence'));
  for (const out of stageOutputs) scan(join(out, 'state'));
  return runs;
}

/** Inside one stage-output: every directory holding run-* folders, with the runs it keeps and the runs it deletes. */
export function runPlan(stageOutput, referenced) {
  const plan = [];
  const visit = (dir, depth) => {
    if (depth > 3 || !existsSync(dir)) return;
    const entries = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());
    const runs = entries.filter((e) => RUN.test(e.name)).map((e) => e.name).sort();
    if (runs.length) {
      const complete = runs.filter((r) => readdirSync(join(dir, r)).some((f) => /^cmp\..+\.json$/.test(f)));
      const keep = new Set([runs.at(-1), complete.at(-1), ...runs.filter((r) => referenced.has(r))].filter(Boolean));
      plan.push({ dir, keep: runs.filter((r) => keep.has(r)), remove: runs.filter((r) => !keep.has(r)) });
    }
    for (const e of entries) if (!RUN.test(e.name)) visit(join(dir, e.name), depth + 1);
  };
  visit(stageOutput, 0);
  return plan;
}

/** The plan for <root>/attempts/stages, and (unless dryRun) its execution. */
export function prune({ root = ROOT, dryRun = false, hours = 12, now = Date.now() } = {}) {
  const stages = join(root, 'attempts', 'stages');
  if (!existsSync(stages)) return { root, removedAttempts: [], keptAttempts: [], runs: [], bytes: 0, files: 0 };
  const listed = existsSync(join(root, ATTEMPTS_FILE)) ? new Set(readFileSync(join(root, ATTEMPTS_FILE), 'utf8').split('\n').map((l) => l.trim().split(/\s+/)[1]).filter(Boolean)) : new Set();
  const ids = [...new Set(readdirSync(stages).map((n) => n.replace(/\.json$/, '')).filter((n) => ATTEMPT.test(n)))].sort();
  const pathsOf = (id) => [join(stages, id), join(stages, `${id}.json`)].filter((p) => existsSync(p));
  const cutoff = now - hours * 3600e3, kept = [], removed = [];
  for (const id of ids) {
    if (listed.has(id)) { kept.push({ id, why: 'ATTEMPTS' }); continue; }
    const t = newestMtime(pathsOf(id));
    if (t >= cutoff) kept.push({ id, why: `modified ${((now - t) / 3600e3).toFixed(1)} h ago` });
    else removed.push({ id, paths: pathsOf(id), ageHours: Math.round((now - t) / 3600e3) });
  }
  const outs = kept.map((k) => join(stages, k.id, 'fork', 'stage-output')).filter((p) => existsSync(p));
  const referenced = referencedRuns(root, outs);
  const runs = kept.flatMap((k) => runPlan(join(stages, k.id, 'fork', 'stage-output'), referenced).map((r) => ({ attempt: k.id, ...r }))).filter((r) => r.remove.length);
  const doomed = [...removed.flatMap((r) => r.paths), ...runs.flatMap((r) => r.remove.map((n) => join(r.dir, n)))];
  // bytes the disk gets back: an inode is freed only when every one of its links is deleted
  const inodes = new Map();
  let files = 0;
  for (const p of doomed) walk(p, (_, st) => {
    if (st.isDirectory()) return;
    files++;
    const key = `${st.dev}:${st.ino}`, e = inodes.get(key) ?? { size: st.size, nlink: st.nlink, seen: 0 };
    e.seen++; inodes.set(key, e);
  });
  let bytes = 0, apparent = 0;
  for (const e of inodes.values()) { apparent += e.size * e.seen; if (e.seen >= e.nlink) bytes += e.size; }
  if (!dryRun) for (const p of doomed) rmSync(p, { recursive: true, force: true });
  const evidenceNamed = removed.map((r) => r.id).filter((id) => referencedIn(root, id));
  return { root, dryRun, hours, keptAttempts: kept, removedAttempts: removed.map(({ id, ageHours }) => ({ id, ageHours })), runs, bytes, apparent, files, evidenceNamed };
}

let evidenceText = null;
function referencedIn(root, id) {
  if (evidenceText === null) { evidenceText = ''; walk(join(root, 'docs', 'evidence'), (f, st) => { if (st.isFile() && /\.(md|json|txt|mjs|py)$/.test(f) && st.size < 64e6) evidenceText += readFileSync(f, 'utf8'); }); }
  return evidenceText.includes(id);
}

const mb = (n) => `${(n / 1e6).toFixed(1)} MB`;
export function pruneCommand(args, { say = (s = '') => process.stdout.write(s + '\n') } = {}) {
  const at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
  const r = prune({ root: resolve(at('--root') ?? ROOT), dryRun: args.includes('--dry-run'), hours: Number(at('--hours') ?? 12) });
  if (args.includes('--json')) { say(JSON.stringify(r, null, 1)); return r; }
  const verb = r.dryRun ? 'would free' : 'freed';
  say(`${r.root}/attempts/stages: keep ${r.keptAttempts.length} attempts (${r.keptAttempts.map((k) => `${k.id} [${k.why}]`).join(', ')})`);
  say(`  delete ${r.removedAttempts.length} attempts${r.evidenceNamed.length ? `; ${r.evidenceNamed.length} of them are named under docs/evidence (those citations will dangle): ${r.evidenceNamed.join(', ')}` : ''}`);
  for (const run of r.runs) say(`  ${run.attempt} ${run.dir.split('stage-output/')[1] ?? run.dir}: keep ${run.keep.join(', ')}; delete ${run.remove.length} older run(s)`);
  say(`${verb} ${mb(r.bytes)} (${(r.bytes / 1e9).toFixed(2)} GB) on disk; ${r.files} files, ${mb(r.apparent)} apparent (hardlinked files count once, and only when every link goes)${r.dryRun ? '; dry run: nothing deleted' : ''}`);
  return r;
}
