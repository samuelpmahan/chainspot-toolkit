#!/usr/bin/env node
/**
 * Runner for the S6 path measurement (agent B; node-only):
 *
 *   node ports/s6straight/pathLoss.run.mjs --specimen golden --attempt ATTEMPT_ID [--out DIR]
 *
 * Reads a completed attempt (never re-runs the provider). The S3 PxC (early/s3.pxc.bin) is the store's board; lane
 * outputs not on it enter as one constant (fn.tk.s6pathLoss.laneOutputs): the S3 structural tees (px.tees.refined, via
 * ports/s4recover loadAttemptParts), the S3 association rows (s3assoc/px.tees.association.json; absent = recorded) and
 * Sam's testimony (testimony.s6.holes; split of the emits only). tk.s7.alphaProfile (an inPart of tk.s6.pathLoss) is
 * produced on first need by the S7 Calculations, registered as fg/alpha/run.mjs registers them (registerAlphaProfile):
 * S4's lane outputs the store lacks (px.tees.familyRefined, tk.s4.basketRecovery) and S4's Calculations (tk.s4.hallway),
 * tk.s3assoc.association (the same association file), the course, the testimony-free straight segments. A path class
 * the profile could not fit is recorded there (`not fitted`) and tk.s6.pathLoss falls back to the proxy, saying so.
 * Stores tk.s6.pathMask, tk.s6.hallway, tk.s6.pairs, tk.s6.pathLoss and writes under <out> (default
 * attempts/stages/<id>/fork/stage-output/s6pathLoss/run-<ISO time>/):
 *   tk.s6.pathLoss.json (the Part, typed arrays summarized), instrumentation.json (the store's profile: sidecar),
 *   s6pathLoss.frames.json + s6pathLoss.flipbook.html (profile page + one page per tk.s6.* Part, rendered by the store),
 *   tk.s6.pathLoss.sheet.png (the store's render of tk.s6.pathLoss, the PNG bytes recompressed)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runnerCache, casFlag } from '../../fg/casRunner.mjs';
import { instrumentedStore, profileSummary, profileFrame } from '../../fg/profile.mjs';
import { RENDER_PART } from '../../fg/store.mjs';
import { writeFlipbook } from '../../fg/node-flipbook.mjs';
import { canonicalJson } from '../../fg/canon.mjs';
import { loadAttemptParts } from '../s4recover/run.mjs';
import { loadTestimony } from '../judge/testimony.mjs';
import { registerAlphaProfile, s4LaneOutputsFor, loadAssociation } from '../../fg/alpha/run.mjs';
import { ALPHA_PROFILE_PART } from '../../contracts/alpha.profile@1.mjs';
import { registerPathLoss, PATH_LOSS_PART, TESTIMONY_PART } from './pathLoss.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');

/** The Part for the JSON file: typed arrays (the corridor pixels) summarized, never dumped. */
/** What the run's profile is: its producer and the path class (fitted or its recorded condition), for the JSON file. */
const alphaSummary = (store) => { const p = store.get(ALPHA_PROFILE_PART), o = p?.overlays?.path; return { producedBy: store.provenance(ALPHA_PROFILE_PART)?.producedBy ?? null, status: p?.status ?? null, path: o ? (o.alpha != null ? { alpha: o.alpha, sigmaAlpha: o.sigmaAlpha, rgb: o.rgb, fitOn: o.fitOn } : o) : null }; };
const summarized = (v) => JSON.parse(JSON.stringify(v, (k, x) => (ArrayBuffer.isView(x) ? { typedArray: x.constructor.name, length: x.length } : x)));

export function runPathLoss({ attempt, specimen, outDir = null, root = ROOT, cas = true }) {
  const loaded = loadAttemptParts({ attempt, specimen, root });
  const out = outDir ?? join(loaded.out, 's6pathLoss', `run-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  const assocFile = join(loaded.out, 's3assoc', 'px.tees.association.json');
  const association = existsSync(assocFile) ? JSON.parse(readFileSync(assocFile, 'utf8')) : { rows: [], condition: `s3assoc not run: no ${assocFile}` };
  const T = loadTestimony(specimen, root);
  const testimony = T ? { path: T.file, rule: `canonical frame (annotation y - ${T.dy} px); bent = corridorBends non-empty`, holes: [...T.holes.values()].map((h) => ({ hole: h.hole, teePx: h.tee, basketPx: h.basket, bent: h.bent })) }
    : { path: null, rule: `no testimony for ${specimen}: nothing judged`, holes: [] };
  const { store, document: instrumentation } = instrumentedStore({ name: `s6pathLoss:${specimen}`, base: loaded.board, ...runnerCache({ root, entry: import.meta.filename, cas }) });
  store.constant('fn.tk.s6pathLoss.laneOutputs', { 'px.tees.refined': loaded.values['px.tees.refined'], 'tk.s6.basketRecovery': loaded.values['tk.s4.basketRecovery'], 'px.tees.association': { rows: association.rows, template: association.template ?? null, condition: association.condition ?? null }, [TESTIMONY_PART]: testimony });
  registerAlphaProfile(store, { s4LaneOutputs: s4LaneOutputsFor(loaded.values, { omit: ['px.tees.refined'] }), association: loadAssociation({ out: loaded.out, attempt, specimen }), course: specimen });   // px.tees.refined: already a root here
  registerPathLoss(store);
  const value = store.get(PATH_LOSS_PART);   // tk.s6.pathMask, tk.s6.hallway, tk.s6.pairs: produced on first need

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, `${PATH_LOSS_PART}.json`), canonicalJson({ schema: 'nctk-s6-path-loss-run@1', specimen, attempt, alphaProfile: alphaSummary(store), hallway: summarized({ ...store.get('tk.s6.hallway'), segments: undefined }), part: summarized(value) }) + '\n');
  const doc = instrumentation(), profile = profileSummary(doc);
  writeFileSync(join(out, 'instrumentation.json'), JSON.stringify(doc) + '\n');   // sidecar: timings are never hashed evidence
  const partPages = store.manifest().parts.map((p) => p.address).filter((a) => a.startsWith('tk.s6.')).sort()
    .map((a) => { const r = store.call(RENDER_PART, { a }).value; return { title: `${a} (${r.kind})`, calculation: 'fg.render', tick: 'render', parts: r.parts, verdicts: [{ name: `${a} renders`, ok: r.kind !== 'unrenderable' && r.parts.length > 0 }] }; });
  const frames = [profileFrame(profile, { wallMs: doc.wallMs }), ...partPages];
  const { images } = writeFlipbook(out, 's6pathLoss', frames, { title: `S6 path loss (${specimen}): edge test and alpha overlay along tee cap -> basket`, background: loaded.background, stage: 'S6' });   // images once, as files under out/img/ (fg/node-flipbook.mjs)
  const sheet = partPages.find((f) => f.title.startsWith(`${PATH_LOSS_PART} `))?.parts.find((p) => p.address.endsWith('#sheet'));
  const sheetPath = sheet ? join(out, `${PATH_LOSS_PART}.sheet.png`) : null;
  if (sheet) images.alias(images.png(sheet.data.png).src, `${PATH_LOSS_PART}.sheet.png`);   // the flipbook's own file under a stable name (a hardlink)
  return { out, sheetPath, value, hallway: store.get('tk.s6.hallway'), profile, emits: doc.calculations.find((e) => e.calculation === 'fn.tk.s6.pathLoss')?.emits ?? null };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
  if (!args.attempt || !args.specimen) { console.error('usage: node ports/s6straight/pathLoss.run.mjs --specimen golden --attempt ATTEMPT_ID [--out DIR] [--no-cas]'); process.exit(2); }
  const r = runPathLoss({ attempt: args.attempt, specimen: args.specimen, outDir: args.out ?? null, cas: casFlag() });
  const v = r.value;
  console.log(JSON.stringify({
    out: r.out, sheet: r.sheetPath, emits: r.emits, hallway: { widthPx: r.hallway.widthPx, segments: r.hallway.emits?.segmentsCount, iqrPx: r.hallway.widthIqrPx },
    threshold: v.threshold, pathLevel: v.pathLevel, agreement: v.agreement, measures: v.measures,
    pairs: v.pairs.map((p) => `${p.pair} | Sam ${p.samHole ?? '-'} ${p.samHole == null ? '' : p.samBent ? 'bent' : 'straight'} | s3 ${p.straight3} | edge pass ${p.edgePassFrac} gap ${p.edgeLongestGapPx} px | overlay mean ${p.meanOverlayFrac} loss ${p.overlayLossFrac} gap ${p.overlayLongestGapPx} px | ${p.condition ?? ''}`),
    profile: r.profile.slice(0, 10).map((p) => `${p.calculation}: ${p.calls}x self ${p.selfMs} ms ${JSON.stringify(p.emits)}`)
  }, null, 1));
}
