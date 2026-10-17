/**
 * AblationForkJoin runner (node-only):
 *
 *   node toolkit.mjs ablate --specimen golden [--rows a,b,...] [--attempt ID] [--out DIR]
 *
 * Upstream comes from ONE completed stage Attempt (default: the latest PASS
 * golden `--until 7 --lanes s4.basketRecovery,s5.globalAssignment,
 * s5-axis-heading` Attempt whose late/S7 evidence still hashes). Each row
 * (a named fork point, ports/ablation/forks.mjs) re-executes S4..S7 from
 * that Attempt's sealed S3 snapshot; the rows are joined Part by Part under
 * geometric Contracts (fg/ablation.mjs) into an effect matrix, every row is
 * judged against Sam's testimony, and a flipbook draws the changes over
 * the source image. The baseline row is itself re-executed and joined
 * against the Attempt's retained outputs (a reproduction witness).
 *
 * Writes <out>/{effect-matrix.json, testimony.json, run.json, frames.json,
 * flipbook.html, rows/<row>/{early,late,s7}/...}; default out is
 * attempts/ablation/<attemptId>/ablation-<time>/.
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { effectMatrix, ablationFrames, cellText } from '../../fg/ablation.mjs';
import { framesJson, renderFlipbook } from '../../fg/flipbook.mjs';
import { findAttempt, runCommand } from '../../scripts/golden-attempt.mjs';
import { COLUMNS } from './parts.mjs';
import { FORKS, DEFAULT_ROWS } from './forks.mjs';
import { judgeRow } from './testimony.mjs';
import { loadUpstream, liftS7Tracer, referenceParts, runBranch } from './branch.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const DEFAULT_LANES = ['s4.basketRecovery', 's5.globalAssignment', 's5-axis-heading'];
const NEEDED = ['stage-output/early/run.receipt.json', 'stage-output/late/s6-rows.json', 'stage-output/s7/fresh-s6-heading-diagnostic.json'];

function findTestimony(root, sourceSha256) {
  const found = [];
  const walk = (d) => {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.annotation.json')) {
        const bytes = readFileSync(p);
        const doc = JSON.parse(bytes.toString('utf8'));
        if (doc?.sourceImage?.sha256 === sourceSha256) found.push({ path: relative(root, p), sha256: sha(bytes), doc });
      }
    }
  };
  walk(join(root, 'testimony'));
  return found.length === 1 ? found[0] : null;
}

export async function ablate({ root, specimen = 'golden', rows = DEFAULT_ROWS, attemptId = null, lanes = DEFAULT_LANES, out = null, keepSnapshot = false, log = () => {} }) {
  const unknown = rows.filter((r) => !FORKS[r]);
  if (unknown.length) throw new Error(`unknown ablation rows ${unknown.join(', ')}; known: ${Object.keys(FORKS).join(', ')}`);
  if (rows[0] !== 'baseline') rows = ['baseline', ...rows.filter((r) => r !== 'baseline')];
  let fork;
  if (attemptId) fork = join(root, 'attempts/stages', attemptId, 'fork');
  else {
    const found = findAttempt(NEEDED, { specimen, lanes, root });
    if (!found) throw new Error(`no PASS ${specimen} --until 7 Attempt with lanes ${lanes.join(',')} and retained S6/S7 evidence; run: ${runCommand({ specimen, lanes, until: 7 })}`);
    fork = found.fork; attemptId = found.attemptId;
  }
  const started = performance.now();
  const upstream = loadUpstream(fork);
  const testimony = findTestimony(root, upstream.early.source.sha256);
  const provider = join(fork, 'source/provider');
  const require = createRequire(pathToFileURL(join(provider, 'package.json')));
  const dist = (p) => require(resolve(provider, 'packages/alg/dist', p));
  // The Attempt's own code, not the working tree's: the branches re-execute
  // exactly what produced the upstream they fork from.
  const imp = (p) => import(pathToFileURL(join(fork, p)).href);
  const familyFix = await imp('ports/early/s3FamilyFix.mjs');
  const modules = { runLate: (await imp('ports/late/runLate.mjs')).runLate, runS4: (await imp('ports/late/s4.mjs')).runS4 };
  const tracer = liftS7Tracer(fork);
  const ctx = { dist, familyFix, testimony: testimony?.doc ?? null, cropTopPx: upstream.cropTopPx };
  out = out ? resolve(out) : join(root, 'attempts/ablation', attemptId, `ablation-${Date.now()}`);
  mkdirSync(out, { recursive: true });

  const branches = [];
  for (const id of rows) {
    log(`row ${id}: fork at ${JSON.stringify(FORKS[id].at)}; re-executing S4..S7`);
    const t = performance.now();
    const b = await runBranch({ upstream, fork: FORKS[id], ctx, outDir: join(out, 'rows', id.replace(/[^A-Za-z0-9._=-]/g, '_')), modules, tracer, keepSnapshot });
    b.timings.totalMs = Math.round(performance.now() - t);
    log(`row ${id}: ${JSON.stringify(b.timings)}`);
    branches.push(b);
  }
  const reference = { id: `attempt:${attemptId}`, parts: referenceParts(upstream) };
  const matrix = effectMatrix({ columns: COLUMNS, rows: branches.map((b) => ({ id: b.id, fork: b.fork, parts: b.parts })), baseline: 'baseline', reference });
  const judged = testimony ? {
    testimony: { path: testimony.path, sha256: testimony.sha256 },
    rows: Object.fromEntries([[reference.id, judgeRow(reference.parts, testimony.doc, { cropTopPx: upstream.cropTopPx })],
      ...branches.map((b) => [b.id, judgeRow(b.parts, testimony.doc, { cropTopPx: upstream.cropTopPx })])]),
    acceptance: "UNKNOWN: agreement with Sam's annotation is evidence; acceptance is Sam's"
  } : { testimony: null, rows: {}, note: `no testimony/**/*.annotation.json for source ${upstream.early.source.sha256}` };

  const members = Object.fromEntries([[reference.id, reference.parts], ...branches.map((b) => [b.id, b.parts])]);
  const frames = ablationFrames(matrix, { members, maxPages: 24 });
  const sourceBytes = readFileSync(resolve(fork, upstream.request.sourcePath));
  const background = { src: `data:image/${sourceBytes[0] === 0x89 ? 'png' : 'jpeg'};base64,${sourceBytes.toString('base64')}`,
    width: upstream.early.source.widthPx, height: upstream.early.source.heightPx, x: 0, y: 0 };
  const write = (name, text) => { writeFileSync(join(out, name), text); return join(out, name); };
  const matrixPath = write('effect-matrix.json', JSON.stringify(matrix, null, 2) + '\n');
  write('testimony.json', JSON.stringify(judged, null, 2) + '\n');
  write('frames.json', framesJson(frames) + '\n');
  const flipbookPath = write('flipbook.html', renderFlipbook(frames, { title: `AblationForkJoin ${specimen}: ${rows.join(' | ')}`, background }));
  const run = {
    schema: 'nctk-ablation-run@1', specimen, attemptId, fork: relative(root, fork),
    upstream: { sealedSnapshotSha256: upstream.early.snapshot.sha256, request: upstream.request, reusedStages: ['S0', 'S1', 'S2', 'S3'] },
    reexecutedStages: ['S4', 'S5', 'S6', 'S7'], skippedLanes: (upstream.request.lanes ?? []).includes('s4.basketRecovery') ? [{ lane: 's4.basketRecovery', reason: 'its receipt binds the whole S3 snapshot hash; its Part does not flow into S5..S7' }] : [],
    code: { from: 'the Attempt fork (ports/late/runLate.mjs, ports/late/s4.mjs, ports/early/s3FamilyFix.mjs, ports/s7.mjs tracer text)', s7TracerSha256: tracer.sha256 },
    rows: branches.map(({ parts, ...b }) => b),
    totalMs: Math.round(performance.now() - started), acceptance: 'UNKNOWN'
  };
  write('run.json', JSON.stringify(run, null, 2) + '\n');
  return { out, matrixPath, flipbookPath, matrix, judged, run };
}

export function printMatrix(matrix) {
  const cols = matrix.columns.map((c) => c.id);
  const lines = [`row | vs | ${cols.join(' | ')}`];
  for (const r of matrix.rows) lines.push(`${r.id} | ${r.against} | ${cols.map((c) => cellText(r.cells[c])).join(' | ')}`);
  return lines.join('\n');
}

export async function cli(root, argv) {
  const get = (flag, fallback = null) => { const i = argv.indexOf(flag); return i < 0 ? fallback : argv[i + 1]; };
  const rows = get('--rows') ? get('--rows').split(',').filter(Boolean) : DEFAULT_ROWS;
  const lanes = get('--lanes') ? get('--lanes').split(',').filter(Boolean) : DEFAULT_LANES;
  const result = await ablate({ root, specimen: get('--specimen', 'golden'), rows, attemptId: get('--attempt'), lanes, out: get('--out'), keepSnapshot: argv.includes('--keep-snapshots'), log: (m) => console.error(m) });
  console.log(printMatrix(result.matrix));
  console.log(JSON.stringify({ out: result.out, effectMatrix: result.matrixPath, flipbook: result.flipbookPath, totalMs: result.run.totalMs,
    timings: Object.fromEntries(result.run.rows.map((r) => [r.id, r.timings])), testimony: result.judged.rows }, null, 2));
}
