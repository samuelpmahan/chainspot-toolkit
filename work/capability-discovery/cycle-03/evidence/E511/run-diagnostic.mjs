#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
const [repoArg,protocolArg,descriptorArg,stagedArg,outArg]=process.argv.slice(2);
if(!outArg)throw Error('usage: node run-diagnostic.mjs REPO_ROOT PROTOCOL_JSON DESCRIPTOR_JSON STAGED_SOURCE_JSON FRESH_OUT_DIR');
const repo=resolve(repoArg), protocolPath=resolve(protocolArg),descriptorPath=resolve(descriptorArg),stagedPath=resolve(stagedArg),out=resolve(outArg),bundle=dirname(protocolPath);
const sha=b=>createHash('sha256').update(b).digest('hex');const read=p=>readFileSync(join(repo,p));const load=p=>JSON.parse(readFileSync(p));
const write=(name,v)=>writeFileSync(join(out,name),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
const manifest=load(join(bundle,'pre-run-manifest.json'));
function identity(){
 const frozen=manifest.files.map(e=>{const actual=sha(readFileSync(join(bundle,e.path)));if(actual!==e.sha256)throw Error('pre-run freeze changed: '+e.path);return {path:e.path,sha256:actual};});
 const cpath='work/capability-discovery/cycle-03/evidence/E506/candidate-freeze.json',cbytes=read(cpath);if(sha(cbytes)!=='d31b7a4312ac1bfc4f76bc96fc278f8acad4f49f4b04283df0faa8e6dce54626')throw Error('candidate manifest changed');
 const c=JSON.parse(cbytes);if(sha(read(c.acceptedRecipe.path))!==c.acceptedRecipe.sha256)throw Error('recipe manifest changed');const recipe=JSON.parse(read(c.acceptedRecipe.path));
 const entries=[...c.files,...c.retainedContractHistoryAndEvidence,c.acceptedRecipe,...recipe.files,recipe.existingGuard,...recipe.immutableSources.map(s=>({path:'experiments/capability-discovery/probes/width/'+s.file,sha256:s.sha256}))];
 const checked=entries.map(e=>{const actual=sha(read(e.path));if(actual!==e.sha256)throw Error('closure changed: '+e.path);return {path:e.path,sha256:actual};});
 return {candidateSha256:sha(cbytes),preRunManifestSha256:sha(readFileSync(join(bundle,'pre-run-manifest.json'))),frozen,checked};
}
mkdirSync(out,{recursive:true});const before=identity();write('identity-before.json',before);
const protocol=load(protocolPath),descriptor=load(descriptorPath),sourceBytes=readFileSync(stagedPath),source=JSON.parse(sourceBytes);
if(sha(readFileSync(descriptorPath))!==protocol.input.requestDescriptorSha256)throw Error('descriptor binding changed');
if(sha(sourceBytes)!==descriptor.source.stagedJsonSha256)throw Error('staged source byte hash changed');
if(source.provenance.rgbaSha256!==descriptor.source.fullRgbaSha256||source.provenance.sourcePngSha256!==descriptor.source.pngSha256||source.image.frame!==descriptor.source.frame||source.image.width!==1290||source.image.height!==2796)throw Error('source differs from freeze');
if(sha(Uint8Array.from(source.image.data))!==descriptor.source.fullRgbaSha256)throw Error('actual full RGBA differs');
if(JSON.stringify(descriptor.geometry)!==JSON.stringify(protocol.unchangedGeometry))throw Error('geometry changed');
if(JSON.stringify(descriptor.roi)!==JSON.stringify(protocol.delta.newRoi))throw Error('ROI differs from frozen ablation');
const request={enabled:descriptor.enabled,source,roi:descriptor.roi,geometry:descriptor.geometry};const completeRequestJsonSha256=sha(JSON.stringify(request));
write('input-binding.json',{schema:'E511-input-binding@1',protocolSha256:sha(readFileSync(protocolPath)),descriptorSha256:sha(readFileSync(descriptorPath)),stagedSourceJsonSha256:sha(sourceBytes),completeRequestJsonSha256,sourceRgbaSha256:descriptor.source.fullRgbaSha256,sourcePngSha256:descriptor.source.pngSha256,callerSha256:sha(readFileSync(new URL(import.meta.url)))});
const {runSourcePixelRoi,preserveNonFinite}=await import(pathToFileURL(join(repo,'experiments/capability-discovery/source-pixels/adapter.mjs')));
const started=performance.now(),usageBefore=process.resourceUsage(),memoryBefore=process.memoryUsage();
const receipt=runSourcePixelRoi(request); // Exactly ONE authorized ROI-only support-ablation adapter invocation.
const elapsedMs=performance.now()-started,usageAfter=process.resourceUsage(),memoryAfter=process.memoryUsage();
const serialized=JSON.stringify(receipt,preserveNonFinite,2)+'\n';writeFileSync(join(out,'receipt.json'),serialized,{flag:'wx'});
const after=identity();write('identity-after.json',after);if(JSON.stringify(before)!==JSON.stringify(after))throw Error('freeze/closure changed during run');
const resources={schema:'E511-actual-process-resources@1',node:process.version,adapterCalls:1,compositionCalls:receipt.execution?.compositionCalls??0,operationsExecuted:receipt.operationsExecuted.length,elapsedMs,usageBefore,usageAfter,memoryBefore,memoryAfter,scope:'Single diagnostic adapter call after staged-source parse/request hashing; process maxRSS includes those earlier allocations. Full-frame ROI and source each run unchanged composition. No allocator causality or speedup claim.'};write('resources.json',resources);
write('run-binding.json',{schema:'E511-run-binding@1',protocolSha256:sha(readFileSync(protocolPath)),preRunManifestSha256:before.preRunManifestSha256,requestDescriptorSha256:sha(readFileSync(descriptorPath)),stagedSourceJsonSha256:sha(sourceBytes),completeRequestJsonSha256,receiptSha256:sha(serialized),callerSha256:sha(readFileSync(new URL(import.meta.url))),adapterCalls:1,compositionCalls:resources.compositionCalls,operationsExecuted:resources.operationsExecuted,status:receipt.status,supportStatus:receipt.support?.status,equivalenceStatus:receipt.equivalence?.status??'UNKNOWN',reason:receipt.reason??null});
console.log(JSON.stringify({status:receipt.status,support:receipt.support?.status,equivalence:receipt.equivalence?.status,compositionCalls:resources.compositionCalls,operationsExecuted:resources.operationsExecuted,elapsedMs,receiptSha256:sha(serialized)},null,2));
