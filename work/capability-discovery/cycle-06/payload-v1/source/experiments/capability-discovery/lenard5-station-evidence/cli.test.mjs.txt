import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { runLenard5CLI, persistLenard5Result } from './cli.mjs';
import { createArtifactWriter } from '../station-evidence/cli.mjs';
import { encodeBytes, decodeBytes } from '../station-evidence/codec.mjs';

// Construction chronology: tests written first; no execution/red observed before
// the root actual-flow checkpoint. All fixtures below are fabricated NONCV data.
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
function temporary(t) {
  const parent = mkdtempSync(join(tmpdir(), 'lenard5-cli-noncv-'));
  t.after(() => rmSync(parent, { recursive:true, force:true }));
  return parent;
}
function fixture() {
  return {
    valueTrace:{ schema:'cycle06-lenard5-trace@1', protocolId:'lenard5-fixed16', status:'NOT_EXECUTED', error:null,
      requestBinding:null, counts:{ requestedPATH:0, attemptedPATH:0, completedPATH:0, failedPATH:0 },
      queryTrace:[], nativeFixture:{ nonfinite:NaN, zero:-0, missing:null, corridor:Uint8Array.of(0,1,255) } },
    sidecar:{ schema:'cycle06-lenard5-sidecar@1', protocolId:'lenard5-fixed16', status:'NOT_EXECUTED', error:null,
      runtime:{ fixture:true }, intervals:[], calculationLog:[] },
    fragments:{ answers:[{ comparisonId:'fabricated', planIndex:0, bytes:encodeBytes({ value:NaN, unit:'lum' }) }],
      calculationEntries:[{ comparisonId:'fabricated', captureIndex:0, bytes:encodeBytes({ seq:1, cached:false }) }] }
  };
}

// Break caught: accepting extra/reordered/generic enabling flags can reach run.
test('malformed CLI grammar refuses before reserving any destination', async t => {
  const parent = temporary(t), out = join(parent, 'must-not-exist');
  for (const args of [[], ['--enable'], ['run','--manifest','missing','--out',out,'extra'],
    ['run','--out',out,'--manifest','missing'], ['run','--manifest','','--out',out],
    ['run','--manifest','missing','--out','bad\0path']]) {
    await assert.rejects(runLenard5CLI(args), /Usage|invalid/);
    assert.equal(existsSync(out), false);
  }
});

// Break caught: invoking the runner before NEW-directory reservation could read
// input or run work even though output already exists.
test('existing output refuses before missing manifest lookup and preserves bytes', async t => {
  const parent = temporary(t), out = join(parent, 'existing');
  mkdirSync(out); writeFileSync(join(out, 'sentinel'), 'original\n', { flag:'wx' });
  await assert.rejects(runLenard5CLI(['run','--manifest',join(parent,'missing.json'),'--out',out]), error => error.code === 'EEXIST');
  assert.equal(readFileSync(join(out,'sentinel'),'utf8'), 'original\n');
  assert.equal(existsSync(join(out,'artifact-manifest.json')), false);
  assert.equal(existsSync(join(out,'cli-receipt.json')), false);
});

// Break caught: manifest refusal must still persist the runner's zero-call result
// after reservation; this is a negative runner call, not a valid enabled run.
test('missing manifest persists NOT_EXECUTED with zero attempted calls', async t => {
  const parent = temporary(t), out = join(parent, 'new');
  const receipt = await runLenard5CLI(['run','--manifest',join(parent,'missing.json'),'--out',out]);
  assert.equal(receipt.status, 'NOT_EXECUTED');
  assert.equal(receipt.intendedExitCode, 1);
  const trace = decodeBytes(Uint8Array.from(readFileSync(join(out,'value-trace.json'))));
  assert.equal(trace.status, 'NOT_EXECUTED');
  assert.equal(trace.counts.attemptedPATH, 0);
  assert.equal(trace.counts.completedPATH, 0);
  assert.equal(receipt.artifactManifest.schema, 'cycle05-station-artifacts@1');
  assert.equal(Object.hasOwn(receipt,'observedExitCode'), false);
});

// Break caught: receipt relabelling, omitted output hashes or numeric coercion
// would lose the real writer/codec contract even with no CV data involved.
test('fabricated result retains legacy envelope and exact raw codec output identities', t => {
  const parent = temporary(t), out = join(parent, 'new'), result = fixture();
  const writer = createArtifactWriter(out);
  const receipt = persistLenard5Result(writer,result,{ outDir:out, manifestPath:join(parent,'not-read.json') });
  assert.equal(receipt.schema, 'cycle06-lenard5-cli-receipt@1');
  assert.equal(receipt.protocolId, 'lenard5-fixed16');
  assert.equal(receipt.writerStatus, 'NOT_EXECUTED');
  assert.equal(receipt.status, 'NOT_EXECUTED');
  const outer = json(join(out,'artifact-manifest.json'));
  assert.equal(outer.schema, 'cycle05-station-artifacts@1');
  assert.equal(receipt.artifactManifest.sha256, sha(readFileSync(join(out,'artifact-manifest.json'))));
  assert.equal(receipt.artifacts.length, 4);
  for (const entry of receipt.artifacts) {
    const bytes = readFileSync(join(out,entry.path));
    assert.equal(entry.sha256, sha(bytes)); assert.equal(entry.bytes, bytes.length);
  }
  const native = decodeBytes(Uint8Array.from(readFileSync(join(out,'value-trace.json')))).nativeFixture;
  assert.equal(Number.isNaN(native.nonfinite), true); assert.equal(Object.is(native.zero,-0), true);
  assert.equal(native.missing,null); assert.equal(Object.getPrototypeOf(native.corridor),Uint8Array.prototype);
  assert.deepEqual(Array.from(native.corridor),[0,1,255]);
  assert.throws(() => writer.write(result), /already used/);
  assert.deepEqual(json(join(out,'cli-receipt.json')), receipt);
});

// Break caught: retrying aggregate encoding or clearing fragments on failure
// would destroy a truthful prefix and could cause a producer retry upstream.
test('fabricated aggregate encode failure retains both fragments and binds failure manifest', t => {
  const parent=temporary(t),out=join(parent,'new'),result=fixture(),writer=createArtifactWriter(out);
  result.valueTrace.unsupported=undefined;
  let failure;
  assert.throws(() => persistLenard5Result(writer,result,{outDir:out,manifestPath:'unused'}), error => {
    failure=error; return error.cliReceipt?.status === 'ENCODING_FAILED';
  });
  assert.equal(failure.cliReceipt.writerStatus,'ENCODING_FAILED');
  assert.equal(failure.cliReceipt.artifacts.length,2);
  assert.deepEqual(readFileSync(join(out,'fragments/answer-0.json')),Buffer.from(result.fragments.answers[0].bytes));
  assert.deepEqual(readFileSync(join(out,'fragments/calculation-0.json')),Buffer.from(result.fragments.calculationEntries[0].bytes));
  assert.equal(existsSync(join(out,'value-trace.json')),false);
  assert.equal(json(join(out,'artifact-manifest.json')).status,'ENCODING_FAILED');
  assert.throws(() => writer.write(fixture()),/already used/);
});

// Break caught: a later wx failure must preserve the earlier trace/fragments and
// must not overwrite the colliding file or misreport aggregate completion.
test('fabricated mid-output collision keeps written prefix and existing sentinel', t => {
  const parent=temporary(t),out=join(parent,'new'),result=fixture(),writer=createArtifactWriter(out);
  writeFileSync(join(out,'timing-sidecar.json'),'occupied\n',{flag:'wx'});
  assert.throws(() => persistLenard5Result(writer,result,{outDir:out,manifestPath:'unused'}), error => error.cliReceipt?.status === 'OUTPUT_FAILED');
  assert.equal(readFileSync(join(out,'timing-sidecar.json'),'utf8'),'occupied\n');
  assert.equal(existsSync(join(out,'value-trace.json')),true);
  const receipt=json(join(out,'cli-receipt.json'));
  assert.equal(receipt.artifacts.length,3);
  assert.equal(receipt.artifacts.some(a => a.path==='timing-sidecar.json'),false);
  assert.equal(json(join(out,'artifact-manifest.json')).status,'OUTPUT_FAILED');
  assert.throws(() => writer.write(result),/already used/);
});

// Break caught: a terminal receipt collision must not be overwritten or hidden
// as success after writer files have already been persisted.
test('receipt wx failure preserves original receipt and does not retry writer', t => {
  const parent=temporary(t),out=join(parent,'new'),result=fixture(),writer=createArtifactWriter(out);
  writeFileSync(join(out,'cli-receipt.json'),'original receipt\n',{flag:'wx'});
  assert.throws(() => persistLenard5Result(writer,result,{outDir:out,manifestPath:'unused'}), error => error.code==='EEXIST');
  assert.equal(readFileSync(join(out,'cli-receipt.json'),'utf8'),'original receipt\n');
  assert.equal(existsSync(join(out,'artifact-manifest.json')),true);
  assert.throws(() => writer.write(result),/already used/);
});
