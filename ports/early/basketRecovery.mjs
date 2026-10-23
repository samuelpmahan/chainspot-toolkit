/**
 * Opt-in S4 basket-recovery bridge. It consumes a verified S3 PxC snapshot,
 * clones it, calls the pinned existing smart basket matcher through PxC.call,
 * and writes candidate/decision evidence to a new Part only on that clone.
 * No S0-S3 detector or accepted PxC object is changed.
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const pretty = (value) => JSON.stringify(value, null, 2);

function treeIdentity(dir, suffixes) {
  const files = [];
  const walk = (folder) => {
    for (const entry of readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (suffixes.test(entry.name)) files.push([path.slice(dir.length), digest(readFileSync(path))]);
    }
  };
  walk(dir);
  return digest(JSON.stringify(files));
}

const tupleEq = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
function geometryMetrics(a, b) {
  const [ax, ay, aw, ah] = a;
  const [bx, by, bw, bh] = b;
  const left = Math.max(ax, bx), top = Math.max(ay, by);
  const right = Math.min(ax + aw, bx + bw), bottom = Math.min(ay + ah, by + bh);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = aw * ah + bw * bh - intersection;
  return { exact: tupleEq(a, b), iou: union ? intersection / union : 0,
    maxEdgeDeltaPx: Math.max(...a.map((value, index) => Math.abs(value - b[index]))) };
}

function compareCandidates(evidence, baskets) {
  return evidence.map((candidate, index) => {
    const matches = baskets.map((basket) => ({ ...geometryMetrics(candidate.semanticBbox, basket.bbox), basketIndex: basket.index, bbox: basket.bbox }))
      .sort((a, b) => b.iou - a.iou || a.maxEdgeDeltaPx - b.maxEdgeDeltaPx);
    const best = matches[0] ?? null;
    const exact = matches.filter((match) => match.exact).map((match) => match.basketIndex);
    const near = best && !best.exact && best.iou >= 0.9 ? best : null;
    return { index, tier: candidate.tier, confidence: candidate.confidence, source: candidate.source,
      semanticBbox: [...candidate.semanticBbox], center: [candidate.cx, candidate.cy],
      metrics: { identity: candidate.identity, effectiveVisibility: candidate.effectiveVisibility, whiteCoverage: candidate.whiteCoverage, blackBorderSupport: candidate.blackBorderSupport, darkCoherence: candidate.darkCoherence },
      classification: exact.length ? 'existing-s2-exact' : near ? 'near-s2-match' : candidate.tier === 'occlusion-recovery' ? 'recovered-proposal' : 'clean-family-proposal',
      exactS2Matches: exact, nearestS2: best };
  });
}

function compareDecisions(decisions, baskets) {
  return decisions.map((decision, index) => {
    const matches = baskets.map((basket) => ({ ...geometryMetrics(decision.semanticBbox, basket.bbox), basketIndex: basket.index, bbox: basket.bbox }))
      .sort((a, b) => b.iou - a.iou || a.maxEdgeDeltaPx - b.maxEdgeDeltaPx);
    return { index, accepted: decision.accepted, tier: decision.tier, reason: decision.reason, source: decision.source,
      searchOrigin: [decision.x, decision.y], semanticBbox: [...decision.semanticBbox],
      metrics: { areaRatio: decision.areaRatio, identity: decision.identity, effectiveVisibility: decision.effectiveVisibility, whiteCoverage: decision.whiteCoverage, blackBorderSupport: decision.blackBorderSupport, darkCoherence: decision.darkCoherence },
      closestS2: matches[0] ?? null };
  });
}

function paintBox(image, bbox, color, thickness = 2) {
  const [x, y, w, h] = bbox;
  const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(image.width - 1, Math.ceil(x + w - 1));
  const y1 = Math.min(image.height - 1, Math.ceil(y + h - 1));
  const set = (px, py) => {
    if (px < 0 || py < 0 || px >= image.width || py >= image.height) return;
    const at = (py * image.width + px) * 4;
    image.data[at] = color[0]; image.data[at + 1] = color[1]; image.data[at + 2] = color[2]; image.data[at + 3] = 255;
  };
  for (let t = 0; t < thickness; t++) for (let px = x0; px <= x1; px++) {
    set(px, y0 + t); set(px, y1 - t);
  }
  for (let t = 0; t < thickness; t++) for (let py = y0; py <= y1; py++) {
    set(x0 + t, py); set(x1 - t, py);
  }
}

export async function runBasketRecovery({ forkRoot, receiptPath, sourcePath, outDir }) {
  const fork = resolve(forkRoot);
  const provider = resolve(fork, 'source/provider');
  const receiptFile = resolve(receiptPath);
  const source = resolve(sourcePath);
  const out = resolve(outDir);
  mkdirSync(out, { recursive: true });
  const run = JSON.parse(readFileSync(receiptFile, 'utf8'));
  if (run.schema !== 'nctk-early@1' || run.snapshot?.sha256 == null)
    throw new Error('Input run receipt must be an nctk-early@1 S3 result with a materialized snapshot');
  const inputBytes = readFileSync(source);
  const sourceSha256 = digest(inputBytes);
  if (sourceSha256 !== run.source.sha256) throw new Error('Source image hash does not match the S3 run receipt');
  const snapshotFile = resolve(dirname(receiptFile), run.snapshot.path);
  const snapshotBytes = readFileSync(snapshotFile);
  if (digest(snapshotBytes) !== run.snapshot.sha256) throw new Error('S3 PxC snapshot hash does not match the S3 run receipt');
  if (!existsSync(resolve(provider, 'REPLAY-PROVENANCE.json'))) throw new Error(`Missing pinned provider under ${provider}`);
  const provenance = JSON.parse(readFileSync(resolve(provider, 'REPLAY-PROVENANCE.json'), 'utf8'));
  const sourceAlgSha256 = treeIdentity(resolve(provider, 'packages/alg/src'), /\.(ts|json|yaml)$/);
  const compiledAlgSha256 = treeIdentity(resolve(provider, 'packages/alg/dist'), /\.(js|json)$/);
  if (sourceAlgSha256 !== provenance.sourceAlgSha256 || compiledAlgSha256 !== provenance.compiledAlgSha256 ||
      sourceAlgSha256 !== run.provider.sourceAlgSha256 || compiledAlgSha256 !== run.provider.compiledAlgSha256)
    throw new Error('Pinned provider provenance differs from the run receipt or REPLAY-PROVENANCE.json');
  const needed = ['px.components.masks', 'px.badges', 'px.baskets', 'px.image.cropped'];
  if (!needed.every((address) => run.snapshot.addresses.includes(address)))
    throw new Error(`S3 snapshot lacks required Parts: ${needed.filter((address) => !run.snapshot.addresses.includes(address)).join(', ')}`);

  const require = createRequire(pathToFileURL(resolve(provider, 'package.json')));
  const dist = (path) => require(resolve(provider, 'packages/alg/dist', path));
  const { restorePxC } = await import(pathToFileURL(resolve(provider, 'scripts/chainspot-lab/sweep/pxcSnapshot.ts')));
  const { executeCompiledPlan } = dist('exec/gateway');
  const { nullFeatureContext } = dist('detectors/threeFactor/features/types');
  const { createMemorySink } = dist('exec/sink');
  const { sha256HexSyncText } = dist('exec/sha256');
  const { pxFn } = dist('exec/board');
  const { matchBasketSpritesSmart, DEFAULT_SMART_BASKET_OPTIONS } = dist('detectors/threeFactor/smartBasket');
  const { extractComponents } = dist('detectors/threeFactor/components');
  const { ComponentPxC } = dist('stages/componentPxC');
  const { BadgePxC } = dist('stages/S1/clean/Badge');
  const { BasketPxC } = dist('stages/S2/clean/Basket');
  const { PNG } = require('pngjs');

  const templatePath = resolve(provider, 'packages/alg/dist/detectors/threeFactor/assets/basket-sprite.json');
  const template = JSON.parse(readFileSync(templatePath, 'utf8'));
  const templateSha256 = digest(readFileSync(templatePath));
  const options = { ...DEFAULT_SMART_BASKET_OPTIONS };
  const branch = restorePxC(snapshotBytes);
  const canonical = branch.get(ComponentPxC.image);
  const canonicalRgbaSha256Before = digest(canonical.rgba);
  const offBasketValue = branch.get(BasketPxC.objects);
  const basketIdentity = (baskets) => digest(JSON.stringify(baskets.map((basket) => ({
    bbox: basket.bbox, whitePx: basket.whitePx, blackPx: basket.blackPx,
    pxSha256: digest(Buffer.from(basket.px.buffer, basket.px.byteOffset, basket.px.byteLength))
  }))));
  const offBasketIdentitySha256 = basketIdentity(offBasketValue);
  const offBasketGeometrySha256 = digest(JSON.stringify(offBasketValue.map((basket) => basket.bbox)));
  const offBaskets = offBasketValue.map((basket, index) => ({ index, bbox: [...basket.bbox], pixels: basket.px.length }));
  const masks = branch.get(ComponentPxC.masks);
  const badgeObjects = branch.get(BadgePxC.objects);
  const badges = badgeObjects.map((badge) => ({
    cx: badge.bbox[0] + badge.bbox[2] / 2, cy: badge.bbox[1] + badge.bbox[3] / 2,
    bboxX: badge.bbox[0], bboxY: badge.bbox[1], bboxW: badge.bbox[2], bboxH: badge.bbox[3]
  }));
  const fn = pxFn('fn.early.S4.matchBasketSpritesSmart');
  const outAddress = 'px.early.s4.basketRecovery';
  const templateAddress = 'px.early.s4.basketTemplate';
  branch.set(templateAddress, template);
  let localInvocationCount = 0;
  const calculate = (args) => {
    localInvocationCount++;
    const decisions = [];
    const evidence = matchBasketSpritesSmart(args.masks.bright, args.masks.dark, args.badges,
      args.template, args.options, decisions);
    const brightComponents = extractComponents(args.masks.bright).components;
    const tolerance = args.options.bboxTolerancePx;
    const silentlySkipped = brightComponents.filter((component) => Math.abs(component.bboxW - args.template.width) > tolerance || Math.abs(component.bboxH - args.template.height) > tolerance);
    const compatibleCount = brightComponents.length - silentlySkipped.length;
    const decisionSources = [...new Set(decisions.map((decision) => decision.source))];
    const prefilter = {
      brightComponentCount: brightComponents.length, matcherSizeCompatibleCount: compatibleCount,
      silentlySkippedByDimensionToleranceCount: silentlySkipped.length,
      silentlySkippedSampleExplanation: 'Matcher has an early bboxW/bboxH tolerance continue before it appends SmartBasketDecision. Its recovery search also filters fine-grid samples below recoveryIdentityMin before a decision is emitted; those pixel-grid probes have no decision row.',
      matcherDecisionCount: decisions.length, matcherEvidenceCount: evidence.length,
      decisionSources, cleanEvidenceCount: evidence.filter((candidate) => candidate.tier === 'clean-family').length,
      recoveryEvidenceCount: evidence.filter((candidate) => candidate.tier === 'occlusion-recovery').length,
      recoveryDecisionCount: decisions.filter((decision) => decision.tier === 'occlusion-recovery').length,
      rejectedDecisionCount: decisions.filter((decision) => !decision.accepted).length,
      noDecisionForSomeBrightComponents: silentlySkipped.length > 0,
      thresholds: args.options
    };
    return { evidence, decisions, comparisons: {
      accepted: compareCandidates(evidence, args.existingBaskets),
      decisions: compareDecisions(decisions, args.existingBaskets)
    }, prefilter };
  };
  branch.register(fn, calculate);
  const op = {
    id: 'early.S4.smartBasketRecovery', kind: 'compute', gate: 'S4', unit: 'early-basket-recovery',
    consumes: [ComponentPxC.masks.address, BadgePxC.objects.address, BasketPxC.objects.address, templateAddress],
    produces: [outAddress], calculations: [fn.address], accessConformance: 'exact',
    note: 'Default-OFF S4 bridge: reuse pinned smart basket matcher; preserve S2 Basket[] and publish independent evidence/decision Part.'
  };
  const plan = { ops: [op], bindings: {}, planFingerprint: sha256HexSyncText(JSON.stringify({ op, options, templateSha256 })) };
  const runtime = {
    implementations: new Map([[op.id, (board) => {
      const args = {
        masks: board.get(ComponentPxC.masks),
        badges: board.get(BadgePxC.objects).map((badge) => ({
          cx: badge.bbox[0] + badge.bbox[2] / 2, cy: badge.bbox[1] + badge.bbox[3] / 2, bboxX: badge.bbox[0], bboxY: badge.bbox[1], bboxW: badge.bbox[2], bboxH: badge.bbox[3]
        })),
        existingBaskets: board.get(BasketPxC.objects),
        template: board.get(templateAddress), options
      };
      board.set(outAddress, board.call(fn, args));
    }]]),
    calculationBindings: new Map([[op.id, [{ address: fn.address, calculate }]]])
  };
  const testimonies = executeCompiledPlan(plan, branch, nullFeatureContext, createMemorySink(), runtime);
  const output = branch.get(outAddress);
  const accepted = output.comparisons.accepted;
  const decisions = output.comparisons.decisions;
  const prefilter = output.prefilter;
  const canonicalRgbaSha256After = digest(branch.get(ComponentPxC.image).rgba);
  const offBasketIdentitySha256After = basketIdentity(branch.get(BasketPxC.objects));
  if (canonicalRgbaSha256After !== canonicalRgbaSha256Before) throw new Error('S4 bridge mutated canonical source pixels');
  if (offBasketIdentitySha256After !== offBasketIdentitySha256) throw new Error('S4 bridge mutated accepted S2 basket geometry');
  const sameBaskets = branch.get(BasketPxC.objects);
  const image = new PNG({ width: canonical.widthPx, height: canonical.heightPx, colorType: 6 });
  image.data.set(canonical.rgba);
  for (const basket of offBaskets) paintBox(image, basket.bbox, [167, 139, 250, 255], 2); // S2 existing = purple
  for (const candidate of accepted) paintBox(image, candidate.semanticBbox,
    candidate.classification === 'existing-s2-exact' ? [34, 197, 94, 255] : candidate.classification === 'near-s2-match' ? [250, 204, 21, 255] : [34, 211, 238, 255], 2);
  for (const decision of decisions.filter((item) => !item.accepted)) paintBox(image, decision.semanticBbox, [239, 68, 68, 255], 1);
  const visualBytes = PNG.sync.write(image);
  const visualPath = join(out, 'basket-bridge-overlay.png');
  writeFileSync(visualPath, visualBytes);
  const basketRecoveryPartPath = join(out, 'basket-recovery.part.json');
  const basketRecoveryPartBytes = Buffer.from(pretty(output));
  writeFileSync(basketRecoveryPartPath, basketRecoveryPartBytes);
  const cropTopRows = run.crop?.upperRowsRemoved;
  if (!Number.isInteger(cropTopRows)) throw new Error('Run receipt is missing exact S0 upper crop rows for source coordinate mapping');
  const sourceBbox = (bbox) => [bbox[0], bbox[1] + cropTopRows, bbox[2], bbox[3]];
  const receipt = {
    schema: 'nctk-basket-recovery-bridge@1', default: 'OFF', mode: 'ON', oracle: 'UNKNOWN',
    source: { path: source, sha256: sourceSha256 },
    inputRunReceipt: { path: receiptFile, sha256: digest(readFileSync(receiptFile)), snapshotPath: snapshotFile, snapshotSha256: digest(snapshotBytes), sourcePath: run.source.path, sourceSha256: run.source.sha256 },
    provider: { provenanceSha256: digest(readFileSync(resolve(provider, 'REPLAY-PROVENANCE.json'))), sourceAlgSha256, compiledAlgSha256 },
    template: { path: templatePath, sha256: templateSha256, width: template.width, height: template.height },
    stage: { id: 'S4', tick: op.id, calculation: fn.address, invocationCount: localInvocationCount,
      calculationInvocationLimit: 'One board.call invocation per run; local counter is incremented inside the bound calculation body. Gateway frozen calculation testimony records the binding/body hash; board.call itself is not a tracked PxC Part read/write.' },
    parts: { consumes: op.consumes, produces: outAddress, writes: testimonies[0].writes,
      materialized: { path: basketRecoveryPartPath, sha256: digest(basketRecoveryPartBytes), format: 'JSON plain-data serialization of the exact PxC Part value' },
      existingS2BasketCount: offBaskets.length, existingS2BasketIdentitySha256: offBasketIdentitySha256, existingS2BasketGeometrySha256: offBasketGeometrySha256,
      candidateCount: accepted.length, decisionCount: decisions.length,
      acceptedCount: decisions.filter((decision) => decision.accepted).length,
      rejectedCount: decisions.filter((decision) => !decision.accepted).length,
      exactSemanticBboxMatches: accepted.filter((candidate) => candidate.classification === 'existing-s2-exact').length,
      nearSemanticBboxMatches: accepted.filter((candidate) => candidate.classification === 'near-s2-match').length,
      recoveredProposalCount: accepted.filter((candidate) => candidate.classification === 'recovered-proposal').length,
      cleanFamilyProposalCount: accepted.filter((candidate) => candidate.classification === 'clean-family-proposal').length },
    prefilter,
    accepted: accepted.map((item) => ({ ...item, sourceSemanticBbox: sourceBbox(item.semanticBbox) })),
    decisions: decisions.map((item) => ({ ...item, sourceSemanticBbox: sourceBbox(item.semanticBbox) })),
    matcherEvidence: output.evidence, matcherDecisions: output.decisions,
    coordinateFrames: { comparisonFrame: 'S0 canonical crop pixel coordinates', sourceFrame: 'original input image pixel coordinates', transform: 'sourceX = canonicalX; sourceY = canonicalY + crop.upperRowsRemoved', cropUpperRowsRemoved: cropTopRows, cropLowerRowsRemoved: run.crop.lowerRowsRemoved },
    visual: { path: visualPath, sha256: digest(visualBytes), legend: { purple: 'existing S2 Basket.bbox', green: 'exact semanticBbox match to S2', yellow: 'nearest S2 bbox IoU ≥ 0.9 but not exact', cyan: 'no exact or near S2 match; candidate proposal', red: 'rejected matcher decision' } },
    comparisonPolicy: { exact: 'four semanticBbox coordinates equal Basket.bbox exactly', near: 'highest S2 IoU >= 0.9 and not exact; this is a reporting cut, not matcher threshold', note: 'Semantic object perimeter compared with semantic object perimeter; never compared with white/component search window or owned pixel extent.' },
    pixelPreservation: { canonicalRgbaSha256Before, canonicalRgbaSha256After, unchanged: canonicalRgbaSha256Before === canonicalRgbaSha256After },
    acceptedPartPreservation: { s2BasketIdentitySha256Before: offBasketIdentitySha256, s2BasketIdentitySha256After: offBasketIdentitySha256After, unchanged: offBasketIdentitySha256 === offBasketIdentitySha256After }
  };
  writeFileSync(join(out, 'basket-bridge.receipt.json'), pretty(receipt));
  writeFileSync(join(out, 'basket-bridge.tick-traffic.json'), pretty({ ticks: testimonies.map((testimony) => ({
    id: testimony.opId, declared: { consumes: op.consumes, produces: op.produces, calculations: op.calculations },
    actual: { consumes: testimony.actualConsumes, produces: testimony.actualProduces, writes: testimony.writes },
    frozenCalculations: testimony.frozenCalculations
  })) }));
  // tick wall times: a sidecar, never in the hashed tick traffic (two identical runs must write identical records)
  writeFileSync(join(out, 'basket-bridge.instrumentation.json'), pretty({ schema: 'nctk-instrumentation@1', ticks: testimonies.map((testimony) => ({ id: testimony.opId, durationMs: testimony.durationMs })) }));
  return receipt;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const [forkRoot, receiptPath, sourcePath, outDir] = process.argv.slice(2);
  if (!forkRoot || !receiptPath || !sourcePath || !outDir) {
    console.error('Usage: node --import tsx basketRecovery.mjs <forkRoot> <run.receipt.json> <source.jpg> <outDir>');
    process.exitCode = 2;
  } else runBasketRecovery({ forkRoot, receiptPath, sourcePath, outDir })
    .then((receipt) => console.log(pretty({ schema: receipt.schema, source: receipt.source,
      parts: receipt.parts, prefilter: receipt.prefilter, visual: receipt.visual })))
    .catch((error) => { console.error(error.stack ?? error); process.exitCode = 1; });
}
