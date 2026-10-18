import test from 'node:test';
import assert from 'node:assert/strict';
import { assessRootInventory, bindingHash, artifactHash } from './root-inventory.mjs';
import { digest } from './source/fg/canon.mjs';
import { runFalsifiers } from './falsifier.mjs';

const H = n => n.toString(16).padStart(64, '0');
function fixture() {
  const binding = { sourceSha256: H(1), canonicalSha256: H(2), codeClosureSha256: H(3), requestSha256: H(4), storeSourceSha256: H(5) };
  const rows = [{ address: 'px.image.cropped', key: H(10) }, { address: 'tk.sameConstant', key: H(11) }];
  const authoritativeManifest = { schema: 'authoritative-readable-roots@1', issuer: 'fixture-provider-owner', scope: 'fixture-board@1',
    authorityPolicyId: 'fixture-authority-policy@1', bindingSha256: bindingHash(binding), rows };
  const keyMaterial = { fn: 'fn.test.indirect', code: H(12), args: null, inputs: [],
    roots: digest(rows.map(r => [r.address, r.key])) };
  const producerReceipt = { schema: 'producer-root-key-witness@1', bindingSha256: bindingHash(binding), rootRows: structuredClone(rows),
    keyMaterial, cacheKey: digest(keyMaterial) };
  const trustAnchor = { issuer: authoritativeManifest.issuer, scope: authoritativeManifest.scope, authorityPolicyId: authoritativeManifest.authorityPolicyId,
    bindingSha256: bindingHash(binding), manifestSha256: artifactHash(authoritativeManifest), producerReceiptSha256: artifactHash(producerReceipt) };
  return { binding, authoritativeManifest, producerReceipt, trustAnchor };
}
const assess = f => assessRootInventory(f, f.trustAnchor);
const repinProducer = f => { f.trustAnchor.producerReceiptSha256 = artifactHash(f.producerReceipt); };

test('complete independently pinned fixture inventory passes only scoped coverage, never scientific acceptance', () => {
  const r = assess(fixture()); assert.equal(r.status, 'pass'); assert.equal(r.cacheReuseAuthorized, true); assert.equal(r.scientificAcceptance, false);
});
test('caller complete boolean, observed subset, or no authoritative anchor never proves completeness', () => {
  const f = fixture(); f.trustAnchor = { complete: true }; f.authoritativeManifest.complete = true;
  assert.equal(assess(f).status, 'unknown');
  const g = fixture(); delete g.authoritativeManifest; assert.equal(assess(g).status, 'unknown');
});
test('legacy receipt without root-key material is unsupported even if a completeness boolean is supplied', () => {
  const f = fixture(); delete f.producerReceipt.keyMaterial; f.producerReceipt.complete = true;
  assert.equal(assess(f).status, 'unsupported');
});
test('missing and incomplete enumeration cannot cover authoritative query-readable roots', () => {
  for (const rows of [[], [{ address: 'tk.sameConstant', key: H(11) }]]) {
    const f = fixture(); f.producerReceipt.rootRows = rows; repinProducer(f);
    const r = assess(f); assert.equal(r.status, 'fail'); assert.ok(r.missing.includes('px.image.cropped'));
  }
});
test('changed pixel key, extra roots, duplicates, and wrong issuer fail closed', () => {
  for (const mutate of [f => f.producerReceipt.rootRows[0].key = H(99),
    f => f.producerReceipt.rootRows.push({ address: 'px.extra', key: H(22) }),
    f => f.producerReceipt.rootRows.push(f.producerReceipt.rootRows[0]),
    f => f.authoritativeManifest.issuer = 'pretend-owner']) {
    const f = fixture(); mutate(f); repinProducer(f); assert.equal(assess(f).status, 'fail');
  }
});
test('source/request/code binding changes or artifact bytes changing after pin fail', () => {
  for (const k of ['sourceSha256', 'canonicalSha256', 'requestSha256', 'codeClosureSha256', 'storeSourceSha256']) {
    const f = fixture(); f.binding[k] = H(99); assert.equal(assess(f).reason, 'source-or-binding-mismatch');
  }
  const f = fixture(); f.producerReceipt.cacheKey = H(99); assert.equal(assess(f).reason, 'artifact-hash-mismatch');
});
test('root material must actually hash full rows and cache key must bind that material', () => {
  const f = fixture(); f.producerReceipt.keyMaterial.roots = H(99); repinProducer(f);
  assert.equal(assess(f).reason, 'root-key-material-mismatch');
  const g = fixture(); g.producerReceipt.cacheKey = H(99); repinProducer(g);
  assert.equal(assess(g).reason, 'producer-cache-key-mismatch');
});
test('actual adapter and incomplete keys reproduce stale6; complete enumeration and controls produce27', () => {
  const r = runFalsifiers(); assert.equal(r.cases.length, 4);
});
const repinAll=f=>{const bh=bindingHash(f.binding);f.authoritativeManifest.bindingSha256=bh;f.producerReceipt.bindingSha256=bh;f.trustAnchor.bindingSha256=bh;if(f.producerReceipt.keyMaterial&&typeof f.producerReceipt.keyMaterial==='object'){f.producerReceipt.keyMaterial.roots=digest(f.producerReceipt.rootRows.map(r=>[r.address,r.key]));f.producerReceipt.cacheKey=digest(f.producerReceipt.keyMaterial);}f.trustAnchor.manifestSha256=artifactHash(f.authoritativeManifest);repinProducer(f);};
test('digest arrays cannot pass source binding even when consistently repinned',()=>{const f=fixture();f.binding.sourceSha256=[H(1)];repinAll(f);assert.equal(assess(f).status,'fail');});
test('shared aliased digest arrays cannot pass root key schemas',()=>{const f=fixture(),key=[H(10)];f.authoritativeManifest.rows[0].key=key;f.producerReceipt.rootRows[0].key=key;repinAll(f);assert.equal(assess(f).status,'fail');});
for(const field of ['issuer','scope','authorityPolicyId'])test(`object ${field} cannot become authority through reference equality`,()=>{const f=fixture(),object={bad:field};f.authoritativeManifest[field]=object;f.trustAnchor[field]=object;repinAll(f);assert.equal(assess(f).status,'fail');});
for(const material of ['roots',[],42,true])test(`malformed root material ${JSON.stringify(material)} classifies fail without throwing`,()=>{const f=fixture();f.producerReceipt.keyMaterial=material;repinProducer(f);assert.equal(assess(f).status,'fail');});
test('malformed wrapper, rows and input pair shapes never authorize reuse or escape classification',()=>{assert.equal(assessRootInventory([],{}).status,'fail');assert.equal(assessRootInventory(null,{}).status,'fail');for(const mutate of [f=>{f.binding=[];},f=>{f.authoritativeManifest.rows={};},f=>{f.producerReceipt.rootRows=[['px.image.cropped',H(10)]];},f=>{f.producerReceipt.keyMaterial.inputs={};},f=>{f.producerReceipt.keyMaterial.inputs=[[{},H(10)]];},f=>{f.producerReceipt.keyMaterial.inputs=[['px.root',[H(10)]]];}]){const f=fixture();mutate(f);repinProducer(f);assert.equal(assess(f).status,'fail');}});
test('authority digest arrays and empty principals remain malformed even if other pins match',()=>{for(const field of ['manifestSha256','producerReceiptSha256','bindingSha256']){const f=fixture();f.trustAnchor[field]=[f.trustAnchor[field]];assert.equal(assess(f).status,'fail');}for(const field of ['issuer','scope','authorityPolicyId']){const f=fixture();f.authoritativeManifest[field]=' ';f.trustAnchor[field]=' ';repinAll(f);assert.equal(assess(f).status,'fail');}});
