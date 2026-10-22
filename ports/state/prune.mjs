/**
 * `node scripts/pxc.mjs prune [--dry-run] [--root DIR] [--hours H] [--json]`: free the disk that attempts and re-runs
 * pile up (heritage's dev attempt held 4 S6 runs, 3 S7 runs and 2 S4 and S5 runs; attempts/stages held 99 attempts,
 * 12 GB). Attempts are reproducible from the recipe (DOCTRINE: "the ReproducibleRecipe is the artifact"). Keep rule:
 *
 *   attempts   every attempt named in an ATTEMPTS file (KEEP_FILES: dev and validation), plus every attempt with anything modified in the
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
 *   sweeps     attempts/sweeps/<id> (S7 grid sweeps): deleted when nothing modified it for H hours and no docs/evidence file names it
 *
 * Nothing else outside attempts/stages is touched (attempts/cas has its own `pxc cas --prune-older-than`). Bytes are counted
 * per inode: a hardlinked file frees its bytes only when every link to it is deleted, so the total is what the disk
 * gets back. --dry-run deletes nothing and prints the same report.
 */
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

export const ROOT = resolve(import.meta.dirname, '..', '..');
export const ATTEMPTS_FILE = 'docs/evidence/dev-s1s4/ATTEMPTS';
// every file whose attempts are kept: the dev courses `pxc state` reads, and the validation views the evidence cites
// (2026-10-22: the validation attempts were listed nowhere, so a retest's prune would have deleted them)
export const KEEP_FILES = Object.freeze([ATTEMPTS_FILE, 'docs/evidence/validation-s7/ATTEMPTS']);
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
  const sweeps = sweepsOf(root, { now }), sweepsRemoved = sweeps.filter((w) => !w.cited && w.ageHours >= hours);
  if (!existsSync(stages)) {
    const f = freedBy(sweepsRemoved.map((w) => w.path));
    if (!dryRun) for (const w of sweepsRemoved) rmSync(w.path, { recursive: true, force: true });
    return { root, dryRun, hours, removedAttempts: [], keptAttempts: [], runs: [], evidenceNamed: [], sweepsRemoved: sweepsRemoved.map((w) => w.id), sweepsKept: sweeps.filter((w) => !sweepsRemoved.includes(w)).map((w) => w.id), ...f };
  }
  const listed = listedAnywhere(root);
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
  const doomed = [...removed.flatMap((r) => r.paths), ...runs.flatMap((r) => r.remove.map((n) => join(r.dir, n))), ...sweepsRemoved.map((w) => w.path)];
  const { bytes, apparent, files } = freedBy(doomed);
  if (!dryRun) for (const p of doomed) rmSync(p, { recursive: true, force: true });
  const evidenceNamed = removed.map((r) => r.id).filter((id) => referencedIn(root, id));
  return { root, dryRun, hours, keptAttempts: kept, removedAttempts: removed.map(({ id, ageHours }) => ({ id, ageHours })), runs, bytes, apparent, files, evidenceNamed,
    sweepsRemoved: sweepsRemoved.map((w) => w.id), sweepsKept: sweeps.filter((w) => !sweepsRemoved.includes(w)).map((w) => w.id) };
}

/** Bytes the disk gets back by deleting `paths`: an inode is freed only when every one of its links is deleted. */
function freedBy(paths) {
  const inodes = new Map();
  let files = 0;
  for (const p of paths) walk(p, (_, st) => {
    if (st.isDirectory()) return;
    files++;
    const key = `${st.dev}:${st.ino}`, e = inodes.get(key) ?? { size: st.size, nlink: st.nlink, seen: 0 };
    e.seen++; inodes.set(key, e);
  });
  let bytes = 0, apparent = 0;
  for (const e of inodes.values()) { apparent += e.size * e.seen; if (e.seen >= e.nlink) bytes += e.size; }
  return { bytes, apparent, files };
}

/**
 * Every attempt id that any checkout of this repository lists in its ATTEMPTS (the main checkout and every worktree, which
 * share attempts/ by symlink): an attempt one checkout's state reads is never deleted from another.
 */
export function listedAnywhere(root) {
  let checkouts = [root];
  try { checkouts = execFileSync('git', ['-C', root, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' }).split('\n').filter((l) => l.startsWith('worktree ')).map((l) => l.slice(9)); } catch { /* not a git checkout: this one only */ }
  const ids = new Set();
  for (const c of new Set([root, ...checkouts])) {
    for (const rel of KEEP_FILES) {
      const f = join(c, rel);
      if (existsSync(f)) for (const l of readFileSync(f, 'utf8').split('\n')) { const id = l.trim().split(/\s+/)[1]; if (id) ids.add(id); }
    }
  }
  return ids;
}

/**
 * `pxc clean`: delete the attempts THIS checkout created (attempts/stages/<id>.json createdBy.checkout, written by the
 * toolkit run), except any attempt a checkout lists in its ATTEMPTS. Nothing another checkout or session created is ever
 * touched, whatever its age; an attempt without createdBy (older than the field) is never touched either.
 */
export function clean({ root = ROOT, dryRun = false } = {}) {
  const stages = join(root, 'attempts', 'stages');
  const me = realpathSync(root), listed = listedAnywhere(root), removed = [], kept = [];
  const sweeps = sweepsOf(root).filter((w) => w.mine), sweepsRemoved = sweeps.filter((w) => !w.cited);
  for (const n of (existsSync(stages) ? readdirSync(stages) : []).filter((n) => n.endsWith('.json') && ATTEMPT.test(n.slice(0, -5))).sort()) {
    const id = n.slice(0, -5);
    let by = null; try { by = JSON.parse(readFileSync(join(stages, n), 'utf8')).createdBy?.checkout ?? null; } catch { by = null; }
    if (by !== me) continue;
    if (listed.has(id)) { kept.push({ id, why: 'listed in an ATTEMPTS file' }); continue; }
    removed.push({ id, paths: [join(stages, id), join(stages, n)].filter((p) => existsSync(p)) });
  }
  const doomed = [...removed.flatMap((r) => r.paths), ...sweepsRemoved.map((w) => w.path)], freed = freedBy(doomed);
  if (!dryRun) for (const p of doomed) rmSync(p, { recursive: true, force: true });
  return { root, me, dryRun, removed: removed.map((r) => r.id), kept, sweepsRemoved: sweepsRemoved.map((w) => w.id), sweepsKept: sweeps.filter((w) => w.cited).map((w) => ({ id: w.id, why: 'named under docs/evidence' })), ...freed };
}

export function cleanCommand(args, { say = (s = '') => process.stdout.write(s + '\n') } = {}) {
  const at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
  const r = clean({ root: resolve(at('--root') ?? ROOT), dryRun: args.includes('--dry-run') });
  if (args.includes('--json')) { say(JSON.stringify(r, null, 1)); return r; }
  say(`${r.me ?? r.root}: ${r.dryRun ? 'would delete' : 'deleted'} ${r.removed.length} attempts this checkout created${r.kept.length ? `; kept ${r.kept.length} listed in ATTEMPTS` : ''}; ${r.sweepsRemoved.length} sweeps (attempts/sweeps)${r.sweepsKept.length ? `, kept ${r.sweepsKept.length} named under docs/evidence (${r.sweepsKept.map((k) => k.id).join(', ')})` : ''}; ${r.dryRun ? 'would free' : 'freed'} ${mb(r.bytes)}`);
  return r;
}

const evidenceText = new Map();   // root -> every evidence file's text, read once per process
function referencedIn(root, id) {
  if (!evidenceText.has(root)) { let t = ''; walk(join(root, 'docs', 'evidence'), (f, st) => { if (st.isFile() && /\.(md|json|txt|mjs|py)$/.test(f) && st.size < 64e6) t += readFileSync(f, 'utf8'); }); evidenceText.set(root, t); }
  return evidenceText.get(root).includes(id);
}

/**
 * S7 grid sweeps (attempts/sweeps/<id>/, ports/s7trace/gridSweep.mjs): small (cells of routes and metrics, no images) and
 * reproducible from their spec. A sweep whose id a file under docs/evidence names is kept (its results are cited); otherwise
 * `pxc clean` deletes the sweeps this checkout created (sweep.json createdBy.checkout) and `pxc prune` the sweeps nothing has
 * modified for H hours. -> [{ id, path, mine, ageHours, cited }]
 */
export function sweepsOf(root, { now = Date.now() } = {}) {
  const base = join(root, 'attempts', 'sweeps');
  if (!existsSync(base)) return [];
  let me = null; try { me = realpathSync(root); } catch { me = root; }
  return readdirSync(base).filter((id) => lstatSync(join(base, id)).isDirectory()).sort().map((id) => {
    const path = join(base, id);
    let by = null; try { by = JSON.parse(readFileSync(join(path, 'sweep.json'), 'utf8')).createdBy?.checkout ?? null; } catch { by = null; }
    return { id, path, mine: by === me, ageHours: Math.round((now - newestMtime([path])) / 3600e3 * 10) / 10, cited: referencedIn(root, id) };
  });
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
  say(`  attempts/sweeps: delete ${r.sweepsRemoved.length} (unmodified for ${r.hours} h and named nowhere under docs/evidence)${r.sweepsRemoved.length ? `: ${r.sweepsRemoved.join(', ')}` : ''}; keep ${r.sweepsKept.length}`);
  say(`${verb} ${mb(r.bytes)} (${(r.bytes / 1e9).toFixed(2)} GB) on disk; ${r.files} files, ${mb(r.apparent)} apparent (hardlinked files count once, and only when every link goes)${r.dryRun ? '; dry run: nothing deleted' : ''}`);
  return r;
}
