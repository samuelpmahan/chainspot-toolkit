#!/usr/bin/env node
/** Portable exact fixed-trial caller. Arguments: REPO_ROOT PROTOCOL_PATH STAGED_SOURCE_JSON OUT_DIR */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
const [repoArg,protocolArg,stagedArg,outArg]=process.argv.slice(2);
if(!outArg) throw Error('usage: node run-trial.mjs REPO_ROOT PROTOCOL_PATH STAGED_SOURCE_JSON OUT_DIR');
const repo=resolve(repoArg),protocolPath=resolve(protocolArg),stagedPath=resolve(stagedArg),out=resolve(outArg);
mkdirSync(out,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const candidatePath='work/capability-discovery/cycle-03/evidence/E506/candidate-freeze.json';
const expectedCandidate='d31b7a4312ac1bfc4f76bc96fc278f8acad4f49f4b04283df0faa8e6dce54626';
const expectedProtocol='112693cce17cf30035191a6cded1829482a589bc19c3f6bbbb3320718c2c0ba2';
const read=p=>readFileSync(join(repo,p));
function checkIdentity(){
 const cbytes=read(candidatePath);if(sha(cbytes)!==expectedCandidate)throw Error('candidate manifest changed');
 const pbytes=readFileSync(protocolPath);if(sha(pbytes)!==expectedProtocol)throw Error('protocol changed');
 const c=JSON.parse(cbytes),entries=[...c.files,...c.retainedContractHistoryAndEvidence,c.acceptedRecipe];
 const recipeBytes=read(c.acceptedRecipe.path);if(sha(recipeBytes)!==c.acceptedRecipe.sha256)throw Error('recipe manifest changed');
 const recipe=JSON.parse(recipeBytes);entries.push(...recipe.files,recipe.existingGuard,...recipe.immutableSources.map(s=>({path:`experiments/capability-discovery/probes/width/${s.file}`,sha256:s.sha256})));
 const checked=entries.map(e=>{const actual=sha(read(e.path));if(actual!==e.sha256)throw Error(`closure changed: ${e.path}`);return {path:e.path,sha256:actual};});
 return {candidate:{path:candidatePath,sha256:sha(cbytes)},protocol:{sha256:sha(pbytes)},checked};
}
const before=checkIdentity();writeFileSync(join(out,'identity-before.json'),JSON.stringify(before,null,2)+'\n',{flag:'wx'});
const declaration=JSON.parse(readFileSync(protocolPath)),sourceBytes=readFileSync(stagedPath),source=JSON.parse(sourceBytes);
if(source.provenance.sourcePngSha256!==declaration.source.pngSha256||source.provenance.rgbaSha256!==declaration.source.rgbaSha256)throw Error('staged original source differs from declaration');
if(source.image.width!==declaration.source.widthPx||source.image.height!==declaration.source.heightPx||source.image.frame!==declaration.frame)throw Error('staged dimensions/frame differ');
const frame=declaration.frame;
// Explicit projection strips human explanation fields only; every supported scalar/coordinate is copied unchanged.
const geometry={frame,geometrySource:declaration.geometrySource,training:{frame,segments:declaration.training.segments.map(s=>({tee:{xPx:s.tee.xPx,yPx:s.tee.yPx},badge:{xPx:s.badge.xPx,yPx:s.badge.yPx}}))},stations:declaration.stations.map(s=>Object.fromEntries(['id','frame','xPx','yPx','headingRad','t0Px','t1Px'].map(k=>[k,s[k]]))),localWidthBank:{frame:declaration.localWidthBank.frame,scope:declaration.localWidthBank.scope,valuesPx:[...declaration.localWidthBank.valuesPx]},occluders:{frame:declaration.occluders.frame,boxes:declaration.occluders.boxes.map(b=>Object.fromEntries(['bboxX','bboxY','bboxW','bboxH','kind'].filter(k=>k in b).map(k=>[k,b[k]])))},edgeSearch:{latLimPx:declaration.edgeSearch.latLimPx,tolWidthPx:declaration.edgeSearch.tolWidthPx}};
const roi={...Object.fromEntries(['xPx','yPx','widthPx','heightPx'].map(k=>[k,declaration.crop[k]])),frame:`${frame}.roi-180-1795-210-215`};
const descriptor={schema:'E508-compact-request@1',enabled:true,source:{stagedJsonSha256:sha(sourceBytes),pngSha256:source.provenance.sourcePngSha256,fullRgbaSha256:source.provenance.rgbaSha256,width:source.image.width,height:source.image.height,frame:source.image.frame,decoder:source.provenance.decoder},roi,geometry,projection:{method:'Exact supported-field projection only. No numeric/coordinate/window/width/box/settings tuning.',stripped:['top-level protocol metadata, expected observations, falsifiers and explanatory fields','training.segments[].proposedLabels','stations[].role','localWidthBank.declarationBasis','edgeSearch.declarationBasis','occluders.authority','crop.exclusiveRightPx/exclusiveBottomPx/transform/resize and explanatory metadata'],retainedMeaning:'All stripped testimony remains in exact frozen protocol. API tee/badge are proposed visual endpoint fields; no accepted identities.',cropFrame:'New name only; adapter translates exact original-frame values by integer crop origin.'}};
writeFileSync(join(out,'request-descriptor.json'),JSON.stringify(descriptor,null,2)+'\n',{flag:'wx'});
const request={enabled:true,source,roi,geometry};
// Hash actual complete request bytes without retaining giant RGBA arrays as a deliverable.
const requestSha256=sha(JSON.stringify(request));
const {runSourcePixelRoi,preserveNonFinite}=await import(pathToFileURL(join(repo,'experiments/capability-discovery/source-pixels/adapter.mjs')));
const started=performance.now(),usageBefore=process.resourceUsage(),memoryBefore=process.memoryUsage();
const receipt=runSourcePixelRoi(request); // ONE fixed adapter trial; two recipe calls only if support passes.
const elapsedMs=performance.now()-started,usageAfter=process.resourceUsage(),memoryAfter=process.memoryUsage();
const serialized=JSON.stringify(receipt,preserveNonFinite,2)+'\n';
writeFileSync(join(out,'receipt.json'),serialized,{flag:'wx'});
const after=checkIdentity();writeFileSync(join(out,'identity-after.json'),JSON.stringify(after,null,2)+'\n',{flag:'wx'});
if(JSON.stringify(before)!==JSON.stringify(after))throw Error('identity changed during trial');
const resources={schema:'E508-producer-resources@1',node:process.version,elapsedMs,adapterCalls:1,compositionCalls:receipt.execution?.compositionCalls??0,operationsExecuted:receipt.operationsExecuted.length,usageBefore,usageAfter,memoryBefore,memoryAfter,note:'Observed process/adapter resources only; no acceleration, allocator causality or speedup claim.'};
writeFileSync(join(out,'resources.json'),JSON.stringify(resources,null,2)+'\n',{flag:'wx'});
writeFileSync(join(out,'run-binding.json'),JSON.stringify({schema:'E508-run-binding@1',candidateSha256:expectedCandidate,protocolSha256:expectedProtocol,stagedSourceJsonSha256:sha(sourceBytes),requestDescriptorSha256:sha(readFileSync(join(out,'request-descriptor.json'))),completeRequestJsonSha256:requestSha256,receiptSha256:sha(serialized),callerSha256:sha(readFileSync(new URL(import.meta.url))),status:receipt.status,compositionCalls:resources.compositionCalls,reason:receipt.reason??null},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:receipt.status,reason:receipt.reason,compositionCalls:resources.compositionCalls,elapsedMs,failures:receipt.support?.failures,receiptSha256:sha(serialized)},null,2));
