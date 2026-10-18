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
 *              duplicates; association: nothing wrong and nothing unassociated. S2 and S3 expect occlusion and recovery
 *              (Sam, 2026-10-18: "they should pass as long as S4 recovers for them"): an S2 or S3 FN whose hole S4
 *              recovers (a TP in S4baskets / S4tees) does not make the cell unmet
 *   unmet      otherwise
 *
 * Freshness is reported beside the status: VERIFIED, STALE (with the changed paths), UNVERIFIED (a post-recipe step ran
 * before closures were recorded) or MISSING. Only STALE changes the status. The matrix is a Part: profiled (emits),
 * renderable (a ledger), with units.
 *
 *   node scripts/pxc.mjs state                 print the matrix; write attempts/state/matrix.{json,flipbook.html}
 *   node scripts/pxc.mjs state --retest [all] [--course a,b]  re-run the stale, unverified and missing cells (all: every
 *                                              cell; --course: these courses only), then print
 *   node scripts/pxc.mjs state --freeze        record rows, every object's geometry and the closures in
 *                                              docs/evidence/dev-s1s4/frozen.json; later matrices and inspectors show
 *                                              each cell and object as same / changed / new against it (before drawn dashed)
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
import { reachableModules } from '../../fg/closure.mjs';

export const ROOT = resolve(import.meta.dirname, '..', '..');
export const ATTEMPTS_FILE = 'docs/evidence/dev-s1s4/ATTEMPTS';
export const FROZEN_FILE = 'docs/evidence/dev-s1s4/frozen.json';
export const MATRIX_PART = 'tk.state.matrix';
export const MATRIX_CALCULATION = 'fn.tk.state.matrix';
/** The S4 tee variant a course ships: the pointer the runner set by its stated rule (cmp.fn.Tee.recover.json accepted), never a constant here. */
export const s4Accepted = (course) => course.s4?.accepted ?? null;
/** The S5 pairing variant a course ships: the pointer its runner set by its stated rule (cmp.fn.Tee.pairBadge.json accepted). */
export const s5Accepted = (course) => course.s5?.accepted ?? null;
/** The S6 straight variant a course ships: the pointer ports/s6straight/run.mjs set (cmp.fn.Hole.straight.json accepted). */
export const s6Accepted = (course) => course.s6?.accepted ?? null;

/** The cells of a course, in stage order, and which closures each was computed with. */
export const CELLS = Object.freeze([
  { key: 'S1', stage: 'S1', what: 'badges', closures: ['recipe'] },
  { key: 'S2', stage: 'S2', what: 'baskets', closures: ['recipe'] },
  { key: 'S3', stage: 'S3', what: 'tees', closures: ['recipe'] },
  { key: 'S3association', stage: 'S3', what: 'tee to badge', closures: ['recipe', 's3assoc'] },
  { key: 'S4baskets', stage: 'S4', what: 'baskets after recovery', closures: ['recipe'] },
  { key: 'S4tees', stage: 'S4', what: 'tees after recovery (accepted variant)', closures: ['recipe', 's4recover'] },
  { key: 'S5pairs', stage: 'S5', what: 'tee to badge after recovery (accepted variant)', closures: ['recipe', 's5pair'] },
  { key: 'S6straight', stage: 'S6', what: 'straight vs bent per tee-badge pair (accepted variant)', closures: ['recipe', 's6straight'] }
]);
/** The steps outside the recipe, and the files each runs from (the recipe closure already covers fg/ and ports/early). */
export const POST_RECIPE_CLOSURES = Object.freeze({
  s3assoc: ['ports/s3assoc'],
  s4recover: ['ports/s4recover', 'impl/fn.Tee.recover', 'contracts/tee.pose@1.mjs'],
  // the S5 runner and its implementations, plus what they import outside them (the plate centres are S4's Calculation)
  s5pair: ['ports/s5pair', 'impl/fn.Tee.pairBadge', 'ports/s4recover/teeRecover.mjs', 'ports/s4recover/poseSpace.mjs', 'ports/judge/testimony.mjs'],
  s6straight: ['ports/s6straight', 'impl/fn.Hole.straight', 'ports/s3assoc/associate.mjs', 'ports/judge/testimony.mjs']
});
export const UNITS = Object.freeze({
  cells: 'count (stage x course cells)', stale: 'count (cells)', unmet: 'count (cells)', unjudged: 'count (cells)', missing: 'count (cells)', met: 'count (cells)'
});

// ------------------------------------------------------------------------------------------------ the pure part

/** The holes S4 recovered for an S2 or S3 cell: a TP (observed or recovered) in the S4 cell of the same kind. */
export function recoveredHoles(course, key) {
  const rows = key === 'S2' ? course.judgement?.S4baskets?.rows : key === 'S3' ? course.judgement?.S4tees?.branches?.[s4Accepted(course)]?.rows : null;
  return new Set((rows ?? []).filter((r) => r.verdict === 'TP' || r.verdict === 'recoveredTP').map((r) => r.hole));
}
/** The FN holes of an S2 / S3 result that S4 did not recover (the only FNs that count against them). */
export const unrecoveredFn = (cell, course, result) => (result?.rows ?? []).filter((r) => r.verdict === 'FN' && !recoveredHoles(course, cell.key).has(r.hole)).map((r) => r.hole);

/** The status rule (Sam, 2026-10-18, "status rule as written"; S2/S3 pass when S4 recovers their misses). */
export function statusOf(cell, course, result, freshness) {
  if (cell.closures.some((k) => freshness[k]?.state === 'STALE')) return 'stale';
  if (!result) return 'missing';
  if (!course.testimony) return 'unjudged';
  if (cell.key === 'S1') return result.labelsMissing.length === 0 && result.duplicates.length === 0 ? 'met' : 'unmet';
  if (cell.key === 'S3association') return result.associatedIncorrectly === 0 && result.notAssociated === 0 ? 'met' : 'unmet';
  if (cell.key === 'S5pairs') return result.wrong === 0 && result.none === 0 ? 'met' : 'unmet';   // every judged tee pairs with its own badge; none unpaired
  if (cell.key === 'S6straight') return result.FP === 0 && result.FN === 0 ? 'met' : 'unmet';   // on judged pairs (testimony: no corridorBends = straight)
  const fn = cell.key === 'S2' || cell.key === 'S3' ? (result.rows ? unrecoveredFn(cell, course, result).length : result.FN) : result.FN;
  return fn === 0 && (!course.testimony.complete || result.FP === 0) ? 'met' : 'unmet';
}

const judgedOf = (course, key) => {
  const s = course.judgement?.[key];
  if (!s) return null;
  return key === 'S4tees' ? (s.branches?.[s4Accepted(course)] ?? null) : key === 'S5pairs' ? (s.variants?.[s5Accepted(course)] ?? null) : key === 'S6straight' ? (s.variants?.[s6Accepted(course)] ?? null) : s;
};
const holes = (t) => (t.complete ? `all ${t.annotatedHoles.length} holes` : `holes ${t.annotatedHoles.join(', ')}`);
const fpOf = (course, r) => (course.testimony.complete ? r.FP : '-');

function expectedOf(cell, course) {
  const t = course.testimony;
  if (!t) return `N = ${course.N} badges (no testimony: count closure only)`;
  if (cell.key === 'S1') return `badge labels for ${holes(t)}`;
  if (cell.key === 'S3association') return `every judged tee associated to its own badge (${holes(t)})`;
  if (cell.key === 'S5pairs') return `every judged tee (S3 + S4) paired with its own hole's badge, none unpaired (${holes(t)}; tee within 8 px)`;
  if (cell.key === 'S6straight') return `straight vs bent as Sam's corridorBends (none = straight) on every judged pair (${holes(t)}; tee within 8 px), FP = 0 and FN = 0; basket within 12 px`;
  const orS4 = cell.key === 'S2' || cell.key === 'S3' ? ', or recovered by S4 (occlusion is expected)' : '';
  return `${cell.what} within ${cell.what.startsWith('baskets') ? 12 : 8} px of ${holes(t)}${orS4}`;
}

function resultOf(cell, course, r) {
  const c = course.counts;
  if (cell.key === 'S6straight') {
    if (!course.testimony) return course.s6?.counts ? `${course.s6.counts.straight} straight / ${course.s6.counts.bent} bent / ${course.s6.counts.unknown} unknown of ${course.s6.counts.pairs} pairs` : null;
    return r ? `${r.TP}/${r.FP}/${r.FN}/${r.TN} TP/FP/FN/TN on ${r.judgedPairs} judged pairs; straight with wrong basket ${r.straightWithWrongBasket}` : null;
  }
  if (!course.testimony) {
    const found = { S1: c.badges, S2: c.baskets, S3: c.tees, S3association: c.associated, S4baskets: c.baskets + c.s4baskets, S4tees: c.tees + c.s4tees, S5pairs: c.paired }[cell.key];
    return found == null ? null : `${found} of N = ${course.N}`;
  }
  if (!r) return null;
  if (cell.key === 'S1') return `${r.found} found; missing ${r.labelsMissing.length}, duplicates ${r.duplicates.length}`;
  if (cell.key === 'S3association') return `${r.associatedCorrectly} right / ${r.associatedIncorrectly} wrong / ${r.notAssociated} none`;
  if (cell.key === 'S5pairs') return s5Judged(r);
  const rec = r.recovered != null ? ` (+${r.recovered} recovered${r.recoveredForHoleCorrectly != null ? `, ${r.recoveredForHoleCorrectly} right hole` : ''})` : '';
  const left = (cell.key === 'S2' || cell.key === 'S3') && r.rows && r.FN ? (() => { const u = unrecoveredFn(cell, course, r); return u.length ? ` (${u.length} FN not recovered by S4: ${u.map((h) => `${cell.key === 'S2' ? 'Basket' : 'Tee'} ${h}`).join(', ')})` : ` (${r.FN} FN recovered by S4)`; })() : '';
  return `${r.TP}/${r.FN}/${fpOf(course, r)} TP/FN/FP${rec}${left}`;
}

function presentOf(cell, course) {
  const o = course.outputs;
  return { S1: o.early, S2: o.early, S3: o.s3fix, S3association: o.s3assoc, S4baskets: o.basketBridge, S4tees: o.s4recover, S5pairs: o.s5pair, S6straight: o.s6straight && Boolean(s6Accepted(course) || !course.testimony) }[cell.key];
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
      attempt: course.attempt,
      ...(cell.key === 'S4tees' && present ? { variants: variantsOf(course) } : {}),
      ...(cell.key === 'S5pairs' && present ? { variants: pairVariantsOf(course) } : {}),
      ...(cell.key === 'S6straight' && present ? { variants: s6VariantsOf(course) } : {})
    });
  }
  const count = (s) => rows.filter((r) => r.status === s).length;
  return { rows, courses: inputs.courses.map((c) => c.course), cells: CELLS.map((c) => c.key),
    emits: { cells: rows.length, met: count('met'), unmet: count('unmet'), unjudged: count('unjudged'), missing: count('missing'), stale: count('stale') }, units: UNITS };
}

/**
 * Every S4 tee variant of a course, side by side: judged TP/FN/FP (or the count closure), standalone ms, and which one
 * the pointer names. The speed/accuracy frontier of one course is this list; across courses it is the S4tees column.
 */
export function variantsOf(course) {
  const s4 = course.s4; if (!s4) return [];
  const names = Object.keys(s4.timingsMs ?? s4.variants ?? {}).sort();
  return names.map((name) => {
    const j = course.judgement?.S4tees?.branches?.[name] ?? null;
    const judged = course.testimony && j ? `${j.TP}/${j.FN}/${fpOf(course, j)} TP/FN/FP (+${j.recovered} recovered, ${j.recoveredForHoleCorrectly} right hole)` : s4.recoveredCount?.[name] != null ? `${(course.counts.tees ?? 0) + s4.recoveredCount[name]} of N = ${course.N}` : null;
    return { name, judged, standaloneMs: s4.timingsMs?.[name]?.ms ?? null, accepted: s4.accepted === name };
  });
}
/** S5's judged text: right / wrong / none (unjudged and unmatched badges beside it), the same for the cell and each variant. */
export const s5Judged = (r) => `${r.right} right / ${r.wrong} wrong / ${r.none} none${r.unjudged ? ` (+${r.unjudged} unjudged)` : ''}; ${r.unmatchedBadges.length} unmatched badge${r.unmatchedBadges.length === 1 ? '' : 's'}${r.laneNotRun ? ` (${r.laneNotRun})` : ''}`;
/** Every S5 pairing variant of a course, side by side, as variantsOf does for S4. */
export function pairVariantsOf(course) {
  const s5 = course.s5; if (!s5) return [];
  const names = Object.keys(s5.timingsMs ?? s5.variants ?? {}).sort();
  return names.map((name) => {
    const j = course.judgement?.S5pairs?.variants?.[name] ?? null;
    const judged = course.testimony && j ? s5Judged(j) : s5.pairedCount?.[name] != null ? `${s5.pairedCount[name]} of N = ${course.N} paired${s5.laneNotRun?.[name] ? ` (${s5.laneNotRun[name]})` : ''}` : null;
    return { name, judged, standaloneMs: s5.timingsMs?.[name]?.ms ?? null, accepted: s5.accepted === name };
  });
}
/** Every S6 straight variant of a course: judged TP/FP/FN/TN (or its verdict counts), standalone ms, lane not run, the pointer. */
export function s6VariantsOf(course) {
  const s6 = course.s6; if (!s6) return [];
  return Object.keys(s6.timingsMs ?? s6.variants ?? {}).sort().map((name) => {
    const j = course.judgement?.S6straight?.variants?.[name] ?? null, c = s6.counts?.[name] ?? null;
    const notRun = Boolean(j?.laneNotRun ?? c?.laneNotRun);
    const judged = notRun ? 'lane not run' : course.testimony && j ? `${j.TP}/${j.FP}/${j.FN}/${j.TN} TP/FP/FN/TN` : c ? `${c.straight} straight of ${c.pairs}` : null;
    return { name, judged, standaloneMs: s6.timingsMs?.[name]?.ms ?? null, accepted: s6.accepted === name, laneNotRun: notRun };
  });
}
export const variantsText = (variants) => variants.map((v) => `${v.accepted ? '→ ' : ''}${v.name} ${v.judged ?? '-'}${v.standaloneMs != null ? ` ${Math.round(v.standaloneMs)} ms` : ''}`).join('; ');

/** The matrix as a markdown table (the legible render of the ledger). */
export function matrixMarkdown(m) {
  const L = ['| course | cell | expected | result | status | freshness' + (m.rows.some((r) => r.vsFrozen) ? ' | vs frozen' : '') + ' |', '|---|---|---|---|---|---' + (m.rows.some((r) => r.vsFrozen) ? '|---' : '') + '|'];
  for (const r of m.rows) {
    const fresh = r.freshness + (r.changedPaths.length ? ` (${r.changedPaths.length} path${r.changedPaths.length > 1 ? 's' : ''}: ${r.changedPaths.slice(0, 3).join(', ')}${r.changedPaths.length > 3 ? ', ...' : ''})` : '');
    L.push(`| ${r.course} | ${r.key} ${r.what} | ${r.expected} | ${r.result ?? '-'} | **${r.status}** | ${fresh}${r.vsFrozen ? ` | ${r.vsFrozen}` : ''} |`);
  }
  const e = m.emits;
  const frontier = m.rows.filter((r) => r.key === 'S4tees' && r.variants?.length);
  if (frontier.length) L.push('', 'S4 tee variants per course (→ the pointer; ms = standalone, a cache hit charged what it cost to compute; by the rule in cmp.fn.Tee.recover.json):', ...frontier.map((r) => `- ${r.course}: ${variantsText(r.variants)}`));
  const pairs = m.rows.filter((r) => r.key === 'S5pairs' && r.variants?.length);
  if (pairs.length) L.push('', 'S5 pairing variants per course (→ the pointer; ms = standalone; by the rule in cmp.fn.Tee.pairBadge.json):', ...pairs.map((r) => `- ${r.course}: ${variantsText(r.variants)}`));
  const s6f = m.rows.filter((r) => r.key === 'S6straight' && r.variants?.length);
  if (s6f.length) L.push('', 'S6 straight variants per course (→ the pointer; ms = standalone; by the rule in cmp.fn.Hole.straight.json):', ...s6f.map((r) => `- ${r.course}: ${variantsText(r.variants)}`));
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

export { reachableModules };   // moved to fg/closure.mjs (the persistent cache's code keys use it too)
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
    // impl/ and contracts/ are discovered by readdir; an impl/ slot a post-recipe step owns (impl/fn.Tee.recover, impl/fn.Hole.straight) is that step's closure, not the recipe's
    const postOwned = (p) => Object.values(POST_RECIPE_CLOSURES).flat().some((q) => q.startsWith('impl/') && (p === q || p.startsWith(`${q}/`)));
    // testimony feeds the judge when the state is derived, never the run: a corrected annotation re-judges, it does not stale
    const relevant = (p) => !postOwned(p) && !p.startsWith('testimony/') && (!isCode(p) || reach.has(p) || p.startsWith('impl/') || p.startsWith('contracts/'));
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
    basketBridge: existsSync(join(out, 'basket-bridge', 'basket-recovery.part.json')), s4recover: existsSync(join(out, 's4recover')) && readdirSync(join(out, 's4recover')).some((d) => d.startsWith('run-')),
    s5pair: existsSync(join(out, 's5pair')) && readdirSync(join(out, 's5pair')).some((d) => d.startsWith('run-')),
    s6straight: existsSync(join(out, 's6straight')) && readdirSync(join(out, 's6straight')).some((d) => d.startsWith('run-')) };
  const request = existsSync(join(out, 'summary.json')) ? readJson(join(out, 'summary.json')).request : null;
  const board = outputs.early ? new Map(deserialize(readFileSync(snap))) : new Map();
  const N = board.get('px.badges')?.length ?? null;
  const counts = { badges: N, baskets: board.get('px.baskets')?.length ?? null, tees: outputs.s3fix ? readJson(join(A, 's3fix', 'px.tees.refined.json')).tees.length : null,
    associated: outputs.s3assoc ? readJson(join(out, 's3assoc', 'px.tees.association.json')).rows.filter((r) => r.best).length : null,
    s4baskets: outputs.basketBridge ? (readJson(join(out, 'basket-bridge', 'basket-recovery.part.json')).comparisons?.accepted ?? []).filter((d) => d.classification !== 'existing-s2-exact').length : null,
    s4tees: null, paired: null };
  // the S4 fork-join's own record: every variant, its standalone cost, and the pointer the runner set by its stated rule
  const s4run = outputs.s4recover ? readdirSync(join(out, 's4recover')).filter((d) => d.startsWith('run-')).sort().at(-1) : null;
  const cmpFile = s4run ? join(out, 's4recover', s4run, 'cmp.fn.Tee.recover.json') : null;
  const cmp = cmpFile && existsSync(cmpFile) ? readJson(cmpFile) : null;
  const variantDir = (name) => join(out, 's4recover', s4run, 'artifacts', 'fn.Tee.recover', name, 'recovered.json');
  const names = cmp ? (cmp.implementations ?? Object.keys(cmp.timingsMs ?? {})) : [];
  const s4 = cmp ? { accepted: cmp.accepted ?? null, rule: cmp.acceptRule ?? null, decidedBy: cmp.acceptedBy ?? null, variants: cmp.variants ?? null,
    timingsMs: cmp.timingsMs ?? Object.fromEntries(Object.entries(cmp.elapsedMs ?? {}).map(([n, ms]) => [n, { ms, calls: null, cacheHits: null }])),
    recoveredCount: Object.fromEntries(names.map((n) => [n, existsSync(variantDir(n)) ? (readJson(variantDir(n)).recovered ?? []).length : null])) } : null;
  if (s4?.accepted) counts.s4tees = s4.recoveredCount[s4.accepted] ?? null;
  // the S5 fork-join's own record, the same way: every variant, its standalone cost, the pointer by its stated rule
  const s5run = outputs.s5pair ? readdirSync(join(out, 's5pair')).filter((d) => d.startsWith('run-')).sort().at(-1) : null;
  const cmp5File = s5run ? join(out, 's5pair', s5run, 'cmp.fn.Tee.pairBadge.json') : null;
  const cmp5 = cmp5File && existsSync(cmp5File) ? readJson(cmp5File) : null;
  const pairsFile = (name) => join(out, 's5pair', s5run, 'artifacts', 'fn.Tee.pairBadge', name, 'pairs.json');
  const names5 = cmp5 ? (cmp5.implementations ?? Object.keys(cmp5.timingsMs ?? {})) : [];
  const pairDocs = Object.fromEntries(names5.map((n) => [n, existsSync(pairsFile(n)) ? readJson(pairsFile(n)) : null]));
  const s5 = cmp5 ? { accepted: cmp5.accepted ?? null, rule: cmp5.acceptRule ?? null, decidedBy: cmp5.acceptedBy ?? null, variants: cmp5.variants ?? null, timingsMs: cmp5.timingsMs ?? {},
    pairedCount: Object.fromEntries(names5.map((n) => [n, pairDocs[n] ? (pairDocs[n].pairs ?? []).filter((p) => p.badge != null).length : null])),
    laneNotRun: Object.fromEntries(names5.map((n) => [n, pairDocs[n]?.laneNotRun ?? null])) } : null;
  if (s5?.accepted) counts.paired = s5.pairedCount[s5.accepted] ?? null;
  // the S6 fork-join's own record, the same way: every variant, its standalone cost, the pointer, each variant's verdicts
  const s6run = outputs.s6straight ? readdirSync(join(out, 's6straight')).filter((d) => d.startsWith('run-')).sort().at(-1) : null;
  const s6cmpFile = s6run ? join(out, 's6straight', s6run, 'cmp.fn.Hole.straight.json') : null;
  const s6cmp = s6cmpFile && existsSync(s6cmpFile) ? readJson(s6cmpFile) : null;
  const s6file = (name) => join(out, 's6straight', s6run, 'artifacts', 'fn.Hole.straight', name, 'straight.json');
  const s6 = s6cmp ? { accepted: s6cmp.accepted ?? null, rule: s6cmp.acceptRule ?? null, decidedBy: s6cmp.acceptedBy ?? null, variants: s6cmp.variants ?? null, timingsMs: s6cmp.timingsMs ?? null,
    counts: Object.fromEntries((s6cmp.implementations ?? []).map((n) => { const d = existsSync(s6file(n)) ? readJson(s6file(n)) : null; return [n, d ? { ...d.counts, laneNotRun: Boolean(d.laneNotRun) } : null]; })) } : null;
  if (s6) s6.counts = { ...s6.counts, ...(s6.accepted && s6.counts[s6.accepted] ? s6.counts[s6.accepted] : {}) };
  const s6Shown = s6 ? (s6.accepted ?? ((s6cmp.implementations ?? []).includes('straight3') ? 'straight3' : null)) : null;   // no pointer: the 3-point test is drawn
  let judgement = null, testimony = null;
  if (outputs.early) {
    try { const j = judgeAttempt({ specimen: course, attempt, root }); testimony = j.testimony; judgement = j.stages ?? null; } catch (error) { judgement = null; }
  }
  // the objects themselves, for renders (the inspector) and for courses without testimony
  const recovered = s4?.accepted && existsSync(variantDir(s4.accepted)) ? readJson(variantDir(s4.accepted)) : null;
  const objects = {
    badges: (board.get('px.badges') ?? []).map((b) => ({ label: b.label, bbox: b.bbox })),
    baskets: (board.get('px.baskets') ?? []).map((k) => ({ bbox: k.bbox })),
    tees: outputs.s3fix ? readJson(join(A, 's3fix', 'px.tees.refined.json')).tees.map((t) => ({ center: t.center, bbox: t.bbox, angleRad: t.angleRad })) : [],
    association: outputs.s3assoc ? readJson(join(out, 's3assoc', 'px.tees.association.json')).rows.map((r) => ({ center: r.center, said: r.best ? Number(r.best.badge) : null })) : [],
    s4baskets: outputs.basketBridge ? (readJson(join(out, 'basket-bridge', 'basket-recovery.part.json')).comparisons?.accepted ?? []).filter((d) => d.classification !== 'existing-s2-exact').map((d) => ({ bbox: d.semanticBbox, tier: d.tier })) : [],
    s4tees: (recovered?.recovered ?? []).map((t) => ({ center: t.center, corners: t.corners ?? null, forHole: t.hole, rule: t.rule, confidence: t.confidence ?? null, visibleFrameFrac: t.evidence?.visibleFrameFrac ?? null })),
    s4missed: (recovered?.missed ?? []).map((m) => ({ hole: m.hole, reason: m.reason })),
    // S5: every tee of the accepted pairing variant, the badge it pairs with and that badge's plate centre (the ray's end)
    pairs: (s5?.accepted ? pairDocs[s5.accepted]?.pairs ?? [] : []).map((p) => ({ name: p.tee, origin: p.origin, center: p.center, said: p.badge != null ? Number(p.badge) : null, plateCenter: p.plateCenter ?? null, residualDeg: p.angleResidualDeg ?? null, signedPerpPx: p.signedPerpPx ?? null })),
    pairBadges: s5?.accepted ? (pairDocs[s5.accepted]?.badges ?? []) : [],
    unpairedBadges: s5?.accepted ? (pairDocs[s5.accepted]?.unmatchedBadges ?? []) : [],
    // the accepted S6 variant's verdict per pair (segment tee -> basket said, or tee -> badge), for the inspector
    s6: s6Shown && existsSync(s6file(s6Shown))
      ? readJson(s6file(s6Shown)).verdicts.map((v) => ({ pair: v.pair, hole: v.hole, tee: v.tee, badge: v.badge, verdict: v.verdict, basket: v.basket, condition: v.condition, evidence: v.evidence })) : []
  };
  const paths = { out, snap, forkRoot, s4run: s4run ? join(out, 's4recover', s4run) : null, s5run: s5run ? join(out, 's5pair', s5run) : null, s6run: s6run ? join(out, 's6straight', s6run) : null };
  const freshness = { ...(request ? { recipe: await recipeFreshness(root, forkRoot, request) } : { recipe: { state: 'UNKNOWN', changed: [] } }), ...(await postRecipeFreshness(root, out)) };
  return { course, attempt, request, testimony, N, counts, judgement, outputs, freshness, objects, paths, s4, s5, s6 };
}

export async function loadStateInputs(root = ROOT, attempts = readAttempts(root)) {
  const declarations = {};
  for (const n of [1, 2, 3, 4, 5, 6]) { const p = join(root, 'stages', `s${n}.json`); if (existsSync(p)) declarations[`S${n}`] = { responsibility: readJson(p).responsibility }; }
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
  const inspector = writeInspector(root, matrix, store.get('tk.state.inputs'), frozen);
  return { matrix, store, frozen, attention: inspector.attention, written: ['attempts/state/matrix.json', 'attempts/state/matrix.flipbook.html', inspector.path] };
}

/** Freeze: the rows and the closures they were computed with become the record a later matrix is compared against. */
export async function freeze(root, matrix, inputs) {
  const closures = {};
  for (const [k, paths] of Object.entries(POST_RECIPE_CLOSURES)) closures[k] = (await closureSnapshot(root, paths)).sha;
  const { frozenObjects } = await import('./inspect.mjs');
  const doc = { schema: 'nctk-state-frozen@2', at: new Date().toISOString(), closures,
    rows: matrix.rows.map(({ course, key, expected, result, status, attempt }) => ({ course, key, expected, result, status, attempt })),
    objects: frozenObjects(inputs),   // per object: hole, name, verdict, error, center, geometry; the inspector draws it dashed when a row changes
    attempts: Object.fromEntries(inputs.courses.map((c) => [c.course, c.attempt])) };
  writeFileSync(join(root, FROZEN_FILE), JSON.stringify(doc, null, 1) + '\n');
  return doc;
}

// ------------------------------------------------------------------------------------------------ retest

const DEV_REQUEST = Object.freeze({ recipe: 'recipes/chainspot-s0-s7.json', until: 4, lanes: ['s3-findfamily-structural-fix', 's4.basketRecovery'] });
const run = (root, args, log) => { log(`  $ node ${args.join(' ')}`); const r = spawnSync('node', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); if (r.status !== 0) throw new Error(`${args[0]} failed (${r.status}): ${(r.stderr || r.stdout).slice(-2000)}`); return r.stdout; };

/** The variant most of the annotated courses accepted in their latest run of a fork-join (default S4; ties: alphabetical), or null when none has a pointer. */
export function acceptedOnAnnotated(root, courses, attempts, { dir = 's4recover', cmp = 'cmp.fn.Tee.recover.json' } = {}) {
  const votes = new Map();
  for (const c of courses) {
    if (!c.testimony) continue;
    const out = join(root, 'attempts', 'stages', attempts.get(c.course) ?? c.attempt, 'fork', 'stage-output', dir);
    const run = existsSync(out) ? readdirSync(out).filter((d) => d.startsWith('run-')).sort().at(-1) : null;
    const f = run ? join(out, run, cmp) : null;
    const accepted = f && existsSync(f) ? readJson(f).accepted : null;
    if (accepted) votes.set(accepted, (votes.get(accepted) ?? 0) + 1);
  }
  return [...votes].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0]?.[0] ?? null;
}

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
    let ranUpstream = false;
    if (redoRecipe || needs(c, 's3assoc') || !c.outputs.s3assoc) { log(`${c.course}: S3 association`); run(root, ['ports/s3assoc/run.mjs', '--specimen', c.course, '--attempt', attempt], log); await record('s3assoc'); ranUpstream = true; }
    const redoS4 = redoRecipe || needs(c, 's4recover') || !c.outputs.s4recover;
    if (redoS4) {
      // a course without testimony ships the variant the annotated courses accepted (their latest runs, this pass or before)
      const elsewhere = c.testimony ? null : acceptedOnAnnotated(root, inputs.courses, attempts);
      log(`${c.course}: S4 tee recovery${elsewhere ? ` (pointer from the annotated courses: ${elsewhere})` : ''}`);
      run(root, ['ports/s4recover/run.mjs', '--specimen', c.course, '--attempt', attempt, ...(elsewhere ? ['--accept', elsewhere] : [])], log); await record('s4recover'); ranUpstream = true;
    }
    // S5 pairs what S4 recovered: it re-runs after S4 does, or when its own closure changed; same --accept handling as S4
    if (redoS4 || needs(c, 's5pair') || !c.outputs.s5pair) {
      const elsewhere = c.testimony ? null : acceptedOnAnnotated(root, inputs.courses, attempts, { dir: 's5pair', cmp: 'cmp.fn.Tee.pairBadge.json' });
      log(`${c.course}: S5 tee-badge pairs${elsewhere ? ` (pointer from the annotated courses: ${elsewhere})` : ''}`);
      run(root, ['ports/s5pair/run.mjs', '--specimen', c.course, '--attempt', attempt, ...(elsewhere ? ['--accept', elsewhere] : [])], log); await record('s5pair');
    }
    // S6 rides on S3 association and the S4 pointer: it re-runs after either, or when its own closure changed
    if (ranUpstream || redoRecipe || needs(c, 's6straight') || !c.outputs.s6straight) {
      const elsewhere = c.testimony ? null : acceptedOnAnnotated(root, inputs.courses, attempts, { dir: 's6straight', cmp: 'cmp.fn.Hole.straight.json' });
      log(`${c.course}: S6 straight vs bent${elsewhere ? ` (pointer from the annotated courses: ${elsewhere})` : ''}`);
      run(root, ['ports/s6straight/run.mjs', '--specimen', c.course, '--attempt', attempt, ...(elsewhere ? ['--accept', elsewhere] : [])], log); await record('s6straight');
    }
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
  const { matrix, written, store, attention } = await stateMatrix(root);
  if (args.includes('--freeze')) { const inputs = store.get('tk.state.inputs'); const doc = await freeze(root, matrix, inputs); written.push(FROZEN_FILE); say(`frozen ${doc.rows.length} rows at ${doc.at}`); }
  say(args.includes('--json') ? JSON.stringify(matrix, null, 1) : matrixMarkdown(matrix));
  if (!args.includes('--json') && attention?.length) { say(`\nLook here first (${attention.length} items; the inspector links each):`); for (const a of attention.slice(0, 25)) say(`  ${a.course} ${a.cell}${a.name ? ` ${a.name}` : ''}${a.hole != null ? ` (hole ${a.hole})` : ''}: ${a.why}  ${a.link}`); if (attention.length > 25) say(`  ... ${attention.length - 25} more in attempts/state/inspector.html`); }
  say(`\nwritten: ${written.join(', ')}`);
  return matrix;
}
