/**
 * Runner glue for the S3 fn.Tee.findFamily ComparableForkJoin (node-only).
 * Lane s3-findfamily-forkjoin (lanes/s3/findfamily-forkjoin.json), default
 * OFF; with the lane off runEarly never imports this file.
 *
 * Every implementation found by convention under <forkRoot>/impl/
 * fn.Tee.findFamily/<name>.mjs runs on its OWN board restored from the
 * sealed S3 snapshot, writes its member set to px.tees.familyMembers on that
 * branch, and then the same two FunctionalGuarantees run on every branch
 * (fg.s3.teeFamily.materialize, fg.s3.teeFamily.precision). The branches are
 * joined by geometric identity under contracts/tee.pose@1 and judged
 * against Sam's annotation testimony (testimony/**\/*.annotation.json whose
 * sourceImage.sha256 is this run's source).
 *
 * Outputs (all under <outDir>):
 *   artifacts/s3forkjoin/fn.Tee.findFamily/<name>/members.json  per branch (FG sink)
 *   artifacts/s3forkjoin/cmp.fn.Tee.findFamily.json             the comparison Part
 *   fg/s3.findfamily-forkjoin.{records.json,frames.json,flipbook.html,timings.json}
 * Returns the compact summary runEarly records as experiments.branches.S3FJ
 * (only when the lane is ON, so lane-off receipts are untouched).
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadRegistry, discoverImplementations } from '../../fg/discover.mjs';
import { comparableForkJoin, forkJoinFrames } from '../../fg/forkjoin.mjs';
import { createFileSink, nodeSha256 } from '../../fg/node-sink.mjs';
import { framesJson, renderFlipbook } from '../../fg/flipbook.mjs';
import { canonicalJson } from '../../fg/canon.mjs';
import { cropWindow } from '../../fg/png.mjs';
import { TEE_FAMILY_SLOT, compareTeeFamilies, ACCEPTANCE } from '../../fg/s3/teeFamily.mjs';

const SIDECAR = 's3.findfamily-forkjoin';
const FGS = [TEE_FAMILY_SLOT.materialize, TEE_FAMILY_SLOT.precision];

function findTestimony(forkRoot, sourceSha256) {
  const dir = join(forkRoot, 'testimony');
  const found = [];
  const walk = (d) => {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.annotation.json')) {
        const bytes = new Uint8Array(readFileSync(p));
        let doc = null;
        try { doc = JSON.parse(Buffer.from(bytes).toString('utf8')); } catch { continue; }
        if (doc?.sourceImage?.sha256 === sourceSha256) found.push({ path: relative(forkRoot, p).split('\\').join('/'), bytes });
      }
    }
  };
  walk(dir);
  if (found.length !== 1) throw new Error(`lane ${TEE_FAMILY_SLOT.lane}: expected exactly one testimony/**/*.annotation.json for source ${sourceSha256}, found ${found.length}${found.length ? ` (${found.map((f) => f.path).join(', ')})` : ''}; the precision judge has no testimony to judge against`);
  return found[0];
}

export async function runTeeFamilyForkJoin({ forkRoot, outDir, snapshot, restorePxC, dist, cropReceipt, sourceSha256 }) {
  const { registry, report } = await loadRegistry({ root: join(forkRoot, 'fg'), stagesDir: join(forkRoot, 'stages') });
  const missing = FGS.filter((id) => report.declaredUnimplemented.includes(id) || !registry.ids.includes(id) || report.implementedUndeclared.includes(id));
  if (missing.length) throw new Error(`${TEE_FAMILY_SLOT.lane}: FunctionalGuarantees not both declared in stages/s3.json and implemented under fg/: ${missing.join(', ')}`);
  const drift = report.mismatches.filter((m) => FGS.includes(m.id));
  if (drift.length) throw new Error(`${TEE_FAMILY_SLOT.lane}: FG implementations drift from stages/s3.json: ${JSON.stringify(drift)}`);

  const implementations = await discoverImplementations(join(forkRoot, 'impl'), TEE_FAMILY_SLOT.slot);
  const contract = (await import(pathToFileURL(join(forkRoot, 'contracts', 'tee.pose@1.mjs')).href)).default;
  const testimony = findTestimony(forkRoot, sourceSha256);
  const { selectTeeFamily } = dist('stages/S3/clean/index');
  const implEnv = Object.freeze({ selectTeeFamily });

  const sink = createFileSink(join(outDir, 'artifacts', 's3forkjoin'), { relativeTo: outDir });
  const restores = [];
  const result = comparableForkJoin({
    slot: TEE_FAMILY_SLOT.slot,
    implementations,
    restore: () => { const t = performance.now(); const board = restorePxC(snapshot); restores.push(Math.round((performance.now() - t) * 1000) / 1000); return board; },
    apply: (board, impl, name) => board.set(TEE_FAMILY_SLOT.part, { slot: TEE_FAMILY_SLOT.slot, implementation: name, members: impl(board, implEnv) }),
    guarantees: registry.guarantees,
    only: FGS,
    lanes: [TEE_FAMILY_SLOT.lane],
    sink,
    env: { testimony, cropReceipt, sourceSha256 },
    compare: compareTeeFamilies({ contract, crop: cropWindow })
  });

  const cmpBytes = Buffer.from(canonicalJson({ schema: 'nctk-s3-findfamily-comparison@1', address: result.comparison.address, implementations: result.comparison.implementations, sha256: result.comparison.sha256, value: result.comparison.value }) + '\n');
  const cmpPath = join(outDir, 'artifacts', 's3forkjoin', `${result.comparison.address}.json`);
  mkdirSync(join(outDir, 'artifacts', 's3forkjoin'), { recursive: true });
  writeFileSync(cmpPath, cmpBytes);
  if (nodeSha256(readFileSync(cmpPath)) !== nodeSha256(cmpBytes)) throw new Error('comparison artifact hash mismatch after write');

  const frames = forkJoinFrames(result);
  const sidecarDir = join(outDir, 'fg');
  mkdirSync(sidecarDir, { recursive: true });
  const records = Object.fromEntries(Object.entries(result.branches).map(([n, b]) => [n, { error: b.error, records: b.records }]));
  writeFileSync(join(sidecarDir, `${SIDECAR}.records.json`), canonicalJson({ schema: 'nctk-fg-forkjoin-records@1', slot: result.slot, guarantees: FGS, branches: records, comparison: { address: result.comparison.address, sha256: result.comparison.sha256 } }) + '\n');
  writeFileSync(join(sidecarDir, `${SIDECAR}.frames.json`), framesJson(frames) + '\n');
  writeFileSync(join(sidecarDir, `${SIDECAR}.flipbook.html`), renderFlipbook(frames, { title: `S3 ${TEE_FAMILY_SLOT.slot} fork-join: ${result.comparison.implementations.join(' vs ')}` }));
  writeFileSync(join(sidecarDir, `${SIDECAR}.timings.json`), JSON.stringify({ restoreMs: restores }, null, 2) + '\n');

  const v = result.comparison.value;
  return {
    mode: 'ON', status: 'FORK_JOIN_ORACLE_SAM', lane: TEE_FAMILY_SLOT.lane, slot: TEE_FAMILY_SLOT.slot,
    implementations: result.comparison.implementations,
    contract: v.contract.address, testimony: { path: testimony.path, sha256: nodeSha256(testimony.bytes) },
    branches: v.branches, counts: v.counts,
    comparison: { address: result.comparison.address, sha256: result.comparison.sha256, path: relative(outDir, cmpPath).split('\\').join('/'), bytes: cmpBytes.length },
    sidecars: ['records.json', 'frames.json', 'flipbook.html'].map((s) => `fg/${SIDECAR}.${s}`),
    acceptance: ACCEPTANCE
  };
}
