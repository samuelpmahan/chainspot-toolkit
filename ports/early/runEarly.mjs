/**
 * Early-lane adapter for the pinned S0-S3 compiled Stage gateways.
 * Experiments are independent, opt-in branches from that Stage's OFF snapshot.
 * It never writes to the provider tree or edits original pixels/PxC identities.
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { createInstrumentation } from './instrument.mjs';
import { createEarlyStore, sealStage } from './earlyStore.mjs';
import { runStageGuarantees, attachPublished } from './stageGuarantees.mjs';
import { isCaptureManifest, runCapture } from '../capture/capture.mjs';
import { CAPTURE_VIEW_CALCULATION } from '../../fg/stitch/capture.calc.mjs';
import { RENDER_PART } from '../../fg/store.mjs';
import { deflateSync } from 'node:zlib';

// Experiment code (what run-stages passes) -> lane name (what an FG's
// `lane` names); the inverse of ports/run-stages.mjs's lane table.
const EXPERIMENT_LANES = {
  S0: 's0-chrome-conservatism', S1: 's1-badge-cardinality-audit', S2: 's2-shell-ownership-audit',
  S3: 'fill-consistent-tee-selection', S3FIX: 's3-findfamily-structural-fix', S1ASM: 's1-badge-assembly',
  S2ASM: 's2-basket-assembly', S3ASM: 's3-tee-assembly', S3FJ: 's3-findfamily-forkjoin'
};
const hash = (value) => createHash('sha256').update(value).digest('hex');
/** A capture run's receipt entry: what was stitched and how (the record itself is early/capture/capture.json). */
const captureReceipt = (c, manifest) => ({ manifest, overlapRule: c.overlapRule, frame: c.frame, coverage: c.coverage, conditions: c.conditions,
  tiles: c.tiles.map((t) => ({ name: t.name, sha256: t.sha256, crop: t.crop, placed: t.placed, transform: t.transform ?? null, copy: t.copy ?? null })),
  links: c.links.map((l) => ({ a: l.a, b: l.b, evidence: l.evidence, sharedHoles: l.sharedHoles, model: l.model, residualLuma: l.residualLuma, contrast: l.contrast })),
  rejected: c.rejected.map((l) => ({ a: l.a, b: l.b, sharedHoles: l.sharedHoles })), record: 'capture/capture.json' });
const json = (value) => JSON.stringify(value, null, 2);
function treeIdentity(dir, suffixes) {
  const files = [];
  const walk = (folder) => {
    for (const entry of readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (suffixes.test(entry.name)) files.push([path.slice(dir.length), hash(readFileSync(path))]);
    }
  };
  walk(dir);
  return hash(JSON.stringify(files));
}

export async function runEarly({ forkRoot, sourcePath, outDir, experiments = [], until = 'S3' }) {
  const root = resolve(forkRoot);
  const provider = resolve(root, 'source/provider');
  if (!existsSync(resolve(provider, 'packages/alg/dist/stages/S0/contract.js')))
    throw new Error(`Pinned compiled Stage contracts not found under ${provider}`);
  let source = resolve(root, sourcePath);
  const out = resolve(root, outDir);
  mkdirSync(out, { recursive: true });
  const require = createRequire(pathToFileURL(join(provider, 'package.json')));
  const dist = (path) => require(resolve(provider, 'packages/alg/dist', path));
  const { decodeNodeFile } = dist('adapters/node');
  const { ComponentPxC } = dist('stages/componentPxC');
  const { BadgePxC } = dist('stages/S1/clean/Badge');
  const { BasketPxC } = dist('stages/S2/clean/Basket');
  const { TeePxC } = dist('stages/S3/clean/Tee');
  const { capturePxC, restorePxC } = await import(pathToFileURL(resolve(provider, 'scripts/chainspot-lab/sweep/pxcSnapshot.ts')));
  const stageOrder = ['S0', 'S1', 'S2', 'S3'];
  const lastIndex = stageOrder.indexOf(until.toUpperCase());
  if (lastIndex < 0) throw new Error(`until must be S0, S1, S2, or S3; received ${until}`);
  // Runner auto-instrumentation (ports/early/instrument.mjs): every
  // compiled-plan op execution below is timed and its produced Parts are
  // read for an `emits` measures object. The record is written as a sidecar
  // (instrumentation.json) beside run.receipt.json at the end of the run;
  // it never enters the receipt, whose bytes are hashed into evidence.
  const instrumentation = createInstrumentation();

  // S0 takes a capture (ports/capture/capture.mjs): a *.capture.json source is 2..N tiles of one course, stitched into one
  // course raster before the stage gateways run; from here on the run's source is that raster (S1-S7 see one course).
  // A plain image path is a capture of one tile: nothing below changes for it.
  let capture = null, decode = decodeNodeFile;
  if (isCaptureManifest(source)) {
    capture = await runCapture({ root, manifestPath: relative(root, source), outDir: join(out, 'capture'), dist, decodeNodeFile, onCall: (entry) => instrumentation.calculations.push(entry) });
    source = capture.coursePath; decode = capture.decode;
  }

  // The run's addressed store (ports/early/earlyStore.mjs): an overlay on
  // the live provider board. Toolkit Parts (source intake, gateway
  // captures, stage snapshots, the crop receipt, the flipbook background,
  // testimony) are written once by their declared producing Calculations;
  // provider capabilities (restore, plan execution, materializers, hashing)
  // are registered fn.* Calculations. FGs, fork-join implementations and the
  // sidecar writers read by address; every Calculation call is timed into
  // the instrumentation sidecar. The pinned clean gateways are routed
  // through fn.provider.<S>.gateway, producing tk.stage.<S>.captured.
  let pxc;
  const store = createEarlyStore({ forkRoot: root, source, getBoard: () => pxc, dist, restorePxC, instrumentation });
  if (capture) {
    store.constant('fn.tk.source.captureRun', { 'tk.source.capture': capture.capture, 'tk.source.courseRaster': capture.courseRaster });
    store.register(...CAPTURE_VIEW_CALCULATION);
  }
  store.call('fn.tk.source.intake');
  const sourceSha256 = store.get('tk.source.sha256');
  const captured = (id) => (store.has(`tk.stage.${id}.captured`) ? store.get(`tk.stage.${id}.captured`) : undefined);

  const tickView = (pcr) => (pcr?.ticks ?? []).map(({ operation, testimony }) => ({
    id: testimony.opId,
    declared: { consumes: operation.consumes, produces: operation.produces, calculations: operation.calculations },
    actual: { consumes: testimony.actualConsumes, produces: testimony.actualProduces, writes: testimony.writes },
    frozenCalculations: testimony.frozenCalculations,
    artifacts: testimony.artifacts.map(({ id, sha256, dims }) => ({ id, sha256, dims }))
  }));

  const stages = [];
  let initialPixels;
  for (const id of stageOrder.slice(0, lastIndex + 1)) {
    const started = Date.now();
    const inputSnapshotSha256 = pxc ? store.get(`tk.stage.${stageOrder[stageOrder.indexOf(id) - 1]}.snapshotSha256`) : null;
    const contract = dist(`stages/${id}/contract`).stageContract;
    const result = await contract.execute({ source, inputLabel: basename(source), decode, ...(pxc ? { pxc } : {}) });
    pxc = result.pxc;
    const image = pxc.get(id === 'S0' ? 'px.course.canonicalPixels' : ComponentPxC.image);
    const canonicalRgbaSha256 = hash(image.rgba);
    if (id === 'S0') {
      initialPixels = store.get('tk.stage.S0.canonicalRgbaSha256');
      if (initialPixels !== canonicalRgbaSha256) throw new Error('tk.stage.S0.canonicalRgbaSha256 disagrees with the S0 canonical pixels');
    } else if (canonicalRgbaSha256 !== initialPixels) throw new Error(`${id} changed canonical S0 source pixels`);
    if (!captured(id)?.pcr) throw new Error(`${id} did not expose its clean PCR`);
    const stage = {
      id,
      receipt: result.receiptText,
      pcr: captured(id).pcr,
      ticks: tickView(captured(id).pcr),
      durationMs: Date.now() - started,
      invocationLimit: 'one clean gateway invocation for this stage in this run',
      inputSourceSha256: id === 'S0' ? sourceSha256 : null,
      inputCanonicalRgbaSha256: id === 'S0' ? null : (stages.at(-1)?.canonicalRgbaSha256 ?? null),
      outputPixelRef: canonicalRgbaSha256,
      inputSnapshotSha256,
      canonicalRgbaSha256,
      panels: result.panels.map((panel) => ({ label: panel.label, widthPx: panel.widthPx, heightPx: panel.heightPx }))
    };
    stages.push(stage);
    const addresses = [...new Set([
      'px.source.selectedInput', 'px.source.fullImage', 'px.course.canonicalPixels',
      'localImage', 'viewport',
      ...Object.values(ComponentPxC).map((key) => key.address),
      ...Object.values(BadgePxC).map((key) => key.address),
      ...Object.values(BasketPxC).map((key) => key.address),
      ...Object.values(TeePxC).map((key) => key.address)
    ])];
    sealStage(store, id, { addresses, capturePxC });
    stage.outputSnapshotSha256 = store.get(`tk.stage.${id}.snapshotSha256`);
  }
  // the capture's default render (tiles, seams, links, badges over the canonical course): early/capture/capture.png
  if (capture) for (const p of store.call(RENDER_PART, { a: 'tk.source.captureView', deflate: (b) => deflateSync(b) }).value.parts)
    if (p.kind === 'raster' && p.data?.png) writeFileSync(join(out, 'capture', 'capture.png'), Buffer.from(p.data.png, 'base64'));
  // S1-S3 FunctionalGuarantees (stages/s1.json, s2.json, s3.json
  // "guarantees"): one file per guarantee under fg/<stage>/<id>.fg.mjs,
  // discovered and run per stage by the fg registry in requires order
  // (lane-gated FGs are dormant unless their lane is ON). Each FG reads only
  // its declared Parts and calls only its declared registered Calculations
  // through the run's store; it publishes its receipt objects, attached
  // below at the stage/receipt addresses the inline blocks used
  // (stages[S].*Materialization, materializations.*, and the lane evidence
  // experiments.branches.*). Each held record also becomes the Part
  // tk.<fgId>.record, which is how S3's stack ledger reads S2's leaving
  // figure. Uniform records, frames and a flipbook per stage are sidecars in
  // <outDir>/fg/<stage>.*, drawn over the Part view.source.background. Any
  // failed guarantee throws and fails the run.
  const stageMaterializations = {};
  const stageBranches = {};
  const lanes = experiments.map((id) => EXPERIMENT_LANES[id]).filter(Boolean);
  for (const [index, stage] of [[1, 's1'], [2, 's2'], [3, 's3']]) {
    if (lastIndex < index) break;
    const run = await runStageGuarantees({ forkRoot: root, stage, store, outDir: out, lanes });
    attachPublished(run.published, { stages, materializations: stageMaterializations, branches: stageBranches });
  }

  // --- ComparableForkJoin over fn.Tee.findFamily (lane s3-findfamily-forkjoin,
  // default OFF). Each implementation under impl/fn.Tee.findFamily/ runs on
  // its own board restored from the S3 snapshot under the same FGs
  // (fg/s3/fg.s3.teeFamily.*.fg.mjs); the branches are joined by geometric
  // identity (contracts/tee.pose@1) and judged against Sam's annotation
  // testimony. With the lane off the module is never imported and nothing
  // below touches the receipt, so lane-off receipts stay byte-identical.
  let s3ForkJoinEvidence = null;
  if (lastIndex >= 3 && experiments.includes('S3FJ')) {
    const { runTeeFamilyForkJoin } = await import('./s3ForkJoin.mjs');
    s3ForkJoinEvidence = {
      baseSnapshotSha256: store.get('tk.stage.S3.snapshotSha256'),
      ...await runTeeFamilyForkJoin({ forkRoot: root, outDir: out, store })
    };
  }

  if (hash(readFileSync(source)) !== sourceSha256) throw new Error('Source image bytes changed during replay');

  const addresses = [...new Set([
    'px.source.selectedInput', 'px.source.fullImage', 'px.course.canonicalPixels',
    'localImage', 'viewport',
    ...Object.values(ComponentPxC).map((key) => key.address),
    ...Object.values(BadgePxC).map((key) => key.address),
    ...Object.values(BasketPxC).map((key) => key.address),
    ...Object.values(TeePxC).map((key) => key.address)
  ])];
  const presentAddresses = addresses.filter((address) => pxc.has(address));
  const snapshotBytes = until.toUpperCase() === 'S3' ? capturePxC(pxc, presentAddresses) : null;
  const snapshotPath = snapshotBytes ? join(out, 's3.pxc.bin') : null;
  if (snapshotBytes) writeFileSync(snapshotPath, snapshotBytes);
  const snapshotSha256 = snapshotBytes ? hash(snapshotBytes) : null;

  // S0-S2 currently have no distinct compiled experimental contract. Keep each
  // gate OFF and record the evidence gap instead of presenting identical code as ON.
  const gates = {
    S0: { id: 's0-chrome-conservatism', default: 'OFF', status: 'validation-only', benefit: 'Expose how much chrome the existing proposal removes so an over-crop is detectable.', falsifier: 'Any nontrivial crop removes content pixels or cuts into the object-bearing area.', reason: 'Pinned S0 contract already applies stripChromeProposal; ON records its native crop receipt without changing pixels.' },
    S1: { id: 's1-badge-cardinality-audit', default: 'OFF', status: 'validation-only', benefit: 'Compare mask component supply with emitted badge objects.', falsifier: 'Emitted badge count or white/black BadgePx disagrees with the component evidence in a way needing adjudication.', reason: 'Pinned clean and candidate implementations are byte-identical; ON records existing calculation evidence, no detector change.' },
    ...(experiments.includes('S1ASM') ? { S1ASM: { id: 's1-badge-assembly', default: 'OFF', status: 'AVAILABLE_OFF', declaration: 'stages/s1.json refinements: refine.s1.badgeAssembly.plateFirst', benefit: 'Every Badge Part is re-assembled plate-first from its component evidence (plate base; frame and digit components fused on; digit counters as digit-owned sub-structure), so the assembly structure crosses the toolkit seam as named Parts with anchor and window-residue accounting instead of a flat px array with two counts.', falsifier: 'A badge fused set differs from the accepted px.badges set, the fused union differs from 37,002, the counters differ from the accepted attribution (10 components, 293 px), or the owned total differs from 37,295.', reason: 'Declared spec delta on fn.Badge.findPx assembly order, enforced in this wiring as a branch from the S1 snapshot; the pinned provider and the base board emissions are unchanged. This gate entry is recorded only when the lane runs, so lane-off receipts stay byte-identical.' } } : {}),
    S2: { id: 's2-shell-ownership-audit', default: 'OFF', status: 'validation-only', benefit: 'Expose candidate family, shell support, and output counts together.', falsifier: 'Shell support or family/output cardinality indicates missed or multiply owned basket pixels.', reason: 'Pinned clean and candidate implementations are byte-identical; ON records existing calculation evidence, no detector change.' },
    ...(experiments.includes('S2ASM') ? { S2ASM: { id: 's2-basket-assembly', default: 'OFF', status: 'AVAILABLE_OFF', declaration: 'stages/s2.json refinements: refine.s2.basketAssembly.bodyFirst', benefit: 'Every Basket Part is re-assembled body-first from its component evidence (bright body base; shell fused on; tip anchor; window-residue accounting), so the assembly structure crosses the toolkit seam as named Parts instead of a flat px array with two counts.', falsifier: 'A basket fused set differs from the accepted px.baskets set, the fused union differs from 36,362, a basket component overlap is nonzero, or a basket window residue falls outside the phase-1 band of 1,172 to 1,177 px.', reason: 'Declared spec delta on fn.Basket.findPx assembly structure, enforced in this wiring as a branch from the S2 snapshot; the pinned provider and the base board emissions are unchanged. This gate entry is recorded only when the lane runs, so lane-off receipts stay byte-identical.' } } : {}),
    S3: { id: 'fill-consistent-tee-selection', default: 'OFF', status: 'AVAILABLE_OFF', contract: 'stages/S3/exp/fill-consistent/contract' },
    S3FIX: { id: 's3-findfamily-structural-fix', default: 'OFF', status: 'AVAILABLE_OFF', declaration: 'stages/s3.json refinements: refine.s3.findFamily.structural', benefit: 'Membership in the tee family becomes a structural verdict per candidate (anchored pad model; fitted-size, border, band, interior and whiteness tests; occlusion excuses only by named prior-layer Parts), so same-scale map chrome is eliminated at S3 with named failed tests instead of surviving to S4 attrition.', falsifier: 'A genuine pad is eliminated or excused, a chrome candidate is admitted, or an admitted tee tuple differs from the pinned baseline tuple.', reason: 'Declared spec delta on fn.Tee.findFamily, enforced in this wiring as a branch from the S3 snapshot; the pinned provider and the base board emissions are unchanged.' },
    ...(experiments.includes('S3ASM') ? { S3ASM: { id: 's3-tee-assembly', default: 'OFF', status: 'AVAILABLE_OFF', declaration: 'stages/s3.json refinements: refine.s3.teeAssembly.interiorFirst', benefit: 'Every baseline Tee Part is assembled whole from its evidence (enclosed interior base, derived from the bright mask and gated exactly against the ring record; frame fused on; ring-center anchor; window-residue accounting), so the tee owns the interior pixels its frame surrounds instead of carrying only the frame.', falsifier: 'A tee frame set differs from the accepted px.tees set, the frame union differs from 4,884, a tee interior size differs from its ring\'s recorded holeArea, or a tee component overlap is nonzero.', reason: 'Declared spec delta on fn.Tee.findPx assembly structure, enforced in this wiring as a branch from the S3 snapshot; the pinned provider and the base board emissions are unchanged. This gate entry is recorded only when the lane runs, so lane-off receipts stay byte-identical.' } } : {}),
    ...(experiments.includes('S3FJ') ? { S3FJ: { id: 's3-findfamily-forkjoin', default: 'OFF', status: 'AVAILABLE_OFF', declaration: 'lanes/s3/findfamily-forkjoin.json; stages/s3.json guarantees fg.s3.teeFamily.materialize, fg.s3.teeFamily.precision', benefit: 'Competing implementations of fn.Tee.findFamily (impl/fn.Tee.findFamily/*.mjs) run side by side on identical restored S3 boards under identical FunctionalGuarantees, are joined member by member by geometric identity (contracts/tee.pose@1), and each member is judged against Sam\'s annotation testimony.', falsifier: 'A branch sees different inputs, a member is not an S3 candidate, the join pairs by key instead of pose, or S0-S3 baseline emissions change.', reason: 'ComparableForkJoin on branches restored from the S3 snapshot; the pinned provider and the base board emissions are unchanged. Precision against Sam\'s testimony is reported, never accepted. This gate entry is recorded only when the lane runs, so lane-off receipts stay byte-identical.' } } : {})
  };
  const branchResults = {};
  if (experiments.some((id) => ['S0', 'S1', 'S2'].includes(id))) {
    const { sha256HexSyncText } = dist('exec/sha256');
    const audits = {
      S0: { opId: 'early.S0.edgeBandAudit', consumes: ['px.source.fullImage', 'px.course.canonicalPixels', 'px.early.s0.cropReceipt'], produces: 'px.early.s0.edgeBandAudit', fn: 'fn.early.S0.edgeBandAudit',
        calculate: (full, crop, cropReceipt) => ({ source: [full.widthPx, full.heightPx], canonical: [crop.widthPx, crop.heightPx], topRowsRemoved: cropReceipt.upperRowsRemoved, bottomRowsRemoved: cropReceipt.lowerRowsRemoved, cropMethod: cropReceipt.cropMethod, removedAreaFraction: 1 - (crop.widthPx * crop.heightPx) / (full.widthPx * full.heightPx) }) },
      S1: { opId: 'early.S1.badgeCardinalityAudit', consumes: ['px.components.masks', 'px.components', 'px.badges.family', 'px.badges'], produces: 'px.early.s1.badgeCardinalityAudit', fn: 'fn.early.S1.badgeCardinalityAudit',
        calculate: (masks, fields, family, badges) => { const labels = badges.map(b => b.label ?? null); const nonempty = labels.filter(v => v !== null); const counts = new Map(nonempty.map(label => [label, nonempty.filter(other => other === label).length])); return { brightComponents: fields.bright.components.length, darkComponents: fields.dark.components.length, brightMaskPixels: masks.bright.data.reduce((n, v) => n + v, 0), darkMaskPixels: masks.dark.data.reduce((n, v) => n + v, 0), familyCount: family.length, badgeCount: badges.length, whiteBadgePx: badges.reduce((n, b) => n + b.whitePx, 0), blackBadgePx: badges.reduce((n, b) => n + b.blackPx, 0), labels, missingLabelCount: labels.length - nonempty.length, duplicateLabelCount: [...counts.values()].filter(n => n > 1).length }; } },
      S2: { opId: 'early.S2.shellOwnershipAudit', consumes: ['px.baskets.family', 'px.baskets.shellFamily', 'px.baskets'], produces: 'px.early.s2.shellOwnershipAudit', fn: 'fn.early.S2.shellOwnershipAudit',
        calculate: (family, shell, baskets) => { const owned = new Map(); for (const [i, basket] of baskets.entries()) for (const pixel of basket.px) owned.set(pixel, (owned.get(pixel) ?? 0) + 1); return { familyCount: family.members.length, shellMemberCount: shell.members.length, shellMargins: shell.margins ?? null, shellPixelCount: shell.shellOffsets.length, basketCount: baskets.length, ownedBasketPixels: [...owned.values()].filter(n => n > 0).length, multiplyOwnedBasketPixels: [...owned.values()].filter(n => n > 1).length }; } }
    };
    for (const id of ['S0', 'S1', 'S2']) if (experiments.includes(id) && stageOrder.indexOf(id) <= lastIndex) {
      const a = audits[id];
      const branch = store.call(`fn.provider.restore.${id}`);
      if (id === 'S0') branch.set('px.early.s0.cropReceipt', store.get('tk.source.cropReceipt'));
      const calculate = (...args) => a.calculate(...args);
      const op = { id: a.opId, kind: 'measure', gate: 'shared', unit: `early-${id.toLowerCase()}-audit`, consumes: a.consumes, produces: [a.produces], calculations: [a.fn], accessConformance: 'exact', note: `${gates[id].benefit} Validation evidence only; source outputs unchanged.` };
      const plan = { ops: [op], bindings: {}, planFingerprint: sha256HexSyncText(JSON.stringify(op)) };
      const runtime = { implementations: new Map([[a.opId, (board) => { const value = calculate(...a.consumes.map((address) => board.get(address))); board.set(a.produces, value); }]]), calculationBindings: new Map([[a.opId, [{ address: a.fn, calculate }]]]) };
      const ticks = store.call('fn.provider.executeCompiledPlan', { site: `early.${id}.audit`, plan, board: branch, runtime });
      const evidence = branch.get(a.produces);
      const offBaseline = id === 'S0'
        ? { ...store.get('tk.source.cropReceipt') }
        : id === 'S1'
          ? { familyCount: captured('S1').family.length, badgeCount: captured('S1').badges.length }
          : { familyCount: captured('S2').family.members.length, shellMemberCount: captured('S2').shellFamily.members.length, basketCount: captured('S2').baskets.length };
      branchResults[id] = { mode: 'ON', status: 'VALIDATION_ONLY_NO_CV_CHANGE', baseSnapshotSha256: store.get(`tk.stage.${id}.snapshotSha256`), benefit: gates[id].benefit, falsifier: gates[id].falsifier, oracle: 'UNKNOWN', partAddress: a.produces, offBaseline, onEvidence: evidence, canonicalRgbaSha256Off: stages[stageOrder.indexOf(id)].canonicalRgbaSha256, canonicalRgbaSha256On: hash(branch.get(id === 'S0' ? 'px.course.canonicalPixels' : ComponentPxC.image).rgba), ticks: ticks.map(t => ({ id: t.opId, declared: { consumes: op.consumes, produces: op.produces, calculations: op.calculations }, actual: { consumes: t.actualConsumes, produces: t.actualProduces, writes: t.writes }, frozenCalculations: t.frozenCalculations })) };
    }
  }
  if (experiments.includes('S3') && until.toUpperCase() === 'S3') {
    const branch = store.call('fn.provider.restore.S2');
    const before = hash(branch.get(ComponentPxC.image).rgba);
    const contract = dist('stages/S3/exp/fill-consistent/contract').stageContract;
    const result = await contract.execute({ source, inputLabel: basename(source), decode: decodeNodeFile, pxc: branch });
    const after = hash(branch.get(ComponentPxC.image).rgba);
    if (before !== after || before !== initialPixels) throw new Error('S3 experiment mutated original canonical pixels');
    const pcr = branch.get('px.tees.exp.pcr');
    const baselineTees = captured('S3').tees;
    const treatmentTees = branch.get(TeePxC.objects);
    const objectIdentity = (tees) => hash(JSON.stringify(tees.map((tee) => ({ center: tee.center, bbox: tee.bbox, innerBbox: tee.innerBbox, pxSha256: hash(Buffer.from(tee.px.buffer, tee.px.byteOffset, tee.px.byteLength)) }))));
    branchResults.S3 = { mode: 'ON', status: 'EXPERIMENTAL_ORACLE_UNKNOWN', receipt: result.receiptText,
      ticks: tickView(pcr), canonicalRgbaSha256: after,
      offBaseline: { tees: baselineTees.length, teeObjectsSha256: objectIdentity(baselineTees) },
      onTreatment: { tees: treatmentTees.length, teeObjectsSha256: objectIdentity(treatmentTees) },
      comparison: { countDelta: treatmentTees.length - baselineTees.length, objectIdentityChanged: objectIdentity(treatmentTees) !== objectIdentity(baselineTees) },
      counts: { measuredFrames: branch.get(TeePxC.family).measured.length, tees: treatmentTees.length } };
  }
  Object.assign(branchResults, stageBranches);
  if (s3ForkJoinEvidence) branchResults.S3FJ = s3ForkJoinEvidence;

  const sourceInfo = { path: source, sha256: sourceSha256, widthPx: captured('S0').fullImage.widthPx, heightPx: captured('S0').fullImage.heightPx };
  const final = pxc;
  const provenance = JSON.parse(readFileSync(resolve(provider, 'REPLAY-PROVENANCE.json'), 'utf8'));
  const sourceAlgSha256 = treeIdentity(resolve(provider, 'packages/alg/src'), /\.(ts|json|yaml)$/);
  const compiledAlgSha256 = treeIdentity(resolve(provider, 'packages/alg/dist'), /\.(js|json)$/);
  const provenanceVerified = sourceAlgSha256 === provenance.sourceAlgSha256 && compiledAlgSha256 === provenance.compiledAlgSha256;
  if (!provenanceVerified) throw new Error('Pinned provider source/compiled artifact hashes do not match REPLAY-PROVENANCE.json');
  const receipt = {
    schema: 'nctk-early@1', source: sourceInfo,
    provider: { provenanceVerified, provenanceSha256: hash(readFileSync(resolve(provider, 'REPLAY-PROVENANCE.json'))), sourceAlgSha256, compiledAlgSha256 },
    stages,
    materializations: stageMaterializations,
    crop: store.get('tk.source.cropReceipt'),
    ...(capture ? { capture: captureReceipt(store.get('tk.source.capture'), sourcePath) } : {}),
    snapshot: snapshotBytes ? { path: snapshotPath, relativePath: 's3.pxc.bin', sha256: snapshotSha256, addresses: presentAddresses } : null,
    counts: { ...(final.has(BadgePxC.objects.address) ? { badges: final.get(BadgePxC.objects).length } : {}), ...(final.has(BasketPxC.objects.address) ? { baskets: final.get(BasketPxC.objects).length } : {}), ...(final.has(TeePxC.objects.address) ? { tees: final.get(TeePxC.objects).length } : {}) },
    experiments: { gates, branches: branchResults },
    oracle: 'UNKNOWN',
    testimonyScope: 'Compiled gateway PCR operation testimony: declared/actual Part traffic, writes, frozen calculation bindings, and artifact hashes. It does not independently prove semantic correctness or every internal read/cache effect.'
  };
  writeFileSync(join(out, 'run.receipt.json'), json(receipt));
  writeFileSync(join(out, 'tick-traffic.json'), json({ stages: Object.fromEntries(stages.map(({ id, ticks }) => [id, ticks])), experiments: branchResults }));
  // Auto-instrumentation sidecar: per-op timing and verbatim emits for every
  // compiled-plan op this runner executed. A sidecar, not receipt content,
  // because elapsed times are nondeterministic and the receipt is hashed.
  writeFileSync(join(out, 'instrumentation.json'), json(instrumentation.document({ store: store.manifest() })));
  return receipt;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const args = process.argv.slice(2);
  const flagAt = args.indexOf('--until');
  const until = flagAt >= 0 ? args[flagAt + 1] : 'S3';
  if (flagAt >= 0) args.splice(flagAt, 2);
  const [forkRoot, sourcePath, outDir, ...experiments] = args;
  if (!forkRoot || !sourcePath || !outDir) {
    console.error('Usage: node --import tsx runEarly.mjs <forkRoot> <sourcePath> <outDir> [S3]');
    process.exitCode = 2;
  } else {
    runEarly({ forkRoot, sourcePath, outDir, experiments, until }).then((result) => console.log(json({
      schema: result.schema, source: result.source, snapshot: result.snapshot, counts: result.counts,
      gates: result.experiments.gates, experimentBranches: Object.keys(result.experiments.branches)
    }))).catch((error) => { console.error(error.stack ?? error); process.exitCode = 1; });
  }
}
