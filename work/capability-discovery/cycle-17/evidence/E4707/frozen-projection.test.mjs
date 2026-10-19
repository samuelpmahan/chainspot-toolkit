import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {renderTrace,main} from './render.mjs';
import {persistHeadingTrace} from './cli.mjs';

// Trusted saved nonpixel consumer fixture; never call the producer/recipe entry.
const input = new URL('../../../work/capability-discovery/cycle-10/evidence/E4009/output/trace.json',import.meta.url);
const bytes = readFileSync(input), hash = value => createHash('sha256').update(value).digest('hex');
const traceHash = 'f237792dc0753096c3ab390a6efdf901e8850dbd433be60c7b9c808588bd3e63';
assert.equal(bytes.length,146333);
assert.equal(hash(bytes),traceHash);
const original = JSON.parse(bytes);
const fresh = () => mkdtempSync(join(process.env.LAB17_EVIDENCE_ROOT || tmpdir(),'heading-projection-'));
const unescapeXml = value => value.replace(/&(amp|lt|gt|quot|apos);/g,(_,key)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[key]));
const metadata = svg => JSON.parse(unescapeXml(svg.match(/<metadata>(.*?)<\/metadata>/s)[1]));
const visible = svg => [...svg.matchAll(/<text\b[^>]*>(.*?)<\/text>/gs)].map(match=>unescapeXml(match[1])).join('');
function captureMain(inputPath,inputHash,out) {
  let stdout = '';
  const write = process.stdout.write;
  process.stdout.write = chunk => { stdout += chunk; return true; };
  try { main(['--input',inputPath,'--sha256',inputHash,'--out',out]); }
  finally { process.stdout.write = write; }
  return JSON.parse(stdout);
}
function assertRows(svg,trace) {
  assert.deepEqual([...svg.matchAll(/<desc>(.*?)<\/desc>/gs)].map(match=>JSON.parse(unescapeXml(match[1]))),trace.renderRows);
  assert.deepEqual([...svg.matchAll(/data-station-id="([^"]+)"/g)].map(match=>unescapeXml(match[1])),trace.renderRows.flatMap(row=>row.stations.map(station=>station.id)));
  const meta = metadata(svg);
  assert.deepEqual(meta.rowIds,trace.renderRows.map(row=>row.id));
  assert.deepEqual(meta.sourceBinding,trace.sourceBinding);
  assert.deepEqual(meta.inputBinding,trace.inputBinding);
}
function assertAllClaims(trace,expected) {
  const dir = fresh(), fixture = join(dir,'test-only-trace.json'), out = join(dir,'display.svg');
  const fixtureBytes = Buffer.from(`${JSON.stringify(trace)}\n`);
  writeFileSync(fixture,fixtureBytes,{flag:'wx'});
  const svg = renderTrace(trace,hash(fixtureBytes));
  assert.deepEqual(metadata(svg).claims,expected);
  assert.ok(visible(svg).includes(expected === null ? 'claims=unavailable/null' : `claims=${JSON.stringify(expected)}`));
  assertRows(svg,trace);
  assert.deepEqual(captureMain(fixture,hash(fixtureBytes),out).claims,expected);
  const receiptDir = fresh(), receipt = persistHeadingTrace(trace,receiptDir);
  assert.deepEqual(receipt.claims,expected);
  assert.deepEqual(JSON.parse(readFileSync(join(receiptDir,'receipt.json'))),receipt);
  assert.deepEqual(receipt.prediction,trace.prediction);
  assert.deepEqual(receipt.renderRows,trace.renderRows);
  assert.deepEqual(JSON.parse(readFileSync(join(receiptDir,'trace.json'))),trace);
  return {svg,receipt};
}

test('actual E4009 SVG preserves saved claims visibly and in metadata with every retained row/station',()=>{
  const svg = renderTrace(original,traceHash);
  assert.deepEqual(metadata(svg).claims,original.claims);
  assert.ok(visible(svg).includes(`claims=${JSON.stringify(original.claims)}`));
  assertRows(svg,original);
  assert.ok(visible(svg).includes(`prediction=${JSON.stringify({status:original.prediction.status,Dprimary:original.prediction.Dprimary,Dbright:original.prediction.Dbright,groups:original.prediction.groups.map(({groupId,status,D})=>({groupId,status,D}))})}`));
});

test('actual E4009 renderer main stdout retains the whole saved claims value',()=>{
  const dir = fresh(), out = join(dir,'actual.svg');
  const summary = captureMain(input.pathname,traceHash,out);
  assert.deepEqual(summary.claims,original.claims);
  assert.equal(summary.traceHash,traceHash);
  assertRows(readFileSync(out,'utf8'),original);
});

test('actual E4009 persistence retains claims and leaves prediction/rows/full trace unchanged',()=>{
  const dir = fresh(), receipt = persistHeadingTrace(original,dir);
  assert.deepEqual(receipt.claims,original.claims);
  assert.deepEqual(JSON.parse(readFileSync(join(dir,'receipt.json'))),receipt);
  assert.deepEqual(receipt.prediction,original.prediction);
  assert.deepEqual(receipt.renderRows,original.renderRows);
  assert.deepEqual(JSON.parse(readFileSync(join(dir,'trace.json'))),original);
  assert.equal(receipt.traceHash,hash(readFileSync(join(dir,'trace.json'))));
});

test('test-only legacy missing and explicit null claims remain unavailable rather than synthesized',()=>{
  const missing = structuredClone(original); delete missing.claims;
  assertAllClaims(missing,null);
  assertAllClaims({...original,claims:null},null);
});

test('test-only partial and extended claims retain all fields and XML-special text without promotion',()=>{
  assertAllClaims({...original,claims:{pathIdentity:'UNKNOWN'}},{pathIdentity:'UNKNOWN'});
  const claims = {...original.claims,extra:{note:'<independent> & "unverified" \'claim\'',retained:[false,null,'UNKNOWN']}};
  const {svg} = assertAllClaims({...original,claims},claims);
  assert.ok(svg.includes('&lt;independent&gt; &amp; \\&quot;unverified\\&quot;'));
  assert.ok(!svg.includes('<independent>'));
});

test('existing renderer schema/row/hash/size/exclusive-write and persistence cap guards remain active',()=>{
  const dir = fresh(), out = join(dir,'guard.svg');
  assert.throws(()=>renderTrace({...original,schema:'heading-ablation-cli@1'},traceHash),/Unexpected trace schema/);
  assert.throws(()=>renderTrace({...original,renderRows:original.renderRows.slice(1)},traceHash),/exactly four/);
  assert.throws(()=>captureMain(input.pathname,'0'.repeat(64),out),/SHA256 mismatch/);
  assert.equal(existsSync(out),false);
  captureMain(input.pathname,traceHash,out);
  assert.throws(()=>captureMain(input.pathname,traceHash,out),/EEXIST/);
  const oversized = join(dir,'oversized.json'); writeFileSync(oversized,Buffer.alloc(2*1024*1024+1));
  assert.throws(()=>captureMain(oversized,hash(readFileSync(oversized)),join(dir,'oversized.svg')),/at most 2MiB/);
  const capDir = fresh();
  assert.throws(()=>persistHeadingTrace({...original,testOnlyPadding:'x'.repeat(2*1024*1024)},capDir),/byte cap/);
  assert.equal(JSON.parse(readFileSync(join(capDir,'failure.json'))).status,'OUTPUT_FAILED');
  const exclusiveDir = fresh(); persistHeadingTrace(original,exclusiveDir);
  assert.throws(()=>persistHeadingTrace(original,exclusiveDir),/EEXIST/);
  assert.equal(hash(readFileSync(input)),traceHash);
});
