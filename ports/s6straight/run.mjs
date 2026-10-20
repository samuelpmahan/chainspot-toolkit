#!/usr/bin/env node
/**
 * Runner for the fn.Hole.straight ComparableForkJoin (node-only), modelled on ports/s4recover/run.mjs.
 *
 *   node ports/s6straight/run.mjs --specimen golden --attempt ATTEMPT_ID [--out DIR] [--accept VARIANT]
 *
 * Reads a completed attempt (never re-runs the provider) after `ports/s3assoc/run.mjs` and `ports/s4recover/run.mjs`.
 * The S3 PxC (early/s3.pxc.bin) is the store's board: px.badges, px.baskets, px.image.cropped are read by address and
 * S6's own Calculations (holeStraight.mjs S6_CALCULATIONS) derive tk.s6.* Parts from them. Lane outputs not on the
 * board are root inputs (absent means that lane did not run: recorded, never thrown):
 *   s3assoc/px.tees.association.json                     px.tees.association (observed tee -> badge, pad template)
 *   early/artifacts/s3fix/px.tees.refined.json           px.tees.refined (S3 tee px: the path mask)
 *   early/artifacts/s3fix/px.tees.family-refined.json    tk.s6.padLength (the family model's major median, course.py C.L)
 *   s4recover/<latest run>/cmp.fn.Tee.recover.json       tk.s6.s4Recovered  (the accepted variant's recovered.json:
 *     -> accepted -> artifacts/fn.Tee.recover/<v>/recovered.json            each tee with the hole it was recovered for)
 *   basket-bridge/basket-recovery.part.json              tk.s6.basketRecovery (S4 recovered basket boxes)
 *   late/s6-rows.json + late/geometry.json               tk.s6.lateS6 (pinned two-ray rows, source px -> canonical)
 *   testimony/<specimen>/*.annotation.json               testimony.source.holes (the judge guarantee only)
 * tk.s7.alphaProfile (the pathLoss variant reads it) is produced on first need by the S7 Calculations, registered as
 * fg/alpha/run.mjs registers them (registerAlphaProfile: S4's lane outputs this store lacks and S4's Calculations for
 * tk.s4.hallway, tk.s3assoc.association = the same association file, the course, testimony-free straight segments).
 * It discovers impl/fn.Hole.straight/*.mjs, runs comparableForkJoin with ./guarantees.mjs and ./compare.mjs, points
 * px.holes.straight at the accepted variant by acceptRule, and writes under <out> (default
 * attempts/stages/<id>/fork/stage-output/s6straight/run-<ISO time>/):
 *   artifacts/fn.Hole.straight/<impl>/straight.json, cmp.fn.Hole.straight.json, keyspace.json, instrumentation.json,
 *   s6straight.{records.json,frames.json,flipbook.html}, s6straight.render.svg (+ .png when ImageMagick is present)
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { join, resolve } from 'node:path';
import { courseSourceOf } from '../capture/capture.mjs';
import { spawnSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { runnerCache, casFlag } from '../../fg/casRunner.mjs';
import { instrumentedStore, profileSummary, profileFrame } from '../../fg/profile.mjs';
import { RENDER_PART, registerQueries } from '../../fg/store.mjs';
import { comparableForkJoin, forkJoinFrames } from '../../fg/forkjoin.mjs';
import { discoverImplementations } from '../../fg/discover.mjs';
import { createFileSink } from '../../fg/node-sink.mjs';
import { writeFlipbook } from '../../fg/node-flipbook.mjs';
import { canonicalJson } from '../../fg/canon.mjs';
import { HOLE_STRAIGHT_SLOT, S6_CALCULATIONS, holeQueries } from './holeStraight.mjs';
import { GUARANTEES } from './guarantees.mjs';
import { compareStraight } from './compare.mjs';
import { straightSvg } from './render.mjs';
import { loadTestimony } from '../judge/testimony.mjs';
import { registerPathLoss as registerPathMeasurement } from './pathLoss.mjs';
import { registerPairFeatures } from './pairFeatures.mjs';
import { loadAttemptParts } from '../s4recover/run.mjs';
import { registerAlphaProfile, s4LaneOutputsFor, loadAssociation } from '../../fg/alpha/run.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const readOpt = (p, absent) => (existsSync(p) ? readJson(p) : absent);
export const PINNED_CANDIDATE = 'TWO_RAY_ZERO_BEND_GEOMETRY_CANDIDATE_UNOWNED';

function findKey(obj, key) {
  if (!obj || typeof obj !== 'object') return undefined;
  if (key in obj) return obj[key];
  for (const v of Object.values(obj)) { const r = findKey(v, key); if (r !== undefined) return r; }
  return undefined;
}

/** The latest run directory of a post-recipe step, or null. */
export const latestRun = (dir) => (existsSync(dir) ? readdirSync(dir).filter((d) => d.startsWith('run-')).sort().at(-1) ?? null : null);

export function loadS6Inputs({ attempt, specimen, root = ROOT }) {
  const fork = join(root, 'attempts', 'stages', attempt, 'fork'), out = join(fork, 'stage-output');
  const record = readJson(join(root, 'attempts', 'stages', `${attempt}.json`));
  const pxc = new Map(deserialize(readFileSync(join(out, 'early', 's3.pxc.bin'))));
  const board = Object.freeze({ has: (a) => pxc.has(a), get: (a) => pxc.get(a), addresses: [...pxc.keys()] });
  const receipt = readJson(join(out, 'early', 'run.receipt.json'));
  const upper = findKey(receipt, 'upperRowsRemoved'), originalPx = findKey(receipt, 'originalPx');

  const assoc = readOpt(join(out, 's3assoc', 'px.tees.association.json'), { rows: [], absent: 'S3 association not run: no observed tee-badge pairs' });
  const association = { absent: assoc.absent ?? null, condition: assoc.absent ?? null, template: assoc.template ?? null, rows: assoc.rows };
  const refinedFile = join(out, 'early', 'artifacts', 's3fix', 'px.tees.refined.json');
  const famFile = join(out, 'early', 'artifacts', 's3fix', 'px.tees.family-refined.json'), fam = existsSync(famFile) ? readJson(famFile).model : null;
  // s3first.py's C.L (course.py): the S3 family model's major median, the pad length every course without AA-fit pads used
  const padLength = fam?.major?.median ? { lengthPx: fam.major.median, rule: 'S3 family model major median (px.tees.family-refined model.major.median; course.py C.L)' } : { lengthPx: null, condition: 'no S3 family model' };
  const refined = existsSync(refinedFile) ? readJson(refinedFile).tees.map((t) => ({ label: t.label, center: t.center, angleRad: t.angleRad, bbox: t.bbox, px: t.px })) : [];

  const s4dir = join(out, 's4recover'), s4run = latestRun(s4dir);
  const cmp = s4run ? readOpt(join(s4dir, s4run, 'cmp.fn.Tee.recover.json'), null) : null;
  const recFile = cmp?.accepted ? join(s4dir, s4run, 'artifacts', 'fn.Tee.recover', cmp.accepted, 'recovered.json') : null;
  const rec = recFile ? readOpt(recFile, null) : null;
  const s4Recovered = {
    accepted: cmp?.accepted ?? null, run: s4run,
    absent: !s4run ? 'S4 tee recovery not run: no recovered tee-badge pairs' : !cmp?.accepted ? 'S4 has no accepted variant (no pointer): no recovered pairs' : !rec ? `S4 accepted ${cmp.accepted} wrote no recovered.json` : null,
    recovered: (rec?.recovered ?? []).map((t) => ({ hole: t.hole, center: t.center, angleRad: t.angleRad ?? null }))
  };

  const bridge = readOpt(join(out, 'basket-bridge', 'basket-recovery.part.json'), { comparisons: { accepted: [] }, absent: 'basket-bridge lane not run: no recovered basket boxes' });
  const basketRecovery = { absent: bridge.absent ?? null, rule: 'S4 basketRecovery accepted decisions with classification != existing-s2-exact; semanticBbox, canonical px',
    recoveredBoxes: (bridge.comparisons?.accepted ?? []).filter((d) => d.classification !== 'existing-s2-exact').map((d) => d.semanticBbox) };

  const s6rows = readOpt(join(out, 'late', 's6-rows.json'), null), geo = readOpt(join(out, 'late', 'geometry.json'), null);
  const lateS6 = !s6rows || !geo ? { absent: `pinned late S6 two-ray rows absent (attempt ran --until ${record.request?.until ?? '?'}; late/s6-rows.json needs --until 6)`, rows: [], templateTops: {} } : (() => {
    const plate = new Map(geo.badgePlates.map((p) => [p.detId, p.holeRead]));
    return {
      absent: null, candidateStatus: PINNED_CANDIDATE, upperRowsRemoved: upper,
      rule: `late/s6-rows.json rows, source px -> canonical: y - ${upper} (S0 upperRowsRemoved); badge hole = geometry.json badgePlates[detId].holeRead`,
      rows: s6rows.rows.map((r) => ({ id: r.id, teeId: r.teeId, badgeId: r.badgeId, holeRead: plate.get(r.badgeId) ?? null, basketId: r.basketId, teeCenter: [r.teeCenter[0], r.teeCenter[1] - upper],
        status: r.status, reasons: r.reasons ?? [], topSignedPerpPx: r.topSignedPerpPx, badgeSignedPerpPx: r.badgeSignedPerpPx })),
      templateTops: Object.fromEntries(geo.templateTops.map((t) => [t.basketId, { bbox: [t.bbox[0], t.bbox[1] - upper, t.bbox[2], t.bbox[3]] }]))
    };
  })();

  const T = loadTestimony(specimen, root);
  const holes = T ? { path: T.file, complete: T.complete, rule: `canonical y = annotation y - ${T.dy} px (testimony/${specimen}/README.md); a hole with no corridorBends is straight`,
    holes: [...T.holes.values()].sort((a, b) => a.hole - b.hole).map((h) => ({ hole: String(h.hole), tee: h.tee, basket: h.basket, bends: h.bends ?? [], bent: h.bent })) }
    : { path: null, complete: false, rule: `no testimony for ${specimen}: blind run, nothing judged`, holes: [] };

  const srcPath = courseSourceOf(fork, record.request.sourcePath);   // a capture's source is the course raster S0 stitched
  const bytes = existsSync(srcPath) ? readFileSync(srcPath) : null;
  const background = bytes && originalPx ? { src: `data:image/${bytes[0] === 0x89 ? 'png' : 'jpeg'};base64,${bytes.toString('base64')}`, width: originalPx.width, height: originalPx.height, x: 0, y: -upper, path: srcPath } : null;   // path: a run hardlinks the source instead of copying it (fg/node-flipbook.mjs)
  return { out, board, upperRowsRemoved: upper, background,
    values: { 'px.tees.association': association, 'px.tees.refined': refined, 'tk.s6.padLength': padLength, 'tk.s6.s4Recovered': s4Recovered, 'tk.s6.basketRecovery': basketRecovery, 'tk.s6.lateS6': lateS6, 'testimony.source.holes': holes } };
}

/**
 * The pointer rule (the S4 shape): among the live variants (no error, not 'lane not run'), the best judged result =
 * fewest FP, then fewest FN; ties -> fastest standalone. A course without testimony takes the variant the annotated
 * courses accepted (acceptedElsewhere); with none on record there is no pointer, recorded, not thrown.
 */
export function acceptRule({ acceptedElsewhere = null, judged = true } = {}) {
  const rule = judged
    ? 'fastest standalone variant whose judged result ties the best (FP asc, then FN asc); variants with lane not run are excluded'
    : `no testimony: the variant the annotated courses accepted${acceptedElsewhere ? ` (${acceptedElsewhere})` : ' (none on record: no pointer)'}`;
  const accept = (value, { names, branches, timingsMs }) => {
    const live = names.filter((n) => !branches[n].error && !value.branches[n]?.laneNotRun);
    if (!judged) { accept.decided = acceptedElsewhere && live.includes(acceptedElsewhere) ? 'annotated courses' : 'nothing'; return accept.decided === 'nothing' ? null : acceptedElsewhere; }
    const score = (n) => { const b = value.branches[n]; return [b.FP ?? Infinity, b.FN ?? Infinity]; };
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

/**
 * The S6 store of an attempt: the S3 board, the lane outputs as constants, every S6 Calculation and query (hole, path,
 * scoring), the S7 profile registered to be produced on first need. Nothing is produced here. Shared by the fork-join
 * runner and the feature report (features.mjs). The persistent cache is on by default (cas: false opts out).
 */
export function buildS6Store({ loaded, attempt, specimen, root = ROOT, cas = true }) {
  const { store, document: instrumentation } = instrumentedStore({ name: `s6straight:${specimen}`, base: loaded.board, ...runnerCache({ root, entry: import.meta.filename, cas }) });
  store.constant('fn.tk.s6straight.laneOutputs', loaded.values);
  for (const [fn, spec] of S6_CALCULATIONS) store.register(fn, spec);
  registerQueries(store, holeQueries((a) => store.get(a)), { resolve: (ref) => ref, note: 'S6 hole questions (ports/s6straight/holeStraight.mjs)' });
  registerPathMeasurement(store);   // fn.q.path.* and tk.s6.pathMask / tk.s6.hallway (agent B's half): produced on first need
  // the S7 profile the pathLoss variant reads: its Calculations registered here, produced on first need (never eagerly)
  const s4 = loadAttemptParts({ attempt, specimen, root });
  registerAlphaProfile(store, { s4LaneOutputs: s4LaneOutputsFor(s4.values, { omit: Object.keys(loaded.values) }), association: loadAssociation({ out: loaded.out, attempt, specimen }), course: specimen });
  registerPairFeatures(store);   // S6 SCORING: tk.s6.pairFeatures and its feature Parts; the five variants are MATCHING rules over it
  return { store, instrumentation };
}

export async function runHoleStraightForkJoin({ attempt, specimen, outDir = null, root = ROOT, acceptedElsewhere = null, cas = true }) {
  const loaded = loadS6Inputs({ attempt, specimen, root });
  const out = outDir ?? join(loaded.out, 's6straight', `run-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  const { store, instrumentation } = buildS6Store({ loaded, attempt, specimen, root, cas });
  // shared by every branch: produced once on the parent, so no variant's standalone time is charged for them (the S4 convention)
  for (const address of ['tk.s6.holePairs', 'tk.s6.baskets', 'tk.s6.badgeCenters', 'tk.s6.hallway', 'tk.s6.pairFeatures']) store.get(address);
  const implementations = await discoverImplementations(join(root, 'impl'), HOLE_STRAIGHT_SLOT.slot);
  const sink = createFileSink(join(out, 'artifacts'), { relativeTo: out });
  const judged = Boolean(loaded.values['testimony.source.holes'].path);
  const accept = acceptRule({ acceptedElsewhere, judged });
  const result = comparableForkJoin({
    slot: HOLE_STRAIGHT_SLOT.slot, part: HOLE_STRAIGHT_SLOT.part, implementations, store,
    restore: () => loaded.board,
    apply: (parts, impl, name) => ({ slot: HOLE_STRAIGHT_SLOT.slot, implementation: name, ...impl(parts) }),
    guarantees: GUARANTEES, sink,
    compare: compareStraight({ parentStore: store, deflate: (raw) => new Uint8Array(deflateSync(raw)) }), accept
  });
  mkdirSync(out, { recursive: true });
  const v = result.comparison.value, cmp = result.comparison;
  writeFileSync(join(out, `${cmp.address}.json`), canonicalJson({
    schema: 'nctk-s6-hole-straight-comparison@1', specimen, attempt, address: cmp.address, implementations: cmp.implementations, sha256: cmp.sha256,
    variants: cmp.variants, accepted: cmp.accepted, acceptRule: accept.rule, acceptedBy: accept.decided,
    upstream: { s4Accepted: loaded.values['tk.s6.s4Recovered'].accepted, s4Run: loaded.values['tk.s6.s4Recovered'].run,
      conditions: Object.entries(loaded.values).map(([k, x]) => (x?.absent ? `${k}: ${x.absent}` : null)).filter(Boolean) },
    timingsMs: cmp.timingsMs,   // standalone: self time of every call under the variant; a cache hit charged what it cost to compute
    value: v
  }) + '\n');
  writeFileSync(join(out, 'keyspace.json'), canonicalJson({ schema: 'nctk-keyspace@1', specimen, attempt, store: store.manifest().store, parts: store.keyspace() }) + '\n');
  const doc = instrumentation(), profile = profileSummary(doc);
  writeFileSync(join(out, 'instrumentation.json'), JSON.stringify(doc) + '\n');
  const partPages = store.manifest().parts.map((p) => p.address).filter((a) => a.startsWith('tk.s6.')).sort()
    .map((a) => { const r = store.call(RENDER_PART, { a }).value; return { title: `${a} (${r.kind})`, calculation: 'fg.render', tick: 'render', parts: r.parts, verdicts: [{ name: `${a} renders`, ok: r.kind !== 'unrenderable' && r.parts.length > 0 }] }; });
  const frames = [...forkJoinFrames(result), profileFrame(profile, { wallMs: doc.wallMs }), ...partPages];
  const records = Object.fromEntries(Object.entries(result.branches).map(([n, b]) => [n, { error: b.error, records: b.records }]));
  writeFileSync(join(out, 's6straight.records.json'), canonicalJson({ schema: 'nctk-fg-forkjoin-records@1', slot: result.slot, specimen, attempt, branches: records }) + '\n');
  const { images } = writeFlipbook(out, 's6straight', frames, { title: `S6 ${HOLE_STRAIGHT_SLOT.slot} fork-join (${specimen}): ${cmp.implementations.join(' vs ')}`, background: loaded.background, records: { branches: records }, stage: 'S6' });   // images once, as files under out/img/ (fg/node-flipbook.mjs)
  const render = writeRender({ out, specimen, attempt, store, result, judged, background: images.background(loaded.background) });   // the run's image file, not a data URL
  return { out, comparison: v, accepted: cmp.accepted, acceptedBy: accept.decided, variants: cmp.variants, timingsMs: Object.fromEntries(Object.entries(cmp.timingsMs).map(([n, t]) => [n, t.ms])), frames: frames.length, branches: records, profile, render };
}

/** The legible report render for Sam: the accepted variant (else straight3) over the course, Sam's bends drawn. */
function writeRender({ out, specimen, attempt, store, result, judged, background }) {
  const cmp = result.comparison, names = cmp.implementations;
  const shown = cmp.accepted ?? (names.includes('straight3') ? 'straight3' : names[0]);
  const verdictsOf = (n) => (store.has(cmp.variants[n]) ? store.get(cmp.variants[n]).verdicts : []);
  const judgeOf = (n) => result.branches[n].records?.[HOLE_STRAIGHT_SLOT.testimony]?.rows ?? [];
  const live = names.filter((n) => !result.branches[n].error && !store.get(cmp.variants[n])?.laneNotRun);
  const rows = verdictsOf(shown).map((v) => { const j = judgeOf(shown).find((r) => r.pair === v.pair); return { ...v, outcome: j?.outcome === 'unjudged' ? null : j?.outcome ?? null, basketAgrees: j?.basketAgrees ?? null }; });
  const others = Object.fromEntries(rows.map((r) => [r.pair, live.filter((n) => n !== shown).map((n) => ({ name: n, verdict: verdictsOf(n).find((x) => x.pair === r.pair)?.verdict })).filter((o) => o.verdict && o.verdict !== r.verdict)]));
  const { widthPx, heightPx } = store.get('px.image.cropped'), T = store.get('testimony.source.holes');
  const t = cmp.value.branches[shown] ?? {};
  const title = `${specimen} S6 straight vs bent: ${shown}${cmp.accepted ? ' (accepted)' : ' (no pointer)'}${judged ? ` TP ${t.TP} / FP ${t.FP} / FN ${t.FN} / TN ${t.TN}` : ''}`;
  const svg = straightSvg({ widthPx, heightPx, image: background, title, accepted: shown, rows, holes: T.holes, others, judged, note: `attempt ${attempt}; canonical px; live variants: ${live.join(', ')}` });
  const svgPath = join(out, 's6straight.render.svg');
  writeFileSync(svgPath, svg);
  const png = join(out, 's6straight.render.png');
  const r = spawnSync('convert', [svgPath, png], { encoding: 'utf8' });
  return { svg: svgPath, png: r.status === 0 && existsSync(png) ? png : null, shown };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
  if (!args.attempt || !args.specimen) { console.error('usage: node ports/s6straight/run.mjs --specimen golden --attempt ATTEMPT_ID [--out DIR] [--no-cas  (do not use the persistent cache attempts/cas)] [--accept VARIANT  (for a course without testimony: what the annotated courses accepted)]'); process.exit(2); }
  const r = await runHoleStraightForkJoin({ attempt: args.attempt, specimen: args.specimen, outDir: args.out ?? null, acceptedElsewhere: args.accept ?? null, cas: casFlag() });
  const c = r.comparison;
  console.log(JSON.stringify({
    out: r.out, frames: r.frames, accepted: r.accepted, acceptedBy: r.acceptedBy, timingsMs: r.timingsMs, render: r.render,
    profile: r.profile.slice(0, 8).map((p) => `${p.calculation}: ${p.calls}x self ${p.selfMs} ms total ${p.totalMs} ms ${JSON.stringify(p.emits)}`),
    branches: c.branches, disagreements: c.disagreements,
    errors: Object.fromEntries(Object.entries(r.branches).map(([n, b]) => [n, b.error]))
  }, null, 1));
}
