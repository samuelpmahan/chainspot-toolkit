/**
 * tk.state.matrix: the state of every stage on every dev course, derived, never typed (Sam, 2026-10-18: "What I really
 * want right now is for State to be derivable easily ... how do we track the goals and status of each stage across
 * courses?"). One row per stage x course: the stage's goal (stages/sN.json `responsibility`), what testimony expects,
 * what the judge finds (ports/judge, run live), and a status that follows from them:
 *
 *   stale      the code the cell was computed with differs from the working tree: the recipe closure (recipes/closure.mjs)
 *              against the attempt's own fork, and each post-recipe closure (POST_RECIPE_CLOSURES) against the shas
 *              recorded when that step ran (`<stage-output>/state/closures.json`, written by `state --retest`)
 *   missing    the attempt has no output for the stage
 *   unjudged   no testimony for the course: count closure is shown, never 'met'
 *   met        judged with FN = 0 and FP = 0 (FP counted only where testimony is complete); S1: no missing labels and no
 *              duplicates; association: nothing wrong and nothing unassociated
 *   unmet      otherwise
 *
 * Freshness is reported beside the status: VERIFIED, STALE (with the changed paths), UNVERIFIED (a post-recipe step ran
 * before closures were recorded) or MISSING. Only STALE changes the status. The matrix is a Part: profiled (emits),
 * renderable (a ledger), with units.
 *
 *   node scripts/pxc.mjs state                 print the matrix; write attempts/state/matrix.{json,flipbook.html}
 *   node scripts/pxc.mjs state --retest [all] [--course a,b]  re-run the stale, unverified and missing cells (all: every
 *                                              cell; --course: these courses only), then print
 *   node scripts/pxc.mjs state --freeze        record rows and closures in docs/evidence/dev-s1s4/frozen.json; later
 *                                              matrices show each row as same / changed / new against it
 *   node scripts/pxc.mjs state --prune [--dry-run]  delete every attempt under attempts/stages that nothing under
 *                                              docs/evidence references (Sam: "Reproducibility is the key"); --retest prunes
 *                                              automatically once it has finished
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { deserialize } from 'node:v8';
import { snapshotPaths, differences, sha, canonical } from '../../facts.mjs';
import { stageState } from '../../recipes/closure.mjs';
import { judgeAttempt } from '../judge/judge.mjs';
import { createPartStore } from '../../fg/store.mjs';
import { partFrame } from '../../fg/render.mjs';
import { renderFlipbook } from '../../fg/flipbook.mjs';

export const ROOT = resolve(import.meta.dirname, '..', '..');
export const ATTEMPTS_FILE = 'docs/evidence/dev-s1s4/ATTEMPTS';
export const FROZEN_FILE = 'docs/evidence/dev-s1s4/frozen.json';
export const MATRIX_PART = 'tk.state.matrix';
export const MATRIX_CALCULATION = 'fn.tk.state.matrix';
export const S4_BRANCH = 'greedyOccluded';

/** The cells of a course, in stage order, and which closures each was computed with. */
export const CELLS = Object.freeze([
  { key: 'S1', stage: 'S1', what: 'badges', closures: ['recipe'] },
  { key: 'S2', stage: 'S2', what: 'baskets', closures: ['recipe'] },
  { key: 'S3', stage: 'S3', what: 'tees', closures: ['recipe'] },
  { key: 'S3association', stage: 'S3', what: 'tee to badge', closures: ['recipe', 's3assoc'] },
  { key: 'S4baskets', stage: 'S4', what: 'baskets after recovery', closures: ['recipe'] },
  { key: 'S4tees', stage: 'S4', what: `tees after recovery (${S4_BRANCH})`, closures: ['recipe', 's4recover'] }
]);
/** The steps outside the recipe, and the files each runs from (the recipe closure already covers fg/ and ports/early). */
export const POST_RECIPE_CLOSURES = Object.freeze({
  s3assoc: ['ports/s3assoc'],
  s4recover: ['ports/s4recover', 'impl/fn.Tee.recover', 'contracts/tee.pose@1.mjs']
});
export const UNITS = Object.freeze({
  cells: 'count (stage x course cells)', stale: 'count (cells)', unmet: 'count (cells)', unjudged: 'count (cells)', missing: 'count (cells)', met: 'count (cells)'
});

// ------------------------------------------------------------------------------------------------ the pure part

/** The status rule (Sam, 2026-10-18, "status rule as written"). */
export function statusOf(cell, course, result, freshness) {
  if (cell.closures.some((k) => freshness[k]?.state === 'STALE')) return 'stale';
  if (!result) return 'missing';
  if (!course.testimony) return 'unjudged';
  if (cell.key === 'S1') return result.labelsMissing.length === 0 && result.duplicates.length === 0 ? 'met' : 'unmet';
  if (cell.key === 'S3association') return result.associatedIncorrectly === 0 && result.notAssociated === 0 ? 'met' : 'unmet';
  return result.FN === 0 && (!course.testimony.complete || result.FP === 0) ? 'met' : 'unmet';
}

const judgedOf = (course, key) => {
  const s = course.judgement?.[key];
  if (!s) return null;
  return key === 'S4tees' ? (s.branches?.[S4_BRANCH] ?? null) : s;
};
const holes = (t) => (t.complete ? `all ${t.annotatedHoles.length} holes` : `holes ${t.annotatedHoles.join(', ')}`);
const fpOf = (course, r) => (course.testimony.complete ? r.FP : '-');

function expectedOf(cell, course) {
  const t = course.testimony;
  if (!t) return `N = ${course.N} badges (no testimony: count closure only)`;
  if (cell.key === 'S1') return `badge labels for ${holes(t)}`;
  if (cell.key === 'S3association') return `every judged tee associated to its own badge (${holes(t)})`;
  return `${cell.what} within ${cell.what.startsWith('baskets') ? 12 : 8} px of ${holes(t)}`;
}

function resultOf(cell, course, r) {
  const c = course.counts;
  if (!course.testimony) {
    const found = { S1: c.badges, S2: c.baskets, S3: c.tees, S3association: c.associated, S4baskets: c.baskets + c.s4baskets, S4tees: c.tees + c.s4tees }[cell.key];
    return found == null ? null : `${found} of N = ${course.N}`;
  }
  if (!r) return null;
  if (cell.key === 'S1') return `${r.found} found; missing ${r.labelsMissing.length}, duplicates ${r.duplicates.length}`;
  if (cell.key === 'S3association') return `${r.associatedCorrectly} right / ${r.associatedIncorrectly} wrong / ${r.notAssociated} none`;
  const rec = r.recovered != null ? ` (+${r.recovered} recovered${r.recoveredForHoleCorrectly != null ? `, ${r.recoveredForHoleCorrectly} right hole` : ''})` : '';
  return `${r.TP}/${r.FN}/${fpOf(course, r)} TP/FN/FP${rec}`;
}

function presentOf(cell, course) {
  const o = course.outputs;
  return { S1: o.early, S2: o.early, S3: o.s3fix, S3association: o.s3assoc, S4baskets: o.basketBridge, S4tees: o.s4recover }[cell.key];
}

function freshnessOf(cell, course) {
  const states = cell.closures.map((k) => course.freshness[k] ?? { state: 'UNVERIFIED' });
  const changed = states.flatMap((f) => f.changed ?? []);
  const state = states.some((f) => f.state === 'STALE') ? 'STALE' : states.some((f) => f.state === 'UNVERIFIED') ? 'UNVERIFIED' : states.some((f) => f.state === 'UNKNOWN') ? 'UNKNOWN' : 'VERIFIED';
  return { state, changed };
}

/**
 * inputs: { declarations: { S1: { responsibility }, ... }, courses: [{ course, attempt, testimony, N, counts, judgement,
 * outputs, freshness }] }. frozen: a frozen.json value or null. Returns the matrix Part value.
 */
export function matrixRows(inputs, frozen = null) {
  const was = new Map((frozen?.rows ?? []).map((r) => [`${r.course} ${r.key}`, r]));
  const rows = [];
  for (const course of inputs.courses) for (const cell of CELLS) {
    const present = presentOf(cell, course);
    const judged = present ? judgedOf(course, cell.key) : null;
    const result = present ? resultOf(cell, course, judged) : null;
    const freshness = freshnessOf(cell, course);
    const status = statusOf(cell, course, course.testimony ? judged : result, course.freshness);
    const f = was.get(`${course.course} ${cell.key}`);
    rows.push({
      course: course.course, key: cell.key, stage: cell.stage, what: cell.what,
      goal: inputs.declarations[cell.stage]?.responsibility ?? null,
      expected: expectedOf(cell, course), result, status,
      freshness: freshness.state, changedPaths: freshness.changed,
      vsFrozen: !frozen ? null : !f ? 'new' : f.result === result && (status === f.status || status === 'stale') ? 'same' : `changed (was ${f.status}: ${f.result})`,
      attempt: course.attempt
    });
  }
  const count = (s) => rows.filter((r) => r.status === s).length;
  return { rows, courses: inputs.courses.map((c) => c.course), cells: CELLS.map((c) => c.key),
    emits: { cells: rows.length, met: count('met'), unmet: count('unmet'), unjudged: count('unjudged'), missing: count('missing'), stale: count('stale') }, units: UNITS };
}

/** The matrix as a markdown table (the legible render of the ledger). */
export function matrixMarkdown(m) {
  const L = ['| course | cell | expected | result | status | freshness' + (m.rows.some((r) => r.vsFrozen) ? ' | vs frozen' : '') + ' |', '|---|---|---|---|---|---' + (m.rows.some((r) => r.vsFrozen) ? '|---' : '') + '|'];
  for (const r of m.rows) {
    const fresh = r.freshness + (r.changedPaths.length ? ` (${r.changedPaths.length} path${r.changedPaths.length > 1 ? 's' : ''}: ${r.changedPaths.slice(0, 3).join(', ')}${r.changedPaths.length > 3 ? ', ...' : ''})` : '');
    L.push(`| ${r.course} | ${r.key} ${r.what} | ${r.expected} | ${r.result ?? '-'} | **${r.status}** | ${fresh}${r.vsFrozen ? ` | ${r.vsFrozen}` : ''} |`);
  }
  const e = m.emits;
  L.push('', `${e.cells} cells: ${e.met} met, ${e.unmet} unmet, ${e.unjudged} unjudged, ${e.missing} missing, ${e.stale} stale.`);
  const goals = new Map(m.rows.map((r) => [r.stage, r.goal]));
  L.push('', 'Goals (stages/*.json responsibility):', ...[...goals].map(([s, g]) => `- ${s}: ${g}`));
  return L.join('\n');
}

// ------------------------------------------------------------------------------------------------ the inputs (I/O)

export const readAttempts = (root = ROOT) => (existsSync(join(root, ATTEMPTS_FILE))
  ? readFileSync(join(root, ATTEMPTS_FILE), 'utf8').trim().split('\n').filter(Boolean).map((l) => l.split(/\s+/)) : []);
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const closureSnapshot = async (root, paths) => { const files = await snapshotPaths(root, paths.filter((p) => existsSync(join(root, p)))); return { files: files.map((f) => [f.path, f.sha256]), sha: sha(canonical(files.map((f) => [f.path, f.sha256]))) }; };

/**
 * The modules a run can reach from its entries, by following relative static and dynamic imports (the recipe closure
 * copies whole directories, so a test file or a renderer nobody imports would otherwise make every cell stale).
 */
export function reachableModules(root, entries) {
  const seen = new Set(), todo = [...entries];
  while (todo.length) {
    const rel = todo.pop(); if (seen.has(rel) || !existsSync(join(root, rel))) continue; seen.add(rel);
    const src = readFileSync(join(root, rel), 'utf8');
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const target = join(rel, '..', m[1]).replace(/^\.\//, '');
      todo.push(target.replace(/\\/g, '/'));
    }
  }
  return seen;
}
export const RUN_ENTRIES = Object.freeze(['toolkit.mjs', 'ports/run-stages.mjs']);
/** The run's entries plus what it discovers by directory listing: every FG (fg/**\/*.fg.mjs) and every implementation (impl/**). */
export function runEntries(root) {
  const found = [];
  const walk = (dir, test) => { if (!existsSync(join(root, dir))) return; for (const e of readdirSync(join(root, dir), { withFileTypes: true })) { const rel = `${dir}/${e.name}`; if (e.isDirectory()) walk(rel, test); else if (test(e.name)) found.push(rel); } };
  walk('fg', (n) => n.endsWith('.fg.mjs')); walk('impl', (n) => n.endsWith('.mjs') && !n.endsWith('.test.mjs'));
  return [...RUN_ENTRIES, ...found];
}
const isCode = (p) => /\.(mjs|js|cjs|ts)$/.test(p) && !/^source\//.test(p);   // the pinned provider is data: it is loaded by path, not by import

/** The working tree's recipe closure for an attempt's request, against the attempt's own fork of it: only what the run can reach. */
async function recipeFreshness(root, forkRoot, request) {
  try {
    const st = await stageState(root, { sourcePath: request.sourcePath, recipePath: request.recipe, selection: { until: request.until, lanes: request.lanes, only: request.only ?? undefined } });
    const reach = new Set([...reachableModules(root, runEntries(root)), ...reachableModules(forkRoot, runEntries(forkRoot))]);
    const relevant = (p) => !isCode(p) || reach.has(p) || p.startsWith('impl/') || p.startsWith('contracts/');   // impl/ and contracts/ are discovered by readdir
    const files = st.files.filter((f) => relevant(f.path));
    const forkFiles = await snapshotPaths(forkRoot, files.map((f) => f.path).filter((p) => existsSync(join(forkRoot, p))));
    const changed = differences(forkFiles, files).map((d) => d.path);
    return { state: changed.length ? 'STALE' : 'VERIFIED', changed, reachable: reach.size };
  } catch (error) { return { state: 'UNKNOWN', changed: [], error: String(error.message ?? error) }; }
}

async function postRecipeFreshness(root, out) {
  const recorded = existsSync(join(out, 'state', 'closures.json')) ? readJson(join(out, 'state', 'closures.json')) : {};
  const f = {};
  for (const [k, paths] of Object.entries(POST_RECIPE_CLOSURES)) {
    const now = await closureSnapshot(root, paths), was = recorded[k];
    if (!was) f[k] = { state: 'UNVERIFIED', changed: [] };
    else { const changed = differences(was.files.map(([path, sha256]) => ({ path, sha256 })), now.files.map(([path, sha256]) => ({ path, sha256 }))).map((d) => d.path); f[k] = { state: changed.length ? 'STALE' : 'VERIFIED', changed }; }
  }
  return f;
}

export async function loadCourse(root, course, attempt) {
  const forkRoot = join(root, 'attempts', 'stages', attempt, 'fork'), out = join(forkRoot, 'stage-output'), A = join(out, 'early', 'artifacts');
  const snap = join(out, 'early', 's3.pxc.bin');
  const outputs = { early: existsSync(snap), s3fix: existsSync(join(A, 's3fix', 'px.tees.refined.json')), s3assoc: existsSync(join(out, 's3assoc', 'px.tees.association.json')),
    basketBridge: existsSync(join(out, 'basket-bridge', 'basket-recovery.part.json')), s4recover: existsSync(join(out, 's4recover')) && readdirSync(join(out, 's4recover')).some((d) => d.startsWith('run-')) };
  const request = existsSync(join(out, 'summary.json')) ? readJson(join(out, 'summary.json')).request : null;
  const board = outputs.early ? new Map(deserialize(readFileSync(snap))) : new Map();
  const N = board.get('px.badges')?.length ?? null;
  const counts = { badges: N, baskets: board.get('px.baskets')?.length ?? null, tees: outputs.s3fix ? readJson(join(A, 's3fix', 'px.tees.refined.json')).tees.length : null,
    associated: outputs.s3assoc ? readJson(join(out, 's3assoc', 'px.tees.association.json')).rows.filter((r) => r.best).length : null,
    s4baskets: outputs.basketBridge ? (readJson(join(out, 'basket-bridge', 'basket-recovery.part.json')).comparisons?.accepted ?? []).filter((d) => d.classification !== 'existing-s2-exact').length : null,
    s4tees: null };
  if (outputs.s4recover) {
    const run = readdirSync(join(out, 's4recover')).filter((d) => d.startsWith('run-')).sort().at(-1), f = join(out, 's4recover', run, 'artifacts', 'fn.Tee.recover', S4_BRANCH, 'recovered.json');
    counts.s4tees = existsSync(f) ? (readJson(f).recovered ?? []).length : null;
  }
  let judgement = null, testimony = null;
  if (outputs.early) {
    try { const j = judgeAttempt({ specimen: course, attempt, root }); testimony = j.testimony; judgement = j.stages ?? null; } catch (error) { judgement = null; }
  }
  // the objects themselves, for renders (the inspector) and for courses without testimony
  const s4run = outputs.s4recover ? readdirSync(join(out, 's4recover')).filter((d) => d.startsWith('run-')).sort().at(-1) : null;
  const recovered = s4run && existsSync(join(out, 's4recover', s4run, 'artifacts', 'fn.Tee.recover', S4_BRANCH, 'recovered.json')) ? readJson(join(out, 's4recover', s4run, 'artifacts', 'fn.Tee.recover', S4_BRANCH, 'recovered.json')) : null;
  const objects = {
    badges: (board.get('px.badges') ?? []).map((b) => ({ label: b.label, bbox: b.bbox })),
    baskets: (board.get('px.baskets') ?? []).map((k) => ({ bbox: k.bbox })),
    tees: outputs.s3fix ? readJson(join(A, 's3fix', 'px.tees.refined.json')).tees.map((t) => ({ center: t.center, bbox: t.bbox, angleRad: t.angleRad })) : [],
    association: outputs.s3assoc ? readJson(join(out, 's3assoc', 'px.tees.association.json')).rows.map((r) => ({ center: r.center, said: r.best ? Number(r.best.badge) : null })) : [],
    s4baskets: outputs.basketBridge ? (readJson(join(out, 'basket-bridge', 'basket-recovery.part.json')).comparisons?.accepted ?? []).filter((d) => d.classification !== 'existing-s2-exact').map((d) => ({ bbox: d.semanticBbox, tier: d.tier })) : [],
    s4tees: (recovered?.recovered ?? []).map((t) => ({ center: t.center, corners: t.corners ?? null, forHole: t.hole, rule: t.rule, confidence: t.confidence ?? null, visibleFrameFrac: t.evidence?.visibleFrameFrac ?? null })),
    s4missed: (recovered?.missed ?? []).map((m) => ({ hole: m.hole, reason: m.reason }))
  };
  const paths = { out, snap, forkRoot, s4run: s4run ? join(out, 's4recover', s4run) : null };
  const freshness = { ...(request ? { recipe: await recipeFreshness(root, forkRoot, request) } : { recipe: { state: 'UNKNOWN', changed: [] } }), ...(await postRecipeFreshness(root, out)) };
  return { course, attempt, request, testimony, N, counts, judgement, outputs, freshness, objects, paths };
}

export async function loadStateInputs(root = ROOT, attempts = readAttempts(root)) {
  const declarations = {};
  for (const n of [1, 2, 3, 4]) { const p = join(root, 'stages', `s${n}.json`); if (existsSync(p)) declarations[`S${n}`] = { responsibility: readJson(p).responsibility }; }
  const courses = [];
  for (const [course, attempt] of attempts) courses.push(await loadCourse(root, course, attempt));
  return { declarations, courses };
}

// ------------------------------------------------------------------------------------------------ the Part

/** The matrix on a store: the inputs are a root Part, the matrix is derived from it (profiled, renderable). */
export function registerStateMatrix(store, inputs, frozen = null) {
  store.constant('fn.tk.state.inputs', { 'tk.state.inputs': inputs, 'tk.state.frozen': frozen });
  store.register(MATRIX_CALCULATION, { inParts: ['tk.state.inputs', 'tk.state.frozen'], outParts: [MATRIX_PART], note: 'the state of every stage on every dev course, derived (ports/state/matrix.mjs)',
    calculate: (io) => ({ [MATRIX_PART]: matrixRows(io.in('tk.state.inputs'), io.in('tk.state.frozen')) }) });
  return store;
}

export async function stateMatrix(root = ROOT, { attempts = readAttempts(root) } = {}) {
  const frozen = existsSync(join(root, FROZEN_FILE)) ? readJson(join(root, FROZEN_FILE)) : null;
  const store = registerStateMatrix(createPartStore({ name: 'state' }), await loadStateInputs(root, attempts), frozen);
  const matrix = store.get(MATRIX_PART);
  const dir = join(root, 'attempts', 'state'); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'matrix.json'), JSON.stringify({ at: new Date().toISOString(), ...matrix }, null, 1) + '\n');
  writeFileSync(join(dir, 'matrix.flipbook.html'), renderFlipbook([partFrame(MATRIX_PART, { rows: matrix.rows.map(({ changedPaths, goal, ...r }) => r), ...matrix.emits })], { title: 'State matrix: every stage on every dev course' }));
  const { writeInspector } = await import('./inspect.mjs');
  const inspector = writeInspector(root, matrix, store.get('tk.state.inputs'));
  return { matrix, store, frozen, written: ['attempts/state/matrix.json', 'attempts/state/matrix.flipbook.html', inspector] };
}

/** Freeze: the rows and the closures they were computed with become the record a later matrix is compared against. */
export async function freeze(root, matrix, inputs) {
  const closures = {};
  for (const [k, paths] of Object.entries(POST_RECIPE_CLOSURES)) closures[k] = (await closureSnapshot(root, paths)).sha;
  const doc = { schema: 'nctk-state-frozen@1', at: new Date().toISOString(), closures,
    rows: matrix.rows.map(({ course, key, expected, result, status, attempt }) => ({ course, key, expected, result, status, attempt })),
    attempts: Object.fromEntries(inputs.courses.map((c) => [c.course, c.attempt])) };
  writeFileSync(join(root, FROZEN_FILE), JSON.stringify(doc, null, 1) + '\n');
  return doc;
}

// ------------------------------------------------------------------------------------------------ retest

const DEV_REQUEST = Object.freeze({ recipe: 'recipes/chainspot-s0-s7.json', until: 4, lanes: ['s3-findfamily-structural-fix', 's4.basketRecovery'] });
const run = (root, args, log) => { log(`  $ node ${args.join(' ')}`); const r = spawnSync('node', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); if (r.status !== 0) throw new Error(`${args[0]} failed (${r.status}): ${(r.stderr || r.stdout).slice(-2000)}`); return r.stdout; };

/** Re-run exactly the cells that need it, record the closures each step ran with, and update ATTEMPTS. */
export async function retest(root, inputs, { all = false, only = null, log = () => {} } = {}) {
  const attempts = new Map(readAttempts(root));
  const needs = (c, k) => all || !c.freshness[k] || c.freshness[k].state !== 'VERIFIED';
  for (const c of inputs.courses) {
    if (only && !only.includes(c.course)) continue;
    let attempt = c.attempt, out = join(root, 'attempts', 'stages', attempt, 'fork', 'stage-output');
    const req = c.request ?? DEV_REQUEST;
    const redoRecipe = needs(c, 'recipe') || !c.outputs.early || !c.outputs.s3fix || !c.outputs.basketBridge;
    if (redoRecipe) {
      log(`${c.course}: recipe ${c.freshness.recipe?.state ?? 'MISSING'}${c.freshness.recipe?.changed?.length ? ` (${c.freshness.recipe.changed.slice(0, 4).join(', ')})` : ''}: re-running S0-S${req.until}`);
      const neat = run(root, ['toolkit.mjs', 'neat', '--recipe', req.recipe, '--specimen', c.course, '--until', String(req.until), '--lanes', req.lanes.join(',')], log);
      const next = /"next": "node (.*)"/.exec(neat)?.[1]; if (!next) throw new Error(`${c.course}: neat printed no next command`);
      const ran = run(root, next.split(' '), log);
      attempt = /attempts\/stages\/(attempt-[0-9a-f-]+)\//.exec(ran)?.[1]; if (!attempt) throw new Error(`${c.course}: run printed no attempt id`);
      out = join(root, 'attempts', 'stages', attempt, 'fork', 'stage-output'); attempts.set(c.course, attempt);
    }
    const closures = existsSync(join(out, 'state', 'closures.json')) ? readJson(join(out, 'state', 'closures.json')) : {};
    const record = async (k) => { closures[k] = { ...(await closureSnapshot(root, POST_RECIPE_CLOSURES[k])), at: new Date().toISOString() }; mkdirSync(join(out, 'state'), { recursive: true }); writeFileSync(join(out, 'state', 'closures.json'), JSON.stringify(closures, null, 1) + '\n'); };
    if (redoRecipe || needs(c, 's3assoc') || !c.outputs.s3assoc) { log(`${c.course}: S3 association`); run(root, ['ports/s3assoc/run.mjs', '--specimen', c.course, '--attempt', attempt], log); await record('s3assoc'); }
    if (redoRecipe || needs(c, 's4recover') || !c.outputs.s4recover) { log(`${c.course}: S4 tee recovery`); run(root, ['ports/s4recover/run.mjs', '--specimen', c.course, '--attempt', attempt], log); await record('s4recover'); }
  }
  writeFileSync(join(root, ATTEMPTS_FILE), [...attempts].map(([c, a]) => `${c} ${a}`).join('\n') + '\n');
  return [...attempts];
}

// ------------------------------------------------------------------------------------------------ prune

/** Every attempt id named anywhere under docs/evidence (ATTEMPTS files, judge and s4r JSON, notes) plus the current ATTEMPTS. */
export function referencedAttempts(root = ROOT) {
  const ids = new Set(readAttempts(root).map(([, a]) => a));
  const walk = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) walk(p); else if (/\.(md|json|py|mjs|txt)$/.test(e.name) || e.name === 'ATTEMPTS') for (const m of readFileSync(p, 'utf8').matchAll(/attempt-\d+-[0-9a-f]+/g)) ids.add(m[0]); } };
  if (existsSync(join(root, 'docs', 'evidence'))) walk(join(root, 'docs', 'evidence'));
  return ids;
}
const dirBytes = (dir) => { let n = 0; for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name); n += e.isDirectory() ? dirBytes(p) : statSync(p).size; } return n; };

/** Attempts are reproducible from the recipe; only the ones evidence names are kept. Returns what was (or would be) removed. */
export function pruneAttempts(root = ROOT, { dryRun = false } = {}) {
  const keep = referencedAttempts(root), dir = join(root, 'attempts', 'stages');
  if (!existsSync(dir)) return { removed: [], kept: [], bytes: 0 };
  const all = readdirSync(dir).filter((d) => d.startsWith('attempt-')), removed = [], kept = [];
  let bytes = 0;
  for (const name of all) {
    const id = name.replace(/\.json$/, '');
    if (keep.has(id)) { kept.push(id); continue; }
    const p = join(dir, name); bytes += statSync(p).isDirectory() ? dirBytes(p) : statSync(p).size;
    removed.push(name); if (!dryRun) rmSync(p, { recursive: true, force: true });
  }
  return { removed, kept: [...new Set(kept)], bytes };
}

// ------------------------------------------------------------------------------------------------ CLI

export async function stateCommand(args, { root = ROOT, say = (s = '') => process.stdout.write(s + '\n') } = {}) {
  const retestAt = args.indexOf('--retest');
  if (retestAt >= 0) {
    const inputs = await loadStateInputs(root);
    const all = args[retestAt + 1] === 'all', at = args.indexOf('--course');
    await retest(root, inputs, { all, only: at >= 0 ? args[at + 1].split(',') : null, log: say });
    const p = pruneAttempts(root); say(`pruned ${p.removed.length} unreferenced attempts (${(p.bytes / 1e9).toFixed(2)} GB); kept ${p.kept.length}`);
  }
  if (args.includes('--prune')) {
    const p = pruneAttempts(root, { dryRun: args.includes('--dry-run') });
    say(`${args.includes('--dry-run') ? 'would remove' : 'removed'} ${p.removed.length} unreferenced attempts (${(p.bytes / 1e9).toFixed(2)} GB); kept ${p.kept.length}: ${p.kept.join(', ')}`);
    if (args.includes('--dry-run')) return { removed: p.removed, kept: p.kept };
  }
  const { matrix, written, store } = await stateMatrix(root);
  if (args.includes('--freeze')) { const inputs = store.get('tk.state.inputs'); const doc = await freeze(root, matrix, inputs); written.push(FROZEN_FILE); say(`frozen ${doc.rows.length} rows at ${doc.at}`); }
  say(args.includes('--json') ? JSON.stringify(matrix, null, 1) : matrixMarkdown(matrix));
  say(`\nwritten: ${written.join(', ')}`);
  return matrix;
}
