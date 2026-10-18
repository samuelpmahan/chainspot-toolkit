#!/usr/bin/env node
/**
 * Runner for the fn.Tee.recover ComparableForkJoin (node-only).
 *
 *   node ports/s4recover/run.mjs --specimen golden --attempt ATTEMPT_ID [--out DIR]
 *
 * Reads a completed `--until 4 --lanes s3-findfamily-structural-fix,
 * s4.basketRecovery` Attempt (never re-runs the provider). The S3 PxC
 * (early/s3.pxc.bin) is the store's board: S0-S3 Parts are read by address
 * (px.image.cropped, px.badges, px.baskets, px.components, ...) and S4's own
 * Calculations (teeRecover.mjs S4_CALCULATIONS) derive tk.s4.* Parts from them.
 * Lane outputs that are not on that board are root inputs:
 *   basket-bridge/basket-recovery.part.json     S4 accepted basket decisions not exact to S2 (semanticBbox)
 *   early/artifacts/s3fix/px.tees.refined.json  S3 structural refined tees
 *   early/artifacts/s3fix/px.tees.family-refined.json  pad model (incl. interiorTone), anchors, candidates
 *   late/geometry.json                          pinned S4 refinedAxes.recovered (source px -> canonical)
 *   testimony/<specimen>/*.annotation.json      Sam's tee points (judge guarantee only)
 * It discovers impl/fn.Tee.recover/*.mjs, runs
 * comparableForkJoin with ports/s4recover/guarantees.mjs, joins by
 * contracts/tee.pose@1, and writes under <out> (default
 * attempts/stages/<id>/fork/stage-output/s4recover/run-<ISO time>/):
 *   artifacts/fn.Tee.recover/<impl>/recovered.json, cmp.fn.Tee.recover.json,
 *   s4recover.{records.json,frames.json,flipbook.html}
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { join, resolve } from 'node:path';
import { instrumentedStore, profileSummary, profileFrame } from '../../fg/profile.mjs';
import { comparableForkJoin, forkJoinFrames } from '../../fg/forkjoin.mjs';
import { discoverImplementations } from '../../fg/discover.mjs';
import { createFileSink } from '../../fg/node-sink.mjs';
import { framesJson, renderFlipbook } from '../../fg/flipbook.mjs';
import { canonicalJson } from '../../fg/canon.mjs';
import contract from '../../contracts/tee.pose@1.mjs';
import { TEE_RECOVER_SLOT, S4_CALCULATIONS } from './teeRecover.mjs';
import { registerPoseQueries } from './poseSpace.mjs';
import { GUARANTEES } from './guarantees.mjs';
import { compareRecovered } from './compare.mjs';
import { loadTestimony, TESTIMONY_DY as JUDGE_TESTIMONY_DY } from '../judge/testimony.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');

/** Measured annotation-frame -> canonical-frame row offsets (px), per testimony/<specimen>/README.md. */
export const TESTIMONY_DY = JUDGE_TESTIMONY_DY;   // one table: ports/judge/testimony.mjs

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

export function loadAttemptParts({ attempt, specimen, root = ROOT }) {
  const fork = join(root, 'attempts', 'stages', attempt, 'fork');
  const out = join(fork, 'stage-output');
  const A = join(out, 'early', 'artifacts');
  const record = readJson(join(root, 'attempts', 'stages', `${attempt}.json`));
  // The S3 PxC is the board: every S0-S3 Part by its address (px.image.cropped, px.badges, px.baskets, px.components, ...).
  // S4 reads those Parts; it never re-derives them from the artifact files written beside them.
  const pxc = new Map(deserialize(readFileSync(join(out, 'early', 's3.pxc.bin'))));
  const board = Object.freeze({ has: (a) => pxc.has(a), get: (a) => pxc.get(a), addresses: [...pxc.keys()] });
  const { widthPx, heightPx } = pxc.get('px.image.cropped');
  // Optional upstream outputs: absent means that lane did not run; record it and feed forward with nothing from it.
  const readOpt = (p, absent) => (existsSync(p) ? readJson(p) : absent);
  const bridge = readOpt(join(out, 'basket-bridge', 'basket-recovery.part.json'), { comparisons: { accepted: [] }, absent: 'basket-bridge lane not run: no recovered basket boxes' });
  const recoveredBoxes = (bridge.comparisons?.accepted ?? []).filter((d) => d.classification !== 'existing-s2-exact').map((d) => d.semanticBbox);
  const refined = readJson(join(A, 's3fix', 'px.tees.refined.json')).tees.map((t) => ({ label: t.label, center: t.center, angleRad: t.angleRad, bbox: t.bbox, px: t.px }));
  const fam = readJson(join(A, 's3fix', 'px.tees.family-refined.json'));
  const familyRefined = {
    model: fam.model,
    anchors: fam.candidates.filter((c) => c.anchor).map((c) => ({ index: c.index, center: [c.ring.cx, c.ring.cy], angleRad: c.frame.angle, frameMajorPx: c.frame.major })),
    candidates: fam.candidates.map((c) => ({ index: c.index, center: [c.ring.cx, c.ring.cy], verdict: c.verdict, failedTests: c.failedTests, toneDistance: c.measurements?.interior?.toneDistance ?? null, frameAreaPx: c.frame?.area ?? null }))
  };

  const receipt = readJson(join(out, 'early', 'run.receipt.json'));
  const upper = findKey(receipt, 'upperRowsRemoved');
  const originalPx = findKey(receipt, 'originalPx');
  const geo = readOpt(join(out, 'late', 'geometry.json'), { refinedAxes: { recovered: [] }, badgePlates: [], absent: 'late S4 not run: the pinned branch has nothing' });
  const lateGeometry = {
    absent: geo.absent ?? null,
    rule: `late/geometry.json refinedAxes.recovered, source px -> canonical: y - ${upper} (S0 upperRowsRemoved); hole from resultRef tee-shard-badge-<plate index> -> badgePlates[index].holeRead`,
    recovered: geo.refinedAxes.recovered.map((r) => {
      const m = /badge-(\d+)/.exec(r.resultRef ?? '');
      const plate = m ? geo.badgePlates.find((p) => p.detId === `badge-${m[1]}`) : null;
      const cs = r.corners.map(([x, y]) => [x, y - upper]);
      const side = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
      const s1 = side(cs[0], cs[1]), s2 = side(cs[1], cs[2]);
      return { detId: r.detId, resultRef: r.resultRef, holeRead: plate?.holeRead ?? null, center: [r.center[0], r.center[1] - upper], angleRad: r.angleRad, corners: cs, sizePx: [Math.round(Math.max(s1, s2) * 1000) / 1000, Math.round(Math.min(s1, s2) * 1000) / 1000], observedPixelCount: r.observedPixelCount, geometrySource: r.geometrySource };
    })
  };

  // Testimony only feeds the judge guarantee; recovery itself runs blind (a course without testimony still recovers).
  const T = loadTestimony(specimen, root);
  const teePoints = T ? {
    frame: 'canonical', path: T.file, rule: `canonical y = annotation y - ${T.dy} px (testimony/${specimen}/README.md measured mapping); tee points are ring-hole centroids`,
    points: [...T.holes.values()].map((h) => ({ hole: h.hole, source: [h.tee[0], h.tee[1] + T.dy], canonical: h.tee })).sort((a, b) => a.hole - b.hole)
  } : { frame: 'canonical', path: null, rule: `no testimony for ${specimen}: blind run, nothing judged`, points: [] };

  const srcPath = join(fork, record.request.sourcePath);
  const bytes = existsSync(srcPath) ? readFileSync(srcPath) : null;
  const background = bytes && originalPx ? { src: `data:image/${bytes[0] === 0x89 ? 'png' : 'jpeg'};base64,${bytes.toString('base64')}`, width: originalPx.width, height: originalPx.height, x: 0, y: -upper } : null;

  return {
    fork, out, upperRowsRemoved: upper, sourcePath: record.request.sourcePath,
    board,
    // lane outputs not on the S3 board (S3 structural fix, S4 basket bridge, late S4) and the testimony: root inputs
    values: {
      'tk.s4.basketRecovery': { recoveredBoxes, rule: 'S4 basketRecovery accepted decisions with classification != existing-s2-exact; semanticBbox, canonical px' },
      'px.tees.refined': refined, 'px.tees.familyRefined': familyRefined,
      'tk.s4.lateGeometry': lateGeometry, 'testimony.source.teePoints': teePoints
    },
    background
  };
}

function findKey(obj, key) {
  if (!obj || typeof obj !== 'object') return undefined;
  if (key in obj) return obj[key];
  for (const v of Object.values(obj)) { const r = findKey(v, key); if (r !== undefined) return r; }
  return undefined;
}

export async function runTeeRecoverForkJoin({ attempt, specimen, outDir = null, root = ROOT }) {
  const loaded = loadAttemptParts({ attempt, specimen, root });
  const out = outDir ?? join(loaded.out, 's4recover', `run-${new Date().toISOString().replace(/[:.]/g, '-')}`); // evidence is never overwritten (file sink)
  // Profiled by construction (fg/profile.mjs): every Calculation call is timed with its emits into instrumentation.json.
  const { store, document: instrumentation } = instrumentedStore({ name: `s4recover:${specimen}`, base: loaded.board });
  store.constant('fn.tk.s4recover.laneOutputs', loaded.values);
  for (const [fn, spec] of S4_CALCULATIONS) store.register(fn, spec);
  registerPoseQueries(store);   // the pose search behind the PxC boundary: fn.q.pose.*
  // Shared Parts are produced once here, on the parent store; every branch reads them through it.
  for (const address of ['tk.s4.padTemplate', 'tk.s4.evidence', 'tk.s4.adjacentBrightComponents']) store.get(address);   // tk.s4.hallway stays lazy
  const implementations = await discoverImplementations(join(root, 'impl'), TEE_RECOVER_SLOT.slot);
  const sink = createFileSink(join(out, 'artifacts'), { relativeTo: out });
  const timings = {};
  const result = comparableForkJoin({
    slot: TEE_RECOVER_SLOT.slot, part: TEE_RECOVER_SLOT.part, implementations, store,
    restore: () => loaded.board,   // every branch reads the same S3 PxC board
    apply: (parts, impl, name) => { const t = performance.now(); const v = impl(parts); timings[name] = Math.round(performance.now() - t); return { slot: TEE_RECOVER_SLOT.slot, implementation: name, ...v }; },
    guarantees: GUARANTEES, sink,
    compare: compareRecovered({ contract, parentStore: store })
  });
  mkdirSync(out, { recursive: true });
  const v = result.comparison.value;
  writeFileSync(join(out, `${result.comparison.address}.json`), canonicalJson({ schema: 'nctk-s4-tee-recover-comparison@1', specimen, attempt, address: result.comparison.address, implementations: result.comparison.implementations, sha256: result.comparison.sha256, elapsedMs: timings, value: v }) + '\n');
  const doc = instrumentation(), profile = profileSummary(doc);
  writeFileSync(join(out, 'instrumentation.json'), JSON.stringify(doc) + '\n');   // sidecar: timings are never hashed evidence
  const frames = [...forkJoinFrames(result), profileFrame(profile, { wallMs: doc.wallMs })];
  const records = Object.fromEntries(Object.entries(result.branches).map(([n, b]) => [n, { error: b.error, records: b.records }]));
  writeFileSync(join(out, 's4recover.records.json'), canonicalJson({ schema: 'nctk-fg-forkjoin-records@1', slot: result.slot, specimen, attempt, branches: records }) + '\n');
  writeFileSync(join(out, 's4recover.frames.json'), framesJson(frames) + '\n');
  writeFileSync(join(out, 's4recover.flipbook.html'), renderFlipbook(frames, { title: `S4 ${TEE_RECOVER_SLOT.slot} fork-join (${specimen}): ${result.comparison.implementations.join(' vs ')}`, background: loaded.background, records: { branches: records }, stage: 'S4' }));
  return { out, comparison: v, timingsMs: timings, frames: frames.length, branches: records, profile };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
  if (!args.attempt || !args.specimen) { console.error('usage: node ports/s4recover/run.mjs --specimen golden --attempt ATTEMPT_ID [--out DIR]'); process.exit(2); }
  const r = await runTeeRecoverForkJoin({ attempt: args.attempt, specimen: args.specimen, outDir: args.out ?? null });
  const c = r.comparison;
  console.log(JSON.stringify({
    out: r.out, frames: r.frames, timingsMs: r.timingsMs, profile: r.profile.slice(0, 12).map((p) => `${p.calculation}: ${p.calls}x self ${p.selfMs} ms total ${p.totalMs} ms ${JSON.stringify(p.emits)}`), template: c.template, seeds: c.seeds, assignmentCount: c.assignment.length,
    branches: Object.fromEntries(Object.entries(c.branches).map(([n, b]) => [n, { ...b, perTee: b.perTee.map((t) => `${t.hole}:${t.verdict}@${t.errorPx}px conf${t.confidence} seed${t.fromSeed} occ${JSON.stringify(Object.fromEntries(Object.entries(t.occludedBy ?? {}).filter(([, x]) => x)))}`) }])),
    errors: Object.fromEntries(Object.entries(r.branches).map(([n, b]) => [n, b.error]))
  }, null, 1));
}
