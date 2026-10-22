#!/usr/bin/env node
/**
 * `pxc sweep --grid <spec.json> [--courses a,b] [--jobs N] [--id ID] [--chunk N] [--dry-run]`: an S7 grid search over the
 * feature registry (ports/s7route/features.mjs), the capability the ABFeature era had (Sam, 2026-10-22: "With ABFeatures I was
 * able to grid search").
 *
 * The spec ({ schema: 's7-grid@1', name, base?, include?: [named configs], axes: [...], sample?: { n, seed } }, features.mjs
 * expandGrid) expands to the cartesian product of its axes over the base (the S7 default unless given), optionally a seeded random
 * subsample; invalid combinations are recorded as skipped, duplicates merged by config hash. The S7 default is always a config:
 * it is the reference every judgement compares with.
 *
 * Each config runs on each course: the dev courses with testimony (docs/evidence/dev-s1s4/ATTEMPTS) and the validation views
 * (docs/evidence/validation-s7/ATTEMPTS), S7 only, on their existing attempts (no S0-S6 run is made). A course's configs share
 * one store (ports/s7trace/gridCell.mjs), so the scene, hallway, table and straight claims are produced once and a config costs
 * only the steps it changes; --jobs N runs N course tasks in parallel (child processes), --chunk N configs per task. A cell
 * (config x course) already recorded under the same config hash and code digest is not recomputed: re-running the same command
 * resumes. Output under attempts/sweeps/<id>/: cells/, results.json and results.md:
 *   dev        agreement with Sam's corridors and bends hit/missed/extra (ports/s7trace/judgeBends.mjs: basket 12 px, W / 2), per course;
 *   samSix     Sam's six validation holes right (docs/evidence/validation-s7/sam-six.json);
 *   crossView  holes whose route length (R1) in a Full / Lazy view is within 15 % of the same hole's in the course's Capture view
 *              (docs/evidence/validation-s7/rerun-2026-10-21.md; ground-truth free);
 *   time       ownMs per course (gridCell.mjs: what the config costs alone once the shared Parts exist);
 *   assumption violations the config's searches recorded (fg/assumptions.mjs);
 * then the Pareto front over (dev agreement, bend errors, Sam's six, cross-view, time) and the shortlist ranked by RANK_RULE.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, realpathSync, readdirSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { fork } from 'node:child_process';
import { expandGrid, resolveConfig, S7_DEFAULT_NAME } from '../s7route/features.mjs';
import { matchBends } from './judgeBends.mjs';
import { canonicalJson, sha256Hex } from '../../fg/canon.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
export const SWEEPS_DIR = join('attempts', 'sweeps');
export const RANK_RULE = 'shortlist: no dev regression against the S7 default (on no dev course fewer holes agree, fewer of Sam\'s bends are hit or more extra bends are placed) and Sam\'s six all right; ranked by cross-view agreement (more), then bend errors on dev (missed + extra, fewer), then time (total ownMs over the courses, less)';
export const CROSS_VIEW_TOLERANCE = 0.15;

/** The courses: dev views with testimony and the validation views, as [{ course, attempt, kind }]. */
export function sweepCourses(root = ROOT, only = null) {
  const read = (rel) => readFileSync(join(root, rel), 'utf8').trim().split('\n').map((l) => l.trim().split(/\s+/)).filter((p) => p.length === 2 && !p[0].startsWith('#'));
  const dev = read('docs/evidence/dev-s1s4/ATTEMPTS').filter(([c]) => existsSync(join(root, 'testimony', c))).map(([course, attempt]) => ({ course, attempt, kind: 'dev' }));
  const val = read('docs/evidence/validation-s7/ATTEMPTS').map(([course, attempt]) => ({ course, attempt, kind: 'validation' }));
  return [...val, ...dev].filter((c) => !only || only.includes(c.course));
}

// ------------------------------------------------------------------------------------------------ judging (pure)
/** Sam's six on one config's validation cells ({ [course]: cell }). -> { right, of, rows } */
export function samSixOf(cells, ref) {
  const rows = ref.holes.map((x) => {
    const c = cells[x.view], h = c?.holes?.[x.hole];
    if (!c) return { ...x, right: null, why: `${x.view} not run` };
    if (!h) return { ...x, right: false, why: 'hole not traced' };
    const basketOk = h.basket === x.basket;
    let bendsOk = true, bendNote = '';
    if (x.bends) {
      const m = matchBends(x.bends, h.verts.slice(1, -1), c.widthPx / 2);
      bendsOk = m.missed.length === 0 && m.extra.length === 0;
      bendNote = `; bends ${m.hits.length}/${m.missed.length}/${m.extra.length} hit/missed/extra vs the hand trace (W / 2 = ${(c.widthPx / 2).toFixed(1)} px)`;
    }
    return { view: x.view, hole: x.hole, basket: x.basket, got: h.basket, bends: h.bends, right: basketOk && bendsOk, why: `${basketOk ? 'basket right' : `ends at ${h.basket ?? 'no basket'}, Sam's call ${x.basket}`}${bendNote}` };
  });
  return { right: rows.filter((r) => r.right).length, of: rows.length, judged: rows.filter((r) => r.right !== null).length, rows };
}
/** Cross-view agreement on one config's cells: each Full / Lazy view's hole against the same hole in its Capture view. */
export function crossViewOf(cells, tol = CROSS_VIEW_TOLERANCE) {
  const rows = [];
  for (const [view, c] of Object.entries(cells)) {
    const cap = view.replace(/(Full|Lazy)$/, 'Capture');
    if (cap === view || !cells[cap]) continue;
    for (const [h, v] of Object.entries(c.holes)) {
      const b = cells[cap].holes[h];
      if (v.lengthR1 > 0 && b?.lengthR1 > 0) rows.push({ view, hole: h, here: v.lengthR1, capture: b.lengthR1, agree: Math.abs(v.lengthR1 - b.lengthR1) / b.lengthR1 <= tol });
    }
  }
  return { agree: rows.filter((r) => r.agree).length, compared: rows.length, disagree: rows.filter((r) => !r.agree).map((r) => `${r.view} ${r.hole}: ${r.here} vs ${r.capture} R1`) };
}
/** Dev agreement and bends on one config's dev cells. */
export function devOf(cells) {
  const per = {}, T = { agree: 0, judged: 0, bendsHit: 0, bendsMissed: 0, extraBends: 0 };
  for (const [course, c] of Object.entries(cells)) {
    if (!c.judged) continue;
    const t = c.judged.totals;
    per[course] = { agree: t.agree, judged: t.judged, bendsHit: t.bendsHit, bendsMissed: t.bendsMissed, extraBends: t.extraBends, notAgreeing: t.notAgreeing };
    for (const k of Object.keys(T)) T[k] += t[k];
  }
  return { ...T, bendErrors: T.bendsMissed + T.extraBends, per };
}
/** Regressions against the reference's dev rows: [course: what got worse]. */
export function devRegressions(dev, ref) {
  const out = [];
  for (const [course, r] of Object.entries(ref.per)) {
    const d = dev.per[course];
    if (!d) { out.push(`${course}: not run`); continue; }
    if (d.agree < r.agree) out.push(`${course}: agree ${d.agree}/${d.judged} < ${r.agree}/${r.judged}`);
    if (d.bendsHit < r.bendsHit) out.push(`${course}: bends hit ${d.bendsHit} < ${r.bendsHit}`);
    if (d.extraBends > r.extraBends) out.push(`${course}: extra bends ${d.extraBends} > ${r.extraBends}`);
  }
  return out;
}
/** The Pareto front: rows no other row dominates on every objective ({ key, better: 'max'|'min' }). */
export function paretoFront(rows, objectives) {
  const ge = (a, b, o) => (o.better === 'max' ? a[o.key] >= b[o.key] : a[o.key] <= b[o.key]);
  const gt = (a, b, o) => (o.better === 'max' ? a[o.key] > b[o.key] : a[o.key] < b[o.key]);
  return rows.filter((r) => !rows.some((q) => q !== r && objectives.every((o) => ge(q, r, o)) && objectives.some((o) => gt(q, r, o))));
}
export const OBJECTIVES = Object.freeze([
  { key: 'devAgree', better: 'max', what: 'dev holes agreeing with Sam\'s corridors (sum over the dev courses with testimony)' },
  { key: 'bendErrors', better: 'min', what: 'dev bends missed + extra against Sam\'s bend testimony (sum)' },
  { key: 'samSix', better: 'max', what: 'Sam\'s six validation holes right (of 6)' },
  { key: 'crossView', better: 'max', what: 'Full / Lazy holes within 15 % route length (R1) of their Capture view (of the compared holes)' },
  { key: 'ownMs', better: 'min', what: 'S7 routeMatch time, ownMs summed over every course' }
]);
/** The shortlist by RANK_RULE. */
export function shortlistOf(rows) {
  return rows.filter((r) => r.complete && !r.devRegressions.length && r.samSix === r.samSixOf)
    .sort((a, b) => b.crossView - a.crossView || a.bendErrors - b.bendErrors || a.ownMs - b.ownMs);
}

/** Every config's row from its cells. */
export function aggregate({ configs, courses, cellsOf, samSixRef, defaultHash }) {
  const rowOf = (cfg) => {
    const cells = Object.fromEntries(courses.map((c) => [c.course, cellsOf(c.course, cfg.hash)]).filter(([, x]) => x));
    const devCells = Object.fromEntries(courses.filter((c) => c.kind === 'dev' && cells[c.course]).map((c) => [c.course, cells[c.course]]));
    const valCells = Object.fromEntries(courses.filter((c) => c.kind === 'validation' && cells[c.course]).map((c) => [c.course, cells[c.course]]));
    const dev = devOf(devCells), six = samSixOf(valCells, samSixRef), cv = crossViewOf(valCells);
    const violations = {};
    for (const c of Object.values(cells)) for (const [a, v] of Object.entries(c.violations ?? {})) { const x = violations[a] ??= { violated: 0, recovered: 0, courses: 0 }; x.violated += v.violated; x.recovered += v.recovered; x.courses++; }
    const ms = Object.fromEntries(Object.entries(cells).map(([k, c]) => [k, c.ms.own]));
    return { hash: cfg.hash, short: cfg.short, names: cfg.names, labels: cfg.labels, sparse: cfg.sparse, complete: Object.keys(cells).length === courses.length, courses: Object.keys(cells).length,
      devAgree: dev.agree, devJudged: dev.judged, bendsHit: dev.bendsHit, bendsMissed: dev.bendsMissed, extraBends: dev.extraBends, bendErrors: dev.bendErrors, dev,
      samSix: six.right, samSixOf: six.of, samSixRows: six.rows, crossView: cv.agree, crossViewCompared: cv.compared, crossViewDisagree: cv.disagree,
      ownMs: Object.values(ms).reduce((a, b) => a + b, 0), paidMs: Object.values(cells).reduce((a, c) => a + c.ms.paid, 0), msPerCourse: ms, violations,
      conditions: Object.values(cells).filter((c) => c.condition).map((c) => `${c.course}: ${c.condition}`),
      routes: Object.fromEntries(Object.entries(cells).map(([k, c]) => [k, c.routesDigest])) };
  };
  const rows = configs.map(rowOf), ref = rows.find((r) => r.hash === defaultHash);
  for (const r of rows) {
    r.devRegressions = ref ? devRegressions(r.dev, ref.dev) : ['the S7 default was not run'];
    r.sameRoutesAsDefault = ref ? Object.keys(r.routes).filter((k) => r.routes[k] === ref.routes[k]).length : null;
    r.changedCourses = ref ? Object.keys(r.routes).filter((k) => r.routes[k] !== ref.routes[k]) : null;
  }
  const complete = rows.filter((r) => r.complete);
  return { rows, front: paretoFront(complete, OBJECTIVES).map((r) => r.hash), shortlist: shortlistOf(rows).map((r) => r.hash), reference: ref?.hash ?? null };
}

// ------------------------------------------------------------------------------------------------ the report
const short = (r) => `\`${r.short}\`${r.names.length ? ` (${r.names.join(', ')})` : ''}`;
const diffOf = (r) => { const f = r.sparse.features; const parts = Object.entries(f).map(([id, d]) => `${id}${d.enabled === false ? ' off' : d.enabled === true && !d.knobs ? ' on' : ''}${d.knobs ? ` ${Object.entries(d.knobs).map(([k, v]) => `${k}=${typeof v === 'number' ? +v.toFixed(4) : v}`).join(' ')}` : ''}`); return parts.length ? parts.join('; ') : 'the S7 default'; };
const viol = (r) => Object.entries(r.violations).map(([a, v]) => `${a} ${v.violated} (${v.recovered} recovered)`).join(', ') || 'none';
export function markdownOf(res) {
  const by = new Map(res.rows.map((r) => [r.hash, r])), ref = by.get(res.reference), C = res.courses;
  const nDev = C.filter((c) => c.kind === 'dev').length, nVal = C.filter((c) => c.kind === 'validation').length;
  const line = (r) => `| ${short(r)} | ${diffOf(r)} | ${r.devAgree}/${r.devJudged} | ${r.bendsHit}/${r.bendsMissed}/${r.extraBends} | ${r.samSix}/${r.samSixOf} | ${r.crossView}/${r.crossViewCompared} | ${(r.ownMs / 1000 / r.courses).toFixed(1)} | ${r.devRegressions.length ? r.devRegressions.join('; ') : '-'} | ${viol(r)} |`;
  const head = '| config | deviation from the S7 default | dev agree (holes) | dev bends hit/missed/extra | Sam\'s six right | cross-view agree (holes) | s per course (own) | dev regressions vs the default | assumption violations (all courses) |\n|---|---|---|---|---|---|---|---|---|';
  return [`# S7 grid sweep ${res.id}`, '',
    `Spec \`${res.specFile}\` (${res.spec.name ?? 'unnamed'}): product ${res.grid.product} configs, ${res.grid.sampled} kept${res.spec.sample ? ` (seeded random subsample, n ${res.spec.sample.n}, seed ${res.spec.sample.seed ?? 1})` : ''}, ${res.grid.skipped.length} invalid combinations skipped, ${res.grid.duplicates} duplicates merged by hash: ${res.rows.length} configs x ${C.length} courses (${nDev} dev with testimony, ${nVal} validation views). Code digest \`${res.codeDigest}\`.`, '',
    'Referents: dev agree = holes whose route ends within 12 px of Sam\'s basket and stays within W / 2 of his corridor, summed over ' + C.filter((c) => c.kind === 'dev').map((c) => c.course).join(', ') + '; bends = Sam\'s bends hit / missed and our extra bends within half his corridor width (same courses); Sam\'s six = docs/evidence/validation-s7/sam-six.json; cross-view = Full / Lazy view holes whose route length in R1 is within 15 % of the Capture view\'s; s per course = ownMs (gridCell.mjs: the config alone on a store whose shared Parts exist) averaged over the courses.', '',
    `Ranking: ${RANK_RULE}.`, '',
    '## Shortlist (top 10)', '', head, ...res.shortlist.slice(0, 10).map((h) => line(by.get(h))), res.shortlist.length ? '' : '(no config passes the filter)', '',
    `## Pareto front (${res.front.length} configs)`, '', `Objectives: ${OBJECTIVES.map((o) => `${o.key} (${o.better}: ${o.what})`).join('; ')}.`, '', head, ...res.front.map((h) => line(by.get(h))), '',
    '## The reference: the S7 default', '', head, ref ? line(ref) : '| not run |', '',
    '## Every config', '', head, ...[...res.rows].sort((a, b) => b.crossView - a.crossView || a.bendErrors - b.bendErrors).map(line), '',
    res.grid.skipped.length ? `## Skipped (invalid combinations)\n\n${res.grid.skipped.map((s) => `- ${s.labels.join(' ')}: ${s.errors.join('; ')}`).join('\n')}\n` : '',
    '## Cost per config x course (ownMs, s)', '', `| config | ${C.map((c) => c.course).join(' | ')} |`, `|---|${C.map(() => '---').join('|')}|`,
    ...res.rows.map((r) => `| \`${r.short}\` | ${C.map((c) => (r.msPerCourse[c.course] === undefined ? '-' : (r.msPerCourse[c.course] / 1000).toFixed(1))).join(' | ')} |`), '',
    `Shared Parts per course (the attempt load, the scene, hallway, starts, straight verdicts, tables, first legs, evidence; s, summed over its tasks): ${Object.entries(res.sharedMs).map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}`).join(', ')}. Wall ${(res.wallMs / 1000).toFixed(0)} s over ${res.runs} run(s) of the command (the last with --jobs ${res.jobs}).`, ''].join('\n');
}

// ------------------------------------------------------------------------------------------------ the command
/** Per course, the S7 default's largest ownMs in any earlier sweep cell (ms; only the task order's estimate). */
function courseWeights(root, defaultHash, codeDigest) {
  const out = {}, base = join(root, SWEEPS_DIR);
  if (!existsSync(base)) return out;
  for (const id of readdirSync(base)) {
    const cells = join(base, id, 'cells');
    if (!existsSync(cells)) continue;
    for (const course of readdirSync(cells)) {
      const p = join(cells, course, `${defaultHash}.json`);
      if (!existsSync(p)) continue;
      try { const c = JSON.parse(readFileSync(p, 'utf8')); out[course] = Math.max(out[course] ?? 0, 1000, c.ms.own); } catch { /* an unreadable cell is no estimate */ }
    }
  }
  return out;
}
const say = (s) => process.stderr.write(s + '\n');
export async function sweepCommand(args, { root = ROOT } = {}) {
  const at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
  const specFile = at('--grid');
  if (!specFile) { say('usage: pxc sweep --grid <spec.json> [--courses a,b] [--jobs N] [--chunk N] [--id ID] [--dry-run]'); return null; }
  const spec = JSON.parse(readFileSync(resolve(specFile), 'utf8')), grid = expandGrid(spec);
  const def = resolveConfig({});
  if (!grid.configs.some((c) => c.hash === def.hash)) grid.configs.unshift({ hash: def.hash, short: def.short, labels: ['the S7 default (reference)'], names: [S7_DEFAULT_NAME], sparse: { features: {} }, canonical: def.canonical, rules: def.rules });
  const courses = sweepCourses(root, at('--courses')?.split(',') ?? null), jobs = Number(at('--jobs') ?? 1);
  const id = at('--id') ?? `${(spec.name ?? basename(specFile, '.json')).replace(/[^A-Za-z0-9_-]+/g, '-')}-${sha256Hex(canonicalJson(spec)).slice(0, 8)}`;
  const dir = join(root, SWEEPS_DIR, id);
  const { cellCodeDigest, recordedCell } = await import('./gridCell.mjs');
  const codeDigest = cellCodeDigest(root);
  // configs sharing their cells (the evidence ranking reads the default's cells) run next to each other, in one task
  const cellKey = (c) => { const { seqScore, ...rest } = c.rules; return canonicalJson(rest); };
  const configs = [...grid.configs].sort((a, b) => (a.hash === def.hash ? -1 : b.hash === def.hash ? 1 : cellKey(a).localeCompare(cellKey(b))));
  const todo = courses.map((c) => ({ ...c, configs: configs.filter((g) => !recordedCell(dir, { course: c.course, attempt: c.attempt, hash: g.hash, codeDigest })) }));
  const nTodo = todo.reduce((a, c) => a + c.configs.length, 0), nAll = configs.length * courses.length;
  say(`sweep ${id}: ${configs.length} configs (product ${grid.product}, kept ${grid.sampled}, ${grid.skipped.length} invalid skipped, ${grid.duplicates} duplicates) x ${courses.length} courses = ${nAll} cells; ${nAll - nTodo} recorded (code ${codeDigest}), ${nTodo} to run with --jobs ${jobs}`);
  if (args.includes('--dry-run')) { for (const c of configs) say(`  ${c.short} ${c.labels.join(' / ')}${c.names.length ? ` = ${c.names.join(', ')}` : ''}`); return { id, dir, configs, courses, todo: nTodo }; }
  mkdirSync(dir, { recursive: true });
  const meta = { schema: 's7-sweep@1', id, specFile, spec, createdBy: { checkout: realpathSync(root) }, createdAt: existsSync(join(dir, 'sweep.json')) ? JSON.parse(readFileSync(join(dir, 'sweep.json'), 'utf8')).createdAt : new Date().toISOString(), codeDigest };
  writeFileSync(join(dir, 'sweep.json'), JSON.stringify(meta, null, 1) + '\n');
  writeFileSync(join(dir, 'configs.json'), JSON.stringify(configs.map(({ hash, short, labels, names, sparse, canonical, rules }) => ({ hash, short, labels, names, sparse, canonical, rules })), null, 1) + '\n');
  // tasks: course x chunk of configs (--chunk, default every config of the course in one task)
  // configs that share their cells stay in one task; the heaviest courses start first (the default's ownMs in any earlier sweep)
  const chunk = Number(at('--chunk') ?? 0) || Infinity, tasks = [];
  for (const c of todo) {
    let cur = [], key = null;
    for (const g of c.configs) {
      if (cur.length >= chunk && cellKey(g) !== key) { tasks.push({ course: c.course, attempt: c.attempt, configs: cur }); cur = []; }
      cur.push({ hash: g.hash, rules: g.rules }); key = cellKey(g);
    }
    if (cur.length) tasks.push({ course: c.course, attempt: c.attempt, configs: cur });
  }
  const weight = courseWeights(root, def.hash, codeDigest);
  tasks.sort((a, b) => (weight[b.course] ?? 10000) * b.configs.length - (weight[a.course] ?? 10000) * a.configs.length);
  const sharedMs = {}, t0 = performance.now();
  let done = 0, running = 0, next = 0;
  await new Promise((ok) => {
    if (!tasks.length) return ok();
    const launch = () => {
      while (running < jobs && next < tasks.length) {
        const task = tasks[next++]; running++;
        const child = fork(import.meta.filename, ['--worker'], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'], execArgv: ['--max-old-space-size=4096'] });
        child.send({ ...task, dir, root, codeDigest });
        child.on('message', (m) => {
          if (m.cell) {
            done++; const c = m.cell, T = c.judged?.totals, el = (performance.now() - t0) / 1000, eta = done ? el / done * (nTodo - done) : 0;
            say(`[${done}/${nTodo} ${el.toFixed(0)} s, eta ${eta.toFixed(0)} s] ${c.course} ${c.configHash.slice(0, 12)} own ${(c.ms.own / 1000).toFixed(1)} s${T ? `, agree ${T.agree}/${T.judged}, bends ${T.bendsHit}/${T.bendsMissed}/${T.extraBends}` : ''}${c.condition ? `, ${c.condition}` : ''}`);
          }
          if (m.done) sharedMs[task.course] = (sharedMs[task.course] ?? 0) + m.done.sharedMs;
          if (m.error) say(`  ${task.course}: worker failed: ${m.error}`);
        });
        child.on('exit', (code) => { if (code) say(`  ${task.course}: worker exited ${code}`); running--; if (next < tasks.length) launch(); else if (!running) ok(); });
      }
    };
    launch();
  });
  const wallMs = performance.now() - t0;
  const samSixRef = JSON.parse(readFileSync(join(root, 'docs/evidence/validation-s7/sam-six.json'), 'utf8'));
  const cellsOf = (course, hash) => { const a = courses.find((c) => c.course === course).attempt; return recordedCell(dir, { course, attempt: a, hash, codeDigest }); };
  const agg = aggregate({ configs, courses, cellsOf, samSixRef, defaultHash: def.hash });
  const prev = existsSync(join(dir, 'results.json')) ? JSON.parse(readFileSync(join(dir, 'results.json'), 'utf8')) : null;
  const res = { schema: 's7-sweep-results@1', id, specFile, spec, codeDigest, rankRule: RANK_RULE, objectives: OBJECTIVES, courses: courses.map(({ course, attempt, kind }) => ({ course, attempt, kind })),
    grid: { product: grid.product, sampled: grid.sampled, skipped: grid.skipped, duplicates: grid.duplicates }, jobs,
    // a resumed sweep adds this run's wall time and shared Parts to the earlier runs' (same code digest)
    wallMs: Math.round(wallMs) + (prev?.codeDigest === codeDigest ? prev.wallMs ?? 0 : 0), runs: Math.max(1, (prev?.codeDigest === codeDigest ? prev.runs ?? 1 : 0) + (nTodo ? 1 : 0)),
    sharedMs: Object.fromEntries([...new Set([...Object.keys(sharedMs), ...Object.keys(prev?.codeDigest === codeDigest ? prev.sharedMs ?? {} : {})])].map((k) => [k, (sharedMs[k] ?? 0) + (prev?.codeDigest === codeDigest ? prev.sharedMs?.[k] ?? 0 : 0)])), ...agg };
  writeFileSync(join(dir, 'results.json'), JSON.stringify(res, null, 1) + '\n');
  writeFileSync(join(dir, 'results.md'), markdownOf(res));
  const by = new Map(res.rows.map((r) => [r.hash, r]));
  say(`\n${res.rows.length} configs; Pareto front ${res.front.length}; shortlist ${res.shortlist.length} (${RANK_RULE})`);
  for (const h of res.shortlist.slice(0, 10)) { const r = by.get(h); say(`  ${r.short} dev ${r.devAgree}/${r.devJudged} bends ${r.bendsHit}/${r.bendsMissed}/${r.extraBends}, Sam's six ${r.samSix}/${r.samSixOf}, cross-view ${r.crossView}/${r.crossViewCompared}, ${(r.ownMs / 1000).toFixed(0)} s: ${diffOf(r)}`); }
  say(`results: ${join(dir, 'results.md')}`);
  return res;
}

if (process.argv.includes('--worker')) {
  process.on('disconnect', () => process.exit(1));   // the sweep was stopped: its finished cells stay recorded, the rest resume
  process.on('message', async (task) => {
    try {
      const { runCourseCells } = await import('./gridCell.mjs');
      const r = runCourseCells({ specimen: task.course, attempt: task.attempt, configs: task.configs, dir: task.dir, root: task.root, codeDigest: task.codeDigest, onCell: (cell) => process.send({ cell: { course: cell.course, configHash: cell.configHash, judged: cell.judged ? { totals: cell.judged.totals } : null, ms: cell.ms, condition: cell.condition } }) });
      process.send({ done: r }, () => process.exit(0));
    } catch (e) { process.send({ error: String(e?.stack ?? e) }, () => process.exit(1)); }
  });
} else if (import.meta.url === `file://${process.argv[1]}`) await sweepCommand(process.argv.slice(2));
