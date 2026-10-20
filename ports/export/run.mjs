#!/usr/bin/env node
/**
 * Runner for the toolkit/app boundary: tk.export.course (chainspot.course-geometry v1) on a completed attempt (node-only;
 * never re-runs the provider).
 *
 *   node ports/export/run.mjs --specimen golden --attempt ID [--attempts-root DIR] [--out DIR] [--no-cas]
 *
 * The store sits on the attempt's S3 PxC (early/s3.pxc.bin) as its board, with S7's lane outputs as root inputs
 * (ports/s7trace/run.mjs loadS7Lanes) and the persistent cache on (fg/cas.mjs). The source bytes are hashed and checked
 * against the attempt record's sourceSha256 (an integrity check: a mismatch stops the run). Testimony is NOT read: the export
 * is blind. Writes under <out> (default <repo>/attempts/export/<specimen>/run-<ISO time>/): course-geometry.json (the value of
 * the Part tk.export.course, canonical JSON, nothing else crosses), tk.export.course.png (its render), instrumentation.json.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, basename } from 'node:path';
import { deflateSync } from 'node:zlib';
import { instrumentedStore, profileSummary, hotSpotLines } from '../../fg/profile.mjs';
import { RENDER_PART } from '../../fg/store.mjs';
import { runnerCache, casFlag } from '../../fg/casRunner.mjs';
import { canonicalJson } from '../../fg/canon.mjs';
import { loadAttemptParts } from '../s4recover/run.mjs';
import { S4_CALCULATIONS } from '../s4recover/teeRecover.mjs';
import { S7_CALCULATIONS, registerTraceQueries } from '../s7trace/traceSpace.mjs';
import { loadS7Lanes, loadMatcher } from '../s7trace/run.mjs';
import { exportCourse, EXPORT_COURSE_PART, captureProvenanceOf } from './course.calc.mjs';
import { courseSourceOf, isCaptureManifest } from '../capture/capture.mjs';
import { RULE_SETS, profileOf } from '../s7route/match.mjs';
import { acceptedOnAnnotated } from '../state/matrix.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');

/**
 * The S7 rule set the export runs: the one the pointer vote accepted on the annotated dev courses (the variant most of their
 * latest S7 runs accepted, ports/state/matrix.mjs acceptedOnAnnotated), never a hard-coded default; --variant overrides.
 */
export function exportRuleSet(root, variant = null, profile = 'quick') {
  let how = variant ? 'given (--variant)' : null;
  if (!variant) {
    const file = join(root, 'docs/evidence/dev-s1s4/ATTEMPTS');
    const pairs = existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').map((l) => l.split(' ')) : [];
    variant = acceptedOnAnnotated(root, pairs.map(([course, a]) => ({ course, attempt: a, testimony: null })), new Map(pairs), { dir: 's7trace', cmp: 'cmp.fn.Hole.trace.json' });
    how = variant ? 'the S7 pointer vote on the annotated dev courses' : null;
  }
  // the alternatives: every rule set in the profile besides the primary (each route a one-click choice in the app)
  const wide = profileOf(profile).filter((n) => n !== variant).map((n) => ({ variant: n, rules: RULE_SETS[n] }));
  if (!variant || !(variant in RULE_SETS)) return { variant: 'routeMatch', rules: {}, how: variant ? `${variant} is not a routeMatch rule set: routeMatch's defaults` : 'no S7 pointer on record: routeMatch\'s defaults', profile, wide };
  return { variant, rules: RULE_SETS[variant], how, profile, wide };
}

export function runExportCourse({ specimen, attempt, attemptsRoot = ROOT, root = ROOT, outDir = null, cas = true, recipe = 'chainspot-s0-s7', variant = null, profile = 'quick' }) {
  const loaded = loadAttemptParts({ attempt, specimen, root: attemptsRoot });
  const record = JSON.parse(readFileSync(join(attemptsRoot, 'attempts', 'stages', `${attempt}.json`), 'utf8'));
  // a capture's original upload is the course raster S0 stitched (its tiles and their transforms travel as source.capture)
  const isCapture = isCaptureManifest(loaded.sourcePath), sourceFile = courseSourceOf(loaded.fork, loaded.sourcePath), bytes = readFileSync(sourceFile), sha256 = createHash('sha256').update(bytes).digest('hex');
  const recorded = isCapture ? JSON.parse(readFileSync(join(loaded.out, 'early', 'run.receipt.json'), 'utf8')).source.sha256 : record.request.sourceSha256;
  if (recorded && recorded !== sha256) throw new Error(`integrity: ${sourceFile} hashes to ${sha256}, the attempt recorded ${recorded}`);
  const captureRecord = isCapture ? JSON.parse(readFileSync(join(loaded.out, 'early', 'capture', 'capture.json'), 'utf8')) : null;
  const original = loaded.background, cropped = loaded.board.get('px.image.cropped');
  const crop = { originalPx: { width: original.width, height: original.height }, upperRowsRemoved: loaded.upperRowsRemoved, lowerRowsRemoved: original.height - cropped.heightPx - loaded.upperRowsRemoved };
  const out = outDir ?? join(root, 'attempts', 'export', specimen, `run-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  const { cache, codeSalt } = runnerCache({ root, entry: import.meta.filename, cas });
  const { store, document: instrumentation } = instrumentedStore({ name: `export:${specimen}`, base: loaded.board, cache, codeSalt });
  const lanes = loadS7Lanes({ out: loaded.out, upperRowsRemoved: loaded.upperRowsRemoved, values: loaded.values });
  store.constant('fn.tk.s7trace.laneOutputs', { ...loaded.values, ...lanes, 'testimony.source.holePaths': { path: null, rule: 'the export is blind: no testimony is read', holes: [] } });
  const stagesRun = [0, 1, 2, 3, 4, ...('tk.s7.straight' in lanes ? [6] : []), 7];
  store.constant('fn.tk.export.source', { 'tk.source.cropReceipt': crop, 'tk.source.sha256': sha256, 'tk.source.path': sourceFile, 'tk.source.captureProvenance': captureProvenanceOf(captureRecord), 'tk.export.producer': { name: 'chainspot-toolkit', recipe, attemptId: attempt, stagesRun }, 'tk.export.ruleSet': exportRuleSet(root, variant, profile) });
  for (const [fn, spec] of S4_CALCULATIONS) store.register(fn, spec);
  for (const [fn, spec] of S7_CALCULATIONS) store.register(fn, spec);
  registerTraceQueries(store, { matcher: loadMatcher(root), board: loaded.board });
  store.register(...exportCourse);
  const part = store.get(EXPORT_COURSE_PART);
  const render = store.call(RENDER_PART, { a: EXPORT_COURSE_PART, deflate: (b) => deflateSync(b) }).value;
  mkdirSync(out, { recursive: true });
  const { emits, ...doc } = part;
  writeFileSync(join(out, 'course-geometry.json'), canonicalJson(doc) + '\n');
  for (const p of render.parts) if (p.kind === 'raster' && p.data?.png) writeFileSync(join(out, `${EXPORT_COURSE_PART}.png`), Buffer.from(p.data.png, 'base64'));
  const docProfile = instrumentation();
  writeFileSync(join(out, 'instrumentation.json'), JSON.stringify(docProfile) + '\n');
  return { out, doc, emits, profile: profileSummary(docProfile), cache: cache?.stats?.() ?? null };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
  const specimen = arg('--specimen'), attempt = arg('--attempt');
  if (!specimen || !attempt) { console.error('usage: node ports/export/run.mjs --specimen golden --attempt ID [--attempts-root DIR] [--out DIR] [--no-cas]'); process.exit(2); }
  const r = runExportCourse({ specimen, attempt, attemptsRoot: arg('--attempts-root') ?? ROOT, outDir: arg('--out'), cas: casFlag(), variant: arg('--variant'), profile: arg('--profile') ?? 'quick' });
  console.log(JSON.stringify({ out: r.out, file: join(r.out, 'course-geometry.json'), emits: r.emits, conditions: r.doc.conditions, cache: r.cache, hotSpots: hotSpotLines(r.profile.hotSpots),
    profile: r.profile.slice(0, 6).map((p) => `${p.calculation}: ${p.calls}x self ${p.selfMs} ms ${JSON.stringify(p.emits)}`) }, null, 1));
}
