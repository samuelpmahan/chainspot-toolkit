#!/usr/bin/env node
/**
 * Runner for the fn.Hole.trace ComparableForkJoin (node-only).
 *
 *   node ports/s7trace/run.mjs --specimen golden --attempt ATTEMPT_ID [--out DIR] [--accept VARIANT]
 *
 * Reads a completed attempt (never re-runs the provider): the S3 PxC (early/s3.pxc.bin) is the store's board, and the
 * S4 runner's loader (ports/s4recover/run.mjs loadAttemptParts) gives the lane outputs not on it. S7's own root inputs:
 *   s3assoc/px.tees.association.json        the S3 association (baselineOf: per hole tee, ray, 3-point verdict) and its AA pad poses
 *   s4recover/run-<time>/cmp.fn.Tee.recover.json the accepted S4 recovered tees (latest run, the pointer it set)
 *   s7/fresh-s6-heading-diagnostic.json     the pinned native tracer (--until 7, lane s5-axis-heading); absent: lane not run
 *   testimony/<specimen>/*.annotation.json  Sam's corridors (judge guarantee only; every run works without it)
 * Every implementation in impl/fn.Hole.trace/ runs as a variant key (px.holes.trace@name); the accepted one is a pointer
 * by the stated rule (acceptRule). Writes under <out> (default <stage-output>/s7trace/run-<ISO time>/):
 *   cmp.fn.Hole.trace.json, keyspace.json, instrumentation.json, s7trace.{records.json,frames.json,flipbook.html},
 *   s7trace.overview.png (the accepted variant over the map, coloured by the judge), artifacts/fn.Hole.trace/<impl>/traces.json
 */
import { exitOnEarlyCondition } from '../early/condition.mjs';
import { runnerCache, casFlag } from '../../fg/casRunner.mjs';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { deflateSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { instrumentedStore, profileSummary, profileFrame, hotSpotLines } from '../../fg/profile.mjs';
import { RENDER_PART } from '../../fg/store.mjs';
import { comparableForkJoin, forkJoinFrames } from '../../fg/forkjoin.mjs';
import { discoverImplementations } from '../../fg/discover.mjs';
import { createFileSink } from '../../fg/node-sink.mjs';
import { writeFlipbook, imageFiles } from '../../fg/node-flipbook.mjs';
import { canonicalJson } from '../../fg/canon.mjs';
import { base64 } from '../../fg/png.mjs';
import contract from '../../contracts/s7.trace@1.mjs';
import { loadAttemptParts } from '../s4recover/run.mjs';
import { S4_CALCULATIONS } from '../s4recover/teeRecover.mjs';
import { baselineOf } from '../s3assoc/freeze.mjs';
import { loadHolePaths } from './holePaths.mjs';
import { HOLE_TRACE_SLOT, S7_CALCULATIONS, registerTraceQueries } from './traceSpace.mjs';
import { GUARANTEES } from './guarantees.mjs';
import { compareTraces, drawCrop, judgedMarks, LEGEND } from './compare.mjs';
import { judgeHoleTraces } from './judgeBends.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
export { loadHolePaths };
const require = createRequire(import.meta.url);
/** The provider's exact one-to-one matcher (pinned dist), the one ports/late/behavior/assignment.mjs uses. */
export const MATCHER_PATH = 'source/provider/packages/alg/dist/detectors/threeFactor/features/g4.teeBadgeLockMath.js';
export const loadMatcher = (root = ROOT) => (existsSync(join(root, MATCHER_PATH)) ? require(join(root, MATCHER_PATH)).maximumWeightTeeBadgeMatching : null);

/** S7's lane outputs (root inputs): association, recovered tees, pinned native traces. Absent ones are recorded conditions. */
export function loadS7Lanes({ out, upperRowsRemoved, values }) {
  const assocFile = join(out, 's3assoc', 'px.tees.association.json');
  let association;
  if (existsSync(assocFile)) {
    const assoc = readJson(assocFile), base = baselineOf(assoc, out), poses = assoc.rows.filter((r) => r.pose);
    // baselineOf writes the frozen-baseline shape, whose tee ray is rounded to 2 decimals (a recorded artifact: up to
    // 0.3 deg, about 1 px per 200 px along the axis); S7 reads the unrounded AA pose angle instead, with the same sense
    const holes = Object.fromEntries(Object.entries(base.holes).map(([b, h]) => {
      const r = assoc.rows.find((x) => x.best && String(x.best.badge) === String(b)), th = ((r?.pose?.thDeg ?? r?.thDeg) * Math.PI) / 180, s = r?.best?.sense ?? 1;
      return [b, r && Number.isFinite(th) ? { ...h, u: [Math.cos(th) * s, Math.sin(th) * s], uRule: 'AA pose thDeg (unrounded), association sense' } : h];
    }));
    association = { holes, source: 's3assoc/px.tees.association.json (baselineOf: the frozen-baseline shape)', condition: null,
      pads: poses.map((r) => ({ label: r.tee, cx: r.pose.cx, cy: r.pose.cy, thDeg: r.pose.thDeg })), template: { L: assoc.template.L, W: assoc.template.W }, padRule: 'S3 association AA pad poses (fn.Tee.poseAA) and their template' };
  } else {
    const m = values['px.tees.familyRefined'].model;
    association = { holes: {}, source: null, condition: 's3assoc not run: no tee is associated to a badge', template: { L: m.major?.median ?? m.lengthPx, W: m.minor?.median ?? m.widthPx },
      pads: values['px.tees.refined'].map((t) => ({ label: t.label, cx: t.center[0], cy: t.center[1], thDeg: t.angleRad * 180 / Math.PI })), padRule: 'S3 refined tees and the S3 family template' };
  }
  const s4dir = join(out, 's4recover'), run = existsSync(s4dir) ? readdirSync(s4dir).filter((d) => d.startsWith('run-')).sort().at(-1) : null;
  const cmp = run && existsSync(join(s4dir, run, 'cmp.fn.Tee.recover.json')) ? readJson(join(s4dir, run, 'cmp.fn.Tee.recover.json')) : null;
  const recFile = cmp?.accepted ? join(s4dir, run, 'artifacts', 'fn.Tee.recover', cmp.accepted, 'recovered.json') : null;
  const recoveredTees = recFile && existsSync(recFile)
    ? { source: `fn.Tee.recover@${cmp.accepted}, ${run}`, condition: null, tees: readJson(recFile).recovered.map((t) => ({ hole: String(t.hole), center: t.center, angleRad: t.angleRad })) }
    : { source: null, condition: run ? 'the S4 fork-join named no accepted variant' : 'S4 recovery not run', tees: [] };
  // S6's accepted fn.Hole.straight variant: the straight / bent verdict per hole (the bend placement's rule 1)
  const s6dir = join(out, 's6straight'), s6run = existsSync(s6dir) ? readdirSync(s6dir).filter((d) => d.startsWith('run-')).sort().at(-1) : null;
  const s6cmp = s6run && existsSync(join(s6dir, s6run, 'cmp.fn.Hole.straight.json')) ? readJson(join(s6dir, s6run, 'cmp.fn.Hole.straight.json')) : null;
  const s6file = s6cmp?.accepted ? join(s6dir, s6run, 'artifacts', 'fn.Hole.straight', s6cmp.accepted, 'straight.json') : null;
  const straightVerdicts = s6file && existsSync(s6file)
    ? { source: `fn.Hole.straight@${s6cmp.accepted}, ${s6run}`, condition: null, verdicts: Object.fromEntries(readJson(s6file).verdicts.map((v) => [String(v.hole), v.verdict])) }
    : null;
  const diag = join(out, 's7', 'fresh-s6-heading-diagnostic.json'), geoFile = join(out, 'late', 'geometry.json');
  let pinnedTraces;
  if (existsSync(diag) && existsSync(geoFile)) {
    const d = readJson(diag), g = readJson(geoFile);
    const holeOf = new Map(g.badgePlates.map((p) => [p.detId, p.holeRead]));
    const teeOf = new Map([...(g.baselineAxes?.visible ?? []), ...(g.baselineAxes?.recovered ?? [])].map((a) => [a.detId, [a.center[0], a.center[1] - upperRowsRemoved]]));
    pinnedTraces = { condition: null, source: 's7/fresh-s6-heading-diagnostic.json (ports/s7.mjs, traceBadgeToBasket on fresh S6 hints)', field: d.field,
      traces: d.traces.filter((t) => t.status !== 'UNKNOWN').map((t) => ({ hitId: t.hitId, hole: holeOf.get(t.badgeId) ?? null, teeCenter: teeOf.get(t.teeId) ?? null, outcome: t.outcome, reason: t.reason ?? null,
        basketIdReached: t.basketIdReached ?? null, lengthPx: t.lengthPx, bendCount: t.bendCount, points: (t.points ?? []).map((p) => p.canonicalPoint) })) };
  } else pinnedTraces = { condition: 'lane not run: no native S7 heading trace in this attempt (recipe --until 7 with lane s5-axis-heading)', traces: [] };
  return { 'tk.s7.association': association, 'tk.s7.recoveredTees': recoveredTees, 'tk.s7.pinnedTraces': pinnedTraces, ...(straightVerdicts ? { 'tk.s7.straight': straightVerdicts } : {}) };
}

/**
 * The pointer rule (the S4 shape, on Sam's S7 judge): among the variants that ran, the most judged holes agreeing with
 * Sam (ends at his basket, stays within W / 2 of his corridor), then the fewest bends missed, then the fewest extra;
 * ties: the fastest standalone. A course without testimony takes the variant the annotated courses accepted.
 */
export function acceptRule({ acceptedElsewhere = null, judged = true } = {}) {
  const rule = judged ? 'fastest standalone variant whose judged result ties the best (agreeing holes desc, bendsMissed asc, extraBends asc)'
    : `no testimony: the variant the annotated courses accepted${acceptedElsewhere ? ` (${acceptedElsewhere})` : ' (none on record: no pointer)'}`;
  const accept = (value, { names, branches, timingsMs }) => {
    const live = names.filter((n) => !branches[n].error);
    if (!judged) { accept.decided = acceptedElsewhere && live.includes(acceptedElsewhere) ? 'annotated courses' : 'nothing'; return accept.decided === 'nothing' ? null : acceptedElsewhere; }
    const score = (n) => { const b = value.branches[n]; return [-(b.agree ?? -1), b.bendsMissed ?? Infinity, b.extraBends ?? Infinity]; };
    const cmpS = (a, b) => { const A = score(a), B = score(b); for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) return A[i] - B[i]; return 0; };
    const sorted = [...live].sort(cmpS);
    if (!sorted.length) { accept.decided = 'nothing'; return null; }
    const tied = sorted.filter((n) => cmpS(n, sorted[0]) === 0);
    accept.decided = tied.length > 1 ? `tie on judged result among ${tied.join(', ')}: fastest standalone` : 'best judged result';
    return tied.sort((a, b) => (timingsMs[a]?.ms ?? Infinity) - (timingsMs[b]?.ms ?? Infinity))[0];
  };
  accept.rule = rule; accept.decided = null;
  return accept;
}

export async function runHoleTraceForkJoin({ attempt, specimen, outDir = null, root = ROOT, attemptsRoot = root, acceptedElsewhere = null, only = null, cas = true }) {
  const loaded = loadAttemptParts({ attempt, specimen, root: attemptsRoot });   // attemptsRoot: where attempts/stages/<ID> lives (read only)
  const out = outDir ?? join(loaded.out, 's7trace', `run-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  const { store, document: instrumentation } = instrumentedStore({ name: `s7trace:${specimen}`, base: loaded.board, ...runnerCache({ root, entry: import.meta.filename, cas }) });
  const holePaths = loadHolePaths(specimen, root);
  store.constant('fn.tk.s7trace.laneOutputs', { ...loaded.values, ...loadS7Lanes({ out: loaded.out, upperRowsRemoved: loaded.upperRowsRemoved, values: loaded.values }), 'testimony.source.holePaths': holePaths });
  for (const [fn, spec] of S4_CALCULATIONS) store.register(fn, spec);
  for (const [fn, spec] of S7_CALCULATIONS) store.register(fn, spec);
  registerTraceQueries(store, { matcher: loadMatcher(root), board: loaded.board });
  for (const a of ['tk.s7.scene', 'tk.s7.hallway', 'tk.s7.holes']) store.get(a);   // shared by every variant, produced once on the parent
  let implementations = await discoverImplementations(join(root, 'impl'), HOLE_TRACE_SLOT.slot);
  if (only) implementations = Object.fromEntries(Object.entries(implementations).filter(([n]) => only.includes(n)));
  const sink = createFileSink(join(out, 'artifacts'), { relativeTo: out });
  const accept = acceptRule({ acceptedElsewhere, judged: Boolean(holePaths.path) });
  const raster = loaded.board.get('px.image.cropped');
  const result = comparableForkJoin({
    slot: HOLE_TRACE_SLOT.slot, part: HOLE_TRACE_SLOT.part, implementations, store,
    restore: () => loaded.board,
    apply: (parts, impl, name) => ({ slot: HOLE_TRACE_SLOT.slot, implementation: name, ...impl(parts) }),
    guarantees: GUARANTEES, sink,
    compare: compareTraces({ contract, parentStore: store, raster, deflate: (r) => deflateSync(r) }), accept
  });
  mkdirSync(out, { recursive: true });
  const v = result.comparison.value, cmp = result.comparison;
  writeFileSync(join(out, `${cmp.address}.json`), canonicalJson({
    schema: 'nctk-s7-hole-trace-comparison@1', specimen, attempt, address: cmp.address, implementations: cmp.implementations, sha256: cmp.sha256,
    variants: cmp.variants, accepted: cmp.accepted, acceptRule: accept.rule, acceptedBy: accept.decided, timingsMs: cmp.timingsMs,
    widthPx: store.get('tk.s7.hallway').widthPx, value: { ...v, holes: v.holes.map((h) => ({ hole: h.hole, rows: h.rows })) }
  }) + '\n');
  writeFileSync(join(out, 'keyspace.json'), canonicalJson({ schema: 'nctk-keyspace@1', specimen, attempt, store: store.manifest().store, parts: store.keyspace() }) + '\n');
  const doc = instrumentation(), profile = profileSummary(doc);
  writeFileSync(join(out, 'instrumentation.json'), JSON.stringify(doc) + '\n');
  // every image this run writes is one file under out/img/; the named PNGs are hardlinks to them (fg/node-flipbook.mjs)
  const images = imageFiles(out);
  // the accepted variant over the whole map at full resolution, coloured by the judge (the render Sam decides on)
  let overview = null;
  if (cmp.accepted) {
    const tr = store.get(HOLE_TRACE_SLOT.part).traces, j = judgeHoleTraces(tr, holePaths, { widthPx: store.get('tk.s7.hallway').widthPx });
    const marks = store.get('tk.s7.holes').holes.flatMap((h) => judgedMarks(tr.find((t) => t.hole === h.hole), j.rows.find((r) => r.hole === h.hole), holePaths.holes.find((p) => p.hole === h.hole), { width: 2 }));
    const png = drawCrop(raster, { x0: 0, y0: 0, w: raster.widthPx, h: raster.heightPx, scale: 1 }, marks, { deflate: (r) => deflateSync(r) });
    images.alias(images.png(png.png).src, 's7trace.overview.png');
    overview = { path: join(out, 's7trace.overview.png'), variant: cmp.accepted, legend: LEGEND, labels: tr.map((t) => ({ hole: t.hole, at: t.path[0] ?? store.get('tk.s7.scene').badges[Number(t.hole)] ?? null, status: t.status, ok: j.rows.find((r) => r.hole === t.hole)?.ok ?? null })) };
    writeFileSync(join(out, 's7trace.overview.json'), JSON.stringify(overview, null, 1) + '\n');
  }
  // routeMatch over the course with the testimony and the bends before / after the placement: tk.s7.routeMatchView through fn.q.part.render
  let routeMatchView = null;
  if (implementations.routeMatch && !result.branches.routeMatch?.error) {
    store.get('tk.s7.routeMatchView');
    const r = store.call(RENDER_PART, { a: 'tk.s7.routeMatchView', deflate: (bytes) => deflateSync(bytes) }).value;
    const png = r.parts.find((q) => q.kind === 'raster');
    if (png) { images.alias(images.png(png.data.png).src, 's7trace.routeMatch.png'); routeMatchView = { path: join(out, 's7trace.routeMatch.png'), totals: store.get('tk.s7.routeMatchView').totals, rows: store.get('tk.s7.routeMatchView').rows }; writeFileSync(join(out, 's7trace.routeMatch.view.json'), JSON.stringify(routeMatchView, null, 1) + '\n'); }
  }
  const partPages = store.manifest().parts.map((p) => p.address).filter((a) => a.startsWith('tk.s7.')).sort()
    .map((a) => { const r = store.call(RENDER_PART, { a }).value; return { title: `${a} (${r.kind})`, calculation: 'fg.render', tick: 'render', parts: r.parts, verdicts: [{ name: `${a} renders`, ok: r.kind !== 'unrenderable' && r.parts.length > 0 }] }; });
  const frames = [...forkJoinFrames(result), profileFrame(profile, { wallMs: doc.wallMs }), ...partPages];
  const records = Object.fromEntries(Object.entries(result.branches).map(([n, b]) => [n, { error: b.error, records: b.records }]));
  writeFileSync(join(out, 's7trace.records.json'), canonicalJson({ schema: 'nctk-fg-forkjoin-records@1', slot: result.slot, specimen, attempt, branches: records }) + '\n');
  writeFlipbook(out, 's7trace', frames, { images, title: `S7 ${HOLE_TRACE_SLOT.slot} fork-join (${specimen}): ${cmp.implementations.join(' vs ')}`, background: loaded.background, records: { branches: records }, stage: 'S7' });   // images once, as files under out/img/ (fg/node-flipbook.mjs)
  return { out, comparison: v, accepted: cmp.accepted, acceptedBy: accept.decided, variants: cmp.variants, timingsMs: Object.fromEntries(Object.entries(cmp.timingsMs).map(([n, t]) => [n, t.ms])), frames: frames.length, branches: records, profile, overview };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
  if (!args.attempt || !args.specimen) { console.error('usage: node ports/s7trace/run.mjs --specimen golden --attempt ATTEMPT_ID [--attempts-root DIR] [--out DIR] [--accept VARIANT] [--only a,b]'); process.exit(2); }
  exitOnEarlyCondition({ root: args['attempts-root'] ?? ROOT, attempt: args.attempt, specimen: args.specimen, stage: 'S7' });   // a recorded early condition: this stage is not run
  const r = await runHoleTraceForkJoin({ attempt: args.attempt, specimen: args.specimen, outDir: args.out ?? null, attemptsRoot: args['attempts-root'] ?? ROOT, acceptedElsewhere: args.accept ?? null, only: args.only ? args.only.split(',') : null, cas: casFlag() });
  const c = r.comparison;
  console.log(JSON.stringify({ out: r.out, frames: r.frames, accepted: r.accepted, acceptedBy: r.acceptedBy, widthPx: c.widthPx, timingsMs: r.timingsMs, hotSpots: hotSpotLines(r.profile.hotSpots ?? []),
    profile: r.profile.slice(0, 10).map((p) => `${p.calculation}: ${p.calls}x self ${p.selfMs} ms ${JSON.stringify(p.emits)}`),
    branches: Object.fromEntries(Object.entries(c.branches).map(([n, b]) => [n, { reached: b.reached, agree: `${b.agree}/${b.judged}`, bends: `${b.bendsHit} hit / ${b.bendsMissed} missed / ${b.extraBends} extra of ${b.bendsSam}`, notAgreeing: b.notAgreeing.join(' '), error: b.error }])),
    disagreements: c.disagreements.map((d) => `hole ${d.hole}: ${d.sameTrace.join(' vs ')}${d.noPath.length ? `; no path: ${d.noPath.join(' ')}` : ''}`),
    overview: r.overview?.path ?? null }, null, 1));
}
