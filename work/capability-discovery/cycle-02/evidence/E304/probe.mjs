import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {describePath,countTurns} from './vendor/path-geometry.mjs';
import {observeFourLaneCrossSection} from './vendor/fourLaneRibbon.ts';
const root=new URL('./',import.meta.url),read=n=>readFileSync(new URL(n,root)),sha=b=>createHash('sha256').update(b).digest('hex');
const protocol=JSON.parse(read('protocol.json')),prepared=JSON.parse(read('prepared.json'));
assert.equal(sha(read('protocol.json')),prepared.protocolSha256);
for(const s of protocol.sources)assert.equal(sha(read(s.file)),s.sha256);
const cases=[];
for(const scene of prepared.scenes){
 const data=new Uint8Array(scene.image.gray.length*4);scene.image.gray.forEach((v,i)=>data.set([v,v,v,255],i*4));const image={width:300,height:200,data};
 for(const candidate of scene.candidates){
  const observations=candidate.samples.map(s=>observeFourLaneCrossSection(image,{xPx:s.point[0],yPx:s.point[1],headingRad:s.headingRad,corridorWidthPx:candidate.width}));
  const provenance=`E304 ${scene.id}/${candidate.id}: exact source Dev72 observations; synthetic same-frame raster, no known occluders`;
  const sampled=describePath({points:candidate.samples.map(s=>s.point),frame:`E304:${scene.id}:synthetic-source-px`,width:{fullWidthPx:candidate.width,provenance:'explicit fixture width hypothesis; not learned course width'},support:{values:observations.map(o=>o.score),threshold:.5,provenance},pairedEdges:{values:candidate.samples.map(s=>s.pairedEdges),provenance:'exact source hallway profile + edge_pair, caller scipy sampler on synthetic raster; association remains unproven'}});
  const geometry=describePath({points:candidate.points,frame:sampled.frame,width:{fullWidthPx:candidate.width,provenance:'explicit fixture width hypothesis; not learned course width'}});
  const turns=countTurns(geometry,{definition:'exploratory absolute turn > 1 degree; no accepted physical bend count',predicate:t=>t.absoluteRadians>Math.PI/180});
  const observedCenters=sampled.centerline.samples.filter(s=>s.status==='observed');
  const summary={id:`${scene.id}/${candidate.id}`,constructionCorrespondence:candidate.corresponds,lengthPx:geometry.lengthPx,turnCountOverOneDegree:turns.count,fullSignedTurnSequenceDeg:geometry.turns.map(t=>t.signedRadians*180/Math.PI),runLengthsPx:geometry.segments.map(s=>s.lengthPx),localWidthNormalizedRuns:geometry.segments.map(s=>s.lengthInFullRibbonWidths),widthHypothesisPx:candidate.width,supportSampling:sampled.supportEvidence,pairedEdgeCoverage:observedCenters.length/candidate.samples.length,meanMidpointOffsetPx:observedCenters.length?observedCenters.reduce((s,v)=>s+v.distanceFromMidpointPx,0)/observedCenters.length:null,meanMidpointOffsetFullWidths:observedCenters.length?observedCenters.reduce((s,v)=>s+v.distanceInFullWidths,0)/observedCenters.length:null,edgeUnknownCount:candidate.samples.length-observedCenters.length,sampleCount:candidate.samples.length};
  cases.push({scene:scene.id,candidate:candidate.id,truth:scene.truth,summary,geometry,turnCount:turns,sampled,observations,sourceSamples:candidate.samples});
 }
}
const by=id=>cases.find(c=>c.summary.id===id).summary;
const a=by('shortcut/curvy-center'),b=by('shortcut/straight-unsupported'),c=by('offset/center'),d=by('offset/offset-8px'),e=by('crossing/turn-to-designated-end'),f=by('crossing/straight-other-end'),g=by('width-alias/width40-hypothesis'),h=by('width-alias/width30-hypothesis');
const checks={P1:b.turnCountOverOneDegree<a.turnCountOverOneDegree&&b.lengthPx<a.lengthPx&&b.supportSampling.supportedFractionOfObserved<a.supportSampling.supportedFractionOfObserved,P2:c.lengthPx===d.lengthPx&&c.turnCountOverOneDegree===d.turnCountOverOneDegree&&d.meanMidpointOffsetPx>c.meanMidpointOffsetPx+.5,P3:f.turnCountOverOneDegree<e.turnCountOverOneDegree&&f.supportSampling.supportedFractionOfObserved>.5&&e.supportSampling.supportedFractionOfObserved>.5&&f.pairedEdgeCoverage>0&&e.pairedEdgeCoverage>0,P4:g.localWidthNormalizedRuns[0]!==h.localWidthNormalizedRuns[0]&&g.supportSampling.supportedFractionOfObserved!==h.supportSampling.supportedFractionOfObserved};
for (const [prediction,passed] of Object.entries(checks)) assert.equal(passed,true,`Frozen predicted discriminator ${prediction} failed; inspect rather than retune`);
assert.equal(h.meanMidpointOffsetPx,null);assert.equal(h.edgeUnknownCount,h.sampleCount);
const output={schema:'route-composition-measurements@1',job_id:'E304',worker:'C4',protocolSha256:prepared.protocolSha256,sources:protocol.sources,checks,cases,limits:protocol.limits};
writeFileSync(new URL('measurements.json',root),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({checks,cases:cases.map(c=>c.summary)},null,2));
