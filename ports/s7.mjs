import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { access, lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const images = {
  IMG_5641: { capture: 'IMG_5641-capture.json', badgeId: 'badge-9', teeId: 'tee-7', mode: 'golden' },
  'AlexClark-original': { capture: 'AlexClark-original-capture.json', badgeId: 'badge-8', teeId: 'tee-recovered-3', mode: 'alex' },
};
const candidateStatus = 'TWO_RAY_ZERO_BEND_GEOMETRY_CANDIDATE_UNOWNED';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const inside = (base, candidate) => {
  const rel = path.relative(base, candidate);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
};

function resolveInside(base, value, label) {
  if (typeof value !== 'string' || !value) throw new TypeError(`${label} is required`);
  const target = path.resolve(base, value);
  if (!inside(base, target)) throw new Error(`${label} must resolve within forkRoot`);
  return target;
}

async function assertRealInside(baseReal, target, label) {
  const actual = await realpath(target);
  if (!inside(baseReal, actual)) throw new Error(`${label} resolves outside forkRoot`);
  return actual;
}

function resolveHandoffPath(root, value, label) {
  if (typeof value !== 'string' || !value) throw new TypeError(`${label} is required`);
  // S6 artifacts are explicit, digest-pinned outputs from runLate and may live in its lane output directory.
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(root, value);
}

async function exists(target) {
  try { await lstat(target); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

function findEvidenceHash(value, expectedHash, rowPath) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(item => findEvidenceHash(item, expectedHash, rowPath));
  for (const [key, item] of Object.entries(value)) {
    if (['rowSha256', 'rowFileSha256', 'rowsSha256'].includes(key) && item === expectedHash) return true;
    if (item && typeof item === 'object') {
      const evidencePath = item.path ?? item.file ?? item.name;
      if (item.sha256 === expectedHash && typeof evidencePath === 'string' &&
          (evidencePath === rowPath || evidencePath.endsWith(path.basename(rowPath)))) return true;
      if (findEvidenceHash(item, expectedHash, rowPath)) return true;
    }
  }
  return false;
}

async function validateS6({ root, rootReal, upstreamS6, expectedSourceSha256 }) {
  const blocked = reason => ({ status: 'BLOCKED', reason, evidence: [], document: null, hits: [], zeroBendRows: [] });
  if (!upstreamS6 || typeof upstreamS6 !== 'object') return blocked('fresh S6 handoff missing');
  if (typeof upstreamS6.rowSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(upstreamS6.rowSha256)) return blocked('fresh S6 row SHA-256 missing or malformed');
  if (typeof upstreamS6.receiptSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(upstreamS6.receiptSha256) || !upstreamS6.receiptPath) {
    return blocked('fresh S6 receipt path and receipt SHA-256 are required');
  }
  if (upstreamS6.sourceSha256 !== expectedSourceSha256) return blocked('fresh S6 source SHA-256 differs from the pinned S7 source');
  let rowPath, receiptPath;
  try {
    rowPath = resolveHandoffPath(root, upstreamS6.rowPath, 'upstreamS6.rowPath');
    receiptPath = resolveHandoffPath(root, upstreamS6.receiptPath, 'upstreamS6.receiptPath');
    const [rowReal, receiptReal] = await Promise.all([realpath(rowPath), realpath(receiptPath)]);
    if (!inside(rootReal, rowReal) || !inside(rootReal, receiptReal)) return blocked('fresh S6 row and receipt must resolve inside forkRoot');
  } catch (error) { return blocked(`fresh S6 artifact path invalid: ${error.message}`); }
  let rowBytes, receiptBytes;
  try { [rowBytes, receiptBytes] = await Promise.all([readFile(rowPath), readFile(receiptPath)]); }
  catch { return blocked('fresh S6 row or receipt cannot be read'); }
  const rowSha256 = sha(rowBytes), receiptSha256 = sha(receiptBytes);
  if (rowSha256 !== upstreamS6.rowSha256) return blocked('fresh S6 row file hash does not match handoff');
  if (receiptSha256 !== upstreamS6.receiptSha256) return blocked('fresh S6 receipt file hash does not match handoff');
  let document, receipt;
  try { document = JSON.parse(rowBytes.toString('utf8')); receipt = JSON.parse(receiptBytes.toString('utf8')); }
  catch { return blocked('fresh S6 row or receipt is invalid JSON'); }
  if (document.schema !== 'nctk-s6-rows@1' || document.sourceSha256 !== expectedSourceSha256 || document.frame !== 'original-jpeg-pixels') {
    return blocked('fresh S6 row schema, source, or frame is incompatible');
  }
  if (receipt.schema !== 'nctk-s6-receipt@1' || receipt.sourceSha256 !== expectedSourceSha256 || receipt.rowSha256 !== rowSha256 ||
      receipt.paramsHash !== document.paramsHash || receipt.traceHash !== document.traceHash || receipt.s3SnapshotSha256 !== document.s3SnapshotSha256 ||
      receipt.pcr?.id !== 'S6.two-ray' || receipt.pcr?.paramsHash !== document.paramsHash) {
    return blocked('fresh S6 receipt does not bind the row/source/PCR identities');
  }
  if (!Array.isArray(document.hits) || !document.hits.length) return blocked('fresh S6 row set has no ray-compatible badge plate hits');
  const invalidHit = document.hits.findIndex(hit => typeof hit.teeId !== 'string' || typeof hit.badgeId !== 'string' || ![-1, 1].includes(hit.sign) ||
    !Array.isArray(hit.u) || hit.u.length !== 2 || !hit.u.every(Number.isFinite) ||
    !Array.isArray(hit.badgeCenter) || hit.badgeCenter.length !== 2 || !hit.badgeCenter.every(Number.isFinite));
  if (invalidHit >= 0) return blocked(`fresh S6 hit geometry is invalid at index ${invalidHit}`);
  if (document.assignment?.selected === true) {
    if (!receipt.assignment || receipt.assignment.sha256 !== document.assignment.sha256 ||
        receipt.assignment.path !== document.assignment.path ||
        !Array.isArray(document.candidateHits) || !Array.isArray(document.assignment.selectedHitIds) ||
        !Array.isArray(receipt.assignment.selectedHitIds))
      return blocked('selected S5 assignment handoff lacks sealed candidate and selected-hit references');
    const selectedIds=document.hits.map(hit=>hit.id),declaredIds=document.assignment.selectedHitIds;
    const candidateIds=new Set(document.candidateHits.map(hit=>hit.id));
    if (new Set(selectedIds).size!==selectedIds.length ||
        new Set(document.hits.map(hit=>hit.teeId)).size!==document.hits.length ||
        new Set(document.hits.map(hit=>hit.badgeId)).size!==document.hits.length ||
        selectedIds.some(id=>!candidateIds.has(id)) ||
        JSON.stringify(selectedIds)!==JSON.stringify(declaredIds) ||
        JSON.stringify(selectedIds)!==JSON.stringify(receipt.assignment.selectedHitIds))
      return blocked('selected S5 assignment is not a unique tee/badge subset of the candidate-hit graph');
    let assignmentPath,assignmentBytes,assignmentDoc;
    try {
      assignmentPath=resolveHandoffPath(root,document.assignment.path,'S5 assignment path');
      if(!inside(rootReal,await realpath(assignmentPath)))return blocked('S5 assignment artifact escapes forkRoot');
      assignmentBytes=await readFile(assignmentPath);
      if(sha(assignmentBytes)!==document.assignment.sha256)return blocked('S5 assignment artifact hash differs from sealed S6 reference');
      assignmentDoc=JSON.parse(assignmentBytes.toString('utf8'));
    } catch(error) {return blocked(`selected S5 assignment artifact invalid: ${error.message}`);}
    if(assignmentDoc.schema!=='nctk-s5-global-assignment@1'||
       assignmentDoc.sourceSha256!==expectedSourceSha256||
       assignmentDoc.s3SnapshotSha256!==document.s3SnapshotSha256||
       assignmentDoc.paramsHash!==document.paramsHash||
       JSON.stringify(assignmentDoc.assignment?.selected?.map(row=>row.hit?.id))!==JSON.stringify(selectedIds))
      return blocked('selected S5 assignment Part does not bind S6 resolved hits');
  }
  const hits = [...new Map(document.hits.map(hit => [`${hit.teeId}|${hit.sign}|${hit.badgeId}`, hit])).values()];
  if (!hits.length) return blocked('fresh S6 row set has no valid ray-compatible badge plate hits');
  const zeroBendRows = Array.isArray(document.rows) ? document.rows.filter(row => row.status === candidateStatus) : [];
  const evidence = [
    { path: path.relative(root, rowPath), sha256: rowSha256, bytes: rowBytes.length, role: 'fresh-s6-rows' },
    { path: path.relative(root, receiptPath), sha256: receiptSha256, bytes: receiptBytes.length, role: 'fresh-s6-receipt' },
  ];
  return { status: 'BOUND', reason: null, rowPath, rowSha256, receiptPath, receiptSha256, evidence, document, hits, zeroBendRows };
}

async function runScript(script, args, cwd) {
  const start = Date.now();
  try {
    const result = await execFileAsync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', maxBuffer: 48 * 1024 * 1024, windowsHide: true });
    return { status: 'completed', exitCode: 0, stdout: result.stdout, stderr: result.stderr, durationMs: Date.now() - start };
  } catch (error) {
    return { status: 'failed', exitCode: Number.isInteger(error.code) ? error.code : 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '', durationMs: Date.now() - start };
  }
}

async function runHeadingHint({ providerRoot, sourceFile, capturePath, rowPath }) {
  const code = String.raw`
    import { createHash } from 'node:crypto';
    import { createRequire } from 'node:module';
    import { readFile } from 'node:fs/promises';
    import { join, resolve } from 'node:path';
    const sha=b=>createHash('sha256').update(b).digest('hex');
    const providerRoot=resolve(process.argv[1]), sourcePath=resolve(process.argv[2]), capturePath=resolve(process.argv[3]), rowPath=resolve(process.argv[4]);
    const capture=JSON.parse(await readFile(capturePath,'utf8'));
    const source=await readFile(sourcePath);
    if(sha(source)!==capture.source.sha256)throw Error('S7 source SHA mismatch inside heading probe');
    const rowDoc=JSON.parse(await readFile(rowPath,'utf8'));
    const localRequire=createRequire(join(providerRoot,'package.json'));
    const dist=p=>localRequire(join(providerRoot,'packages/alg/dist',p));
    const {decodeNodeFile}=dist('adapters/node');
    const {stageContract}=dist('stages/S0/contract');
    const {runThreeFactor,parseConfig,resolveConfig,DEFAULT_EXECUTION,canonicalJson,sha256Hex}=dist('detectors/threeFactor');
    const {traceBadgeToBasket}=dist('detectors/threeFactor/features/g4.teeBadgeLockMath');
    const configBytes=await readFile(join(providerRoot,'packages/alg/src/detectors/threeFactor/configs/posterior-tee-recovery-on.json'));
    if(sha(configBytes)!==capture.configSha256)throw Error('S7 config bytes mismatch');
    const config=resolveConfig(parseConfig(JSON.parse(configBytes)),DEFAULT_EXECUTION);
    const paramsHash=await sha256Hex(canonicalJson(config));
    if(paramsHash!==capture.paramsHash)throw Error('S7 resolved configuration mismatch');
    const s0=await stageContract.execute({source:sourcePath,inputLabel:capture.source.path,decode:decodeNodeFile});
    const canonical=s0.pxc.get('px.course.canonicalPixels');
    if(sha(canonical.rgba)!==capture.source.frame.canonicalRgbaSha256)throw Error('S7 canonical pixels mismatch');
    const run=runThreeFactor(canonical,{config,paramsHash}),m=run.measurement;
    const baskets=m.baskets.map(b=>({basketId:b.detId,bbox:b.bbox}));
    const fieldAt=([x,y])=>m.field.support[Math.max(0,Math.min(m.field.height-1,Math.round((y-m.viewport.topPx)/m.field.scale)))*m.field.width+Math.max(0,Math.min(m.field.width-1,Math.round(x/m.field.scale)))];
    const cropMatch=s0.receiptText.match(/rowsRemoved: upper=(\d+) lower=(\d+)/);
    if(!cropMatch)throw Error('Fresh S0 crop receipt lacks exact removed-row transform');
    const canonicalToSource=[0,Number(cropMatch[1])];
    if(rowDoc.frame!=='original-jpeg-pixels')throw Error('Fresh S6 frame is incompatible with S0 source transform');
  const hits=[...new Map(rowDoc.hits.map(hit=>[hit.teeId+'|'+hit.sign+'|'+hit.badgeId,hit])).values()];
    const traces=hits.map(hit=>{
      const badge=m.badges.find(b=>b.detId===hit.badgeId);
      if(!badge)return {hitId:hit.id,teeId:hit.teeId,badgeId:hit.badgeId,sign:hit.sign,status:'UNKNOWN',reason:'badge id has no native S7 geometry'};
      if(!Array.isArray(hit.u)||hit.u.length!==2||!hit.u.every(Number.isFinite)||!Array.isArray(hit.badgeCenter)||hit.badgeCenter.length!==2||!hit.badgeCenter.every(Number.isFinite))
        return {hitId:hit.id,teeId:hit.teeId,badgeId:hit.badgeId,sign:hit.sign,status:'UNKNOWN',reason:'S6 hit geometry or axis is invalid'};
      const nativeBadgeCenterSource=[badge.cxPx+canonicalToSource[0],badge.cyPx+canonicalToSource[1]];
      const centerResidualPx=Math.hypot(nativeBadgeCenterSource[0]-hit.badgeCenter[0],nativeBadgeCenterSource[1]-hit.badgeCenter[1]);
      if(centerResidualPx>1)return {hitId:hit.id,teeId:hit.teeId,badgeId:hit.badgeId,sign:hit.sign,status:'UNKNOWN',reason:'S6 badge center does not align with transformed native S7 geometry',
        hitBadgeCenterSource:hit.badgeCenter,nativeBadgeCenterSource,centerResidualPx};
      const headingRad=Math.atan2(hit.u[1],hit.u[0]);
      const traced=traceBadgeToBasket({badgeId:badge.detId,startPx:[badge.cxPx,badge.cyPx],headingRad,field:m.field,
        viewportTopPx:m.viewport.topPx,supportTau:m.parameters.supportTau,corridorWidthPx:m.parameters.corridorWidthPx,
        startBadgeBbox:badge.bbox,occluders:m.badges.filter(b=>b.detId!==badge.detId).map(b=>({id:b.detId,bbox:b.bbox})),
        baskets,maxTraceLengthPx:Math.hypot(m.field.width*m.field.scale,m.field.height*m.field.scale)});
      const points=traced.points.map(point=>({canonicalPoint:point,sourcePoint:[point[0]+canonicalToSource[0],point[1]+canonicalToSource[1]],support:fieldAt(point)}));
      const end=traced.points.at(-1),prev=traced.points.at(-2);
      const next=end&&prev?[end[0]*2-prev[0],end[1]*2-prev[1]]:null;
      return {hitId:hit.id,teeId:hit.teeId,badgeId:hit.badgeId,sign:hit.sign,axisTaintedByBadgeConstraint:hit.axisTaintedByBadgeConstraint,
        hitBadgeCenterSource:hit.badgeCenter,nativeBadgeCenterSource,centerResidualPx,
        u:hit.u,headingRad,headingDeg:headingRad*180/Math.PI,sourceAxisHintOnly:true,
        outcome:traced.outcome,reason:traced.reason,basketIdReached:traced.basketId??null,lengthPx:traced.lengthPx,bendCount:traced.bendCount,
        pointCount:traced.points.length,points,nextStraightProbe:next?{canonicalPoint:next,sourcePoint:[next[0]+canonicalToSource[0],next[1]+canonicalToSource[1]],support:fieldAt(next)}:null};
    });
    const tracedBadgeIds=new Set(traces.filter(t=>t.status!=='UNKNOWN').map(t=>t.badgeId));
    const noAxisBadges=m.badges.filter(b=>!tracedBadgeIds.has(b.detId)).map(b=>b.detId);
    console.log(JSON.stringify({schema:'s7-fresh-s6-heading-hints@1',sourceSha256:capture.source.sha256,
      canonicalRgbaSha256:capture.source.frame.canonicalRgbaSha256,paramsHash,frame:rowDoc.frame,
      canonicalToSource,transformSource:'fresh S0 receiptText cropReceipt rowsRemoved upper value',
      field:{width:m.field.width,height:m.field.height,scale:m.field.scale,supportTau:m.parameters.supportTau,corridorWidthPx:m.parameters.corridorWidthPx},
      badgeCoverage:{rayCompatibleHits:rowDoc.hits.length,deduplicatedHits:hits.length,tracedHits:traces.filter(x=>x.status!=='UNKNOWN').length,
        distinctBadges:new Set(traces.filter(x=>x.status!=='UNKNOWN').map(x=>x.badgeId)).size,totalNativeBadges:m.badges.length,noAxisBadges},
      zeroBendCandidateRows:rowDoc.rows.filter(r=>r.status==='TWO_RAY_ZERO_BEND_GEOMETRY_CANDIDATE_UNOWNED').length,
      unknown:traces.filter(x=>x.status==='UNKNOWN'||x.outcome!=='basket').map(x=>({hitId:x.hitId,badgeId:x.badgeId,status:x.status??x.outcome,reason:x.reason})),traces},null,2));
  `;
  const startedAt = Date.now();
  try {
    const result = await execFileAsync(process.execPath, ['--input-type=module', '-e', code, providerRoot, sourceFile, capturePath, rowPath], {
      cwd: path.dirname(providerRoot), encoding: 'utf8', maxBuffer: 48 * 1024 * 1024, windowsHide: true,
    });
    return { status: 'completed', exitCode: 0, stdout: result.stdout, stderr: result.stderr, durationMs: Date.now() - startedAt };
  } catch (error) {
    return { status: 'failed', exitCode: Number.isInteger(error.code) ? error.code : 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '', durationMs: Date.now() - startedAt };
  }
}

async function collectFile(file, root, role, parseJson = true) {
  try {
    const bytes = await readFile(file);
    let content = null;
    if (parseJson) content = JSON.parse(bytes.toString('utf8'));
    return { path: path.relative(root, file), sha256: sha(bytes), bytes: bytes.length, role, content };
  } catch (error) { return { path: path.relative(root, file), role, error: error.message, content: null }; }
}

function expectedReplayFiles(scriptDir, imageId, spec) {
  const dir = spec.mode === 'alex' ? scriptDir : path.join(scriptDir, `${imageId}-${spec.badgeId}`);
  return [path.join(dir, 'replay.json'), path.join(dir, 'source-route.svg')];
}

function expectedWidthFile(scriptDir, imageId, badgeId, mode) {
  return path.join(scriptDir, 'width-probe', `${imageId}-${badgeId}${mode === 'heading' ? '-s5-axis' : ''}`, 'width-probe.json');
}

function summarize(role, content) {
  if (role === 'native-replay-receipt') return { schema: content.schema, operation: content.operation, sourceSha256: content.source?.sha256,
    paramsHash: content.paramsHash, selectedBadgeId: content.runObserved?.badge?.id ?? null,
    selectedBadgeCount: content.runObserved?.badgeCount ?? null, basketRouteCount: content.routes?.length ?? null,
    ridgeTrace: content.ridgeTrace ? { outcome: content.ridgeTrace.outcome?.outcome, reason: content.ridgeTrace.outcome?.reason,
      lengthPx: content.ridgeTrace.outcome?.lengthPx, bendCount: content.ridgeTrace.outcome?.bendCount } : null };
  if (role.startsWith('native-width')) return { schema: content.schema, sourceSha256: content.source?.sha256,
    headingSource: content.headingSource, s5AxisEvidence: content.s5AxisEvidence,
    variants: (content.outcomes ?? []).map(outcome => ({ name: outcome.name, outcome: outcome.traced?.outcome,
      reason: outcome.traced?.reason, lengthPx: outcome.traced?.lengthPx, bendCount: outcome.traced?.bendCount })) };
  if (role === 'fresh-s6-heading-diagnostic') return { schema: content.schema, badgeCoverage: content.badgeCoverage,
    traces: (content.traces ?? []).map(({ rowId, teeId, badgeId, basketId, outcome, reason, lengthPx, bendCount, headingDeg, status }) =>
      ({ rowId, teeId, badgeId, basketId, outcome, reason, lengthPx, bendCount, headingDeg, status })) };
  return null;
}

/** Invoke existing S7 replay and, when requested and fully attested, trace fresh S6 axis hints. */
export async function runS7({ forkRoot, sourcePath, outDir, imageId, upstreamS6, headingLane = false }) {
  if (typeof forkRoot !== 'string' || !forkRoot) throw new TypeError('forkRoot is required');
  const spec = images[imageId];
  if (!spec) throw new Error(`unsupported imageId: ${imageId}`);
  const root = path.resolve(forkRoot);
  await access(root);
  const rootReal = await realpath(root);
  const sourceFile = resolveInside(root, sourcePath, 'sourcePath');
  await assertRealInside(rootReal, sourceFile, 'sourcePath');
  const out = resolveInside(root, outDir, 'outDir');
  if (await exists(out)) throw new Error(`outDir already exists: ${path.relative(root, out)}`);
  const providerRoot = resolveInside(root, 'source/provider', 'providerRoot');
  const s7Dir = resolveInside(root, 'source/chainspot-teams/s7', 'S7 source');
  const replayScript = resolveInside(root, 'source/chainspot-teams/s7/replay.mjs', 'replay script');
  const widthScript = resolveInside(root, 'source/chainspot-teams/s7/width-probe.mjs', 'width script');
  const capturePath = resolveInside(providerRoot, `artifacts/composed-render-20260927/${spec.capture}`, 'capture');
  await Promise.all([providerRoot, s7Dir, replayScript, widthScript, capturePath].map(item => assertRealInside(rootReal, item, 'S7 input')));
  const captureBytes = await readFile(capturePath), capture = JSON.parse(captureBytes.toString('utf8'));
  const captureSource = resolveInside(providerRoot, capture.source.path, 'captured source');
  if (path.resolve(captureSource) !== path.resolve(sourceFile)) throw new Error('sourcePath does not match the selected image capture');
  const sourceBytes = await readFile(sourceFile), sourceSha256 = sha(sourceBytes);
  if (sourceSha256 !== capture.source.sha256) throw new Error('sourcePath bytes differ from pinned S7 capture');
  const provenancePath = resolveInside(providerRoot, 'REPLAY-PROVENANCE.json', 'provider provenance');
  const provenanceBytes = await readFile(provenancePath), provenance = JSON.parse(provenanceBytes.toString('utf8'));
  const configPath = resolveInside(providerRoot, 'packages/alg/src/detectors/threeFactor/configs/posterior-tee-recovery-on.json', 'config');
  const configBytes = await readFile(configPath), configSha256 = sha(configBytes);
  const portBytes = await readFile(new URL(import.meta.url));
  const replayScriptSha256 = sha(await readFile(replayScript));
  const widthScriptSha256 = sha(await readFile(widthScript));
  const s6 = headingLane
    ? await validateS6({ root, rootReal, upstreamS6, expectedSourceSha256: sourceSha256 })
    : { status: 'OFF', reason: 's5-axis-heading lane not selected', evidence: [], hits: [], zeroBendRows: [] };

  const replayFiles = expectedReplayFiles(s7Dir, imageId, spec);
  const legacyWidthFile = spec.mode === 'golden' ? expectedWidthFile(s7Dir, imageId, spec.badgeId, 'legacy') : null;
  const nativeFiles = [...replayFiles, ...(legacyWidthFile ? [legacyWidthFile] : [])];
  for (const file of nativeFiles) if (await exists(file)) throw new Error(`native output already exists: ${path.relative(root, file)}`);
  const calls = [];
  const receipts = [];
  calls.push({ operation: 'existing-replay-path-selected-badge', ...await runScript(replayScript, [providerRoot, imageId, spec.badgeId, spec.teeId], root) });
  for (const file of replayFiles) receipts.push(await collectFile(file, root, file.endsWith('.svg') ? 'native-visual-evidence' : 'native-replay-receipt', !file.endsWith('.svg')));
  if (spec.mode === 'golden') {
    calls.push({ operation: 'existing-width-probe-legacy-baseline', ...await runScript(widthScript, [providerRoot, imageId, spec.badgeId, spec.teeId], root) });
    receipts.push(await collectFile(legacyWidthFile, root, 'native-width-baseline-receipt'));
  }
  let headingReport = null;
  if (headingLane && s6.status === 'BOUND') {
    // The old width-probe hardcodes legacy tee/badge/basket identifiers. Invoke its exact existing tracer on fresh S6 rows directly instead.
    const headingInvocation = await runHeadingHint({ providerRoot, sourceFile, capturePath, rowPath: s6.rowPath });
    calls.push({ operation: 'existing-trace-function-fresh-s6-axis-hints', ...headingInvocation });
    try { headingReport = JSON.parse(headingInvocation.stdout); }
    catch { s6.status = 'BLOCKED'; s6.reason = `fresh S6 native geometry trace could not be parsed: ${headingInvocation.stderr || headingInvocation.stdout}`; }
    if (headingReport) {
      const headingReceiptPath = path.join(out, 'fresh-s6-heading-diagnostic.json');
      const headingBytes = Buffer.from(`${JSON.stringify(headingReport, null, 2)}\n`);
      receipts.push({ path: path.relative(root, headingReceiptPath), sha256: sha(headingBytes), bytes: headingBytes.length,
        role: 'fresh-s6-heading-diagnostic', content: headingReport });
    }
  }
  const replayReceipt = receipts.find(receipt => receipt.role === 'native-replay-receipt')?.content;
  const widthReceipts = receipts.filter(receipt => receipt.role === 'native-width-baseline-receipt').map(receipt => receipt.content).filter(Boolean);
  const selectedBadgeCount = replayReceipt?.runObserved?.badgeCount ?? null;
  const basketRouteCount = replayReceipt?.routes?.length ?? null;
  const routesUnknown = replayReceipt?.routes?.filter(route => typeof route.reachable !== 'boolean' || !route.reachable).length ?? null;
  const widthUnknown = widthReceipts.reduce((sum, receipt) => sum + (receipt.outcomes ?? []).filter(outcome => outcome.traced?.outcome !== 'basket').length, 0);
  const headingTraces = headingReport?.traces ?? [];
  const headingUnknown = headingTraces.filter(trace => trace.status === 'UNKNOWN' || trace.outcome !== 'basket').length;
  for (const receipt of receipts.filter(item => item.error)) calls.push({ operation: `required-output:${receipt.role}`, status: 'failed', exitCode: 1, stderr: receipt.error, durationMs: 0 });
  const callsFailed = calls.some(call => call.status !== 'completed' || call.exitCode !== 0);
  const status = callsFailed ? 'FAILED' : s6.status === 'BLOCKED' ? 'PARTIAL' : 'COMPLETED';
  const unknown = [
    ...(replayReceipt?.routes ?? []).filter(route => typeof route.reachable !== 'boolean' || !route.reachable)
      .map(route => ({ kind: 'basket-route-for-selected-badge', badgeId: replayReceipt.runObserved?.badge?.id, basketId: route.basketId, reason: route.reason ?? 'route unknown/unreachable' })),
    ...widthReceipts.flatMap(receipt => (receipt.outcomes ?? []).filter(outcome => outcome.traced?.outcome !== 'basket')
      .map(outcome => ({ kind: 'legacy-width-trace', name: outcome.name, outcome: outcome.traced?.outcome, reason: outcome.traced?.reason }))),
    ...headingTraces.filter(trace => trace.status === 'UNKNOWN' || trace.outcome !== 'basket')
      .map(trace => ({ kind: 'fresh-s6-axis-trace', hitId: trace.hitId, badgeId: trace.badgeId, outcome: trace.outcome ?? trace.status, reason: trace.reason })),
  ];
  const callDurationMs = calls.reduce((sum, call) => sum + call.durationMs, 0);
  const stage = {
    schema: 'nctk-stage-evidence@1', stage: 'S7', status, imageId,
    source: { path: path.relative(root, sourceFile), sha256: sourceSha256, bytes: sourceBytes.length,
      capturePath: path.relative(root, capturePath), captureSha256: sha(captureBytes), frame: capture.source.frame },
    provider: { provenancePath: path.relative(root, provenancePath), provenanceSha256: sha(provenanceBytes), sourceCommit: provenance.sourceCommit,
      sourceAlgSha256: provenance.sourceAlgSha256, compiledAlgSha256: provenance.compiledAlgSha256, configSha256 },
    adapter: { path: fileURLToPath(import.meta.url), sha256: sha(portBytes) },
    declaredEvidence: { replayScript: path.relative(root, replayScript), replayScriptSha256, widthProbe: spec.mode === 'golden' ? path.relative(root, widthScript) : null,
      widthProbeSha256: spec.mode === 'golden' ? widthScriptSha256 : null,
      operations: calls.map(call => call.operation), selectedBadge: spec.mode === 'golden' ? { badgeId: spec.badgeId, teeId: spec.teeId } : null,
      upstreamS6: upstreamS6 ? { rowPath: upstreamS6.rowPath, rowSha256: upstreamS6.rowSha256, receiptPath: upstreamS6.receiptPath,
        receiptSha256: upstreamS6.receiptSha256, sourceSha256: upstreamS6.sourceSha256 } : null },
    actualEvidence: { invocations: calls.map(({ operation, status, exitCode, durationMs }) => ({ operation, status, exitCode, durationMs })),
      files: receipts.map(({ content, ...evidence }) => evidence) },
    counts: { invocations: calls.length, selectedBadgeCoverage: replayReceipt ? { count: 1, total: selectedBadgeCount,
        ratio: selectedBadgeCount ? 1 / selectedBadgeCount : null } : null,
      basketRoutesForSelectedBadge: { count: basketRouteCount, unknown: routesUnknown },
      legacyWidthVariants: widthReceipts.reduce((sum, receipt) => sum + (receipt.outcomes?.length ?? 0), 0), widthUnknown,
      freshS6RayHits: headingReport?.badgeCoverage ?? null, freshS6ZeroBendCandidateRows: headingReport?.zeroBendCandidateRows ?? null, freshS6HeadingUnknown: headingUnknown },
    unknown,
    s6Seam: { status: s6.status, reason: s6.reason ?? null, rowSha256: s6.rowSha256 ?? null, receiptSha256: s6.receiptSha256 ?? null,
      deduplicatedRayHits: s6.hits.map(hit => ({ id: hit.id, teeId: hit.teeId, sign: hit.sign, badgeId: hit.badgeId, u: hit.u, badgeCenter: hit.badgeCenter, axisTaintedByBadgeConstraint: hit.axisTaintedByBadgeConstraint })),
      zeroBendCandidateCount: s6.zeroBendRows.length, evidence: s6.evidence },
    nativeReceipts: receipts.map(({ content, ...receipt }) => ({ ...receipt, summary: content ? summarize(receipt.role, content) : null })),
    calls, durationMs: callDurationMs,
    limitation: 'Existing S7 native replay re-decodes the pinned JPEG and routes one selected badge to all baskets (1/N badge coverage). Fresh S6 axes are hints passed to the existing trace function on native S7 badge geometry; they do not restore S0/PxC continuity, prove tee/basket ownership, or accept paths.',
  };
  await mkdir(out, { recursive: true });
  if (headingReport) await writeFile(path.join(out, 'fresh-s6-heading-diagnostic.json'), `${JSON.stringify(headingReport, null, 2)}\n`, { flag: 'wx' });
  const outputPath = path.join(out, 's7.json');
  await writeFile(outputPath, `${JSON.stringify(stage, null, 2)}\n`, { flag: 'wx' });
  return stage;
}
