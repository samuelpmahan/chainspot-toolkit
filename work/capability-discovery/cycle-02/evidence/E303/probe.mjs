import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {estimateFourLaneCorridorWidth,observeFourLaneCrossSection} from './source/vendor/dev72/fourLaneRibbon.ts';
import {widthSearchAt,profileAt,edgePairOf,samp,OFFS} from './source/vendor/active/ports/s6straight/pathSpace.mjs';
const here=new URL('./',import.meta.url),read=p=>readFileSync(new URL(p,here)),sha=b=>createHash('sha256').update(b).digest('hex');
const protocol=JSON.parse(read('protocol.json')),manifest=JSON.parse(read('source/provenance.json'));
const sourceHashes=manifest.sources.map(s=>{const bytes=read('source/'+s.file);assert.equal(sha(bytes),s.sha256);return {...s,verified:true};});
const radians=d=>d*Math.PI/180;
function build(spec,side){
  const W=256,H=256,width=spec[side+'Width'],phi=radians(spec[side+'Deg']),kind=spec[side+'Kind']??'ribbon',level=spec[side+'Rgb']??(kind==='ellipse'?190:145);
  const tx=Math.cos(phi),ty=Math.sin(phi),nx=-ty,ny=tx,data=new Uint8Array(W*H*4),lum=new Float64Array(W*H),mask=new Uint8Array(W*H);
  const occlusion=spec[side+'Occlusion'],occluders=occlusion==='all'?[{bboxX:0,bboxY:0,bboxW:256,bboxH:256}]:occlusion==='rails'?[{bboxX:40,bboxY:108,bboxW:176,bboxH:11},{bboxX:40,bboxY:137,bboxW:176,bboxH:11}]:[];
  const occupiedColumnRows=[];
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const dx=x-128,dy=y-128,t=dx*tx+dy*ty,n=dx*nx+dy*ny;
    const inside=kind==='ellipse'?(t/180)**2+(n/(width/2))**2<1:Math.abs(t)<110&&Math.abs(n)<width/2;
    const g=inside?level:100,i=y*W+x;lum[i]=g;data.set([g,g,g,255],4*i);
    if(x===128&&inside)occupiedColumnRows.push(y);
    if(occluders.some(o=>x>=o.bboxX&&x<=o.bboxX+o.bboxW&&y>=o.bboxY&&y<=o.bboxY+o.bboxH))mask[i]=1;
  }
  const originOffset=spec[side+'OriginNormalOffset']??0,origin=[128+nx*originOffset,128+ny*originOffset];
  const point=t=>({xPx:origin[0]+tx*t,yPx:origin[1]+ty*t});
  return {image:{width:W,height:H,data},ctx:{W,H,lum,mask:occluders.length?mask:null},phi,origin,point,occluders,width,kind,level,occupiedColumnRows,originOffset,tx,ty,nx,ny};
}
function separation(scene,t){
  if(scene.level===100)return {tPx:t,halfLevel:null,crossingsNormalPx:[],separationPx:null};
  const threshold=(scene.level+100)/2,crossings=[],step=.05;let last=null;
  for(let k=0;k<=2800;k++){const n=-70+k*step,x=128+scene.tx*t+scene.nx*n,y=128+scene.ty*t+scene.ny*n,v=samp(scene.ctx.lum,256,256,x,y)-threshold;
    if(last&&((last.v<0&&v>=0)||(last.v>=0&&v<0)))crossings.push(last.n+(n-last.n)*(-last.v)/(v-last.v));last={n,v};}
  return {tPx:t,halfLevel:threshold,crossingsNormalPx:crossings,separationPx:crossings.length===2?crossings[1]-crossings[0]:null,measurementFrame:'object-centered normal, before caller origin offset'};
}
const stations=protocol.evaluation.stationTpx;
const cases=protocol.cases.map(spec=>{
  const train=build(spec,'train'),evalScene=build(spec,'eval');
  const segments=[{tee:train.point(-60),badge:train.point(60)}];
  const estimate=estimateFourLaneCorridorWidth(train.image,segments,train.occluders,protocol.candidateWidthsPx,{});
  const trainProfile=profileAt(train.ctx,train.origin,train.phi,-40,40),evalProfile=profileAt(evalScene.ctx,evalScene.origin,evalScene.phi,-50,50);
  const fittedTrain=widthSearchAt(train.ctx,train.origin,train.phi,-40,40,protocol.evaluation.freeWidthSearchArguments);
  const fittedEval=widthSearchAt(evalScene.ctx,evalScene.origin,evalScene.phi,-50,50,protocol.evaluation.freeWidthSearchArguments);
  const constrainedEval=edgePairOf(evalProfile,estimate.widthPx,protocol.evaluation.edgePairArguments);
  const rawTrainingRows=protocol.candidateWidthsPx.map(widthPx=>({widthPx,stations:protocol.training.sourceFractions.map(f=>{const p=train.point(-60+120*f);return {fraction:f,state:{...p,headingRad:train.phi,corridorWidthPx:widthPx},observation:observeFourLaneCrossSection(train.image,{...p,headingRad:train.phi,corridorWidthPx:widthPx},train.occluders,{})};})}));
  const rawEvaluationRows=stations.map(t=>{const p=evalScene.point(t);return {tPx:t,independentStation:true,state:{...p,headingRad:evalScene.phi,corridorWidthPx:estimate.widthPx},learnedWidthObservation:observeFourLaneCrossSection(evalScene.image,{...p,headingRad:evalScene.phi,corridorWidthPx:estimate.widthPx},evalScene.occluders,{}),candidateObservations:protocol.candidateWidthsPx.map(widthPx=>({widthPx,observation:observeFourLaneCrossSection(evalScene.image,{...p,headingRad:evalScene.phi,corridorWidthPx:widthPx},evalScene.occluders,{})}))};});
  const sorted=estimate.scores.filter(r=>Number.isFinite(r.meanScore)).toSorted((a,b)=>b.meanScore-a.meanScore||a.widthPx-b.widthPx),margin=sorted.length>1?sorted[0].meanScore-sorted[1].meanScore:null;
  const diagnosticStatus=!estimate.scores.some(r=>r.visibleSamples>0)?'ABSTAIN_NO_VISIBLE_TRAINING':!sorted.length||sorted[0].meanScore<=0||margin===0?'ABSTAIN_ZERO_OR_TIED':'EXPOSED_SEPARATED_SOURCE_SCORE_ONLY';
  return {id:spec.id,exposure:'exposed exploration',input:spec,trainingSegment:segments[0],estimate,scoreSeparation:margin,diagnosticStatus,calibratedWidthPx:null,trainingRaster:{nominalWidthArgumentPx:train.width,kind:train.kind,occupiedRowsAtCenterColumn:train.occupiedColumnRows,occupiedRowCountAtCenterColumn:train.occupiedColumnRows.length,columnMeasurementNote:'vertical source-raster rows at x128; for rotation not a normal-width measure',bilinearCenterNormalSeparation:separation(train,0)},evaluationRaster:{nominalWidthArgumentPx:evalScene.width,kind:evalScene.kind,occupiedRowsAtCenterColumn:evalScene.occupiedColumnRows,occupiedRowCountAtCenterColumn:evalScene.occupiedColumnRows.length,bilinearNormalSeparationByStation:stations.map(t=>separation(evalScene,t)),originNormalOffsetPx:evalScene.originOffset},fits:{trainFree:fittedTrain,evalFree:fittedEval,evalAtLearnedWidth:constrainedEval},rawTrainingRows,rawEvaluationRows,profiles:{offsetsNormalPx:Array.from(OFFS),train:{nT:trainProfile.nT,lum:Array.from(trainProfile.prof),visibleCount:Array.from(trainProfile.ok)},evaluation:{nT:evalProfile.nT,lum:Array.from(evalProfile.prof),visibleCount:Array.from(evalProfile.ok)}}};
});
const out={schema:'tee-badge-width-transfer-receipt@1',job_id:'E303',worker:'C5',exposure:'ALL EXPOSED',protocolSha256:sha(read('protocol.json')),probeSha256:sha(read('probe.mjs')),sourceHashes,runtime:process.version,cases,units:{widths:'same-raster source px; no meters/global scale',profile:'RGB-mean lum levels at normal offsets',fitScore:'lum/source-px gradient',fourLaneScores:'dimensionless clamped source band lift, not calibrated probability'}};
const replacer=(_k,v)=>typeof v==='number'&&!Number.isFinite(v)?{numberKind:'nonfinite',value:String(v)}:v;
writeFileSync(new URL('measurements.json',here),JSON.stringify(out,replacer,2)+'\n');
console.log(JSON.stringify({job_id:'E303',protocolSha256:out.protocolSha256,probeSha256:out.probeSha256,sourceHashes:sourceHashes.map(s=>({file:s.file,sha256:s.sha256})),cases:cases.map(c=>({id:c.id,estimate:c.estimate,status:c.diagnosticStatus,margin:c.scoreSeparation,fitTrain:c.fits.trainFree,fitEval:c.fits.evalFree,fitConstrained:c.fits.evalAtLearnedWidth,evalLearned:c.rawEvaluationRows.map(r=>({t:r.tPx,score:r.learnedWidthObservation.score,railScore:r.learnedWidthObservation.railScore,innerScore:r.learnedWidthObservation.innerScore,railMode:r.learnedWidthObservation.railMode}))}))},replacer,2));
