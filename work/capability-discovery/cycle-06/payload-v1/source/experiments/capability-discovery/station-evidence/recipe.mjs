/** Fixed synthetic8 registered-query experiment. Default OFF; no production wiring. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { encodeBytes, decodeBytes } from './codec.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const own = (v, k) => Object.hasOwn(v, k);
const PROTOCOL = '3b7f1d2b166c759997c73f820c433ff653c84114e83c28af62c68ec003967ff5';
const PROTOCOL_PATH = 'discovery-cycle05/F4/E1102/protocol.json';
const FRAME = 'cycle05-F4-synthetic384x320-integer-pixel-centers';
const CALLER = 'cycle05-station-measurement';
const CONSTANT = 'fn.input.stationMeasurement';
const RASTER = 'px.image.cropped', MASK = 'tk.s6.pathMask';
const CASES = Object.freeze([
  ['intact','intact','clear',160], ['gap2','gap2','clear',160], ['gap6','gap6','clear',160],
  ['largeBrightEllipse','ellipse','clear',160], ['organicCapsule','capsule','clear',160],
  ['normalOffsetPlus6','intact','clear',166], ['maskedGap6','gap6','gap6',160], ['allHidden','intact','allHidden',160]
].map(row => Object.freeze(row)));
const RASTER_HASHES = Object.freeze({
  intact:'e6648f24c1616297317cb2f6062317ba83ab2c4949e5d4d22568f07b05cf1c7a',
  gap2:'87c0ad2feaa151e91fcae975ef406127191f1b0f6cb7d5c369c057ed87bebec0',
  gap6:'103f9e66febf38864142faa6aaa42a38c89a28a3f7625a3f45073a96f51ea42f',
  ellipse:'61e2b22c86e374ed554cbc3d9a95be277b9258d578bb7d10aa3fb0257ca34468',
  capsule:'e0308d74a0b672eeae242c4df4018c343df93ea6a595fb25449fd730bc0e4d72'
});
const MASK_HASHES = Object.freeze({
  clear:'6d7bd1fa33ee71b2d2c4fc8062f6c4b09804b84449ff73a687fe7cfd568d0625',
  gap6:'30207778746e6e497de8196f270dad9227d6cb368968435a748e357d08f58ad0',
  allHidden:'a32194817413b4fcf784d7579edb733c098ac8fec4d893ec13c78f1f50046bf3'
});
export const SOURCE_MODULES = Object.freeze([
  ['width/vendor/active/ports/s6straight/pathSpace.mjs','d0fb2bf5076a386a5c362b8fe034ab49ba5318fda2bd21eb74d30334ed6a105e'],
  ['width/vendor/active/contracts/alpha.profile@1.mjs','9d1f316af6af2887e0c59bd7a2b0bc13d3305a817cfb6efffb42c8f3b238396f'],
  ['root-inventory/source/fg/store.mjs','122d624e0311e18f596db37bf292d9c31f47a364e75c8808ca6788c3449a3074'],
  ['root-inventory/source/fg/pxset.mjs','01e68e82741d4af56901b3306a304ca540e8ab0d73a12ba20a0afbe0e788f5d5'],
  ['root-inventory/source/fg/render.mjs','39a24a645c222430464592546eb6bdc1a8b190902ed5708ecd951b0bb639315a'],
  ['root-inventory/source/fg/canon.mjs','3cc0319f4678eaf8679adcbfaa9db054841417a966c079019b0f72e24ba24406'],
  ['root-inventory/source/fg/png.mjs','7668bab9de6a19a2cc6f44e5ac47d6e89373da130764365cf32011187a980241'],
  ['root-inventory/source/fg/alpha/alphaRender.mjs','4d17e1da77b1e5ceb6a4a2609d26c010caa6c43df8392e9599544299d9e1c549'],
  ['root-inventory/source/contracts/alpha.profile@1.mjs','9d1f316af6af2887e0c59bd7a2b0bc13d3305a817cfb6efffb42c8f3b238396f']
].map(([path, sha256]) => Object.freeze({ path, sha256 })));
export const SYNTHETIC_PROFILE = Object.freeze({
  protocolId:'synthetic8', protocolSha256:PROTOCOL, protocolPath:PROTOCOL_PATH,
  inventorySha256:'c103c508e5cb8668bbc5069620046c3f5b2c3eea05d018af9d17169e308529aa',
  frame:FRAME, widthPx:384, heightPx:320,
  predictedOnly:Object.freeze({ PATHQueries:32, constants:8, CalculationEntries:40, stores:8 })
});

class RecipeError extends Error {
  constructor(code, phase, message, comparisonId = null, planIndex = null) {
    super(message); this.name = 'StationEvidenceError';
    Object.assign(this, { code, phase, comparisonId, planIndex });
  }
}
const bad = (message, code = 'INVALID_REQUEST', phase = 'validation') => { throw new RecipeError(code, phase, message); };
const plain = v => v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;
function fields(v, keys) {
  if (!plain(v)) bad('ordinary object required');
  const found = Reflect.ownKeys(v);
  if (found.length !== keys.length || found.some(k => typeof k !== 'string' || !keys.includes(k))) bad('unsupported/missing object fields');
  for (const k of keys) {
    const d = Object.getOwnPropertyDescriptor(v, k);
    if (!d || !own(d, 'value') || !d.enumerable || d.value === undefined) bad('own enumerable data properties required');
  }
}
function dense(v, length) {
  if (!Array.isArray(v) || Object.getPrototypeOf(v) !== Array.prototype || v.length !== length || Reflect.ownKeys(v).length !== length + 1) bad('dense exact-length array required');
  for (let k = 0; k < length; k++) {
    const d = Object.getOwnPropertyDescriptor(v, String(k));
    if (!d || !own(d, 'value') || !d.enumerable) bad('array hole/accessor rejected');
  }
}
function bytePlane(v, expectedLength, binary = false) {
  if (!v || Object.getPrototypeOf(v) !== Uint8Array.prototype) bad('exact Uint8Array required; Buffer/subclass refused');
  const len = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'length').get.call(v);
  if (len !== expectedLength) bad('byte plane has wrong length');
  const keys = Reflect.ownKeys(v);
  if (keys.length !== len || keys.some((k, i) => k !== String(i))) bad('byte plane custom properties refused');
  if (binary && v.some(x => x !== 0 && x !== 1)) bad('mask bytes must be0/1');
}
function finiteExact(value, expected) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Object.is(value, -0) || value !== expected) bad('finite exact preset number required');
}
function projectError(error, code = 'INVALID_REQUEST', phase = 'validation', comparisonId = null, planIndex = null) {
  const message = String(error?.message ?? error);
  return {
    code:error?.code ?? code, phase:error?.phase ?? phase, name:String(error?.name ?? 'Error'),
    message:message.length > 4096 ? `${message.slice(0,4060)} [truncated from ${message.length} chars]` : message,
    comparisonId:error?.comparisonId ?? comparisonId, planIndex:error?.planIndex ?? planIndex
  };
}
function enabled(input) {
  if (input === null || (typeof input !== 'object' && typeof input !== 'function')) return false;
  const d = Object.getOwnPropertyDescriptor(input, 'enabled');
  if (!d) return false;
  if (!own(d, 'value') || typeof d.value !== 'boolean') bad('enabled must be an own boolean data property');
  return d.value;
}

/** Caller-visible fixed metadata only; no source reads, bytes, stores or queries. */
export function syntheticDeclarations() {
  return CASES.map(([id, imageId, maskId, y]) => ({
    id, frame:FRAME, imageId, widthPx:384, heightPx:320, rgbaSha256:RASTER_HASHES[imageId],
    mask:{ sha256:MASK_HASHES[maskId] }, originPx:[192,y], phiRad:0, t0Px:-8, t1Px:8, stepPx:1, widthsPx:[30],
    provenance:{ protocolPath:PROTOCOL_PATH, sourceKind:'synthetic-raw', encodedFile:null, decoderTestimony:null }
  }));
}
function makePlan(comparisons) {
  const plans = [];
  const push = (c, widthPx, query, rawArgs) => plans.push({ planIndex:plans.length, comparisonId:c.id, widthPx, query:`fn.q.path.${query}`, rawArgs });
  for (const c of comparisons) {
    const base = () => ({ raster:RASTER, mask:MASK, originPx:[...c.originPx], phiRad:c.phiRad, t0Px:c.t0Px, t1Px:c.t1Px, stepPx:c.stepPx });
    push(c, null, 'profile', { ...base(), lat0Px:0 });
    for (const widthPx of c.widthsPx) {
      push(c, widthPx, 'edgePair', { ...base(), lat0Px:0, widthPx, tolPx:3, latLimPx:12, minOk:{ count:8, ofStations:0.2 } });
      push(c, widthPx, 'stationContrast', { ...base(), widthPx, bandPx:[1,3], alongPx:2 });
      push(c, widthPx, 'loss', { ...base(), widthPx, profile:null, threshold:null, tauLum:8 });
    }
  }
  return plans;
}
export function planSyntheticQueries() { return makePlan(syntheticDeclarations()); }

function validate(input) {
  if (!enabled(input)) return null;
  fields(input, ['schema','enabled','protocolId','protocolSha256','comparisons']);
  if (input.schema !== 'cycle05-registered-station-request@1') bad('unsupported request schema');
  if (input.protocolId !== 'synthetic8' || input.protocolSha256 !== PROTOCOL) bad('only exact synthetic8 protocol admitted', 'PROTOCOL_MISMATCH');
  dense(input.comparisons, 8);
  const expected = syntheticDeclarations(), records = [];
  let aggregateBytes = 0;
  for (let i = 0; i < 8; i++) {
    const c = input.comparisons[i], e = expected[i];
    fields(c, ['id','frame','imageId','widthPx','heightPx','rgba','rgbaSha256','mask','originPx','phiRad','t0Px','t1Px','stepPx','widthsPx','provenance']);
    for (const k of ['id','frame','imageId']) if (typeof c[k] !== 'string' || !c[k].trim() || c[k].length > 160 || c[k] !== e[k]) bad('comparison order/frame/image linkage mismatch');
    for (const k of ['widthPx','heightPx','phiRad','t0Px','t1Px','stepPx']) finiteExact(c[k], e[k]);
    dense(c.originPx, 2); c.originPx.forEach((x, j) => finiteExact(x, e.originPx[j]));
    dense(c.widthsPx, 1); finiteExact(c.widthsPx[0], 30);
    const pixels = c.widthPx * c.heightPx, rgbaBytes = pixels * 4, N = Math.ceil((c.t1Px-c.t0Px)/c.stepPx), B = c.widthsPx.length;
    const modeled = [pixels, rgbaBytes, N, (1+B)*N*241, 2*B*N*100, N*(2*Math.ceil(30)+1)*3, pixels*13];
    if (!modeled.every(Number.isSafeInteger) || pixels > 4000000 || rgbaBytes > 16000000 || N > 48 || modeled[3] > 46272 || modeled[4] > 28800 || modeled[5] > 14544 || modeled[6] > 52000000) bad('safe allocation/work budget exceeded', 'RESOURCE_LIMIT');
    for (let k = 0; k < N; k++) if (!Number.isSafeInteger(c.t0Px+k) || (k && c.t0Px+k === c.t0Px+k-1)) bad('station representability refused', 'RESOURCE_LIMIT');
    bytePlane(c.rgba, rgbaBytes);
    fields(c.mask, ['data','sha256']); bytePlane(c.mask.data, pixels, true);
    if (c.rgbaSha256 !== e.rgbaSha256 || c.mask.sha256 !== e.mask.sha256) bad('frozen input digest declaration mismatch', 'INPUT_HASH_MISMATCH');
    fields(c.provenance, ['protocolPath','sourceKind','encodedFile','decoderTestimony']);
    for (const k of Object.keys(e.provenance)) if (c.provenance[k] !== e.provenance[k]) bad('unsupported synthetic provenance');
    aggregateBytes += rgbaBytes + pixels;
    if (!Number.isSafeInteger(aggregateBytes) || aggregateBytes > 300000000) bad('aggregate byte cap exceeded', 'RESOURCE_LIMIT');
    const pre = { rgbaSha256:sha(c.rgba), maskSha256:sha(c.mask.data) };
    if (pre.rgbaSha256 !== e.rgbaSha256 || pre.maskSha256 !== e.mask.sha256) bad('actual supplied input hash mismatch', 'INPUT_HASH_MISMATCH');
    // Only these private references retain caller buffers. Metadata is copied now.
    records.push({ metadata:e, suppliedRGBA:c.rgba, suppliedMask:c.mask.data, suppliedPre:pre });
  }
  return { records, declarations:expected, plannedQueries:makePlan(expected), aggregateBytes };
}
function requestBinding(valid) {
  const manifest = { schema:'cycle05-registered-station-request@1', protocolId:'synthetic8', protocolSha256:PROTOCOL, comparisons:valid.declarations };
  return { protocolId:'synthetic8', protocolSha256:PROTOCOL, protocolPath:PROTOCOL_PATH, protocolFileVerification:null,
    manifestSha256:sha(encodeBytes(manifest)), manifest, declaredInputByteSum:valid.aggregateBytes,
    settings:{ profile:{ lat0Px:0 }, edgePair:{ tolPx:3, latLimPx:12, minOk:{ count:8, ofStations:0.2 } }, stationContrast:{ bandPx:[1,3], alongPx:2 }, loss:{ profile:null, threshold:null, tauLum:8 } },
    predictedOnly:{ ...SYNTHETIC_PROFILE.predictedOnly }, suppliedFiles:[] };
}

/** Non-CV boundary inspection; does not import/query/create stores or expose buffers. */
export function inspectStationRequest(input) {
  try {
    const valid = validate(input);
    return valid ? { status:'READY', error:null, requestBinding:requestBinding(valid), plannedQueries:valid.plannedQueries }
      : { status:'DISABLED', error:null, requestBinding:null, plannedQueries:[] };
  } catch (error) { return { status:'NOT_EXECUTED', error:projectError(error), requestBinding:null, plannedQueries:[] }; }
}

/** Exact physical closure check only; no module is imported by this function. */
export function verifySourceClosure() {
  const entries = SOURCE_MODULES.map(s => {
    const entry = { path:`experiments/capability-discovery/probes/${s.path}`, expectedSha256:s.sha256, actualSha256:null, error:null };
    try { entry.actualSha256 = sha(readFileSync(new URL(`../probes/${s.path}`, import.meta.url))); }
    catch (error) { entry.error = projectError(error,'SOURCE_HASH_MISMATCH','source-read'); }
    return entry;
  });
  return { verified:entries.every(e => e.expectedSha256 === e.actualSha256), entries };
}
function ownSourceHashes() {
  return ['recipe.mjs','codec.mjs','cli.mjs'].map(path => ({ path:`experiments/capability-discovery/station-evidence/${path}`, sha256:sha(readFileSync(new URL(path, import.meta.url))) }));
}
const detached = value => decodeBytes(encodeBytes(value));
function interval(intervals, phase, extra, fn) {
  const start = performance.now();
  try { return fn(); }
  finally { const end = performance.now(); intervals.push({ phase, ...extra, start,end,elapsed:end-start,nondeterministic:true }); }
}
async function asyncInterval(intervals, phase, fn) {
  const start = performance.now();
  try { return await fn(); }
  finally { const end = performance.now(); intervals.push({ phase,start,end,elapsed:end-start,nondeterministic:true }); }
}
function rootResult() {
  return {
    valueTrace:{ schema:'cycle05-registered-station-trace@1', protocolId:null, protocolSha256:null, requestBinding:null, sourceBinding:null,
      status:'DISABLED', error:null, plannedQueries:[], queryTrace:[],
      counts:{ requestedPATH:0, attemptedPATH:0, completedPATH:0, failedPATH:0, capturedCalculationEntries:0, capturedConstantEntries:0, capturedPATHEntries:0 },
      inputIntegrity:{ supplied:[], snapshots:[], postErrors:[] },
      claims:{ promoted:false, pathIdentity:'UNKNOWN', physicalEdgeIdentity:'UNKNOWN', calibratedWidth:'UNKNOWN', scientificAcceptance:'UNKNOWN', humanAcceptance:'UNKNOWN', tau8:'historical native diagnostic', overlay:'WHITE brightness proxy, not alpha; threshold:null' } },
    sidecar:{ schema:'cycle05-registered-station-sidecar@1', protocolId:null,
      runtime:{ node:process.version, platform:process.platform, arch:process.arch, clock:'node:perf_hooks.performance.now', nondeterministic:true },
      intervals:[], calculationLog:[], status:'DISABLED', error:null },
    fragments:{ answers:[], calculationEntries:[] }
  };
}
function snapshot(record, index) {
  const { metadata:m } = record, rgba = Uint8Array.from(record.suppliedRGBA), maskBytes = Uint8Array.from(record.suppliedMask);
  const actual = { rgbaSha256:sha(rgba), maskSha256:sha(maskBytes) };
  if (actual.rgbaSha256 !== m.rgbaSha256 || actual.maskSha256 !== m.mask.sha256) throw new RecipeError('SNAPSHOT_HASH_MISMATCH','snapshot','copied bytes do not match frozen input',m.id);
  return { rgba, maskBytes, raster:Object.freeze({ widthPx:m.widthPx, heightPx:m.heightPx, rgba }),
    mask:Object.freeze({ widthPx:m.widthPx, heightPx:m.heightPx, mask:maskBytes }),
    identity:{ snapshotId:`synthetic8/${index}/${m.id}`, frame:m.frame, widthPx:m.widthPx, heightPx:m.heightPx,
      rgbaSha256:actual.rgbaSha256, maskKind:'Uint8Array', maskSha256:actual.maskSha256, partKeys:{ [RASTER]:null, [MASK]:null } }, pre:actual };
}
function hashPrivate(s) { return { rgbaSha256:sha(s.rgba), maskSha256:sha(s.maskBytes) }; }
function sameHashes(a,b) { return a.rgbaSha256 === b.rgbaSha256 && a.maskSha256 === b.maskSha256; }

/** Only this enabled entrypoint can import the frozen gateway and execute its fixed32 calls. */
export async function runStationEvidence(input) {
  const result = rootResult(), trace = result.valueTrace, sidecar = result.sidecar, { counts } = trace;
  let valid = null, phase = 'validation', firstSnapshot = null, firstIntegrity = null;
  const snapshotIntegrity = (s,id) => {
    const record = { comparisonId:id, snapshotId:s.identity.snapshotId, pre:s.pre, checks:[], post:null, verified:null, partKeys:null, error:null };
    trace.inputIntegrity.snapshots.push(record);
    return record;
  };
  const setFailure = (error, fallbackCode, fallbackPhase, comparisonId = null, planIndex = null) => {
    const projected = projectError(error, fallbackCode, fallbackPhase, comparisonId, planIndex);
    trace.error ??= projected;
    trace.status = projected.code.includes('MUTATION') || projected.code.includes('HASH_MISMATCH') ? 'INTEGRITY_FAILED'
      : projected.code === 'ENCODING_FAILED' ? 'ENCODING_FAILED' : counts.attemptedPATH ? 'PARTIAL_FAILED' : 'NOT_EXECUTED';
    return projected;
  };
  try {
    // Disabled is deliberately checked before timing or any unrelated property/source read.
    if (!enabled(input)) return result;
    valid = interval(sidecar.intervals, 'validation', {}, () => validate(input));
    trace.inputIntegrity.supplied = valid.records.map(r => ({ comparisonId:r.metadata.id, pre:r.suppliedPre, post:null, verified:null, error:null }));
    trace.protocolId = sidecar.protocolId = 'synthetic8'; trace.protocolSha256 = PROTOCOL;
    trace.requestBinding = requestBinding(valid);
    trace.plannedQueries = valid.plannedQueries;
    trace.queryTrace = valid.plannedQueries.map(p => ({ planIndex:p.planIndex, comparisonId:p.comparisonId, state:'NOT_ATTEMPTED', resolvedIdentity:null, nativeAnswer:null, error:null }));
    counts.requestedPATH = valid.plannedQueries.length;
    phase = 'snapshot';
    firstSnapshot = interval(sidecar.intervals, 'snapshot', { comparisonId:valid.records[0].metadata.id }, () => snapshot(valid.records[0],0));
    firstIntegrity = snapshotIntegrity(firstSnapshot,valid.records[0].metadata.id);
    phase = 'source-verify';
    const beforeImport = interval(sidecar.intervals, 'source-verify-before-import', {}, verifySourceClosure);
    trace.sourceBinding = { beforeImport, afterImport:null, afterRun:null, implementation:ownSourceHashes(), renderer:null, importCaching:'host ESM cache; not a source-byte attestation' };
    if (!beforeImport.verified) throw new RecipeError('SOURCE_HASH_MISMATCH',phase,'nine-module source closure mismatch before import');
    phase = 'import';
    const [{ createPartStore, registerQueries }, { PATH_QUERIES }] = await asyncInterval(sidecar.intervals, 'import', () => Promise.all([
      import('../probes/root-inventory/source/fg/store.mjs'), import('../probes/width/vendor/active/ports/s6straight/pathSpace.mjs')
    ]));
    const afterImport = interval(sidecar.intervals, 'source-verify-after-import', {}, verifySourceClosure);
    trace.sourceBinding.afterImport = afterImport;
    if (!afterImport.verified) throw new RecipeError('SOURCE_HASH_MISMATCH','source-verify-after-import','source changed during import');
    // A comparison scope owns the only live private raster/mask/store. No private
    // Part value, cached answer, store or buffer is returned from that scope.
    for (let index = 0; index < valid.records.length; index++) {
      const record = valid.records[index], id = record.metadata.id;
      phase = 'snapshot';
      const s = index === 0 ? firstSnapshot : interval(sidecar.intervals, 'snapshot', { comparisonId:id }, () => snapshot(record,index));
      firstSnapshot = null;
      const integrity = index === 0 ? firstIntegrity : snapshotIntegrity(s,id);
      const initial = hashPrivate(s);
      if (!sameHashes(initial,s.pre)) throw new RecipeError('SNAPSHOT_HASH_MISMATCH','before-first-call','private snapshot changed before store',id);
      let captureIndex = 0;
      phase = 'registration';
      try {
      const store = createPartStore({ base:null, name:id, onCall:entry => {
        // Capture in callback completion order, before any JSON normalization.
        const capture = { comparisonId:id, captureIndex:captureIndex++, nativeEntry:entry };
        let bytes;
        try { bytes = encodeBytes(capture, { maxBytes:4194304 }); }
        catch (error) { throw new RecipeError('ENCODING_FAILED','onCall',error.message,id); }
        const copy = decodeBytes(bytes, { maxBytes:4194304 });
        sidecar.calculationLog.push(copy);
        result.fragments.calculationEntries.push({ comparisonId:id, captureIndex:copy.captureIndex, bytes });
        counts.capturedCalculationEntries++;
        if (entry.calculation === CONSTANT) counts.capturedConstantEntries++;
        if (entry.calculation.startsWith('fn.q.path.')) counts.capturedPATHEntries++;
      } });
      store.constant(CONSTANT, { [RASTER]:s.raster, [MASK]:s.mask });
      registerQueries(store, PATH_QUERIES);
        for (const plan of valid.plannedQueries.filter(p => p.comparisonId === id)) {
          const row = trace.queryTrace[plan.planIndex];
          row.resolvedIdentity = detached(s.identity);
          counts.attemptedPATH++;
          phase = 'query';
          try {
            const answer = interval(sidecar.intervals, 'query', { comparisonId:id, planIndex:plan.planIndex, query:plan.query }, () => store.call(plan.query, detached(plan.rawArgs), { caller:CALLER }));
            // The frozen PATH table is synchronous; no promise/normalization path.
            if (answer && typeof answer.then === 'function') throw new RecipeError('QUERY_THROW','query','unexpected asynchronous native answer',id,plan.planIndex);
            counts.completedPATH++; row.state = 'COMPLETED';
            let bytes;
            try { bytes = encodeBytes(answer); }
            catch (error) { throw new RecipeError('ENCODING_FAILED','answer-encode',error.message,id,plan.planIndex); }
            result.fragments.answers.push({ planIndex:plan.planIndex, comparisonId:id, bytes });
            row.nativeAnswer = decodeBytes(bytes);
          } catch (error) {
            // Successful call whose answer encoding failed stays COMPLETED in
            // external call counts; it is not fabricated as a thrown query.
            if (row.state !== 'COMPLETED') { row.state = 'THREW'; counts.failedPATH++; }
            row.error = projectError(error,'QUERY_THROW','query',id,plan.planIndex);
            throw new RecipeError(row.error.code,row.error.phase,row.error.message,id,plan.planIndex);
          } finally {
            const post = hashPrivate(s), matches = sameHashes(s.pre,post);
            integrity.checks.push({ planIndex:plan.planIndex, post, verified:matches });
            // provenance never invokes a producer. Null remains null if lazy
            // materialization failed; no get/has/keyOf is used to force it.
            for (const address of [RASTER,MASK]) s.identity.partKeys[address] = store.provenance(address)?.key ?? null;
            row.resolvedIdentity = detached(s.identity);
            if (!matches) throw new RecipeError('SNAPSHOT_HASH_MISMATCH','post-query','private copied inputs changed',id,plan.planIndex);
          }
        }
      } finally {
        integrity.post = hashPrivate(s); integrity.verified = sameHashes(integrity.pre,integrity.post);
        integrity.partKeys = { ...s.identity.partKeys };
        if (!integrity.verified) integrity.error = projectError(new RecipeError('SNAPSHOT_HASH_MISMATCH','post-comparison','private copied input mismatch',id));
      }
    }
    trace.status = 'COMPLETED';
  } catch (error) {
    const fallback = phase === 'import' ? 'IMPORT_FAILED' : phase.startsWith('source') ? 'SOURCE_HASH_MISMATCH' : phase === 'snapshot' ? 'SNAPSHOT_HASH_MISMATCH' : 'INVALID_REQUEST';
    setFailure(error, fallback, phase);
  } finally {
    if (firstSnapshot && firstIntegrity) {
      try {
        firstIntegrity.post = hashPrivate(firstSnapshot);
        firstIntegrity.verified = sameHashes(firstIntegrity.pre,firstIntegrity.post);
        firstIntegrity.partKeys = { ...firstSnapshot.identity.partKeys };
        if (!firstIntegrity.verified) throw new RecipeError('SNAPSHOT_HASH_MISMATCH','post-run','unexecuted private snapshot changed',valid?.records[0].metadata.id ?? null);
      } catch (error) {
        firstIntegrity.error = projectError(error,'SNAPSHOT_HASH_MISMATCH','post-run');
        trace.inputIntegrity.postErrors.push(firstIntegrity.error); setFailure(error,'SNAPSHOT_HASH_MISMATCH','post-run');
      }
    }
    firstSnapshot = null;
    if (valid) {
      for (let i = 0; i < valid.records.length; i++) {
        const r = valid.records[i], actual = trace.inputIntegrity.supplied[i];
        try {
          actual.post = { rgbaSha256:sha(r.suppliedRGBA), maskSha256:sha(r.suppliedMask) };
          actual.verified = sameHashes(actual.pre,actual.post);
          if (!actual.verified) throw new RecipeError('POST_INPUT_MUTATION','post-run','supplied original bytes changed',r.metadata.id);
        } catch (error) {
          actual.error = projectError(error,'POST_INPUT_MUTATION','post-run',r.metadata.id);
          trace.inputIntegrity.postErrors.push(actual.error); setFailure(error,'POST_INPUT_MUTATION','post-run',r.metadata.id);
        }
      }
      if (trace.sourceBinding) {
        try {
          const post = interval(sidecar.intervals, 'source-verify-after-run', {}, verifySourceClosure);
          trace.sourceBinding.afterRun = post;
          if (!post.verified) throw new RecipeError('POST_SOURCE_MUTATION','post-run','source closure changed after attempted run');
        } catch (error) {
          const p = projectError(error,'POST_SOURCE_MUTATION','post-run');
          trace.inputIntegrity.postErrors.push(p); setFailure(error,'POST_SOURCE_MUTATION','post-run');
        }
      }
    }
    sidecar.status = trace.status; sidecar.error = trace.error;
  }
  return result;
}
