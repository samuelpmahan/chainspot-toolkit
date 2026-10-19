#!/usr/bin/env node
/**
 * Runner for the S5 learning measurement (node-only):
 *
 *   node ports/s5pair/residual.mjs --specimen golden --attempt ATTEMPT_ID [--out DIR]
 *
 * Reads a completed attempt (never re-runs the provider). The S3 PxC (early/s3.pxc.bin) is the store's board, loaded as
 * ports/s4recover/run.mjs loadAttemptParts loads it: px.tees, px.badges, px.baskets and px.image.cropped are read by
 * address. Root inputs that are not on that board enter as one named constant (fn.tk.s5residual.laneOutputs):
 *   testimony.s5.straightHoles   Sam's holes (testimony/<specimen>/*.annotation.json, canonical frame), bent = any
 *                                corridor bend: the judge's S5straight truth; absent testimony is the recorded
 *                                condition 'no testimony'
 *   tk.s5.recordedAssociation    the frozen S3 association (baselines/s3assoc/<specimen>.json): the recorded per-hole z
 *                                the 76/76 line-up signal came from; absent is a recorded condition
 * tk.s7.alphaProfile (contracts/alpha.profile@1) is an inPart of the measurement, produced on first need by the S7
 * Calculations registered exactly as fg/alpha/run.mjs registers them (registerAlphaProfile): S4's lane outputs and
 * Calculations (tk.s4.hallway), tk.s3assoc.association (s3assoc/px.tees.association.json; absent = recorded), the
 * course name, and the testimony-free straight segments (fn.tk.s7.straightSegments: every associated tee -> badge).
 * A class the profile could not fit is its own recorded condition (`not fitted`); the pad un-composite then records
 * noProfile (no fill class fitted) and the raw fit stands.
 * Stores tk.s5.residualProfile and tk.s5.residualStrips (ports/s5pair/residualProfile.mjs) and writes beside the attempt
 * (default attempts/stages/<id>/fork/stage-output/s5pair/run-<ISO time>/): tk.s5.residualProfile.json,
 * instrumentation.json (the store's profile), keyspace.json, s5pair.frames.json and s5pair.flipbook.html (the profile
 * page and one page per tk.s5.* Part, rendered by the store itself).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadAttemptParts } from '../s4recover/run.mjs';
import { registerAlphaProfile, loadAssociation } from '../../fg/alpha/run.mjs';
import { runnerCache, casFlag } from '../../fg/casRunner.mjs';
import { instrumentedStore, profileSummary, profileFrame } from '../../fg/profile.mjs';
import { RENDER_PART } from '../../fg/store.mjs';
import { framesJson, renderFlipbook } from '../../fg/flipbook.mjs';
import { canonicalJson } from '../../fg/canon.mjs';
import { loadTestimony } from '../judge/testimony.mjs';
import { MATCH_PX } from '../judge/judge.mjs';
import { registerPairQueries } from './pairSpace.mjs';
import { S5_RESIDUAL_CALCULATIONS, RESIDUAL_PROFILE_PART, RESIDUAL_STRIPS_PART, STRAIGHT_TRUTH_PART, RECORDED_ASSOC_PART } from './residualProfile.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

export function loadResidualInputs({ attempt, specimen, root = ROOT }) {
  const loaded = loadAttemptParts({ attempt, specimen, root });
  const { out, board, background } = loaded;
  const T = loadTestimony(specimen, root);
  const truth = T ? {
    course: specimen, source: T.file, matchTeePx: MATCH_PX.tee,
    rule: `canonical y = annotation y - ${T.dy} px; straight = no corridor bend; a tee is Sam's hole n when his tee point is within ${MATCH_PX.tee} px (the judge's one tee match rule)`,
    holes: [...T.holes.values()].sort((a, b) => a.hole - b.hole).map((h) => ({ hole: h.hole, tee: h.tee, bent: h.bent }))
  } : { course: specimen, status: 'no testimony', source: null, rule: `no testimony for ${specimen}: nothing to learn from`, matchTeePx: MATCH_PX.tee, holes: [] };
  // optional upstream: the pinned late S5 rows, kept only as a referent (same tee index, same badge index)
  const pinnedFile = join(out, 'late', 's5-pairs.json');
  const pinned = existsSync(pinnedFile) ? readJson(pinnedFile).rows : null;
  // the recorded signal (76/76): the frozen S3 association per hole, baselines/s3assoc/<specimen>.json
  const recFile = join(root, 'baselines', 's3assoc', `${specimen}.json`);
  const recorded = existsSync(recFile) ? { source: `baselines/s3assoc/${specimen}.json`, frozenFrom: readJson(recFile).frozenFrom ?? null, holes: readJson(recFile).holes } : { status: 'no recorded association', reason: `no baselines/s3assoc/${specimen}.json` };
  return { out, board, truth, pinned, background, recorded, s4LaneOutputs: loaded.values, association: loadAssociation({ out, attempt, specimen }) };
}

export function runResidualProfile({ attempt, specimen, outDir = null, root = ROOT, cas = true }) {
  const L = loadResidualInputs({ attempt, specimen, root });
  const out = outDir ?? join(L.out, 's5pair', `run-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  const { store, document: instrumentation } = instrumentedStore({ name: `s5pair:${specimen}`, base: L.board, ...runnerCache({ root, entry: import.meta.filename, cas }) });
  store.constant('fn.tk.s5residual.laneOutputs', { [STRAIGHT_TRUTH_PART]: L.truth, [RECORDED_ASSOC_PART]: L.recorded });
  // the S7 profile is an inPart of the measurement: its Calculations registered here, produced on first need
  registerAlphaProfile(store, { s4LaneOutputs: L.s4LaneOutputs, association: L.association, course: specimen });
  registerPairQueries(store);
  for (const [fn, spec] of S5_RESIDUAL_CALCULATIONS) store.register(fn, spec);
  const P = store.get(RESIDUAL_PROFILE_PART);
  store.get(RESIDUAL_STRIPS_PART);
  mkdirSync(out, { recursive: true });
  const pinnedOf = (r) => { const p = L.pinned?.find((x) => x.sourceMark === `px.tees[${r.teeIndex}]` && x.badgeMark === `px.badges[${r.badgeIndex}]`); return p ? { angleResidualDeg: Math.round(p.angleResidualDeg * 1000) / 1000, signedPerpPx: Math.round(p.signedPerpPx * 1000) / 1000, status: p.status } : null; };
  const referent = L.pinned ? { source: 'late/s5-pairs.json rows (pinned native S5 two-ray measure, original JPEG frame)', perPair: P.rows.filter((r) => r.badgeIndex != null).map((r) => ({ tee: r.tee, hole: r.hole, pinned: pinnedOf(r) })) } : { status: 'lane not run', reason: 'no late/s5-pairs.json on this attempt' };
  writeFileSync(join(out, `${RESIDUAL_PROFILE_PART}.json`), canonicalJson({ specimen, attempt, ...P, pinnedReferent: referent }) + '\n');
  writeFileSync(join(out, 'keyspace.json'), canonicalJson({ schema: 'nctk-keyspace@1', specimen, attempt, store: store.manifest().store, parts: store.keyspace() }) + '\n');
  const doc = instrumentation(), profile = profileSummary(doc);
  writeFileSync(join(out, 'instrumentation.json'), JSON.stringify(doc) + '\n');   // sidecar: timings are never hashed evidence
  // one page per Part, rendered by the store itself; the strips Part's render is paged one strip per page (with its
  // legend) so a 4x crop fills the viewer: the parts are the store's, only the paging is the runner's
  const page = (title, parts, ok = parts.length > 0) => ({ title, calculation: 'fg.render', tick: 'render', parts, verdicts: [{ name: `${title} renders`, ok }] });
  const prof = store.call(RENDER_PART, { a: RESIDUAL_PROFILE_PART }).value, strips = store.call(RENDER_PART, { a: RESIDUAL_STRIPS_PART }).value;
  const legend = strips.parts.filter((p) => p.address.endsWith('#legend')), crops = strips.parts.filter((p) => p.kind === 'raster');
  const partPages = [
    page(`${RESIDUAL_PROFILE_PART} (${prof.kind}) on ${specimen}`, prof.parts, prof.kind !== 'unrenderable'),
    page(`${RESIDUAL_STRIPS_PART} (${strips.kind}) on ${specimen}: legend`, strips.parts.filter((p) => p.kind === 'ledger'), strips.kind !== 'unrenderable'),
    ...crops.map((c) => page(c.address, [c, ...legend]))
  ];
  const frames = [...partPages, profileFrame(profile, { wallMs: doc.wallMs })];
  writeFileSync(join(out, 's5pair.frames.json'), framesJson(frames) + '\n');
  writeFileSync(join(out, 's5pair.flipbook.html'), renderFlipbook(frames, { title: `S5 learning (${specimen}): tee axis vs badge ray residual on straight holes`, background: L.background, stage: 'S5' }));
  return { out, profile: P, referent, calls: profile };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
  if (!args.attempt || !args.specimen) { console.error('usage: node ports/s5pair/residual.mjs --specimen golden --attempt ATTEMPT_ID [--out DIR] [--no-cas]'); process.exit(2); }
  const r = runResidualProfile({ attempt: args.attempt, specimen: args.specimen, outDir: args.out ?? null, cas: casFlag() });
  const P = r.profile;
  console.log(JSON.stringify({
    out: r.out, course: P.course, condition: P.condition,
    lineUp: { nPads: P.lineUp.nPads, linesUpWithOwnBadge: P.lineUp.linesUpWithOwnBadge, fraction: P.lineUp.fraction, recorded: P.lineUp.recorded, verdict: P.lineUp.verdict, allPairs: P.lineUp.allPairs }, alpha: P.alpha, template: P.template, counts: P.counts,
    straightRaw: P.straight.raw, straightUnmixed: P.straight.unmixed, bentReferent: P.bentReferent,
    rows: P.rows.map((x) => `${x.identity ?? '-'} (${x.tee}) ${x.badge ?? ''} ${x.status}: ${x.signedAngleResidualDeg ?? '-'} deg, ${x.signedPerpPx ?? '-'} px at ${x.alongPx ?? '-'} px; z ${x.z ?? '-'} (course z ${x.zCourse ?? '-'}); pinned ${JSON.stringify(r.referent.perPair?.find((p) => p.tee === x.tee)?.pinned ?? null)}`),
    profileTop: r.calls.slice(0, 6).map((p) => `${p.calculation}: ${p.calls}x self ${p.selfMs} ms ${JSON.stringify(p.emits)}`)
  }, null, 1));
}
