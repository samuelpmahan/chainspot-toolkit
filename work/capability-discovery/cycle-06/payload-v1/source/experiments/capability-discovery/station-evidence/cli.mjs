#!/usr/bin/env node
/** Fixed synthetic8 file adapter. No PNG decoding, math or gateway replacement. */
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeBytes } from './codec.mjs';
import { runStationEvidence, syntheticDeclarations, SYNTHETIC_PROFILE } from './recipe.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const RAW_NAMES = ['intact', 'gap2', 'gap6', 'ellipse', 'capsule'];
const MASK_NAMES = ['clear', 'gap6', 'allHidden'];
const MASK_FOR_CASE = ['clear', 'clear', 'clear', 'clear', 'clear', 'clear', 'gap6', 'allHidden'];
const MANIFEST_KEYS = ['schema', 'enabled', 'protocolId', 'protocolPath', 'inventoryPath', 'fixturesDirectory'];
const errorInfo = (error, phase) => ({
  code: phase === 'encode' ? 'ENCODING_FAILED' : 'OUTPUT_FAILED', phase,
  name: String(error?.name ?? 'Error'), message: String(error?.message ?? error).slice(0, 4096)
});

function readBounded(path, maxBytes, exactBytes = null, expectedSha256 = null) {
  const size = statSync(path).size;
  if (!Number.isSafeInteger(size) || size > maxBytes || (exactBytes !== null && size !== exactBytes)) throw new Error(`refused input byte length: ${path}`);
  const bytes = Uint8Array.from(readFileSync(path));
  if (bytes.length !== size || (exactBytes !== null && bytes.length !== exactBytes)) throw new Error(`input length changed while reading: ${path}`);
  const sha256 = sha(bytes);
  if (expectedSha256 !== null && sha256 !== expectedSha256) throw new Error(`input SHA256 mismatch: ${path}`);
  return { bytes, binding: { path, bytes: bytes.length, sha256 } };
}

/** Read exactly the admitted raw fixture files; returned byte planes are not Buffers. */
export function readSyntheticManifest(path) {
  const manifestPath = resolve(path);
  const disk = readBounded(manifestPath, 8192);
  const manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(disk.bytes));
  if (!manifest || Object.getPrototypeOf(manifest) !== Object.prototype ||
      Object.keys(manifest).length !== MANIFEST_KEYS.length || MANIFEST_KEYS.some(k => !Object.hasOwn(manifest, k)) ||
      manifest.schema !== 'cycle05-station-files@1' || manifest.enabled !== true || manifest.protocolId !== 'synthetic8') {
    throw new Error('exact enabled synthetic8 file manifest required');
  }
  for (const key of ['protocolPath', 'inventoryPath', 'fixturesDirectory']) {
    if (typeof manifest[key] !== 'string' || !manifest[key].trim() || manifest[key].includes('\0')) throw new Error(`invalid ${key}`);
  }
  const fromManifest = value => resolve(dirname(manifestPath), value);
  const protocolPath = fromManifest(manifest.protocolPath), inventoryPath = fromManifest(manifest.inventoryPath);
  const fixturesDirectory = fromManifest(manifest.fixturesDirectory);
  const protocol = readBounded(protocolPath, 131072, null, SYNTHETIC_PROFILE.protocolSha256);
  const inventoryFile = readBounded(inventoryPath, 131072, null, SYNTHETIC_PROFILE.inventorySha256);
  const inventory = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(inventoryFile.bytes));
  const suppliedFiles = [
    { role: 'disk-manifest', ...disk.binding },
    { role: 'protocol', ...protocol.binding },
    { role: 'inventory', ...inventoryFile.binding }
  ];
  const rasters = new Map(), masks = new Map();
  for (const name of RAW_NAMES) {
    const entry = inventory.rasters[name];
    if (entry.rawPath !== `fixtures/${name}.rgba` || entry.rgbaBytes !== 491520) throw new Error('unsupported pinned raster inventory');
    const loaded = readBounded(join(fixturesDirectory, `${name}.rgba`), 491520, 491520, entry.rgbaSha256);
    rasters.set(name, loaded.bytes); suppliedFiles.push({ role: 'rgba', id: name, ...loaded.binding });
  }
  for (const name of MASK_NAMES) {
    const entry = inventory.masks[name];
    if (entry.path !== `fixtures/${name}.mask.u8` || entry.bytes !== 122880) throw new Error('unsupported pinned mask inventory');
    const loaded = readBounded(join(fixturesDirectory, `${name}.mask.u8`), 122880, 122880, entry.sha256);
    if (loaded.bytes.some(value => value !== 0 && value !== 1)) throw new Error('nonbinary synthetic mask');
    masks.set(name, loaded.bytes); suppliedFiles.push({ role: 'mask', id: name, ...loaded.binding });
  }
  const comparisons = syntheticDeclarations().map((declaration, index) => ({
    ...declaration, rgba: rasters.get(declaration.imageId),
    mask: { data: masks.get(MASK_FOR_CASE[index]), sha256: declaration.mask.sha256 }
  }));
  return {
    request: { schema: 'cycle05-registered-station-request@1', enabled: true, protocolId: 'synthetic8', protocolSha256: SYNTHETIC_PROFILE.protocolSha256, comparisons },
    suppliedFiles, manifestSha256: disk.binding.sha256
  };
}

/** Reserve a NEW destination before execution; each writer is one-shot even after failure. */
export function createArtifactWriter(outDir) {
  const directory = resolve(outDir);
  mkdirSync(directory); // No recursive mkdir or existing-directory reuse.
  let used = false;
  return {
    write(runResult) {
      if (used) throw new Error('artifact writer is already used; no overwrite or retry');
      used = true;
      const artifacts = [];
      let phase = 'fragments', fragmentsDirectory = false, manifestAttempted = false;
      const manifest = { schema: 'cycle05-station-artifacts@1', status: 'OUTPUT_FAILED', artifacts, error: null };
      const put = (name, bytes, metadata = {}) => {
        writeFileSync(join(directory, name), bytes, { flag: 'wx' });
        artifacts.push({ path: name, bytes: bytes.length, sha256: sha(bytes), ...metadata });
      };
      const finishManifest = () => {
        manifestAttempted = true;
        writeFileSync(join(directory, 'artifact-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
      };
      try {
        // Persist already-encoded fragments BEFORE final aggregate serialization.
        for (const [kind, rows] of [['answer', runResult.fragments.answers], ['calculation', runResult.fragments.calculationEntries]]) {
          for (let index = 0; index < rows.length; index++) {
            const row = rows[index];
            if (!row.bytes || Object.getPrototypeOf(row.bytes) !== Uint8Array.prototype) throw new Error('fragment bytes must be exact Uint8Array');
            if (!fragmentsDirectory) { mkdirSync(join(directory, 'fragments')); fragmentsDirectory = true; }
            const metadata = { kind, comparisonId: row.comparisonId };
            if (kind === 'answer') metadata.planIndex = row.planIndex;
            else metadata.captureIndex = row.captureIndex;
            // Filenames never interpolate externally supplied identifiers/paths.
            put(`fragments/${kind}-${index}.json`, row.bytes, metadata);
          }
        }
        phase = 'encode';
        const valueBytes = encodeBytes(runResult.valueTrace);
        phase = 'output'; put('value-trace.json', valueBytes, { kind: 'value-trace' });
        phase = 'encode';
        const sidecarBytes = encodeBytes(runResult.sidecar, { maxBytes: 4194304 });
        phase = 'output'; put('timing-sidecar.json', sidecarBytes, { kind: 'timing-sidecar' });
        manifest.status = runResult.valueTrace.status;
        manifest.error = runResult.valueTrace.error;
        finishManifest();
        return manifest;
      } catch (error) {
        manifest.status = phase === 'encode' ? 'ENCODING_FAILED' : 'OUTPUT_FAILED';
        manifest.error = errorInfo(error, phase);
        // Keep all files already written, including fragments and a possible value
        // trace. If the filesystem also refuses this manifest, preserve that error.
        if (!manifestAttempted) {
          try { finishManifest(); }
          catch (manifestError) { error.artifactManifestError = errorInfo(manifestError, 'artifact-manifest'); }
        }
        error.artifactManifest = manifest;
        throw error;
      }
    }
  };
}

async function main(args) {
  if (args.length !== 5 || args[0] !== 'run' || args[1] !== '--manifest' || args[3] !== '--out') {
    throw new Error('Usage: node cli.mjs run --manifest PATH --out NEWDIR');
  }
  const loaded = readSyntheticManifest(args[2]);
  const writer = createArtifactWriter(args[4]); // Refuse destination before any query.
  const result = await runStationEvidence(loaded.request);
  if (result.valueTrace.requestBinding) {
    result.valueTrace.requestBinding.suppliedFiles = loaded.suppliedFiles;
    const protocol = loaded.suppliedFiles.find(file => file.role === 'protocol');
    result.valueTrace.requestBinding.protocolFileVerification = { path: protocol.path, expectedSha256: SYNTHETIC_PROFILE.protocolSha256, actualSha256: protocol.sha256, verified: true };
  }
  const manifest = writer.write(result);
  console.log(JSON.stringify({ status: manifest.status, out: resolve(args[4]), manifestSha256: loaded.manifestSha256, counts: result.valueTrace.counts }));
  if (manifest.status !== 'COMPLETED') process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    console.error(JSON.stringify({ status: error.artifactManifest?.status ?? 'NOT_EXECUTED', error: String(error?.message ?? error) }));
    process.exitCode = 1;
  });
}
