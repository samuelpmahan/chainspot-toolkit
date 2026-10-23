/**
 * Run ONE ablation branch from the S3 boundary through S4..S7 (node-only).
 *
 * Upstream (S0..S3) is never re-run: every branch starts from the sealed
 * S3 snapshot of ONE completed stage Attempt (its s3.pxc.bin, hash-checked
 * against its early receipt). The branch restores a private copy of those
 * Parts, applies its fork point (ports/ablation/forks.mjs), re-seals them
 * as its own s3.pxc.bin + early receipt, and then RE-EXECUTES the
 * downstream with the Attempt's own code (the fork's ports/late/*.mjs and
 * the S7 tracer text from the fork's ports/s7.mjs):
 *
 *   S4..S6  runLate (until 6, the Attempt's late lanes), exactly as
 *           run-stages invokes it, on the branch snapshot
 *   S4 obs  runS4 once more on the branch snapshot, only to OBSERVE
 *           px.s4.teeBadge.state (runLate keeps that Part in memory and
 *           returns receipts only)
 *   S7      the fresh-S6 heading tracer, byte-for-byte the probe program
 *           embedded in ports/s7.mjs, on this branch's s6-rows.json
 *
 * s4.basketRecovery is NOT re-run per branch: its receipt binds to the
 * whole S3 snapshot hash, so it cannot be reused by a branch whose
 * snapshot differs, and its Part does not flow into S5..S7 (STAGES.md).
 */
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { deserialize, serialize } from '../../fg/pxcCodec.mjs';   // node:v8 with packed typed arrays
import { extractParts } from './parts.mjs';
import { withoutTime } from '../early/instrument.mjs';

const exec = promisify(execFile);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const ms = (t) => Math.round(performance.now() - t);

export const LATE_LANES = ['s4.openFrame', 's4.singletonPropagation', 's5.exactCellPose', 's5.globalAssignment', 's6.axisPropagation'];

/** The sealed upstream of one stage Attempt fork. */
export function loadUpstream(fork) {
  const earlyDir = join(fork, 'stage-output/early');
  const early = readJson(join(earlyDir, 'run.receipt.json'));
  if (early.schema !== 'nctk-early@1' || !early.snapshot?.sha256) throw new Error(`${fork}: early receipt has no sealed S3 snapshot`);
  const snapshotBytes = readFileSync(resolve(earlyDir, early.snapshot.path));
  if (sha(snapshotBytes) !== early.snapshot.sha256) throw new Error(`${fork}: s3.pxc.bin bytes differ from the early receipt`);
  const summary = readJson(join(fork, 'stage-output/summary.json'));
  const cropTopPx = early.crop?.upperRowsRemoved;
  if (!Number.isInteger(cropTopPx)) throw new Error(`${fork}: S0 crop receipt lacks upperRowsRemoved`);
  return { fork, early, snapshotBytes, request: summary.request, cropTopPx };
}

/** The Attempt's S7 tracer program, lifted verbatim from its ports/s7.mjs. */
export function liftS7Tracer(fork) {
  const text = readFileSync(join(fork, 'ports/s7.mjs'), 'utf8');
  const open = 'const code = String.raw`', start = text.indexOf(open);
  const end = start < 0 ? -1 : text.indexOf('`;', start + open.length);
  if (start < 0 || end < 0) throw new Error('ports/s7.mjs: heading tracer program not found (runHeadingHint code block)');
  const code = text.slice(start + open.length, end);
  if (code.includes('${') || code.includes('`')) throw new Error('ports/s7.mjs tracer program interpolates; refusing to lift it');
  return { code, sha256: sha(code), from: 'ports/s7.mjs runHeadingHint' };
}

/** Parts of the Attempt itself, as retained (the row-0 reference). */
export function referenceParts(upstream) {
  const late = join(upstream.fork, 'stage-output/late');
  const opt = (p) => { try { return readJson(p); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };
  return extractParts({
    s3: new Map(deserialize(Buffer.from(upstream.snapshotBytes))),
    s4State: null, // not retained by the Attempt: runLate returns receipts, not px.s4.teeBadge.state
    geometry: opt(join(late, 'geometry.json')), s5Pairs: opt(join(late, 's5-pairs.json')),
    assignment: opt(join(late, 's5-global-assignment.json')), s6Rows: opt(join(late, 's6-rows.json')),
    s7: opt(join(upstream.fork, 'stage-output/s7/fresh-s6-heading-diagnostic.json')),
    cropTopPx: upstream.cropTopPx
  });
}

export async function runBranch({ upstream, fork: forkSpec, ctx, outDir, modules, tracer, keepSnapshot = false }) {
  const timings = {};
  const root = upstream.fork, provider = join(root, 'source/provider');
  const lanes = upstream.request.lanes ?? [];
  let t = performance.now();
  // 1. fork: private restore of the sealed S3 Parts, apply, re-seal.
  const entries = deserialize(Buffer.from(upstream.snapshotBytes));
  const parts = new Map(entries);
  const delta = forkSpec.apply(parts, ctx);
  // An untouched snapshot keeps the sealed bytes (re-serializing restored
  // values is NOT byte-identical: v8 re-encodes typed-array backing), so the
  // baseline row runs on the exact upstream identity.
  const bytes = delta.replaced.length ? serialize([...parts.entries()]) : upstream.snapshotBytes;
  const snapshotSha256 = sha(bytes);
  const earlyDir = join(outDir, 'early');
  mkdirSync(earlyDir, { recursive: true });
  writeFileSync(join(earlyDir, 's3.pxc.bin'), bytes);
  const early = { ...upstream.early, snapshot: { ...upstream.early.snapshot, path: join(earlyDir, 's3.pxc.bin'), sha256: snapshotSha256 },
    ablation: { fork: { id: forkSpec.id, at: forkSpec.at }, sealedUpstreamSnapshotSha256: upstream.early.snapshot.sha256, delta } };
  writeFileSync(join(earlyDir, 'run.receipt.json'), JSON.stringify(withoutTime(early).record, null, 2) + '\n');   // hashed evidence: no clock fields
  timings.forkMs = ms(t);
  // 2. S4..S6, re-executed by the Attempt's own runLate.
  t = performance.now();
  const late = await modules.runLate({ forkRoot: root, sourcePath: upstream.request.sourcePath, outDir: join(outDir, 'late'),
    early, earlyOutDir: earlyDir, until: Math.min(upstream.request.until, 6), lanes: lanes.filter((x) => LATE_LANES.includes(x)), basketBridge: null });
  writeFileSync(join(outDir, 'late/run.receipt.json'), JSON.stringify(withoutTime(late).record, null, 2) + '\n');   // hashed evidence: no clock fields
  timings.s4s6Ms = ms(t);
  // 3. observe px.s4.teeBadge.state (same runS4 call runLate makes).
  t = performance.now();
  const source = resolve(root, upstream.request.sourcePath);
  const s4 = await modules.runS4({ forkRoot: provider, sourcePath: source, sourceSha256: upstream.early.source.sha256,
    snapshotPath: join(earlyDir, 's3.pxc.bin'), snapshotSha256, canonicalRgbaSha256: upstream.early.stages[0].canonicalRgbaSha256, openFrame: false });
  timings.s4ObserveMs = ms(t);
  // 4. S7 tracer on this branch's S6 rows.
  let s7 = null;
  if (upstream.request.until >= 7 && lanes.includes('s5-axis-heading') && late.s6?.rowPath) {
    if (sha(readFileSync(late.s6.rowPath)) !== late.s6.rowSha256) throw new Error(`${forkSpec.id}: S6 rows changed after runLate sealed them`);
    t = performance.now();
    const imageId = upstream.request.sourcePath.includes('IMG_5641') ? 'IMG_5641' : 'AlexClark-original';
    const capturePath = join(provider, `artifacts/composed-render-20260927/${imageId}-capture.json`);
    const run = await exec(process.execPath, ['--input-type=module', '-e', tracer.code, provider, source, capturePath, late.s6.rowPath],
      { cwd: dirname(provider), encoding: 'utf8', maxBuffer: 48 * 1024 * 1024 });
    s7 = JSON.parse(run.stdout);
    mkdirSync(join(outDir, 's7'), { recursive: true });
    writeFileSync(join(outDir, 's7/fresh-s6-heading-diagnostic.json'), JSON.stringify(s7, null, 2) + '\n');
    timings.s7Ms = ms(t);
  }
  // The ~49 MiB branch snapshot is reconstructible (sealed upstream + fork
  // spec, deterministic); keep only its hash unless asked to keep bytes.
  if (!keepSnapshot) rmSync(join(earlyDir, 's3.pxc.bin'));
  const lateDir = join(outDir, 'late');
  const opt = (name) => { try { return readJson(join(lateDir, name)); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };
  const extracted = extractParts({ s3: parts, s4State: s4.state, geometry: opt('geometry.json'), s5Pairs: opt('s5-pairs.json'),
    assignment: opt('s5-global-assignment.json'), s6Rows: opt('s6-rows.json'), s7, cropTopPx: upstream.cropTopPx });
  return {
    id: forkSpec.id, fork: { id: forkSpec.id, at: forkSpec.at, describe: forkSpec.describe }, delta, timings,
    snapshotSha256, snapshotEqualsSealed: snapshotSha256 === upstream.early.snapshot.sha256,
    s4Unresolved: { holes: s4.state.unresolvedHoles, tees: s4.state.unresolvedTees },
    s6RowSha256: late.s6?.rowSha256 ?? null, parts: extracted
  };
}
