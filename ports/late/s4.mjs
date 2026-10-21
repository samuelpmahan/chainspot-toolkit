/** Existing clean S4 contracts on a freshly supplied, immutable S3 PxC snapshot. */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deserialize } from '../../fg/pxcCodec.mjs';   // node:v8 with packed typed arrays

const sha = value => createHash('sha256').update(value).digest('hex');
const require = createRequire(import.meta.url);
const pcrTicks = pcr => pcr.ticks.map(({ operation, testimony }) => ({
  id: operation.id,
  declared: { consumes: operation.consumes, produces: operation.produces, calculations: operation.calculations },
  actual: { consumes: testimony.actualConsumes, produces: testimony.actualProduces, writes: testimony.writes },
  frozenCalculations: testimony.frozenCalculations,
  invocationLimit: 'Bound function identity and exact get/set traffic; nested invocation is not independently gateway-tracked.',
  artifactHashes: testimony.artifacts?.map(a => ({ id: a.id, sha256: a.sha256 })) ?? []
}));

export async function runS4({ forkRoot, sourcePath, sourceSha256, snapshotPath, snapshotSha256, canonicalRgbaSha256,
  openFrame = false }) {
  const root = resolve(forkRoot);
  const dist = path => require(resolve(root, 'packages/alg/dist', path));
  const { createExecBoard } = dist('exec/board');
  const { decodeNodeFile } = dist('adapters/node');
  const source = readFileSync(resolve(sourcePath));
  if (sha(source) !== sourceSha256) throw new Error('S4 source SHA differs from fresh S0–S3 handoff');
  const bytes = readFileSync(resolve(snapshotPath));
  if (sha(bytes) !== snapshotSha256) throw new Error('S4 upstream S3 snapshot SHA mismatch');
  const entries = deserialize(Buffer.from(bytes));
  if (!Array.isArray(entries) || entries.some(e => !Array.isArray(e) || e.length !== 2 || typeof e[0] !== 'string'))
    throw new Error('S4 invalid PxC snapshot address/value entries');
  const pxc = createExecBoard();
  for (const [address, value] of entries) pxc.set(address, value);
  const canonical = pxc.get('px.course.canonicalPixels');
  if (sha(canonical.rgba) !== canonicalRgbaSha256) throw new Error('S4 canonical image differs from fresh S3');
  const inputHash = sha(canonical.rgba);
  const badges = pxc.get('px.badges'), baskets = pxc.get('px.baskets'), visible = pxc.get('px.tees');
  const basis = { badges: badges.length, baskets: baskets.length, visibleTees: visible.length,
    sourceSha256, snapshotSha256, canonicalRgbaSha256 };
  const baseContract = dist('stages/S4/exp/axis-local/contract').stageContract;
  const context = { source: resolve(sourcePath), inputLabel: sourcePath.split('/').at(-1), decode: decodeNodeFile, pxc };
  const before = Date.now();
  const base = await baseContract.execute(context);
  const basePcr = pxc.get('px.s4.pcr');
  const baseState = pxc.get('px.s4.teeBadge.state');
  const baseCounts = { resolutions: baseState.resolutions.length, unresolvedHoles: baseState.unresolvedHoles.length };
  let candidatePcr = null, candidateBasePcr = null, candidateState = null, candidates = [], candidateReceipt = null, candidatePxc = null;
  if (openFrame) {
    // Contract composes its own axis-local predecessor. Restore again to prevent
    // double execution and preserve a byte-identical input for OFF/ON comparison.
    const nextPxc = createExecBoard();
    for (const [address, value] of deserialize(Buffer.from(bytes))) nextPxc.set(address, value);
    const result = await dist('stages/S4/exp/open-frame/contract').stageContract.execute({ ...context, pxc: nextPxc });
    candidatePcr = nextPxc.get('px.s4.pcr');
    candidateBasePcr = nextPxc.get('px.s4.basePcr');
    candidateState = nextPxc.get('px.s4.teeBadge.state');
    candidates = nextPxc.get('px.s4.openFrames');
    candidateReceipt = result.receiptText;
    candidatePxc = nextPxc;
    if (sha(nextPxc.get('px.course.canonicalPixels').rgba) !== inputHash) throw new Error('S4 refinement mutated canonical pixels');
  }
  if (sha(pxc.get('px.course.canonicalPixels').rgba) !== inputHash) throw new Error('S4 baseline mutated canonical pixels');
  const selected = candidateState ?? baseState;
  return { pxc: candidatePxc ?? pxc, canonical, badges, baskets, visible,
    state: selected, candidates,
    report: { stageId: 'S4', status: 'GEOMETRY_PROPOSALS_WITH_UNRESOLVED_OWNERSHIP',
      source: basis, featureId: 's4.openFrame', defaultEnabled: false, explicitlyEnabled: openFrame,
      nativeReceipts: { base: base.receiptText, refinement: candidateReceipt },
      ticks: candidatePcr ? [...pcrTicks(candidateBasePcr), ...pcrTicks(candidatePcr)] : pcrTicks(basePcr),
      comparisonTicks: { off: pcrTicks(basePcr), on: candidatePcr ? [...pcrTicks(candidateBasePcr), ...pcrTicks(candidatePcr)] : null },
      pcrs: { baselineOff: basePcr, refinementOnBase: candidateBasePcr, refinementOnContinuation: candidatePcr },
      counts: { ...basis, baseline: baseCounts, refinement: candidateState ? {
        resolutions: candidateState.resolutions.length, openFrameCandidates: candidates.length,
        unresolvedHoles: candidateState.unresolvedHoles.length } : null },
      unknown: { unresolvedHoleReads: selected.unresolvedHoles,
        unresolvedTees: selected.unresolvedTees,
        warning: 'A badge count of 18 is inventory only. Candidate resolution and inferred rectangle do not establish physical fit or ownership.' },
      durationMs: Date.now() - before,
      provenance: 'Native S4 axis-local and open-frame contracts restored from the exact fresh S3 PxC bytes. Legacy teeRecovery is a separate engine and its archived marks are not spliced into this branch.' }
  };
}
