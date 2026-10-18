import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lenard5Declarations, planLenard5Queries, inspectLenard5Request, runLenard5Evidence } from './recipe.mjs';

// NON-CV ONLY. No valid enabled runner or vendor/store/PATH call is a test baseline.
// Tests written first; no preimplementation execution/red has been observed.
const request = manifestPath => ({ schema:'cycle06-lenard5-request@1', enabled:true, manifestPath });
const fileManifest = protocolPath => ({
  schema:'cycle06-lenard5-files@1', enabled:true, protocolId:'lenard5-fixed16',
  protocolPath, inputAttestationPath:'/not-read-attestation.json'
});
function temporary(t) {
  const directory = mkdtempSync(join(tmpdir(), 'lenard5-preflight-'));
  t.after(() => rmSync(directory, { recursive:true, force:true }));
  return directory;
}

// Break caught: partial/inherited opt-in or unrelated property access activates work.
test('missing/false own enabled is disabled without inspecting unrelated getters', async () => {
  let reads = 0;
  const trap = { enabled:false, get manifestPath() { reads++; throw Error('getter'); } };
  for (const value of [undefined, null, 1, 'true', {}, Object.create({ enabled:true }), trap]) {
    const result = await runLenard5Evidence(value);
    assert.equal(result.valueTrace.status, 'DISABLED');
    assert.equal(result.valueTrace.sourceBinding, null);
    assert.equal(result.valueTrace.requestBinding, null);
    assert.deepEqual(result.valueTrace.queryTrace, []);
    assert.equal(result.valueTrace.counts.attemptedPATH, 0);
    assert.equal(result.valueTrace.counts.capturedCalculationEntries, 0);
    assert.deepEqual(result.sidecar.intervals, []);
    assert.deepEqual(result.sidecar.calculationLog, []);
    assert.equal(inspectLenard5Request(value).status, 'DISABLED');
  }
  assert.equal(reads, 0);
});

// Break caught: enabled getters/coercion execute caller code or activate the runner.
test('enabled accessor and nonboolean enabled refuse without evaluating getters', async () => {
  let reads = 0;
  const accessor = Object.defineProperty({}, 'enabled', { enumerable:true, get() { reads++; return true; } });
  for (const value of [accessor, { enabled:'true' }, { enabled:1 }, { enabled:new Boolean(true) }]) {
    const result = await runLenard5Evidence(value);
    assert.equal(result.valueTrace.status, 'NOT_EXECUTED');
    assert.equal(result.valueTrace.error.code, 'INVALID_REQUEST');
    assert.equal(result.valueTrace.counts.attemptedPATH, 0);
    assert.equal(result.valueTrace.sourceBinding, null);
  }
  assert.equal(reads, 0);
});

// Break caught: ignored extra fields reopen a caller-buffer/arbitrary-geometry API.
test('closed request rejects caller buffers, hidden/symbol/accessor/custom shapes before file reads', async () => {
  let reads = 0;
  const base = request('/does-not-exist.json');
  const accessor = Object.defineProperty({ ...base }, 'manifestPath', { enumerable:true, get() { reads++; throw Error('getter'); } });
  const hidden = Object.defineProperty({ ...base }, 'hidden', { value:1 });
  const nullProto = Object.assign(Object.create(null), base);
  const decorated = Object.assign(new Uint8Array([1]), { extra:true });
  for (const value of [
    { ...base, rgba:decorated }, { ...base, mask:null }, { ...base, comparisons:[] },
    { ...base, widthsPx:[34] }, { ...base, [Symbol('extra')]:1 }, hidden, nullProto,
    Object.assign(Object.create({ custom:true }), base), accessor,
    { ...base, schema:'other' }, { ...base, manifestPath:'' },
    { ...base, manifestPath:'x\0y' }, { ...base, manifestPath:'x'.repeat(4097) },
    { ...base, manifestPath:undefined }
  ]) {
    const output = inspectLenard5Request(value);
    assert.equal(output.status, 'NOT_EXECUTED');
    assert.equal(output.error.code, 'INVALID_REQUEST');
    assert.equal(output.requestBinding, null);
    assert.deepEqual(output.plannedQueries, []);
    const run = await runLenard5Evidence(value);
    assert.equal(run.valueTrace.counts.attemptedPATH, 0);
    assert.equal(run.valueTrace.sourceBinding, null);
  }
  assert.equal(reads, 0);
});

// Break caught: synthetic geometry/settings or dropped controls silently replace E1104.
test('declarations retain16 full-frame comparisons with12 null and4 strip masks', () => {
  const values = lenard5Declarations();
  assert.equal(values.length, 16);
  assert.deepEqual(values.map(v => v.id), [
    'primary/before16','primary/core16','primary/after16','primary/long48',
    'bright-nonpath/before16','bright-nonpath/core16','bright-nonpath/after16','bright-nonpath/long48',
    'normal-plus6/before16','normal-plus6/core16','normal-plus6/after16','normal-plus6/long48',
    'masked-primary/before16','masked-primary/core16','masked-primary/after16','masked-primary/long48'
  ]);
  assert.equal(values.filter(v => v.mask === null).length, 12);
  assert.equal(values.filter(v => v.mask?.sha256 === '305285b7e2bc9d44dfd572caa8d39030ed1b0c2254c15967fbb9b7bff7fae609').length, 4);
  for (const v of values) {
    assert.equal(v.widthPx, 1290); assert.equal(v.heightPx, 2796);
    assert.equal(v.frame, 'Lenard-5.original-source-pixel-centers');
    assert.equal(v.phiRad, -0.20539538918976738);
    assert.deepEqual(v.widthsPx, [34,42,50]);
    assert.equal(v.stepPx, 1);
  }
  assert.deepEqual(values[0].originPx, [780,906]);
  assert.deepEqual(values[4].originPx, [780,740]);
  assert.deepEqual(values[8].originPx, [781.223725524672,911.8738825184256]);
  assert.deepEqual(values.slice(0,4).map(v => [v.t0Px,v.t1Px]), [[-24,-8],[-8,8],[8,24],[-24,24]]);
  values[0].originPx[0] = 0; values[0].widthsPx[0] = 0; values[12].mask.sha256 = 'wrong';
  const fresh = lenard5Declarations();
  assert.deepEqual(fresh[0].originPx, [780,906]);
  assert.deepEqual(fresh[0].widthsPx, [34,42,50]);
  assert.equal(fresh[12].mask.sha256, '305285b7e2bc9d44dfd572caa8d39030ed1b0c2254c15967fbb9b7bff7fae609');
});

// Break caught: one-profile-per-width, synthetic tol3, recentering or metadata Part strings.
test('fixed plan emits160 literal public requests in frozen order without extra operations', () => {
  const plans = planLenard5Queries();
  assert.equal(plans.length, 160);
  assert.deepEqual(plans.slice(0,10).map(p => [p.query,p.widthPx]), [
    ['fn.q.path.profile',null],
    ['fn.q.path.edgePair',34],['fn.q.path.stationContrast',34],['fn.q.path.loss',34],
    ['fn.q.path.edgePair',42],['fn.q.path.stationContrast',42],['fn.q.path.loss',42],
    ['fn.q.path.edgePair',50],['fn.q.path.stationContrast',50],['fn.q.path.loss',50]
  ]);
  assert.deepEqual(plans[0].rawArgs, { raster:'px.image.cropped',mask:'tk.s6.pathMask',originPx:[780,906],phiRad:-0.20539538918976738,t0Px:-24,t1Px:-8,stepPx:1,lat0Px:0 });
  assert.deepEqual(plans[1].rawArgs, { raster:'px.image.cropped',mask:'tk.s6.pathMask',originPx:[780,906],phiRad:-0.20539538918976738,t0Px:-24,t1Px:-8,stepPx:1,lat0Px:0,widthPx:34,tolPx:2,latLimPx:12,minOk:{count:8,ofStations:0.2} });
  assert.deepEqual(plans[2].rawArgs.bandPx, [1,3]);
  assert.equal(plans[2].rawArgs.alongPx, 2);
  assert.deepEqual(plans[159].rawArgs, { raster:'px.image.cropped',mask:'tk.s6.pathMask',originPx:[780,906],phiRad:-0.20539538918976738,t0Px:-24,t1Px:24,stepPx:1,widthPx:50,profile:null,threshold:null,tauLum:8 });
  assert.equal(plans[80].comparisonId, 'normal-plus6/before16');
  assert.equal(plans[120].comparisonId, 'masked-primary/before16');
  for (let i = 0; i < plans.length; i++) {
    assert.equal(plans[i].planIndex, i);
    for (const v of Object.values(plans[i].rawArgs)) if (typeof v === 'string') assert.ok(['px.image.cropped','tk.s6.pathMask'].includes(v));
  }
  plans[1].rawArgs.minOk.count = 0;
  assert.equal(planLenard5Queries()[1].rawArgs.minOk.count, 8);
});

// Break caught: missing, growing/overlarge or nonregular manifests are trusted/parsed.
test('file preflight refuses missing/nonregular/oversize/invalidUTF8 manifests without a query', t => {
  const directory = temporary(t);
  const subdir = join(directory, 'directory'); mkdirSync(subdir);
  const tooLarge = join(directory, 'large.json'); writeFileSync(tooLarge, ' '.repeat(8193));
  const invalid = join(directory, 'bad-utf8.json'); writeFileSync(invalid, new Uint8Array([0xff]));
  for (const path of [join(directory,'missing'), subdir, tooLarge, invalid]) {
    const output = inspectLenard5Request(request(path));
    assert.equal(output.status, 'NOT_EXECUTED');
    assert.equal(output.requestBinding, null);
    assert.deepEqual(output.plannedQueries, []);
    assert.ok(output.error);
  }
});

// Break caught: accepted self-declarations or unknown manifest keys bypass fixed protocol.
test('closed file manifest and actual protocol bytes are checked before attestation or pixels', t => {
  const directory = temporary(t);
  const badProtocol = join(directory, 'protocol.json'); writeFileSync(badProtocol, '{}');
  const cases = [
    { ...fileManifest(badProtocol), protocolId:'synthetic8' },
    { ...fileManifest(badProtocol), enabled:false },
    { ...fileManifest(badProtocol), geometry:[] },
    { ...fileManifest(badProtocol), protocolPath:'' },
    fileManifest(badProtocol)
  ];
  for (let i = 0; i < cases.length; i++) {
    const path = join(directory, `case-${i}.json`);
    writeFileSync(path, JSON.stringify(cases[i]));
    const output = inspectLenard5Request(request(path));
    assert.equal(output.status, 'NOT_EXECUTED');
    assert.equal(output.requestBinding, null);
    assert.deepEqual(output.plannedQueries, []);
    assert.ok(output.error);
  }
});
