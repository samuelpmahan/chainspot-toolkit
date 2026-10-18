#!/usr/bin/env node
// Isolated source-pixel variation of the existing ribbon width bank only.
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root=resolve(process.argv[2]);
const probeScriptSha256=createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');
const stem=process.argv[3]??'AlexClark-original';
const badgeId=process.argv[4]??'badge-8';
const teeId=process.argv[5]??'tee-recovered-3';
const s5AxisMode=process.argv[6]==='--s5-axis';
const out=resolve(import.meta.dirname);
const localRequire=createRequire(join(root,'package.json'));
const dist=path=>localRequire(join(root,'packages/alg/dist',path));
const sha=data=>createHash('sha256').update(data).digest('hex');
const capture=JSON.parse(readFileSync(join(root,`artifacts/composed-render-20260927/${stem}-capture.json`)));
const jpg=join(root,capture.source.path),jpgBytes=readFileSync(jpg);
if(sha(jpgBytes)!==capture.source.sha256)throw Error('Source JPEG mismatch');
const configBytes=readFileSync(join(root,'packages/alg/src/detectors/threeFactor/configs/posterior-tee-recovery-on.json'));
if(sha(configBytes)!==capture.configSha256)throw Error('Config bytes mismatch');
const {decodeNodeFile}=dist('adapters/node');
const {stageContract}=dist('stages/S0/contract');
const {runThreeFactor,parseConfig,resolveConfig,DEFAULT_EXECUTION,canonicalJson,sha256Hex}=dist('detectors/threeFactor');
const {computeRibbonSupport,patchBadgeOcclusion}=dist('detectors/threeFactor/ribbon');
const {traceBadgeToBasket}=dist('detectors/threeFactor/features/g4.teeBadgeLockMath');
const config=resolveConfig(parseConfig(JSON.parse(configBytes)),DEFAULT_EXECUTION);
const paramsHash=await sha256Hex(canonicalJson(config));
if(paramsHash!==capture.paramsHash)throw Error('Resolved config mismatch');
const s0=await stageContract.execute({source:jpg,inputLabel:stem,decode:decodeNodeFile});
const canonical=s0.pxc.get('px.course.canonicalPixels');
if(sha(canonical.rgba)!==capture.source.frame.canonicalRgbaSha256)throw Error('Canonical pixels mismatch');
const run=runThreeFactor(canonical,{config,paramsHash});
const m=run.measurement,badge=m.badges.find(b=>b.detId===badgeId);
const paired=run.assignment.scoredPairs.find(p=>p.raw.badgeId===badgeId&&p.raw.teeId===teeId);
if(!badge||!paired)throw Error('Badge or heading-hint pair missing');
const path=[...paired.raw.teeLeg.path].reverse();
const last=path.at(-1),prior=path.at(-2),legacyHeadingRad=Math.atan2(last[1]-prior[1],last[0]-prior[0]);

const protocolBytes=readFileSync(join(out,'protocol.json'));
const oldBase=JSON.parse(readFileSync(resolve(out,'../../discovery-swarm/W2/baseline-native.json')));
const oldHeading=JSON.parse(readFileSync(resolve(out,'../../discovery-swarm/W2/heading-native.json')));
const rowBytes=readFileSync(join(out,'s5-row.json')),rowDoc=JSON.parse(rowBytes);
const rows=rowDoc.rows.filter(row=>row.teeId===teeId&&row.badgeId===badgeId&&row.basketId==='basket-10');
if(rows.length!==1||rows[0].status!=='TWO_RAY_ZERO_BEND_GEOMETRY_CANDIDATE_UNOWNED'||rowDoc.sourceSha256!==capture.source.sha256||sha(rowBytes)!==oldHeading.s5AxisEvidence.rowFileSha256)throw Error('S5 evidence mismatch');
const s5HeadingRad=Math.atan2(rows[0].u[1],rows[0].u[0]);
const field=m.field;
const fieldHashes=()=>({supportSha256:sha(Buffer.from(field.support.buffer)),thetaSha256:sha(Buffer.from(field.bestTheta.buffer))});
const before=fieldHashes();
for(const receipt of [oldBase,oldHeading]){
 if(before.supportSha256!==receipt.outcomes[0].field.supportSha256||before.thetaSha256!==receipt.outcomes[0].field.thetaSha256)throw Error('Prior field hash mismatch');
 if(sha(configBytes)!==receipt.configSha256||paramsHash!==receipt.paramsHash)throw Error('Prior source config mismatch');
 for(const [file,key] of [['ribbon.js','compiledRibbonSha256'],['features/g4.teeBadgeLockMath.js','compiledTracerSha256']])if(sha(readFileSync(join(root,'packages/alg/dist/detectors/threeFactor',file)))!==receipt[key])throw Error('Prior compiled source mismatch');
}
const center=[badge.cxPx,badge.cyPx],step=m.parameters.corridorWidthPx/4;
const inside=(bbox,[x,y])=>x>=bbox[0]&&y>=bbox[1]&&x<=bbox[0]+bbox[2]&&y<=bbox[1]+bbox[3];
const fieldAt=([x,y])=>{const i=Math.max(0,Math.min(field.height-1,Math.round((y-m.viewport.topPx)/field.scale)))*field.width+Math.max(0,Math.min(field.width-1,Math.round(x/field.scale)));return {support:field.support[i],thetaRad:field.bestTheta[i]}};
const exitSeed=(h,extra)=>{const d=[Math.cos(h),Math.sin(h)],b=badge.bbox,tx=d[0]>0?(b[0]+b[2]-center[0])/d[0]:d[0]<0?(b[0]-center[0])/d[0]:Infinity,ty=d[1]>0?(b[1]+b[3]-center[1])/d[1]:d[1]<0?(b[1]-center[1])/d[1]:Infinity,t=Math.min(tx,ty);return {seed:center.map((v,i)=>v+d[i]*(t+extra)),bboxExitCanonical:center.map((v,i)=>v+d[i]*t),rayDistanceToExitPx:t,extraPx:extra}};
const variants=[];
for(const [axis,h] of [['legacy',legacyHeadingRad],['s5',s5HeadingRad]])for(const deltaDeg of [0,-15,15])variants.push({name:`center-${axis}${deltaDeg===0?'':deltaDeg<0?'-minus15':'-plus15'}`,axis,deltaDeg,headingRad:h+deltaDeg*Math.PI/180,startPx:center,seedType:'center'});
for(const [axis,h] of [['legacy',legacyHeadingRad],['s5',s5HeadingRad]])for(const multiple of [1,2]){const e=exitSeed(h,step*multiple);variants.push({name:`exit-${axis}-plus${multiple}step`,axis,deltaDeg:0,headingRad:h,startPx:e.seed,seedType:'explicit-bbox-exit',exitGeometry:e});}
const traceArgs=v=>({badgeId,startPx:v.startPx,headingRad:v.headingRad,field,viewportTopPx:m.viewport.topPx,supportTau:m.parameters.supportTau,corridorWidthPx:m.parameters.corridorWidthPx,startBadgeBbox:badge.bbox,occluders:m.badges.filter(b=>b.detId!==badgeId).map(b=>({id:b.detId,bbox:b.bbox})),baskets:m.baskets.map(b=>({basketId:b.detId,bbox:b.bbox})),maxTraceLengthPx:Math.hypot(field.width*field.scale,field.height*field.scale)});
const outcomes=variants.map(v=>{const a=traceBadgeToBasket(traceArgs(v)),b=traceBadgeToBasket(traceArgs(v));if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Nondeterministic repeat');let outsideLengthPx=0,insideLengthPx=0;for(let i=1;i<a.points.length;i++){const prev=a.points[i-1],next=a.points[i],len=Math.hypot(next[0]-prev[0],next[1]-prev[1]);if(!inside(badge.bbox,prev)&&!inside(badge.bbox,next))outsideLengthPx+=len;else insideLengthPx+=len;}const prev=a.points.at(-2),end=a.points.at(-1),next=prev?[end[0]*2-prev[0],end[1]*2-prev[1]]:null;return {...v,headingDeg:v.headingRad*180/Math.PI,rawtrace:a,nativeUnknown:a.outcome==='unknown',noBasket:a.basketId===undefined,determinismExact:true,geometry:{outsideBadgeSegmentsLengthPx:outsideLengthPx,segmentsTouchingBadgeLengthPx:insideLengthPx,pointCount:a.points.length,outsidePointCount:a.points.filter(p=>!inside(badge.bbox,p)).length},samples:a.points.map(point=>({point,sourcePoint:[point[0],point[1]+4],...fieldAt(point),insideOwnBadge:inside(badge.bbox,point)})),nextStraightProbe:next?{point:next,...fieldAt(next),insideOwnBadge:inside(badge.bbox,next)}:null}});
const baselineMatch=JSON.stringify(outcomes.find(o=>o.name==='center-legacy').rawtrace)===JSON.stringify(oldBase.outcomes[0].traced);
const s5Match=JSON.stringify(outcomes.find(o=>o.name==='center-s5').rawtrace)===JSON.stringify(oldHeading.outcomes[0].traced);
if(!baselineMatch||!s5Match)throw Error('Control trace mismatch');
const after=fieldHashes();if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Shared field mutation');
const receipt={schema:'c1-native-counterfactual-receipt@1',job_id:'E301',worker:'C1',protocolSha256:sha(protocolBytes),producerSha256:probeScriptSha256,executionUtc:new Date().toISOString(),source:capture.source,configSha256:sha(configBytes),paramsHash,parameters:m.parameters,viewport:m.viewport,badge:{detId:badge.detId,bbox:badge.bbox,center},headingProvenance:{legacyHeadingRad,s5HeadingRad,rowSha256:sha(rowBytes),rowStatus:rows[0].status,role:'geometry hint only; no endpoint ownership'},field:{width:field.width,height:field.height,scale:field.scale,...before,hashesAfter:after,source:'runThreeFactor(...).measurement.field; same object all 20 calls'},controls:{baselineExact:baselineMatch,s5Exact:s5Match,oldBaselineReceiptSha256:sha(readFileSync(resolve(out,'../../discovery-swarm/W2/baseline-native.json'))),oldS5ReceiptSha256:sha(readFileSync(resolve(out,'../../discovery-swarm/W2/heading-native.json')))},tracerCommonArgs:{viewportTopPx:m.viewport.topPx,supportTau:m.parameters.supportTau,corridorWidthPx:m.parameters.corridorWidthPx,startBadgeBbox:badge.bbox,occluders:m.badges.filter(b=>b.detId!==badgeId).map(b=>({id:b.detId,bbox:b.bbox})),baskets:m.baskets.map(b=>({basketId:b.detId,bbox:b.bbox})),maxTraceLengthPx:Math.hypot(field.width*field.scale,field.height*field.scale)},outcomes};
writeFileSync(join(out,'native-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({field:receipt.field,controls:receipt.controls,variants:outcomes.map(o=>({name:o.name,lengthPx:o.rawtrace.lengthPx,outsideLengthPx:o.geometry.outsideBadgeSegmentsLengthPx,outcome:o.rawtrace.outcome,reason:o.rawtrace.reason,basketId:o.rawtrace.basketId??null,determinism:o.determinismExact}))},null,2));
