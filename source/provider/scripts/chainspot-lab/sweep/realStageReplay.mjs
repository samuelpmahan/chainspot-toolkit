/** Isolated source-pixel replay of existing Stage contracts; no detector implementation. */
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
process.chdir(root);
const require = createRequire(import.meta.url);
const dist = (path) => require(resolve(root, 'packages/alg/dist', path));
const { stroke, renderProgression } = await import('./stageOperation.ts');
const { capturePxC, restorePxC } = await import('./pxcSnapshot.ts');
const { decodeNodeFile } = dist('adapters/node');
const { ComponentPxC } = dist('stages/componentPxC');
const { BadgePxC } = dist('stages/S1/clean/Badge');
const { BasketPxC } = dist('stages/S2/clean/Basket');
const { TeePxC } = dist('stages/S3/clean/Tee');

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const source = resolve(process.argv[2] ?? 'artifacts/replay/source/IMG_5641.jpg');
const out = resolve(process.argv[3] ?? `artifacts/replay/runs/${basename(source, extname(source))}-${Date.now()}-${randomUUID().slice(0, 8)}`);
mkdirSync(out, { recursive: true });
const sourceSha256 = sha256(readFileSync(source));
function treeIdentity(dir, suffixes) {
  const files = [];
  const walk = (folder) => {
    for (const entry of readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (suffixes.test(entry.name)) files.push([path.slice(dir.length), sha256(readFileSync(path))]);
    }
  };
  walk(dir);
  return sha256(JSON.stringify(files));
}
const identity = {
  harnessSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
  sourceAlgSha256: treeIdentity(resolve(root, 'packages/alg/src'), /\.(ts|json|yaml)$/),
  compiledAlgSha256: treeIdentity(resolve(root, 'packages/alg/dist'), /\.(js|json)$/),
  dependencySha256: sha256(readFileSync(resolve(root,
    existsSync(resolve(root, 'provenance/original-package-lock.json'))
      ? 'provenance/original-package-lock.json' : 'package-lock.json'))),
  labDependencySha256: sha256(readFileSync(resolve(root,
    existsSync(resolve(root, 'provenance/original-lab-package-lock.json'))
      ? 'provenance/original-lab-package-lock.json' : 'scripts/chainspot-lab/package-lock.json'))),
  runtimeDependencySha256: sha256(readFileSync(resolve(root, 'package-lock.json'))),
  runtime: `${process.version}/${process.platform}/${process.arch}`
};
function repositoryProvenance() {
  const { execFileSync } = require('node:child_process');
  try {
    const checkoutRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (checkoutRoot !== root) throw new Error('Ancestor Git checkout is not this replay root');
    return { commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
      evidence: 'local-git-checkout' };
  } catch {
    const metadata = JSON.parse(readFileSync(resolve(root, 'REPLAY-PROVENANCE.json'), 'utf8'));
    if (metadata.sourceAlgSha256 !== identity.sourceAlgSha256 ||
      metadata.compiledAlgSha256 !== identity.compiledAlgSha256)
      throw new Error('Bundled provider source or compiled-alg hash mismatch');
    return { commit: metadata.sourceCommit, evidence: 'bundled-provenance-source-and-compiled-hashes-verified' };
  }
}
const repository = repositoryProvenance();
const capture = {};
// The contracts already call these exported clean functions. Observe their real
// return values to retain PCRs which StageOutput currently omits.
for (const [id, path, name] of [
  ['S0', 'stages/S0/clean/index', 'executeS0'],
  ['S1', 'stages/S1/clean/index', 'executeS1BadgesCandidate'],
  ['S2', 'stages/S2/clean/index', 'executeS2BasketsCandidate'],
  ['S3', 'stages/S3/clean/index', 'executeS3VisibleTees']
]) {
  const module = dist(path);
  const original = module[name];
  if (typeof original !== 'function') throw new Error(`Missing ${id} clean function ${name}`);
  module[name] = (...args) => {
    const value = original(...args);
    if (value instanceof Promise) return value.then((result) => (capture[id] = result, result));
    capture[id] = value;
    return value;
  };
}

function nativePanel(panel) {
  const image = new PNG({ width: panel.widthPx, height: panel.heightPx, colorType: 6 });
  image.data.set(panel.rgba);
  // Keep transparent ownership subtraction visible without changing its Part.
  for (let i = 0; i < image.width * image.height; i++) {
    const a = image.data[i * 4 + 3] / 255;
    if (a === 1) continue;
    const checker = (Math.floor(i % image.width / 8) + Math.floor(Math.floor(i / image.width) / 8)) % 2 ? 170 : 225;
    for (let c = 0; c < 3; c++) image.data[i * 4 + c] = Math.round(image.data[i * 4 + c] * a + checker * (1 - a));
    image.data[i * 4 + 3] = 255;
  }
  for (const box of panel.boxes ?? []) stroke(image, ...box.bbox, box.color);
  return image;
}

function savePanels(stage, panels, indices) {
  return indices.map((index) => {
    const panel = panels[index];
    if (!panel) throw new Error(`${stage} panel index ${index} missing`);
    const file = `${stage}-${String(index + 1).padStart(2, '0')}-${panel.label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
    const bytes = PNG.sync.write(nativePanel(panel));
    writeFileSync(join(out, file), bytes);
    return { label: panel.label, path: file, widthPx: panel.widthPx, heightPx: panel.heightPx, sha256: sha256(bytes) };
  });
}

function tickTraffic(pcr) {
  return pcr.ticks.map(({ operation, testimony }) => ({
    id: testimony.opId,
    declared: { consumes: operation.consumes, produces: operation.produces, calculations: operation.calculations },
    actual: { consumes: testimony.actualConsumes, produces: testimony.actualProduces, writes: testimony.writes },
    frozenCalculations: testimony.frozenCalculations,
    artifactHashes: testimony.artifacts.map(({ id, sha256, dims }) => ({ id, sha256, dims }))
  }));
}

const outputs = {};
const panels = [];
let pxc;
let initialCanonicalHash;
for (const id of ['S0', 'S1', 'S2', 'S3']) {
  const contract = dist(`stages/${id}/contract`).stageContract;
  const result = await contract.execute({ source, inputLabel: basename(source), decode: decodeNodeFile, ...(pxc ? { pxc } : {}) });
  pxc = result.pxc;
  const currentCanonicalHash = sha256(pxc.get('px.course.canonicalPixels').rgba);
  if (id === 'S0') initialCanonicalHash = currentCanonicalHash;
  else if (currentCanonicalHash !== initialCanonicalHash) throw new Error(`${id} mutated S0 canonical pixels`);
  const selected = id === 'S0' ? [0, 1] : id === 'S1' ? [2, 3, 4] : id === 'S2' ? [3, 4] : [5, 6];
  outputs[id] = { receiptText: result.receiptText, panels: savePanels(id, result.panels, selected),
    pcr: capture[id].pcr, canonicalRgbaSha256: currentCanonicalHash };
  panels.push(result.panels.at(-1));
}
if (Object.keys(capture).length !== 4) throw new Error('Clean Stage execution capture incomplete');
if (sha256(readFileSync(source)) !== sourceSha256) throw new Error('Source bytes changed during Stage execution');
const canonical = pxc.get(ComponentPxC.image);
const pixelSha256 = sha256(canonical.rgba);
const addresses = [...new Set([
  'px.source.selectedInput', 'px.source.fullImage', 'px.course.canonicalPixels',
  ...Object.values(ComponentPxC).map(key => key.address),
  ...Object.values(BadgePxC).map(key => key.address),
  ...Object.values(BasketPxC).map(key => key.address),
  ...Object.values(TeePxC).map(key => key.address)
])];
const snapshot = capturePxC(pxc, addresses);
writeFileSync(join(out, 's3.pxc.bin'), snapshot);
const snapshotSha256 = sha256(snapshot);
const branchOut = {};
for (const variant of ['axis-local', 'open-frame']) {
  const isolated = restorePxC(snapshot);
  const inputDigest = sha256(isolated.get(ComponentPxC.image).rgba);
  if (inputDigest !== pixelSha256) throw new Error(`${variant} snapshot pixel mismatch`);
  const contract = dist(`stages/S4/exp/${variant}/contract`).stageContract;
  const result = await contract.execute({ source, inputLabel: basename(source), decode: decodeNodeFile, pxc: isolated });
  if (sha256(isolated.get(ComponentPxC.image).rgba) !== pixelSha256) throw new Error(`${variant} mutated canonical pixels`);
  const pcr = isolated.get('px.s4.pcr');
  const state = isolated.get('px.s4.teeBadge.state');
  const basePcr = variant === 'open-frame' ? isolated.get('px.s4.basePcr') : null;
  branchOut[variant] = {
    receiptText: result.receiptText,
    pcr, basePcr,
    state: { assumption: state.assumption, recovery: state.recovery, resolutions: state.resolutions,
      unresolvedHoles: state.unresolvedHoles, unresolvedTees: state.unresolvedTees },
    candidates: variant === 'open-frame' ? isolated.get('px.s4.openFrames').map((candidate, index) => ({
      index, center: candidate.center, bbox: candidate.bbox, parts: candidate.parts,
      ownedObservedPx: candidate.px.length, sideCoverage: candidate.sideCoverage,
      interiorFraction: candidate.interiorFraction,
      selectedHole: state.resolutions.find(resolution => resolution.tee === pxc.get(TeePxC.objects).length + index)?.hole ?? null
    })) : null,
    panels: savePanels(`S4-${variant}`, result.panels, result.panels.map((_, index) => index))
  };
  const contact = PNG.sync.write(renderProgression(result.panels));
  writeFileSync(join(out, `S4-${variant}-progression.png`), contact);
}
writeFileSync(join(out, 'run.receipt.json'), JSON.stringify({
  schema: 'chainspot-real-stage-replay@1',
  source: { path: source, sha256: sourceSha256, widthPx: capture.S0.fullImage.widthPx, heightPx: capture.S0.fullImage.heightPx },
  crop: { ...capture.S0.cropReceipt, canonicalImageId: canonical.imageId, canonicalRgbaSha256: pixelSha256 },
  repositoryCommit: repository.commit,
  repositoryCommitEvidence: repository.evidence,
  identity,
  snapshot: { path: 's3.pxc.bin', sha256: snapshotSha256, addresses },
  counts: { badges: pxc.get(BadgePxC.objects).length, baskets: pxc.get(BasketPxC.objects).length, tees: pxc.get(TeePxC.objects).length },
  clean: Object.fromEntries(Object.entries(outputs).map(([id, value]) => [id, { receiptText: value.receiptText,
    canonicalRgbaSha256: value.canonicalRgbaSha256, pcr: value.pcr, panels: value.panels }])),
  branches: branchOut,
  testimonyScope: 'Actual gateway operation Part get/set traffic, writes and artifacts; frozen fn identities show bindings, not independently instrumented invocation. has/register/call, artifact extractor reads and external cache writes are not all represented as Part traffic.',
  replay: `node --import tsx sweep/realStageReplay.mjs ${JSON.stringify(source)} ${JSON.stringify(out)}`
}, null, 2));
writeFileSync(join(out, 'tick-traffic.json'), JSON.stringify({
  clean: Object.fromEntries(Object.entries(outputs).map(([id, value]) => [id, tickTraffic(value.pcr)])),
  branches: Object.fromEntries(Object.entries(branchOut).map(([id, value]) => [id, {
    ...(value.basePcr ? { base: tickTraffic(value.basePcr) } : {}), continuation: tickTraffic(value.pcr)
  }]))
}, null, 2));
writeFileSync(join(out, 'S0-S3-progression.png'), PNG.sync.write(renderProgression(panels)));
console.log(JSON.stringify({ out, sourceSha256, crop: capture.S0.cropReceipt, pixelSha256,
  snapshotSha256, counts: { badges: pxc.get(BadgePxC.objects).length, baskets: pxc.get(BasketPxC.objects).length, tees: pxc.get(TeePxC.objects).length },
  branches: Object.fromEntries(Object.entries(branchOut).map(([id, v]) => [id, { resolutions: v.state.resolutions.length, unresolvedHoles: v.state.unresolvedHoles, candidateCount: v.candidates?.length ?? null }]))
}, null, 2));
