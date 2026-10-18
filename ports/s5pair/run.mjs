#!/usr/bin/env node
/**
 * Runner for the fn.Tee.pairBadge ComparableForkJoin (node-only): S5, every tee of the course paired with its badge.
 *
 *   node ports/s5pair/run.mjs --specimen golden --attempt ATTEMPT_ID [--out DIR] [--accept VARIANT]
 *
 * Reads a completed attempt after S3 association and S4 recovery (never re-runs the provider or S4). The S3 PxC
 * (early/s3.pxc.bin) is the store's board: px.badges, px.image.cropped, ... by address; tk.s4.badgePlates is S4's own
 * Calculation over px.badges (ports/s4recover/teeRecover.mjs). Lane outputs not on that board are root inputs:
 *   s3assoc/px.tees.association.json                     S3 association rows (observed tees, their badge, AA-fit pose)
 *   s4recover/run-<latest>/cmp.fn.Tee.recover.json       the S4 pointer (accepted variant), then
 *     artifacts/fn.Tee.recover/<accepted>/recovered.json px.tees.recovered: the accepted S4 recovered tees
 *   late/s5-pairs.json, late/s5-global-assignment.json  the pinned S5 (source px -> canonical: y - S0 upperRowsRemoved)
 *   late/geometry.json                                   the pinned S5's tee axes (baselineAxes)
 *   testimony/<specimen>/*.annotation.json               Sam's tee points (judge guarantee only)
 * A missing upstream output is a recorded condition ("lane not run"), never a throw. It discovers
 * impl/fn.Tee.pairBadge/*.mjs, runs comparableForkJoin with ports/s5pair/guarantees.mjs, points px.tees.pairs at the
 * accepted variant by acceptRule, and writes under <out> (default attempts/stages/<id>/fork/stage-output/s5pair/
 * run-<ISO time>/): artifacts/fn.Tee.pairBadge/<impl>/pairs.json, cmp.fn.Tee.pairBadge.json, keyspace.json,
 * instrumentation.json, s5pair.{records.json,frames.json,flipbook.html}, s5pair.<variant>.svg (the labelled render).
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { deflateSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { runnerCache, casFlag } from '../../fg/casRunner.mjs';
import { instrumentedStore, profileSummary, profileFrame } from '../../fg/profile.mjs';
import { RENDER_PART, registerQueries } from '../../fg/store.mjs';
import { comparableForkJoin, forkJoinFrames } from '../../fg/forkjoin.mjs';
import { discoverImplementations } from '../../fg/discover.mjs';
import { createFileSink } from '../../fg/node-sink.mjs';
import { framesJson, renderFlipbook } from '../../fg/flipbook.mjs';
import { canonicalJson } from '../../fg/canon.mjs';
import { PAIR_QUERIES } from './residualQuery.mjs';
import { S4_CALCULATIONS } from '../s4recover/teeRecover.mjs';
import { loadTestimony } from '../judge/testimony.mjs';
import { PAIR_SLOT } from './pairBadge.mjs';
import { GUARANTEES } from './guarantees.mjs';
import { comparePairs, pairsSvg } from './compare.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const readOpt = (p, absent) => (existsSync(p) ? readJson(p) : absent);
const latestRun = (dir) => (existsSync(dir) ? readdirSync(dir).filter((d) => d.startsWith('run-')).sort().at(-1) ?? null : null);

function findKey(obj, key) {
  if (!obj || typeof obj !== 'object') return undefined;
  if (key in obj) return obj[key];
  for (const v of Object.values(obj)) { const r = findKey(v, key); if (r !== undefined) return r; }
  return undefined;
}

/** The pinned S5 in the canonical frame, or why there is none. */
export function latePinnedPart(late, upper) {
  const pairsFile = join(late, 's5-pairs.json'), assignFile = join(late, 's5-global-assignment.json'), geoFile = join(late, 'geometry.json');
  if (!existsSync(pairsFile)) return { laneNotRun: 'late S5 not run (the attempt stops before --until 5): the pinned S5 has nothing', axes: [], selected: [], unusedTeeIds: [], unmatchedBadgeIds: [] };
  if (!existsSync(assignFile)) return { laneNotRun: 'lane s5.globalAssignment not run: the pinned S5 rows are unowned measurements (every tee x every badge), no one-to-one pairs', axes: [], selected: [], unusedTeeIds: [], unmatchedBadgeIds: [] };
  const rows = readJson(pairsFile).rows, a = readJson(assignFile).assignment, geo = existsSync(geoFile) ? readJson(geoFile) : null;
  const holeOf = new Map(rows.map((r) => [r.badgeId, r.holeRead]));
  const measured = new Map(rows.map((r) => [`${r.teeId} ${r.badgeId}`, r]));
  const canon = (p) => [p[0], p[1] - upper];
  const axes = geo ? [...geo.baselineAxes.visible.map((x) => ({ ...x, kind: 'visible' })), ...geo.baselineAxes.recovered.map((x) => ({ ...x, kind: 'recovered' }))]
    .map((x) => ({ detId: x.detId, kind: x.kind, center: canon(x.center), angleRad: x.angleRad, geometrySource: x.geometrySource ?? null })) : [];
  return {
    laneNotRun: geo ? null : 'late/geometry.json missing: the pinned S5 tee axes are unknown',
    rule: `late/s5-global-assignment.json assignment.selected, source px -> canonical: y - ${upper} (S0 upperRowsRemoved); badge by late/s5-pairs.json holeRead`,
    assignmentStatus: a.status ?? null,
    axes,
    selected: (a.selected ?? []).map((s) => { const m = measured.get(`${s.teeId} ${s.badgeId}`); return { teeId: s.teeId, badgeId: s.badgeId, holeRead: holeOf.get(s.badgeId) ?? null, hitId: s.id, angleResidualDeg: m?.angleResidualDeg ?? null, signedPerpPx: m?.signedPerpPx ?? null }; }),
    unusedTeeIds: a.unusedTeeIds ?? [], unmatchedBadgeIds: a.unmatchedBadgeIds ?? [], notes: []
  };
}

export function loadAttemptParts({ attempt, specimen, root = ROOT }) {
  const fork = join(root, 'attempts', 'stages', attempt, 'fork'), out = join(fork, 'stage-output');
  const record = readJson(join(root, 'attempts', 'stages', `${attempt}.json`));
  const pxc = new Map(deserialize(readFileSync(join(out, 'early', 's3.pxc.bin'))));
  const board = Object.freeze({ has: (a) => pxc.has(a), get: (a) => pxc.get(a), addresses: [...pxc.keys()] });
  const receipt = readJson(join(out, 'early', 'run.receipt.json'));
  const upper = findKey(receipt, 'upperRowsRemoved'), originalPx = findKey(receipt, 'originalPx');
  const assoc = readOpt(join(out, 's3assoc', 'px.tees.association.json'), { rows: [], absent: 's3assoc not run: no observed tee has a badge' });
  // the S4 pointer: the variant its runner accepted by its stated rule (cmp.fn.Tee.recover.json), never a constant here
  const s4run = latestRun(join(out, 's4recover'));
  const cmp4 = s4run ? readOpt(join(out, 's4recover', s4run, 'cmp.fn.Tee.recover.json'), null) : null;
  const accepted4 = cmp4?.accepted ?? null;
  const recFile = accepted4 ? join(out, 's4recover', s4run, 'artifacts', 'fn.Tee.recover', accepted4, 'recovered.json') : null;
  const recovered = recFile && existsSync(recFile)
    ? { variant: accepted4, run: s4run, rule: cmp4.acceptRule ?? null, acceptedBy: cmp4.acceptedBy ?? null, recovered: readJson(recFile).recovered ?? [] }
    : { variant: null, run: s4run, recovered: [], absent: !s4run ? 's4recover not run: no recovered tees' : 'S4 has no accepted variant (no pointer): no recovered tees' };
  const T = loadTestimony(specimen, root);
  const teePoints = T ? {
    frame: 'canonical', path: T.file, rule: `canonical y = annotation y - ${T.dy} px (testimony/${specimen}/README.md measured mapping); tee points are ring-hole centroids`,
    points: [...T.holes.values()].map((h) => ({ hole: h.hole, source: [h.tee[0], h.tee[1] + T.dy], canonical: h.tee })).sort((a, b) => a.hole - b.hole)
  } : { frame: 'canonical', path: null, rule: `no testimony for ${specimen}: blind run, nothing judged`, points: [] };
  const srcPath = join(fork, record.request.sourcePath);
  const bytes = existsSync(srcPath) ? readFileSync(srcPath) : null;
  const background = bytes && originalPx ? { src: `data:image/${bytes[0] === 0x89 ? 'png' : 'jpeg'};base64,${bytes.toString('base64')}`, width: originalPx.width, height: originalPx.height, x: 0, y: -upper } : null;
  return {
    fork, out, upperRowsRemoved: upper, board, background,
    values: { 'px.tees.association': assoc, 'px.tees.recovered': recovered, 'tk.s5.latePinned': latePinnedPart(join(out, 'late'), upper), 'testimony.source.teePoints': teePoints }
  };
}

/**
 * The pointer rule (the S4 rule's shape, ports/s4recover/run.mjs acceptRule): among the variants that ran (no error,
 * lane run) whose judged result ties the best (right desc, wrong asc, none asc), the fastest standalone. A course
 * without testimony takes the variant the annotated courses accepted (acceptedElsewhere); with none on record there is
 * no pointer, and that is recorded, not thrown.
 */
export function acceptRule({ acceptedElsewhere = null, judged = true } = {}) {
  const rule = judged
    ? 'fastest standalone variant whose judged result ties the best (right desc, wrong asc, none asc); a variant whose lane did not run is not a candidate'
    : `no testimony: the variant the annotated courses accepted${acceptedElsewhere ? ` (${acceptedElsewhere})` : ' (none on record: no pointer)'}`;
  const accept = (value, { names, branches, timingsMs }) => {
    const live = names.filter((n) => !branches[n].error && !value.variants[n]?.laneNotRun);
    if (!judged) { accept.decided = acceptedElsewhere && live.includes(acceptedElsewhere) ? 'annotated courses' : 'nothing'; return accept.decided === 'nothing' ? null : acceptedElsewhere; }
    const score = (n) => { const b = value.variants[n]; return [-(b.right ?? -1), b.wrong ?? Infinity, b.none ?? Infinity]; };
    const cmpScore = (a, b) => { const A = score(a), B = score(b); for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) return A[i] - B[i]; return 0; };
    const sorted = [...live].sort(cmpScore);
    if (!sorted.length) { accept.decided = 'nothing'; return null; }
    const tied = sorted.filter((n) => cmpScore(n, sorted[0]) === 0);
    accept.decided = tied.length > 1 ? `tie on judged result among ${tied.join(', ')}: fastest standalone` : 'best judged result';
    return tied.sort((a, b) => (timingsMs[a]?.ms ?? Infinity) - (timingsMs[b]?.ms ?? Infinity))[0];
  };
  accept.rule = rule; accept.decided = null;
  return accept;
}

export async function runPairBadgeForkJoin({ attempt, specimen, outDir = null, root = ROOT, acceptedElsewhere = null, cas = true }) {
  const loaded = loadAttemptParts({ attempt, specimen, root });
  const out = outDir ?? join(loaded.out, 's5pair', `run-${new Date().toISOString().replace(/[:.]/g, '-')}`); // evidence is never overwritten (file sink)
  const { store, document: instrumentation } = instrumentedStore({ name: `s5pair:${specimen}`, base: loaded.board, ...runnerCache({ root, entry: import.meta.filename, cas }) });
  store.constant('fn.tk.s5pair.laneOutputs', loaded.values);
  for (const [fn, spec] of S4_CALCULATIONS.filter(([fn]) => fn === 'fn.tk.s4.badgePlates')) store.register(fn, spec);   // the plate centres S4 recovers against
  registerQueries(store, PAIR_QUERIES, { note: 'tee-badge pair math behind the PxC boundary (ports/s5pair/residualQuery.mjs)' });
  store.get('tk.s4.badgePlates');   // shared by every branch: produced once on the parent
  const implementations = await discoverImplementations(join(root, 'impl'), PAIR_SLOT.slot);
  const sink = createFileSink(join(out, 'artifacts'), { relativeTo: out });
  const judged = Boolean(loaded.values['testimony.source.teePoints'].path);
  const accept = acceptRule({ acceptedElsewhere, judged });
  const result = comparableForkJoin({
    slot: PAIR_SLOT.slot, part: PAIR_SLOT.part, implementations, store,
    restore: () => loaded.board,
    apply: (parts, impl, name) => ({ slot: PAIR_SLOT.slot, implementation: name, ...impl(parts) }),   // timed by the store, never by hand
    guarantees: GUARANTEES, sink,
    compare: comparePairs({ parentStore: store, deflate: (raw) => deflateSync(raw) }), accept
  });
  mkdirSync(out, { recursive: true });
  const v = result.comparison.value, cmp = result.comparison;
  const timings = Object.fromEntries(Object.entries(cmp.timingsMs).map(([n, t]) => [n, t.ms]));
  writeFileSync(join(out, `${cmp.address}.json`), canonicalJson({
    schema: 'nctk-s5-tee-badge-pair-comparison@2', specimen, attempt, address: cmp.address, implementations: cmp.implementations, sha256: cmp.sha256,
    variants: cmp.variants, accepted: cmp.accepted, acceptRule: accept.rule, acceptedBy: accept.decided,
    s4Accepted: loaded.values['px.tees.recovered'].variant,
    timingsMs: cmp.timingsMs,   // standalone: self time of every call under the variant (fg/forkjoin.mjs standaloneMs)
    value: v
  }) + '\n');
  writeFileSync(join(out, 'keyspace.json'), canonicalJson({ schema: 'nctk-keyspace@1', specimen, attempt, store: store.manifest().store, parts: store.keyspace() }) + '\n');
  const doc = instrumentation(), profile = profileSummary(doc);
  writeFileSync(join(out, 'instrumentation.json'), JSON.stringify(doc) + '\n');   // sidecar: timings are never hashed evidence
  // renderable (a default property of Parts): one page per Part this run produced or rooted, rendered by the store itself
  const partPages = store.manifest().parts.map((p) => p.address).filter((a) => a.startsWith('tk.s4.') || a.startsWith('tk.s5.') || a.startsWith(PAIR_SLOT.part)).sort()
    .map((a) => { const r = store.call(RENDER_PART, { a }).value; return { title: `${a} (${r.kind})`, calculation: 'fg.render', tick: 'render', parts: r.parts, verdicts: [{ name: `${a} renders`, ok: r.kind !== 'unrenderable' && r.parts.length > 0 }] }; });
  const frames = [...forkJoinFrames(result), profileFrame(profile, { wallMs: doc.wallMs }), ...partPages];
  const records = Object.fromEntries(Object.entries(result.branches).map(([n, b]) => [n, { error: b.error, records: b.records }]));
  writeFileSync(join(out, 's5pair.records.json'), canonicalJson({ schema: 'nctk-fg-forkjoin-records@1', slot: result.slot, specimen, attempt, branches: records }) + '\n');
  writeFileSync(join(out, 's5pair.frames.json'), framesJson(frames) + '\n');
  writeFileSync(join(out, 's5pair.flipbook.html'), renderFlipbook(frames, { title: `S5 ${PAIR_SLOT.slot} fork-join (${specimen}): ${cmp.implementations.join(' vs ')}`, background: loaded.background, records: { branches: records }, stage: 'S5' }));
  // the labelled render of each variant (the pointer's marked): tees, rays to their badge plate, coloured by verdict, legend
  const img = store.get('px.image.cropped'), plateOf = new Map(store.get('tk.s4.badgePlates').map((p) => [String(p.label), p.plateCenter]));
  const renders = {};
  for (const n of cmp.implementations) {
    const j = result.branches[n].records?.[PAIR_SLOT.testimony];
    if (result.branches[n].error || !j?.rows) continue;
    const file = `s5pair.${n}.svg`;
    writeFileSync(join(out, file), pairsSvg({ title: `S5 tee -> badge pairs, ${specimen} (${attempt}), variant ${n}${cmp.accepted === n ? ' (the pointer)' : ''}${judged ? '' : '; no testimony: unjudged'}`,
      rows: j.rows, unmatched: j.unmatchedBadges, plates: plateOf, widthPx: img.widthPx, heightPx: img.heightPx, image: loaded.background, totals: j.totals }) + '\n');
    renders[n] = file;
  }
  return { out, comparison: v, accepted: cmp.accepted, acceptedBy: accept.decided, variants: cmp.variants, timingsMs: timings, frames: frames.length, branches: records, renders, profile };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
  if (!args.attempt || !args.specimen) { console.error('usage: node ports/s5pair/run.mjs --specimen golden --attempt ATTEMPT_ID [--out DIR] [--no-cas  (do not use the persistent cache attempts/cas)] [--accept VARIANT  (for a course without testimony: what the annotated courses accepted)]'); process.exit(2); }
  const r = await runPairBadgeForkJoin({ attempt: args.attempt, specimen: args.specimen, outDir: args.out ?? null, acceptedElsewhere: args.accept ?? null, cas: casFlag() });
  const c = r.comparison;
  console.log(JSON.stringify({
    out: r.out, frames: r.frames, accepted: r.accepted, acceptedBy: r.acceptedBy, timingsMs: r.timingsMs, renders: r.renders,
    profile: r.profile.slice(0, 8).map((p) => `${p.calculation}: ${p.calls}x self ${p.selfMs} ms total ${p.totalMs} ms ${JSON.stringify(p.emits)}`),
    variants: Object.fromEntries(Object.entries(c.variants).map(([n, b]) => [n, { tees: b.tees, paired: b.paired, right: b.right, wrong: b.wrong, none: b.none, unjudged: b.unjudged, unmatchedBadges: b.unmatchedBadgeLabels, holesWithNoTee: b.missingTeeHoles, laneNotRun: b.laneNotRun, error: b.error }])),
    disagreements: c.disagreements,
    errors: Object.fromEntries(Object.entries(r.branches).map(([n, b]) => [n, b.error]))
  }, null, 1));
}
