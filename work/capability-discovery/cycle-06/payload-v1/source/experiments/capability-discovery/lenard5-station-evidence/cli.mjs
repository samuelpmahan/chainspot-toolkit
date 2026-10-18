#!/usr/bin/env node
/** Fixed Lenard5 CLI. Input loading and all measurement belong to recipe.mjs. */
import { openSync, fstatSync, readSync, closeSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runLenard5Evidence } from './recipe.mjs';
import { createArtifactWriter } from '../station-evidence/cli.mjs';

const USAGE = 'Usage: node cli.mjs run --manifest FILE.json --out NEWDIR';
const info = (error, phase) => ({
  phase, name:String(error?.name ?? 'Error'), message:String(error?.message ?? error).slice(0,4096)
});
const validPath = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 4096 && !value.includes('\0');

/** Observe only our emitted output files; never load the input manifest here. */
function outputBinding(path, maxBytes, retain = false) {
  const fd = openSync(path,'r');
  try {
    const stat = fstatSync(fd), size = stat.size;
    if (!stat.isFile() || !Number.isSafeInteger(size) || size < 0 || size > maxBytes) throw new Error('refused output file type/size');
    const hash = createHash('sha256'), kept = retain ? new Uint8Array(size) : null;
    const chunk = new Uint8Array(Math.max(1,Math.min(size,65536)));
    let position = 0;
    while (position < size) {
      const count = readSync(fd,chunk,0,Math.min(chunk.length,size-position),position);
      if (count === 0) throw new Error('output file shortened during binding');
      const bytes = chunk.subarray(0,count);
      hash.update(bytes); if (kept) kept.set(bytes,position);
      position += count;
    }
    if (readSync(fd,chunk,0,1,position) !== 0 || fstatSync(fd).size !== size) throw new Error('output file changed length during binding');
    return { bytes:size, sha256:hash.digest('hex'), retained:kept };
  } finally { closeSync(fd); }
}

function observeArtifacts(directory, receipt, expectedStatus) {
  const observed = outputBinding(join(directory,'artifact-manifest.json'),131072,true);
  receipt.artifactManifest = { path:'artifact-manifest.json', bytes:observed.bytes, sha256:observed.sha256, schema:null, status:null };
  const manifest = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(observed.retained));
  receipt.artifactManifest.schema = manifest.schema;
  receipt.artifactManifest.status = manifest.status;
  if (manifest.schema !== 'cycle05-station-artifacts@1' || typeof manifest.status !== 'string' ||
      manifest.status !== expectedStatus || !Array.isArray(manifest.artifacts) || manifest.artifacts.length > 512) {
    throw new Error('unexpected legacy artifact manifest shape/status');
  }
  const seen = new Set();
  for (const artifact of manifest.artifacts) {
    if (!artifact || typeof artifact.path !== 'string' ||
        !/^(?:value-trace\.json|timing-sidecar\.json|fragments\/(?:answer|calculation)-\d+\.json)$/.test(artifact.path) ||
        seen.has(artifact.path) || !Number.isSafeInteger(artifact.bytes) || artifact.bytes < 0 ||
        typeof artifact.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(artifact.sha256)) {
      throw new Error('unexpected artifact binding/path');
    }
    seen.add(artifact.path);
    const actual = outputBinding(join(directory,artifact.path),33554432);
    receipt.artifacts.push({ path:artifact.path, bytes:actual.bytes, sha256:actual.sha256,
      matchesManifest:actual.bytes === artifact.bytes && actual.sha256 === artifact.sha256 });
    if (!receipt.artifacts.at(-1).matchesManifest) throw new Error('emitted artifact differs from legacy manifest');
  }
}

/** One writer invocation; preserve its prefix/errors and append a separate receipt.
 * A supplied runnerError means no result exists: do not invent a trace or call
 * the writer. This is also the NONCV seam for fabricated writer/codec fixtures.
 */
export function persistLenard5Result(writer, runResult, { outDir, manifestPath }, runnerError = null) {
  const directory = resolve(outDir);
  let firstError = runnerError, written = null;
  if (!firstError) {
    try { written = writer.write(runResult); }
    catch (error) { firstError = error; }
  }
  const writerStatus = written?.status ?? firstError?.artifactManifest?.status ?? null;
  const receipt = {
    schema:'cycle06-lenard5-cli-receipt@1', protocolId:'lenard5-fixed16',
    requestedManifestPath:resolve(manifestPath),
    inputVerificationAuthority:'runner value-trace requestBinding; CLI does not reload or decode inputs',
    runStatus:runResult?.valueTrace?.status ?? null, writerStatus,
    status:runnerError ? 'RUNNER_FAILED' : writerStatus ?? 'OUTPUT_FAILED',
    intendedExitCode:1, artifactManifest:null, artifacts:[],
    error:firstError ? info(firstError,runnerError ? 'runner' : 'writer') : null,
    bindingError:null,
    limits:'Legacy cycle05 writer envelope unchanged; exclusive one-shot best-effort retained prefix, not atomic/durable output or execution attestation. Actual exit is outer-process evidence.'
  };
  if (!runnerError) {
    try { observeArtifacts(directory,receipt,writerStatus); }
    catch (error) {
      receipt.bindingError = info(error,'output-binding'); receipt.status = 'OUTPUT_FAILED';
      firstError ??= error;
    }
  }
  receipt.intendedExitCode = receipt.status === 'COMPLETED' ? 0 : 1;
  try {
    writeFileSync(join(directory,'cli-receipt.json'),`${JSON.stringify(receipt,null,2)}\n`,{flag:'wx'});
  } catch (error) {
    if (firstError) {
      firstError.cliReceiptError = info(error,'cli-receipt');
      firstError.cliReceipt = receipt;
      throw firstError;
    }
    error.cliReceiptError = info(error,'cli-receipt');
    error.cliReceipt = { ...receipt, status:'OUTPUT_FAILED', intendedExitCode:1 };
    throw error;
  }
  if (firstError) { firstError.cliReceipt = receipt; throw firstError; }
  return receipt;
}

/** Exact explicit run grammar; NEW output is reserved before any runner call. */
export async function runLenard5CLI(args) {
  if (!Array.isArray(args) || args.length !== 5 || args[0] !== 'run' || args[1] !== '--manifest' || args[3] !== '--out') throw new Error(USAGE);
  if (!validPath(args[2]) || !validPath(args[4])) throw new Error('invalid manifest/output path');
  const manifestPath = resolve(args[2]), outDir = resolve(args[4]);
  const writer = createArtifactWriter(outDir);
  let result;
  try {
    result = await runLenard5Evidence({ schema:'cycle06-lenard5-request@1', enabled:true, manifestPath });
  } catch (error) {
    return persistLenard5Result(writer,null,{outDir,manifestPath},error);
  }
  return persistLenard5Result(writer,result,{outDir,manifestPath});
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runLenard5CLI(process.argv.slice(2)).then(receipt => {
    console.log(JSON.stringify({ status:receipt.status, intendedExitCode:receipt.intendedExitCode, receipt:'cli-receipt.json', artifactManifest:receipt.artifactManifest }));
    process.exitCode = receipt.intendedExitCode;
  }).catch(error => {
    console.error(JSON.stringify({ status:error.cliReceipt?.status ?? 'NOT_EXECUTED',
      error:info(error,'terminal'), receiptError:error.cliReceiptError ?? null }));
    process.exitCode = 1;
  });
}
