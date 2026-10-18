import assert from 'node:assert/strict';import {readFileSync,writeFileSync,mkdirSync}from'node:fs';import{resolve,dirname}from'node:path';import{fileURLToPath,pathToFileURL}from'node:url';
import{validateCatalog}from'../validate.mjs';import{widthEvidence,observationChannels}from'../guards.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),c=JSON.parse(readFileSync(resolve(root,'catalog.json'))),r=JSON.parse(readFileSync(resolve(root,'recipes.json')));
assert.equal(validateCatalog(c,r,{root}).status,'PASS');
// Import-specifier adaptation only, after checking source bytes. Original snapshots remain exact.
const runtime=resolve(root,'.runtime');mkdirSync(runtime,{recursive:true});
for(const name of ['ribbon','routing','scoring','assignment']){let text=readFileSync(resolve(root,`sources/provider-${name}.ts`),'utf8');text=text.replace(/from '\.\/(ribbon|routing|scoring)'/g,(_,m)=>`from './${m}.ts'`);writeFileSync(resolve(runtime,`${name}.ts`),text)}
const provider=await import(pathToFileURL(resolve(runtime,'ribbon.ts'))),route=await import(pathToFileURL(resolve(runtime,'routing.ts'))),matching=await import(pathToFileURL(resolve(runtime,'assignment.ts'))),four=await import(pathToFileURL(resolve(root,'sources/dev72-fourLaneRibbon.ts')));
const width=160,height=120,data=new Uint8Array(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const p=(y*width+x)*4,g=y>=40&&y<=80?145:100;data.set([g,g,g,255],p)}
const image={width,height,data},state={xPx:60,yPx:60,headingRad:0,corridorWidthPx:40};
const paired=four.observeFourLaneCrossSection(image,state);assert.equal(paired.score,1);assert.equal(paired.railMode,'paired');
const railMasks=[{bboxX:0,bboxY:35,bboxW:160,bboxH:10},{bboxX:0,bboxY:75,bboxW:160,bboxH:10}];
const innerOnly=four.observeFourLaneCrossSection(image,state,railMasks);assert.equal(innerOnly.railScore,null);assert.equal(innerOnly.innerScore,1);assert.equal(innerOnly.score,1);assert.equal(observationChannels(innerOnly).interiorOnly,true);
const interiorTrack=four.trackFourLaneRibbon(image,state,railMasks,{maxDistancePx:24});assert.ok(interiorTrack.steps.every(x=>x.observation.railScore===null&&x.observation.score===1));
const segments=[{tee:{xPx:20,yPx:60},badge:{xPx:130,yPx:60}}],fullMask=[{bboxX:0,bboxY:0,bboxW:width,bboxH:height}];
const hiddenWidth=four.estimateFourLaneCorridorWidth(image,segments,fullMask,[30,40,50]);assert.equal(hiddenWidth.widthPx,30);assert.ok(hiddenWidth.scores.every(x=>x.visibleSamples===0));
const hiddenGuard=widthEvidence(hiddenWidth,{segmentCount:1,candidateCount:3});assert.equal(hiddenGuard.status,'UNKNOWN');assert.equal(widthEvidence(JSON.parse(JSON.stringify(hiddenWidth)),{segmentCount:1,candidateCount:3}).status,'UNKNOWN');
const noSegments=four.estimateFourLaneCorridorWidth(image,[],[],[]);assert.equal(noSegments.widthPx,40);assert.equal(widthEvidence(noSegments,{segmentCount:0,candidateCount:0}).status,'UNKNOWN');
const measuredWidth=four.estimateFourLaneCorridorWidth(image,segments,[],[30,40,50]),measuredGuard=widthEvidence(measuredWidth,{segmentCount:1,candidateCount:3});assert.equal(measuredGuard.status,'EVIDENCE_SUPPORTED');assert.equal(measuredGuard.widthPx,40);
const seeded=four.seedFourLaneState({xPx:20,yPx:60},{xPx:60,yPx:60},40);assert.equal(four.deterministicOccluderExitDistancePx(seeded,{bboxX:50,bboxY:50,bboxW:20,bboxH:20}),10);
const transit=four.trackFourLaneRibbon(image,seeded,[{bboxX:50,bboxY:35,bboxW:20,bboxH:50}],{maxDistancePx:42});assert.equal(transit.steps.filter(x=>x.deterministicOccluderTransit).length,3);
const field=provider.computeRibbonSupport(image,{fieldScale:2,widthsSrc:[40],orientations:12});assert.ok(Array.from(field.support).every(x=>Number.isFinite(x)&&x>=0&&x<=1));assert.ok(Math.max(...field.support)>0);
const costs=provider.buildSupportCost(field);assert.ok(Array.from(costs).every(x=>Number.isFinite(x)&&x>=1&&x<=5));
const uniform={width:8,height:8,scale:2,support:new Float32Array(64).fill(1)};const routed=route.routeBadgeLegs(uniform,{id:'badge',xPx:2,yPx:102},[{id:'tee',xPx:12,yPx:102}],[],100);assert.equal(routed.tees[0].geodesic,5);assert.deepEqual(routed.tees[0].path.at(-1),[12,102]);
const pair=(badge,tee,basket,score)=>({score,raw:{badgeId:badge,teeId:tee,basketId:basket,pairId:`${badge}:${tee}:${basket}`,supportMean:1}});
const ranked=matching.rankPairsByBadge([pair('a','t1','b1',1),pair('a','t2','b2',.7),pair('b','t1','b1',.9),pair('b','t3','b3',.8)]),selected=matching.selectAssignments(ranked),rows=[...selected.values()].filter(Boolean);assert.equal(rows.length,2);assert.equal(new Set(rows.map(x=>x.raw.teeId)).size,2);assert.equal(new Set(rows.map(x=>x.raw.basketId)).size,2);
console.log(JSON.stringify({status:'PASS',acceptance:'not_assessed',R101:{innerOnly,channels:observationChannels(innerOnly),trackerCombinedSteps:interiorTrack.steps.length,hiddenWidth,hiddenGuard,noSegments,measuredGuard},support:{cells:field.support.length,max:Math.max(...field.support)},routing:{geodesic:routed.tees[0].geodesic,last:routed.tees[0].path.at(-1)},tracker:{transitSteps:3},matching:{selected:rows.map(x=>x.raw.pairId)},limits:'Synthetic bounded probe; no full scoring/corpus/geometry/acceptance or shortest-path proof.'},null,2));
