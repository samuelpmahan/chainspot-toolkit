/** Fixed Lenard5 file-only experiment. Default OFF; no production/default wiring. */
import { openSync, fstatSync, readSync, closeSync, constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeBytes, decodeBytes } from '../station-evidence/codec.mjs';
import { verifySourceClosure } from '../station-evidence/recipe.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const own = (value, key) => Object.hasOwn(value, key);
const detached = value => decodeBytes(encodeBytes(value));
const ROOT = new URL('./', import.meta.url);
const PROTOCOL = 'cb4d757f36ffe6721e71541d6093a48cc11e081bd10c1684746aad8249973829';
const ATTESTATION = '9f1cb90eed3c74214c9a03029730ea1ab487c48bd86b89cbe3a701eebe923ef1';
const RGBA = '4379abb30a5b0907aa0e1435b13e19eafe8fdd31ac57c9b8bdff4495a14fdc2a';
const PNG = '30fa01879840deb0584ffe001fa39779998710010faeae93510dbc7a8a0abe6e';
const MASK_SHA = '305285b7e2bc9d44dfd572caa8d39030ed1b0c2254c15967fbb9b7bff7fae609';
const FRAME = 'Lenard-5.original-source-pixel-centers';
const SOURCE_REF = '49255331791b1245cf0f9cd699816175f94e70f2';
const SOURCE_BLOB = '78a4345489a5544640859127cd79f5a06bf9f21b';
const WIDTH = 1290, HEIGHT = 2796, PIXELS = 3606840, RGBA_BYTES = 14427360;
const RASTER = 'px.image.cropped', MASK = 'tk.s6.pathMask';
const CONSTANT = 'fn.input.lenard5StationMeasurement', CALLER = 'cycle06-lenard5-station-measurement';
const GROUPS = Object.freeze([
  Object.freeze(['primary',780,906,false]),
  Object.freeze(['bright-nonpath',780,740,false]),
  Object.freeze(['normal-plus6',781.223725524672,911.8738825184256,false]),
  Object.freeze(['masked-primary',780,906,true])
]);
const WINDOWS = Object.freeze([
  Object.freeze(['before16',-24,-8]), Object.freeze(['core16',-8,8]),
  Object.freeze(['after16',8,24]), Object.freeze(['long48',-24,24])
]);
const LEGACY_RUNTIME = Object.freeze([
  Object.freeze(['../station-evidence/codec.mjs','3cba80fa24f1ff9ae30f5a24fbcc8c4b29944304a03447252d6172448fdd7015']),
  Object.freeze(['../station-evidence/cli.mjs','4ca8c6065698f49bf6d13766764e298f0edcfde55e720a830e1e3b78223ec04c']),
  Object.freeze(['../station-evidence/recipe.mjs','ef7248daf5c83fd014c4a5004aa511e41399492a46be0460fe566ab421383ad3'])
]);

class PresetError extends Error {
  constructor(code, phase, message, comparisonId = null, planIndex = null) {
    super(message); this.name = 'Lenard5EvidenceError';
    Object.assign(this, { code, phase, comparisonId, planIndex });
  }
}
const fail = (message, code = 'INVALID_REQUEST', phase = 'validation') => { throw new PresetError(code, phase, message); };
function projectError(error, code = 'INVALID_REQUEST', phase = 'validation', comparisonId = null, planIndex = null) {
  return {
    code:error instanceof PresetError ? error.code : code,
    phase:error instanceof PresetError ? error.phase : phase,
    name:String(error?.name ?? 'Error'), message:String(error?.message ?? error).slice(0,4096),
    comparisonId:error?.comparisonId ?? comparisonId, planIndex:error?.planIndex ?? planIndex
  };
}
function fields(value, keys) {
  if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) fail('ordinary object required');
  const found = Reflect.ownKeys(value); // Small metadata ONLY. Never a pixel/mask plane.
  if (found.length !== keys.length || found.some(key => typeof key !== 'string' || !keys.includes(key))) fail('unsupported/missing fields');
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !own(descriptor, 'value') || !descriptor.enumerable || descriptor.value === undefined) fail('own enumerable data fields required');
  }
}
function pathString(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 4096 || value.includes('\0')) fail('nonempty bounded path string required');
  return value;
}
function isEnabled(input) {
  if (input === null || (typeof input !== 'object' && typeof input !== 'function')) return false;
  const descriptor = Object.getOwnPropertyDescriptor(input, 'enabled');
  if (!descriptor) return false;
  if (!own(descriptor, 'value') || typeof descriptor.value !== 'boolean') fail('enabled must be own boolean data');
  return descriptor.value;
}
function validateRequest(input) {
  if (!isEnabled(input)) return null;
  fields(input, ['schema','enabled','manifestPath']);
  if (input.schema !== 'cycle06-lenard5-request@1') fail('unsupported request schema');
  return { schema:input.schema, enabled:true, manifestPath:resolve(pathString(input.manifestPath)) };
}

/** Bounded regular-file read, with no Buffer/typed-key enumeration or growing readFileSync. */
function readBounded(path, maxBytes, exactBytes = null, expectedSha256 = null, mismatchCode = 'INPUT_HASH_MISMATCH') {
  let descriptor;
  try {
    // NONBLOCK makes a FIFO refuse at fstat rather than waiting for a writer.
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
    const stat = fstatSync(descriptor);
    if (!stat.isFile()) fail('regular input file required', 'INPUT_FILE_INVALID', 'file-read');
    const length = stat.size;
    if (!Number.isSafeInteger(length) || length < 0 || length > maxBytes || (exactBytes !== null && length !== exactBytes)) {
      fail('input byte length refused', 'INPUT_LENGTH_MISMATCH', 'file-read');
    }
    // Created here; not an externally decorated/subclassed byte plane.
    const bytes = new Uint8Array(length);
    let position = 0;
    while (position < length) {
      const count = readSync(descriptor, bytes, position, length-position, position);
      if (count === 0) fail('input truncated while reading', 'INPUT_LENGTH_MISMATCH', 'file-read');
      position += count;
    }
    if (readSync(descriptor, new Uint8Array(1), 0, 1, length) !== 0) fail('input grew while reading', 'INPUT_LENGTH_MISMATCH', 'file-read');
    const sha256 = sha(bytes);
    if (expectedSha256 !== null && sha256 !== expectedSha256) fail('actual input digest mismatch', mismatchCode, 'file-hash');
    return { bytes, binding:{ path, bytes:length, sha256 } };
  } catch (error) {
    if (error instanceof PresetError) throw error;
    throw new PresetError('INPUT_READ_FAILED','file-read',String(error?.message ?? error));
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}
function parseJSON(loaded) {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal:true }).decode(loaded.bytes)); }
  catch (error) { throw new PresetError('INVALID_INPUT_JSON','file-parse',String(error?.message ?? error)); }
}

/** Detached fixed metadata only. No bytes, source reads, vendor or store. */
export function lenard5Declarations() {
  return GROUPS.flatMap(([groupId,x,y,masked]) => WINDOWS.map(([windowId,t0Px,t1Px]) => ({
    id:`${groupId}/${windowId}`, groupId, windowId, imageId:'Lenard-5', frame:FRAME,
    widthPx:WIDTH, heightPx:HEIGHT, rgbaSha256:RGBA,
    mask:masked ? { kind:'Uint8Array', bytes:PIXELS, sha256:MASK_SHA } : null,
    originPx:[x,y], phiRad:-0.20539538918976738, t0Px,t1Px,stepPx:1,widthsPx:[34,42,50]
  })));
}
export function planLenard5Queries() {
  const plans = [];
  const push = (comparison, widthPx, name, rawArgs) => plans.push({
    planIndex:plans.length, comparisonId:comparison.id, groupId:comparison.groupId,
    windowId:comparison.windowId, widthPx, query:`fn.q.path.${name}`, rawArgs
  });
  for (const c of lenard5Declarations()) {
    const base = () => ({ raster:RASTER,mask:MASK,originPx:[...c.originPx],phiRad:c.phiRad,t0Px:c.t0Px,t1Px:c.t1Px,stepPx:c.stepPx });
    push(c,null,'profile',{ ...base(),lat0Px:0 });
    for (const widthPx of c.widthsPx) {
      push(c,widthPx,'edgePair',{ ...base(),lat0Px:0,widthPx,tolPx:2,latLimPx:12,minOk:{count:8,ofStations:0.2} });
      push(c,widthPx,'stationContrast',{ ...base(),widthPx,bandPx:[1,3],alongPx:2 });
      push(c,widthPx,'loss',{ ...base(),widthPx,profile:null,threshold:null,tauLum:8 });
    }
  }
  return plans;
}
function resourcePlan() {
  let declaredComparisonInputByteSum = 0;
  for (const c of lenard5Declarations()) {
    const N = Math.ceil((c.t1Px-c.t0Px)/c.stepPx), B = c.widthsPx.length;
    const modeled = [WIDTH*HEIGHT,WIDTH*HEIGHT*4,N,(1+B)*N*241,2*B*N*100,N*101*3,PIXELS*13];
    if (!modeled.every(Number.isSafeInteger) || modeled[0] !== PIXELS || modeled[1] !== RGBA_BYTES ||
        N > 48 || modeled[3] > 46272 || modeled[4] > 28800 || modeled[5] > 14544 || modeled[6] > 52000000) {
      fail('fixed allocation/work plan exceeded','RESOURCE_LIMIT','resource-plan');
    }
    declaredComparisonInputByteSum += RGBA_BYTES + (c.mask === null ? 0 : PIXELS);
  }
  if (declaredComparisonInputByteSum !== 245265120) fail('fixed input reference sum mismatch','RESOURCE_LIMIT','resource-plan');
  return {
    declaredComparisonInputByteSum, canonicalPlaneBytes:18034200, aggregateNativeAnswerTypedBytes:294912,
    maxComparisonProfileGridVisits:46272, maxComparisonContrastGridVisits:28800,
    maxLossCorridorRGBBytes:14544,
    qualification:'source-derived selected allocations/work only; not measured RSS, peak memory or timing',
    codecCaps:{maxDepth:32,maxNodes:500000,maxTypedBytes:1000000,maxBytes:33554432,sidecarMaxBytes:4194304}
  };
}
function loadFiles(request) {
  const manifestFile = readBounded(request.manifestPath,8192);
  const manifest = parseJSON(manifestFile);
  fields(manifest,['schema','enabled','protocolId','protocolPath','inputAttestationPath']);
  if (manifest.schema !== 'cycle06-lenard5-files@1' || manifest.enabled !== true || manifest.protocolId !== 'lenard5-fixed16') {
    fail('only exact enabled lenard5-fixed16 file manifest admitted','PROTOCOL_MISMATCH','manifest');
  }
  const fromManifest = path => resolve(dirname(request.manifestPath),pathString(path));
  const protocolFile = readBounded(fromManifest(manifest.protocolPath),131072,12718,PROTOCOL,'PROTOCOL_MISMATCH');
  const attestationFile = readBounded(fromManifest(manifest.inputAttestationPath),131072,4252,ATTESTATION);
  const attestation = parseJSON(attestationFile);
  // Exact document digest protects ALL testimony, including decoder metadata and absolute paths.
  if (attestation.schema !== 'cycle06-exact-input-attestation@1' || attestation.sourceRef !== SOURCE_REF ||
      attestation.gitBlob !== SOURCE_BLOB || attestation.protocol?.sha256 !== PROTOCOL ||
      attestation.image?.width !== WIDTH || attestation.image?.height !== HEIGHT || attestation.image?.frame !== FRAME) {
    fail('pinned attestation linkage mismatch','INPUT_HASH_MISMATCH','attestation');
  }
  const specs = [
    ['png',attestation.sourcePng,3943106,PNG],
    ['rgba',attestation.fullRgba,RGBA_BYTES,RGBA],
    ['mask',attestation.mask,PIXELS,MASK_SHA]
  ];
  const files = [
    { role:'disk-manifest',...manifestFile.binding },
    { role:'protocol',...protocolFile.binding },
    { role:'input-attestation',...attestationFile.binding }
  ];
  let rgba, mask;
  for (const [role,entry,length,digest] of specs) {
    if (!entry || entry.bytes !== length || entry.sha256 !== digest) fail('pinned raw/encoded declaration mismatch','INPUT_HASH_MISMATCH','attestation');
    const loaded = readBounded(resolve(dirname(attestationFile.binding.path),pathString(entry.path)),length,length,digest);
    files.push({role,...loaded.binding});
    if (role === 'rgba') rgba = loaded.bytes;
    if (role === 'mask') {
      for (const value of loaded.bytes) if (value !== 0 && value !== 1) fail('nonbinary mask','INVALID_MASK','file-validation');
      mask = loaded.bytes;
    }
    // PNG body is hash checked, not decoded, and is not retained or emitted.
  }
  return {
    rgba,mask,files,resource:resourcePlan(),
    decoderTestimony:detached(attestation.provenance.decoder),
    stagingImplementation:detached(attestation.strictDecoder.implementation),
    request, declarations:lenard5Declarations(), plannedQueries:planLenard5Queries()
  };
}
function requestBinding(valid) {
  return {
    protocolId:'lenard5-fixed16',protocolSha256:PROTOCOL,attestationSha256:ATTESTATION,
    schema:'cycle06-lenard5-request-binding@1',request:detached(valid.request),
    comparisons:detached(valid.declarations),suppliedFiles:detached(valid.files),
    sourceOriginal:{ref:SOURCE_REF,path:'specimens/dev/Lenard-5.png',gitBlob:SOURCE_BLOB,frame:FRAME},
    encodedFileVerification:{verified:true,sha256:PNG,bytes:3943106,meaning:'actual file hash, no in-run PNG decode'},
    rawStageVerification:{verified:true,sha256:RGBA,bytes:RGBA_BYTES,meaning:'actual raw file hash; correspondence is independently reviewed staging testimony'},
    decoderTestimony:detached(valid.decoderTestimony),stagingImplementation:detached(valid.stagingImplementation),
    maskPolicy:{nullComparisons:12,explicitMaskComparisons:4,maskSha256:MASK_SHA,meaning:'caller synthetic visibility, not detected physical occlusion'},
    settings:{profile:{lat0Px:0},edgePair:{tolPx:2,latLimPx:12,minOk:{count:8,ofStations:0.2}},
      stationContrast:{bandPx:[1,3],alongPx:2},loss:{profile:null,threshold:null,tauLum:8}},
    predictedOnly:{stores:16,PATHQueries:160,constants:16,CalculationEntries:176,perStoreCallbackSeq:[1,0,2,3,4,5,6,7,8,9,10]},
    resourcePlan:detached(valid.resource)
  };
}

/** NONCV file/hash preflight. It never imports vendor, creates stores or returns planes. */
export function inspectLenard5Request(input) {
  try {
    const request = validateRequest(input);
    if (!request) return {status:'DISABLED',error:null,requestBinding:null,plannedQueries:[]};
    const valid = loadFiles(request);
    return {status:'READY',error:null,requestBinding:requestBinding(valid),plannedQueries:valid.plannedQueries};
  } catch (error) {
    return {status:'NOT_EXECUTED',error:projectError(error),requestBinding:null,plannedQueries:[]};
  }
}
function interval(intervals, phase, extra, fn) {
  const start = performance.now();
  try { return fn(); }
  finally { const end = performance.now(); intervals.push({phase,...extra,start,end,elapsed:end-start,nondeterministic:true}); }
}
async function asyncInterval(intervals, phase, fn) {
  const start = performance.now();
  try { return await fn(); }
  finally { const end = performance.now(); intervals.push({phase,start,end,elapsed:end-start,nondeterministic:true}); }
}
function runtimeHashes() {
  const entries = [
    ...['recipe.mjs','cli.mjs'].map(path => [path,null]),
    ...LEGACY_RUNTIME
  ].map(([relative,expectedSha256]) => {
    const path = fileURLToPath(new URL(relative,ROOT));
    const loaded = readBounded(path,131072);
    return {path,expectedSha256,actualSha256:loaded.binding.sha256,bytes:loaded.binding.bytes};
  });
  if (entries.some(e => e.expectedSha256 !== null && e.expectedSha256 !== e.actualSha256)) {
    fail('frozen codec/writer/recipe bytes changed','SOURCE_HASH_MISMATCH','runtime-source');
  }
  return entries;
}
function sameRuntime(a,b) {
  return a.length === b.length && a.every((entry,index) => entry.path === b[index].path && entry.bytes === b[index].bytes && entry.actualSha256 === b[index].actualSha256);
}
function snapshot(valid,metadata,index) {
  const rgba = Uint8Array.from(valid.rgba);
  const maskBytes = metadata.mask === null ? null : Uint8Array.from(valid.mask);
  const pre = {rgbaSha256:sha(rgba),maskSha256:maskBytes === null ? null : sha(maskBytes)};
  if (pre.rgbaSha256 !== RGBA || pre.maskSha256 !== (metadata.mask === null ? null : MASK_SHA)) {
    throw new PresetError('SNAPSHOT_HASH_MISMATCH','snapshot','private copied inputs differ',metadata.id);
  }
  return {
    rgba,maskBytes,pre,raster:Object.freeze({widthPx:WIDTH,heightPx:HEIGHT,rgba}),
    mask:maskBytes === null ? null : Object.freeze({widthPx:WIDTH,heightPx:HEIGHT,mask:maskBytes}),
    identity:{snapshotId:`lenard5-fixed16/${index}/${metadata.id}`,comparisonId:metadata.id,frame:FRAME,
      widthPx:WIDTH,heightPx:HEIGHT,rgbaSha256:pre.rgbaSha256,
      maskKind:maskBytes === null ? null : 'Uint8Array',maskSha256:pre.maskSha256,
      partKeys:{[RASTER]:null,[MASK]:null}}
  };
}
const hashPrivate = s => ({rgbaSha256:sha(s.rgba),maskSha256:s.maskBytes === null ? null : sha(s.maskBytes)});
const sameHashes = (a,b) => a.rgbaSha256 === b.rgbaSha256 && a.maskSha256 === b.maskSha256;
function rootResult() {
  return {
    valueTrace:{schema:'cycle06-lenard5-trace@1',protocolId:null,protocolSha256:null,status:'DISABLED',error:null,
      requestBinding:null,sourceBinding:null,plannedQueries:[],queryTrace:[],
      counts:{requestedPATH:0,attemptedPATH:0,completedPATH:0,failedPATH:0,capturedCalculationEntries:0,capturedConstantEntries:0,capturedPATHEntries:0},
      inputIntegrity:{suppliedPlanes:null,snapshots:[],postFiles:[],request:null,postErrors:[]},
      claims:{promoted:false,heldout:false,pathIdentity:'UNKNOWN',physicalEdgeIdentity:'UNKNOWN',calibratedWidth:'UNKNOWN',
        geometryScientificIdentity:'UNKNOWN',scientificAcceptance:'UNKNOWN',humanAcceptance:'UNKNOWN',
        continuity:'UNKNOWN',tau8:'historical native diagnostic',overlay:'WHITE brightness proxy, not alpha; threshold:null',
        dependence:'same exposed image and overlapping supports; not independent confidence',historicalLimit:'synthetic capsule/intact collision retained'}},
    sidecar:{schema:'cycle06-lenard5-sidecar@1',protocolId:null,status:'DISABLED',error:null,
      runtime:{node:process.version,platform:process.platform,arch:process.arch,clock:'node:perf_hooks.performance.now',nondeterministic:true},
      intervals:[],calculationLog:[]},
    fragments:{answers:[],calculationEntries:[]}
  };
}

/** Only this enabled route can import the unchanged gateway and attempt the fixed160 requests. */
export async function runLenard5Evidence(input) {
  const result = rootResult(), trace = result.valueTrace, sidecar = result.sidecar, counts = trace.counts;
  let request = null,valid = null,phase = 'validation',firstSnapshot = null,firstIntegrity = null;
  const setFailure = (error,code = 'INVALID_REQUEST',at = phase,comparisonId = null,planIndex = null) => {
    const projected = projectError(error,code,at,comparisonId,planIndex);
    trace.error ??= projected;
    const terminal = trace.error.code;
    trace.status = terminal.includes('MUTATION') || terminal.includes('HASH_MISMATCH') ? 'INTEGRITY_FAILED' :
      terminal === 'ENCODING_FAILED' ? 'ENCODING_FAILED' : counts.attemptedPATH ? 'PARTIAL_FAILED' : 'NOT_EXECUTED';
    return projected;
  };
  const integrityFor = (s,id) => {
    const record = {comparisonId:id,snapshotId:s.identity.snapshotId,pre:s.pre,checks:[],post:null,verified:null,partKeys:null,error:null};
    trace.inputIntegrity.snapshots.push(record);
    return record;
  };
  const postError = error => {
    const projected = setFailure(error,'POST_INPUT_MUTATION','post-run');
    trace.inputIntegrity.postErrors.push(projected);
    return projected;
  };
  try {
    // Deliberately no intervals/source/pixel access before the own enabled descriptor.
    if (!isEnabled(input)) return result;
    request = interval(sidecar.intervals,'validation',{},() => validateRequest(input));
    phase = 'file-preflight';
    valid = interval(sidecar.intervals,'file-preflight',{},() => loadFiles(request));
    trace.protocolId = sidecar.protocolId = 'lenard5-fixed16';
    trace.protocolSha256 = PROTOCOL;
    trace.requestBinding = requestBinding(valid);
    trace.plannedQueries = valid.plannedQueries;
    trace.queryTrace = valid.plannedQueries.map(plan => ({
      planIndex:plan.planIndex,comparisonId:plan.comparisonId,state:'NOT_ATTEMPTED',resolvedIdentity:null,nativeAnswer:null,error:null
    }));
    counts.requestedPATH = valid.plannedQueries.length;
    trace.inputIntegrity.suppliedPlanes = {pre:{rgbaSha256:sha(valid.rgba),maskSha256:sha(valid.mask)},post:null,verified:null};
    phase = 'snapshot';
    firstSnapshot = interval(sidecar.intervals,'snapshot',{comparisonId:valid.declarations[0].id},() => snapshot(valid,valid.declarations[0],0));
    firstIntegrity = integrityFor(firstSnapshot,valid.declarations[0].id);
    phase = 'source-verify';
    const beforeImport = interval(sidecar.intervals,'source-verify-before-import',{},verifySourceClosure);
    trace.sourceBinding = {
      beforeImport,afterImport:null,afterRun:null,implementationBefore:null,implementationAfterImport:null,implementationAfterRun:null,
      importCaching:'host ESM cache; source hashes do not authenticate execution or defeat concurrent replacement',
      renderer:null
    };
    if (!beforeImport.verified) fail('nine-module source closure differs','SOURCE_HASH_MISMATCH','source-verify-before-import');
    trace.sourceBinding.implementationBefore = runtimeHashes();
    phase = 'import';
    const [{createPartStore,registerQueries},{PATH_QUERIES}] = await asyncInterval(sidecar.intervals,'import',() => Promise.all([
      import('../probes/root-inventory/source/fg/store.mjs'),
      import('../probes/width/vendor/active/ports/s6straight/pathSpace.mjs')
    ]));
    const afterImport = interval(sidecar.intervals,'source-verify-after-import',{},verifySourceClosure);
    trace.sourceBinding.afterImport = afterImport;
    trace.sourceBinding.implementationAfterImport = runtimeHashes();
    if (!afterImport.verified || !sameRuntime(trace.sourceBinding.implementationBefore,trace.sourceBinding.implementationAfterImport)) {
      fail('source changed during import','SOURCE_HASH_MISMATCH','source-verify-after-import');
    }
    // Each invocation holds the only reachable private comparison store/raster/mask.
    // No store, input Part, private buffer or cached-answer reference escapes.
    const compare = (metadata,index,s,integrity) => {
      const id = metadata.id;
      let captureIndex = 0;
      if (!sameHashes(hashPrivate(s),s.pre)) throw new PresetError('SNAPSHOT_HASH_MISMATCH','before-first-call','private input changed',id);
      try {
        phase = 'registration';
        const store = createPartStore({base:null,name:id,onCall:entry => {
          let bytes;
          const capture = {comparisonId:id,captureIndex:captureIndex++,nativeEntry:entry};
          try { bytes = encodeBytes(capture,{maxBytes:4194304}); }
          catch (error) { throw new PresetError('ENCODING_FAILED','onCall',String(error.message),id); }
          const copy = decodeBytes(bytes,{maxBytes:4194304});
          sidecar.calculationLog.push(copy);
          result.fragments.calculationEntries.push({comparisonId:id,captureIndex:copy.captureIndex,bytes});
          counts.capturedCalculationEntries++;
          if (entry.calculation === CONSTANT) counts.capturedConstantEntries++;
          if (entry.calculation.startsWith('fn.q.path.')) counts.capturedPATHEntries++;
        }});
        // A null MASK is a real lazily produced Part value, never missing/zero.
        store.constant(CONSTANT,{[RASTER]:s.raster,[MASK]:s.mask});
        registerQueries(store,PATH_QUERIES);
        for (const plan of valid.plannedQueries.slice(index*10,index*10+10)) {
          const row = trace.queryTrace[plan.planIndex];
          row.resolvedIdentity = detached(s.identity);
          counts.attemptedPATH++;
          phase = 'query';
          try {
            const answer = interval(sidecar.intervals,'query',{comparisonId:id,planIndex:plan.planIndex,query:plan.query},
              () => store.call(plan.query,detached(plan.rawArgs),{caller:CALLER}));
            if (answer && typeof answer.then === 'function') throw new PresetError('QUERY_THROW','query','unexpected asynchronous answer',id,plan.planIndex);
            counts.completedPATH++; row.state = 'COMPLETED';
            let bytes;
            try { bytes = encodeBytes(answer); }
            catch (error) { throw new PresetError('ENCODING_FAILED','answer-encode',String(error.message),id,plan.planIndex); }
            result.fragments.answers.push({comparisonId:id,planIndex:plan.planIndex,bytes});
            row.nativeAnswer = decodeBytes(bytes);
          } catch (error) {
            if (row.state !== 'COMPLETED') { row.state = 'THREW'; counts.failedPATH++; }
            row.error = setFailure(error,'QUERY_THROW','query',id,plan.planIndex);
            throw new PresetError(row.error.code,row.error.phase,row.error.message,id,plan.planIndex);
          } finally {
            const post = hashPrivate(s),verified = sameHashes(s.pre,post);
            integrity.checks.push({planIndex:plan.planIndex,post,verified});
            // provenance is read-only and does not force lazy materialization.
            for (const address of [RASTER,MASK]) s.identity.partKeys[address] = store.provenance(address)?.key ?? null;
            row.resolvedIdentity = detached(s.identity);
            if (!verified) {
              const error = new PresetError('SNAPSHOT_HASH_MISMATCH','post-query','private input changed',id,plan.planIndex);
              postError(error); throw error;
            }
          }
        }
      } finally {
        integrity.post = hashPrivate(s);
        integrity.verified = sameHashes(integrity.pre,integrity.post);
        integrity.partKeys = {...s.identity.partKeys};
        if (!integrity.verified) {
          const error = new PresetError('SNAPSHOT_HASH_MISMATCH','post-comparison','private input changed',id);
          integrity.error = postError(error); throw error;
        }
      }
    };
    for (let index = 0; index < valid.declarations.length; index++) {
      const metadata = valid.declarations[index];
      phase = 'snapshot';
      const s = index === 0 ? firstSnapshot : interval(sidecar.intervals,'snapshot',{comparisonId:metadata.id},() => snapshot(valid,metadata,index));
      const integrity = index === 0 ? firstIntegrity : integrityFor(s,metadata.id);
      firstSnapshot = null;
      compare(metadata,index,s,integrity);
    }
    trace.status = 'COMPLETED';
  } catch (error) {
    setFailure(error,phase === 'import' ? 'IMPORT_FAILED' : phase.startsWith('source') ? 'SOURCE_HASH_MISMATCH' : 'INVALID_REQUEST',phase);
  } finally {
    // If import/preflight after first snapshot failed, that unused snapshot is still checked.
    if (firstSnapshot && firstIntegrity) {
      try {
        firstIntegrity.post = hashPrivate(firstSnapshot);
        firstIntegrity.verified = sameHashes(firstIntegrity.pre,firstIntegrity.post);
        firstIntegrity.partKeys = {...firstSnapshot.identity.partKeys};
        if (!firstIntegrity.verified) throw new PresetError('SNAPSHOT_HASH_MISMATCH','post-run','unused first snapshot changed');
      } catch (error) { firstIntegrity.error = postError(error); }
    }
    firstSnapshot = null;
    if (valid) {
      try {
        const planes = trace.inputIntegrity.suppliedPlanes;
        planes.post = {rgbaSha256:sha(valid.rgba),maskSha256:sha(valid.mask)};
        planes.verified = sameHashes(planes.pre,planes.post);
        if (!planes.verified) throw new PresetError('POST_INPUT_MUTATION','post-run','canonical supplied planes changed');
      } catch (error) { postError(error); }
      // Rehash each actual original file once; only its identity, never body, escapes.
      for (const entry of valid.files) {
        const checked = {role:entry.role,path:entry.path,expectedSha256:entry.sha256,actualSha256:null,verified:false,error:null};
        trace.inputIntegrity.postFiles.push(checked);
        try {
          const loaded = readBounded(entry.path,entry.bytes,entry.bytes,entry.sha256,'POST_INPUT_MUTATION');
          checked.actualSha256 = loaded.binding.sha256; checked.verified = true;
        } catch (error) {
          checked.refusal = projectError(error);
          checked.error = postError(new PresetError('POST_INPUT_MUTATION','post-file',String(error?.message ?? error)));
        }
      }
      if (trace.sourceBinding) {
        try {
          const post = interval(sidecar.intervals,'source-verify-after-run',{},verifySourceClosure);
          trace.sourceBinding.afterRun = post;
          trace.sourceBinding.implementationAfterRun = runtimeHashes();
          if (!post.verified || !sameRuntime(trace.sourceBinding.implementationBefore,trace.sourceBinding.implementationAfterRun)) {
            throw new PresetError('POST_SOURCE_MUTATION','post-run','source closure changed after attempted run');
          }
        } catch (error) { postError(error); }
      }
    }
    if (request) {
      try {
        const after = validateRequest(input);
        const verified = after !== null && after.schema === request.schema && after.manifestPath === request.manifestPath && after.enabled === request.enabled;
        trace.inputIntegrity.request = {verified,error:null};
        if (!verified) throw new PresetError('POST_REQUEST_MUTATION','post-run','small request metadata changed');
      } catch (error) {
        trace.inputIntegrity.request = {verified:false,refusal:projectError(error),
          error:postError(new PresetError('POST_REQUEST_MUTATION','post-run',String(error?.message ?? error)))};
      }
    }
    sidecar.status = trace.status; sidecar.error = trace.error;
  }
  return result;
}
