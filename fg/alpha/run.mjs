#!/usr/bin/env node
/**
 * Runner for tk.s7.alphaProfile (node-only).
 *
 *   node fg/alpha/run.mjs --specimen golden --attempt ATTEMPT_ID [--out DIR]
 *
 * Reads a completed `--until 4 --lanes s3-findfamily-structural-fix,s4.basketRecovery` Attempt (never re-runs the
 * provider). The S3 PxC (early/s3.pxc.bin) is the store's board, exactly as ports/s4recover/run.mjs loads it
 * (loadAttemptParts); S4's Calculations are registered so tk.s4.hallway is produced on first need (it is an inPart of
 * the profile, never resolved eagerly). Lane outputs not on the board enter as one named constant:
 *   tk.s3assoc.association   s3assoc/px.tees.association.json (node ports/s3assoc/run.mjs); absent = recorded
 *   tk.s7.course             the specimen name
 * Writes under <out> (default attempts/stages/<id>/fork/stage-output/s7alpha/run-<ISO time>/):
 *   tk.s7.alphaProfile.json, instrumentation.json (sidecar: timings), s7alpha.frames.json, s7alpha.flipbook.html,
 *   alphaProfile.png (the render's raster parts on one labelled sheet)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import zlib from 'node:zlib';
import { runnerCache, casFlag } from '../casRunner.mjs';
import { instrumentedStore, profileSummary, profileFrame } from '../profile.mjs';
import { RENDER_PART } from '../store.mjs';
import { framesJson, renderFlipbook } from '../flipbook.mjs';
import { canonicalJson } from '../canon.mjs';
import { loadAttemptParts } from '../../ports/s4recover/run.mjs';
import { S4_CALCULATIONS } from '../../ports/s4recover/teeRecover.mjs';
import { ALPHA_PROFILE_PART } from '../../contracts/alpha.profile@1.mjs';
import { registerAlphaQueries } from './alphaSpace.mjs';
import { ALPHA_CALCULATIONS, ASSOCIATION_PART, COURSE_PART, CALLED_SHOT } from './alphaProfile.calc.mjs';
import { contactSheet } from './alphaRender.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');

/** The called shot, graded: per class, is the fitted alpha inside the called range, and the colour as called? */
export function gradeShot(profile, shot = CALLED_SHOT) {
  const rows = [];
  for (const cls of ['c1Fill', 'c2Fill', 'path']) {
    const o = profile.overlays[cls], call = shot[cls];
    if (!o || o.alpha == null) { rows.push({ class: cls, called: `${call.alpha.join('-')}`, got: o?.reason ?? 'not fitted', alphaInRange: null, colourAsCalled: null }); continue; }
    const [r, g, b] = o.rgb, inRange = o.alpha >= call.alpha[0] && o.alpha <= call.alpha[1];
    const colour = cls === 'path' ? Math.max(r, g, b) - Math.min(r, g, b) <= 20 && Math.min(r, g, b) >= 180 : g >= r && g >= b;
    rows.push({ class: cls, called: `alpha ${call.alpha.join('-')}; ${call.rgb}`, got: `alpha ${o.alpha} +- ${o.sigmaAlpha}; rgb ${o.rgb.join('/')}`, alphaInRange: inRange, colourAsCalled: colour });
  }
  return rows;
}

/** The S3 association rows of an attempt (s3assoc/px.tees.association.json), or its recorded absence. */
export function loadAssociation({ out, attempt, specimen }) {
  const assocFile = join(out, 's3assoc', 'px.tees.association.json');
  return existsSync(assocFile) ? JSON.parse(readFileSync(assocFile, 'utf8'))
    : { absent: `S3 association not run on this attempt (node ports/s3assoc/run.mjs --specimen ${specimen} --attempt ${attempt}): no straight segments` };
}

/** The S4 lane outputs tk.s4.hallway reads (loadAttemptParts values), less the roots a consumer's store already has. */
export const s4LaneOutputsFor = (values, { omit = [] } = {}) => Object.fromEntries(Object.entries(values).filter(([k]) => !omit.includes(k)));

/**
 * Register what tk.s7.alphaProfile needs on a consumer's store, so the Part is produced on first need (an inPart of
 * the consumer's Calculation: S5 learning, S6 discrimination), exactly as this runner produces it:
 *   s4LaneOutputs  S4's lane outputs as one constant (fn.tk.s4recover.laneOutputs), and S4's Calculations, so
 *                  tk.s4.hallway is produced on first need; null when the store already produces tk.s4.hallway
 *   association    tk.s3assoc.association (loadAssociation; its absence is recorded by fn.tk.s7.straightSegments)
 *   course         tk.s7.course, the specimen name
 * plus fn.tk.s7.straightSegments, fn.tk.s7.alphaProfile and fn.q.alpha.*. Nothing is computed here.
 */
export function registerAlphaProfile(store, { s4LaneOutputs = null, association, course }) {
  if (s4LaneOutputs) {
    store.constant('fn.tk.s4recover.laneOutputs', s4LaneOutputs);                   // S4's lane outputs (tk.s4.hallway reads them)
    for (const [fn, spec] of S4_CALCULATIONS) if (!store.registered(fn)) store.register(fn, spec);
  }
  store.constant('fn.tk.s7alpha.laneOutputs', { [ASSOCIATION_PART]: association, [COURSE_PART]: course });
  for (const [fn, spec] of ALPHA_CALCULATIONS) store.register(fn, spec);
  registerAlphaQueries(store);
}

export function runAlphaProfile({ attempt, specimen, outDir = null, root = ROOT, cas = true }) {
  const loaded = loadAttemptParts({ attempt, specimen, root });
  const association = loadAssociation({ out: loaded.out, attempt, specimen });
  const out = outDir ?? join(loaded.out, 's7alpha', `run-${new Date().toISOString().replace(/[:.]/g, '-')}`);   // evidence is never overwritten
  const { store, document: instrumentation } = instrumentedStore({ name: `s7alpha:${specimen}`, base: loaded.board, ...runnerCache({ root, entry: import.meta.filename, cas }) });
  registerAlphaProfile(store, { s4LaneOutputs: loaded.values, association, course: specimen });
  const profile = store.get(ALPHA_PROFILE_PART);
  mkdirSync(out, { recursive: true });
  const { emits, ...value } = profile;
  writeFileSync(join(out, `${ALPHA_PROFILE_PART}.json`), canonicalJson({ ...value, attempt, provenance: store.provenance(ALPHA_PROFILE_PART) }) + '\n');
  const shot = gradeShot(profile);
  const doc = instrumentation(), summary = profileSummary(doc);
  writeFileSync(join(out, 'instrumentation.json'), JSON.stringify(doc) + '\n');   // sidecar: timings are never hashed evidence
  const r = store.call(RENDER_PART, { a: ALPHA_PROFILE_PART }).value;
  const frames = [
    { title: `${ALPHA_PROFILE_PART} (${specimen}): what the overlays are made of`, calculation: 'fg.render', tick: 'render', parts: r.parts,
      verdicts: [{ name: `${ALPHA_PROFILE_PART} renders (${r.kind})`, ok: r.kind !== 'unrenderable' && r.parts.length > 0 }],
      receipt: { legend: 'swatches: each fitted overlay composited at its alpha over black | white | grey 128 | the opaque colour; crops: original vs unmixed (the overlay removed by the contract unmix); histogram: per-pair residual, RGB levels' } },
    { title: `called shot (${specimen})`, calculation: 'fg.alpha.shot', tick: 'shot', parts: [{ address: 'tk.s7.alphaProfile#shot', kind: 'ledger', data: { rows: shot } }],
      verdicts: shot.filter((s) => s.alphaInRange != null).map((s) => ({ name: `${s.class}: alpha as called`, ok: s.alphaInRange })) },
    profileFrame(summary, { wallMs: doc.wallMs })
  ];
  writeFileSync(join(out, 's7alpha.frames.json'), framesJson(frames) + '\n');
  writeFileSync(join(out, 's7alpha.flipbook.html'), renderFlipbook(frames, { title: `S7 alpha profile (${specimen})`, stage: 'S7' }));
  const sheet = contactSheet(profile, store.get('px.image.cropped'), { title: `${specimen} ${ALPHA_PROFILE_PART}`, deflate: zlib.deflateSync });
  if (sheet) writeFileSync(join(out, 'alphaProfile.png'), sheet);
  return { out, profile: value, shot, profile_: summary };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
  if (!args.attempt || !args.specimen) { console.error('usage: node fg/alpha/run.mjs --specimen golden --attempt ATTEMPT_ID [--out DIR] [--no-cas]'); process.exit(2); }
  const r = runAlphaProfile({ attempt: args.attempt, specimen: args.specimen, outDir: args.out ?? null, cas: casFlag() });
  const p = r.profile;
  console.log(JSON.stringify({ out: r.out, course: p.course, r1Px: p.r1Px, overlays: p.overlays, scale: p.fit.scale, perClass: Object.fromEntries(Object.entries(p.fit.perClass).map(([k, v]) => [k, { pairs: v.pairs, trimmedPairs: v.trimmedPairs, controlRatio: v.controlRatio, alphaOls: v.alphaOls, alphaByGeometry: v.alphaByGeometry.map((g) => `${g.binArcPx}/${g.depthPx}: ${g.alpha}`).join(', '), bounded: v.bounded, counts: v.counts }])),
    shot: r.shot, profile: r.profile_.slice(0, 8).map((x) => `${x.calculation}: ${x.calls}x self ${x.selfMs} ms ${JSON.stringify(x.emits)}`) }, null, 1));
}
