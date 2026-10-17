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
const out=resolve(import.meta.dirname,'width-probe',`${stem}-${badgeId}${s5AxisMode?'-s5-axis':''}`);
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
let headingRad=legacyHeadingRad,headingSource='legacy teeLeg final approach';
let s5AxisEvidence=null;
if(s5AxisMode){
  if(stem!=='IMG_5641')throw Error('S5 axis counterfactual is bounded to IMG_5641');
  const rowPath=resolve(process.argv[7]??resolve(import.meta.dirname,'../s6/replay/artifacts/s6-two-ray/baseline/IMG_5641-rows.json'));
  const rowBytes=readFileSync(rowPath),rowDoc=JSON.parse(rowBytes);
  if(rowDoc.sourceSha256!==capture.source.sha256)throw Error('Sealed S6 source mismatch');
  const rows=rowDoc.rows.filter(row=>row.teeId===teeId&&row.badgeId===badgeId&&row.basketId==='basket-10');
  if(rows.length!==1)throw Error('Expected exact S6 row missing/ambiguous');
  const row=rows[0];
  if(row.status!=='TWO_RAY_ZERO_BEND_GEOMETRY_CANDIDATE_UNOWNED')throw Error('S6 row status changed');
  headingRad=Math.atan2(row.u[1],row.u[0]);
  headingSource='sealed S6 two-ray row, fixed S5 visible-tee axis u toward badge; geometry hint only';
  s5AxisEvidence={rowPath,rowFileSha256:sha(rowBytes),rowId:row.id,rowStatus:row.status,u:row.u,
    headingDeg:headingRad*180/Math.PI,legacyHeadingDeg:legacyHeadingRad*180/Math.PI,
    signedDeltaDeg:Math.atan2(Math.sin(headingRad-legacyHeadingRad),Math.cos(headingRad-legacyHeadingRad))*180/Math.PI,
    badgeCenterSource:row.badgeCenter,teeCenterSource:row.teeCenter};
}
const image={width:canonical.widthPx,height:canonical.heightPx,data:canonical.rgba};
const knobs=config.features.ribbon.knobs;
const banks=s5AxisMode?[['baseline',m.parameters.widthsSrc]]:
  [['baseline',m.parameters.widthsSrc],['width40',[40]],['width50',[50]],['width55',[55]],
    ['baselinePlus50And55',[24,32,40,48,50,55,56,64]]];
const fieldAt=(field,[x,y])=>field.support[Math.max(0,Math.min(field.height-1,Math.round((y-m.viewport.topPx)/field.scale)))*field.width+Math.max(0,Math.min(field.width-1,Math.round(x/field.scale)))];
const inside=(bbox,[x,y])=>x>=bbox[0]&&y>=bbox[1]&&x<=bbox[0]+bbox[2]&&y<=bbox[1]+bbox[3];
const outcomes=[];
let baselineExitTrial=null;
for(const [name,widthsSrc] of banks){
  const field=computeRibbonSupport(image,{...m.parameters,widthsSrc},knobs);
  if(m.parameters.patchBadges)patchBadgeOcclusion(field,image,m.badges,m.parameters.corridorWidthPx,knobs);
  let baselineExact=null;
  if(name==='baseline'){
    baselineExact=field.support.length===m.field.support.length && field.support.every((value,index)=>Object.is(value,m.field.support[index]))
      && field.bestTheta.every((value,index)=>Object.is(value,m.field.bestTheta[index]));
    if(!baselineExact)throw Error('Direct recomputation differs from gateway support field');
  }
  const traced=traceBadgeToBasket({badgeId,startPx:[badge.cxPx,badge.cyPx],headingRad,field,
    viewportTopPx:m.viewport.topPx,supportTau:m.parameters.supportTau,corridorWidthPx:m.parameters.corridorWidthPx,
    startBadgeBbox:badge.bbox,occluders:m.badges.filter(b=>b.detId!==badgeId).map(b=>({id:b.detId,bbox:b.bbox})),
    baskets:m.baskets.map(b=>({basketId:b.detId,bbox:b.bbox})),maxTraceLengthPx:Math.hypot(field.width*field.scale,field.height*field.scale)});
  const end=traced.points.at(-1),prev=traced.points.at(-2);
  const next=end&&prev?[end[0]*2-prev[0],end[1]*2-prev[1]]:null;
  if(name==='baseline')baselineExitTrial=next;
  let sum=0,above=0,nonzero=0;
  for(const value of field.support){sum+=value;if(value>=m.parameters.supportTau)above++;if(value>0)nonzero++}
  outcomes.push({name,widthsSrc,variantIdentitySha256:sha(JSON.stringify({source:capture.source.sha256,
      canonical: capture.source.frame.canonicalRgbaSha256,baselineParamsHash:paramsHash,
      ribbonJs:sha(readFileSync(join(root,'packages/alg/dist/detectors/threeFactor/ribbon.js'))),
      tracerJs:sha(readFileSync(join(root,'packages/alg/dist/detectors/threeFactor/features/g4.teeBadgeLockMath.js'))),
      probeScriptSha256,widthsSrc,fieldScale:m.parameters.fieldScale,corridorWidthPx:m.parameters.corridorWidthPx,
      supportTau:m.parameters.supportTau,badgeId,teeId,headingRad,s5AxisRowSha256:s5AxisEvidence?.rowFileSha256??null})),field:{width:field.width,height:field.height,scale:field.scale,
      supportSha256:sha(Buffer.from(field.support.buffer)),thetaSha256:sha(Buffer.from(field.bestTheta.buffer)),
      meanSupport:sum/field.support.length,fractionAboveTau:above/field.support.length,nonzeroCells:nonzero},
    baselineExact,traced,points:traced.points.map(point=>({point,support:fieldAt(field,point),insideOwnBadge:inside(badge.bbox,point)})),
    fixedBaselineExitTrial:baselineExitTrial?{point:baselineExitTrial,support:fieldAt(field,baselineExitTrial),insideOwnBadge:inside(badge.bbox,baselineExitTrial)}:null,
    nextStraightProbe:next?{point:next,support:fieldAt(field,next),insideOwnBadge:inside(badge.bbox,next)}:null});
}
const result={schema:'s7-width-bank-probe@1',source:capture.source,configSha256:sha(configBytes),paramsHash,
  probeScriptSha256,
  compiledRibbonSha256:sha(readFileSync(join(root,'packages/alg/dist/detectors/threeFactor/ribbon.js'))),
  compiledTracerSha256:sha(readFileSync(join(root,'packages/alg/dist/detectors/threeFactor/features/g4.teeBadgeLockMath.js'))),
  stem,badgeId,teeId,headingRad,headingSource,s5AxisEvidence,badge:{label:badge.label,bbox:badge.bbox,center:[badge.cxPx,badge.cyPx]},
  note:'paramsHash identifies the untouched baseline gateway config; each variant has its own identity including widthsSrc and direct calculation JS hashes. Only widthsSrc varies. Each width is full canonical-source pixels sampled at half width / fieldScale 3. Normalization recomputed per bank. SupportTau=.5 and corridorWidthPx=37 remain fixed; no claimed basket on forced reachability. Variant hash does not cover every transitive dependency.',
  parameters:{...m.parameters},outcomes};
mkdirSync(out,{recursive:true});
writeFileSync(join(out,'width-probe.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({sourceSha256:capture.source.sha256,paramsHash,baselineExact:outcomes[0].baselineExact,
  headingSource,s5AxisEvidence,
  variants:outcomes.map(o=>({name:o.name,widthsSrc:o.widthsSrc,outcome:o.traced.outcome,
    reason:o.traced.reason,basketId:o.traced.basketId,lengthPx:o.traced.lengthPx,bendCount:o.traced.bendCount,
    fixedBaselineExitTrial:o.fixedBaselineExitTrial,nextStraightProbe:o.nextStraightProbe,
    fieldSummary:{meanSupport:o.field.meanSupport,fractionAboveTau:o.field.fractionAboveTau}}))},null,2));
