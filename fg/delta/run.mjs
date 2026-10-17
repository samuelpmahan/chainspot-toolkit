#!/usr/bin/env node
/**
 * Build the three Δ models over a real golden attempt and run every
 * projection over each (node-only; reads attempts, writes only to --out).
 *
 *   node fg/delta/run.mjs --base <attempt dir with s3 lanes> --assembly <attempt dir with s1-badge-assembly>
 *                         --source <IMG.jpg> --out <dir>
 *
 * Attempt dirs are the attempt-<id> folders; their fork/stage-output/early
 * is read. Writes per model: stream.<M>.json, flipbook.<M>.html,
 * frames.<M>.json, scrub.<M>.json; and report.json (P1, P4, conservation,
 * sizes, cross-model scene equality) plus sample.<M>.json (one Δ, px elided).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { loadEvidence } from './evidence.mjs';
import { MODELS } from './models.mjs';
import { groups, stageLayers, receipt, receiptTargets, compareReceipt, conservation, scrub, ablate, frames, sceneAt } from './project.mjs';
import { sceneContent } from './scene.mjs';
import { renderFlipbook } from '../flipbook.mjs';
import { canonicalJson } from '../canon.mjs';
import { countRuns } from './px.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const early = (d) => join(d, 'fork/stage-output/early');
const out = args.out;
mkdirSync(out, { recursive: true });
const sha = (s) => createHash('sha256').update(s).digest('hex');

const t0 = Date.now();
const ev = loadEvidence({ baseDir: early(args.base), assemblyDir: args.assembly ? early(args.assembly) : null });
const background = args.source ? { src: `data:image/jpeg;base64,${readFileSync(args.source).toString('base64')}`, width: ev.crop.originalPx.width, height: ev.crop.originalPx.height, x: 0, y: -ev.crop.upperRowsRemoved } : null;
const targets = receiptTargets(ev.receipts.base, ev.receipts.assembly);

// px runs elided, for a human-sized sample of one Δ
const elide = (v) => JSON.parse(JSON.stringify(v, (k, x) => (Array.isArray(x) && x.length > 8 && x.every((n) => typeof n === 'number') ? `<${countRuns(x)} px in ${x.length / 2} runs>` : x)));

const calcs = [...new Set(ev.steps.flatMap((s) => [...s.calculations, ...s.outs.flatMap((o) => Object.values(o.roleCalc ?? {}))]))];
const report = { evidence: { base: args.base, assembly: args.assembly ?? null, steps: ev.steps.length, frame: ev.frame, reconstructed: ev.steps.filter((s) => s.reconstructed).map((s) => ({ step: s.key, note: s.reconstructed })) }, models: {} };
const contentByModel = {};

for (const model of MODELS) {
  const t = Date.now();
  const stream = model.build(ev);
  const buildMs = Date.now() - t;
  const json = canonicalJson(stream);
  writeFileSync(join(out, `stream.${model.id}.json`), json);
  const G = groups(model, stream);
  const perStepBytes = G.map((g) => canonicalJson(g.entries).length).sort((a, b) => a - b);

  // P1 + conservation
  const base = stageLayers(model, stream);
  const derived = receipt(base.fold.scene, base.layers);
  const p1 = compareReceipt(derived, targets);
  const cons = conservation(base.fold.scene);
  const consMain = conservation(sceneAt(model, stream, G.findIndex((g) => g.step === 'S3/Tee.findPx')));

  // P2
  const fr = frames(model, stream, { fg: `fg.delta.${model.id}` });
  writeFileSync(join(out, `frames.${model.id}.json`), canonicalJson(fr.map((f) => ({ ...f, parts: f.parts.map((p) => (p.kind === 'pxset' ? { ...p, data: { width: p.data.width, pxCount: p.data.px.length } } : p)) }))));
  writeFileSync(join(out, `flipbook.${model.id}.html`), renderFlipbook(fr, { background, title: `Δ flipbook ${model.id}: ${model.title}` }));

  // P3: scrub + timing of random access
  const ts = Date.now();
  const sc = scrub(model, stream, { hash: sha });
  const scrubMs = Date.now() - ts;
  writeFileSync(join(out, `scrub.${model.id}.json`), canonicalJson(sc));
  contentByModel[model.id] = sc.map((s) => s.contentSha256);

  // P4: drop each Calculation
  const ta = Date.now();
  const ablations = calcs.map((c) => ablate(model, stream, ev, c, base));
  const ablateMs = Date.now() - ta;

  // one sample Δ: the structural-fix lane Tick, px elided
  const sampleStep = G.find((g) => g.step === 'S3/early.S3.findFamilyStructuralFix') ?? G[G.length - 1];
  writeFileSync(join(out, `sample.${model.id}.json`), JSON.stringify(elide(sampleStep.entries), null, 1));

  report.models[model.id] = {
    title: model.title,
    stream: { bytes: json.length, entries: model.entriesOf(stream).length, steps: G.length, perStepBytes: { median: perStepBytes[Math.floor(perStepBytes.length / 2)], max: perStepBytes[perStepBytes.length - 1] }, sampleStepBytes: canonicalJson(sampleStep.entries).length, sampleStepEntries: sampleStep.entries.length, buildMs },
    foldViolations: base.fold.violations.length,
    p1: { matched: p1.matched, of: p1.of, misses: p1.rows.filter((r) => !r.ok) },
    p1Rows: p1.rows,
    conservation: { final: { closes: cons.closes, layer: cons.layer, enclosedUnowned: cons.enclosedUnowned }, mainPathAfterS3: { closes: consMain.closes, conflictPx: consMain.layer.conflictPx, dupAgreePx: consMain.layer.dupAgreePx, reownedFromMutePx: consMain.layer.reownedFromMutePx } },
    p2: { pages: fr.length, flipbook: join(out, `flipbook.${model.id}.html`) },
    p3: { steps: sc.length, fullScrubMs: scrubMs },
    p4: { ablateMs, ablations }
  };
  console.log(`${model.id}: ${json.length} B, ${model.entriesOf(stream).length} entries, P1 ${p1.matched}/${p1.of}, conserve ${cons.closes} (conflict ${cons.layer.conflictPx}), pages ${fr.length}`);
}

// P3 cross-model: the same scene at every step?
const ids = Object.keys(contentByModel);
report.sceneEquality = Object.fromEntries(ids.slice(1).map((id) => [`${ids[0]}=${id}`, contentByModel[id].map((h, k) => h === contentByModel[ids[0]][k]).filter(Boolean).length + `/${contentByModel[id].length}`]));
report.calcs = calcs;
report.ms = Date.now() - t0;
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 1));
console.log('scene equality', report.sceneEquality, `${report.ms} ms`);
