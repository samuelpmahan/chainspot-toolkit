import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {profileAt,widthSearchAt,edgePairOf,OFFS,stationContrastAt} from './vendor/active/ports/s6straight/pathSpace.mjs';
import {observeFourLaneCrossSection as observe,estimateFourLaneCorridorWidth as estimate} from './vendor/dev72/fourLaneRibbon.ts';
const root=new URL('./',import.meta.url), sha=b=>createHash('sha256').update(b).digest('hex');
const protocolBytes=readFileSync(new URL('protocol.json',root)), protocol=JSON.parse(protocolBytes);
const sources=JSON.parse(readFileSync(new URL('provenance.json',root))).sources.map(s=>{ const b=readFileSync(new URL(s.file,root));assert.equal(sha(b),s.sha256);return {...s,verified:true}; });
const fixtures={
 corridor40:(x,y)=>y>=80&&y<120,
 corridor30:(x,y)=>y>=85&&y<115,
 'center-shift8':(x,y)=>y>=88&&y<128,
 ragged:(x,y)=>Math.abs(y-100)<(28+24*(.5+.5*Math.sin(x/17)))/2,
 'large-ellipse':(x,y)=>((x-150)/140)**2+((y-100)/58)**2<=1,
 'capsule-patch':(x,y)=>(x-Math.max(60,Math.min(240,x)))**2+(y-99.5)**2<=400,
 crossing:(x,y)=>(y>=80&&y<120)||(x>=137&&x<163)
};
const segment={tee:{xPx:40,yPx:100},badge:{xPx:260,yPx:100}}, widths=[24,30,36,40,42,48,54], origin=[40,100], ph=0;
const unpack=p=>({nT:p.nT,offsetsPx:Array.from(OFFS),profLum:p.prof?Array.from(p.prof):null,okCount:p.ok?Array.from(p.ok):null});
const make=(fn)=>{const W=320,H=200,data=new Uint8Array(W*H*4);for(let y=0;y<H;y++)for(let x=0;x<W;x++){const v=fn(x,y)?145:100;data.set([v,v,v,255],(y*W+x)*4);}return {width:W,height:H,data};};
const state=(x=150,y=100,w=40)=>({xPx:x,yPx:y,headingRad:0,corridorWidthPx:w});
const rows=[];
for(const [id,fn] of Object.entries(fixtures)) {
 const image=make(fn), c={W:320,H:200,lum:Float64Array.from({length:320*200},(_,i)=>image.data[4*i]),mask:null};
 const globalProfile=profileAt(c,origin,ph,44,188);
 const globalDefault=widthSearchAt(c,origin,ph,44,188),globalWide=widthSearchAt(c,origin,ph,44,188,{latLim:12});
 const learned=estimate(image,[segment],[],widths);
 const stationRows=protocol.stationXSourcePx.map(x=>{
  const p=profileAt(c,[x,100],0,-8,8), fit=widthSearchAt(c,[x,100],0,-8,8,{latLim:12});
  const atWidth=w=>observe(image,state(x,100,w));
  const obs={atWidth30:atWidth(30),atWidth40:atWidth(40),atLearnedWidth:atWidth(learned.widthPx)};
  const recentered=fit?{state:state(x,100+fit.cPx,fit.wPx),observation:observe(image,state(x,100+fit.cPx,fit.wPx))}:null;
  return {xPx:x,originPx:[x,100],profileWindowAlongPx:[-8,8],defaultFit:widthSearchAt(c,[x,100],0,-8,8),wideFit:fit,edgeExpected30:edgePairOf(p,30),edgeExpected40:edgePairOf(p,40),rawChannels:obs,recentered,ratios:fit?{widthOver40:fit.wPx/40,centerOffsetOverWidth:fit.cPx/fit.wPx}:null,profile:unpack(p)};
 });
 const sc=stationContrastAt(c,origin,0,protocol.stationXSourcePx.map(x=>x-40),40);
 rows.push({id,fixtureDescription:protocol.cases.find(c=>c.id===id),image:{width:320,height:200,sha256:sha(image.data)},global:{profile:unpack(globalProfile),defaultFit:globalDefault,wideFit:globalWide,edgeExpected30:edgePairOf(globalProfile,30),edgeExpected40:edgePairOf(globalProfile,40),widthLearned:learned},stationRows,contrastAtExpectedWidth40:{leftLum:Array.from(sc.cl),rightLum:Array.from(sc.cr),okLeft:Array.from(sc.okl),okRight:Array.from(sc.okr)}});
 writeFileSync(new URL(`${id}.rgba`,root),image.data);
}
const get=id=>rows.find(r=>r.id===id);
const checks=[];const check=(id,fn,meaning)=>{fn();checks.push({id,status:'PASS',meaning});};
check('two-local-widths',()=>{assert.equal(get('corridor40').global.defaultFit.wPx,40);assert.equal(get('corridor30').global.defaultFit.wPx,30);},'Distinct LOCAL source-pixel widths measured without a meter-scale claim.');
check('midpoint-reveals-shift',()=>{assert.equal(get('center-shift8').global.defaultFit,null);assert.equal(get('center-shift8').global.wideFit.cPx,7.5);assert.ok(get('center-shift8').stationRows.every(s=>s.recentered.observation.score===1));},'Center-midpoint is geometric diagnosis; default rejection alone does not mean ribbon absent.');
check('capsule-survives-entire-composition',()=>{assert.deepEqual(get('capsule-patch').global,get('corridor40').global);assert.deepEqual(get('capsule-patch').stationRows,get('corridor40').stationRows);},'Organic capsule and corridor have byte-identical exposed measurement profiles/channels; semantic path identity is not observed.');
check('large-bright-no-local-pair',()=>{assert.equal(get('large-ellipse').global.wideFit,null);},'Bright patch contains no selected bilateral pair within fixed normal profile window.');
check('crossing-local-failure-global-fit',()=>{assert.equal(get('crossing').global.wideFit.wPx,40);assert.equal(get('crossing').stationRows[2].wideFit,null);assert.equal(get('crossing').stationRows[2].rawChannels.atWidth40.score,0);},'A global pair can coexist with unsupported central crossing station.');
check('ragged-independent-window-variation',()=>{const a=get('ragged').stationRows.map(s=>s.wideFit?.wPx).filter(v=>v!==undefined);assert.ok(Math.max(...a)-Math.min(...a)>10);},'Independent station profile fits disclose variation hidden by one averaged cross section; >10 is a descriptive fixture assertion, not acceptance policy.');
const receipt={schema:'C3-E302-bilateral-composition-receipt@1',job_id:'E302',worker:'C3',outcome:'mixed_change',protocolSha256:sha(protocolBytes),runtime:{node:process.version},sourceIDs:sources,sourceIntegrity:'4 exact source files SHA256 verified; imported only pathSpace and Dev72, provider unused',units:{frame:protocol.frame,edges:'normal offsets source px relative station origin; image center y=100+cPx at phi0',edgeStrength:'RGB mean luminance/source px',channels:'source-normalized dimensionless lift (not confidence)',widthRatios:'dimensionless'},checks,cases:rows,limits:['Exposed deterministic synthetic mechanism fixtures, no held-out validation.','No endpoint identity, physical scale, organic-class rejection or production policy claimed.','Dev72 nearest-pixel sampler differs from pathSpace bilinear profile; fitted pixel-edge width and corridor tolerance remain distinct.','No new pixel measurement math; fixture raster generation only.','Source profile reach and width search defaults remain source-pixel contracts, not global scale invariants.']};
writeFileSync(new URL('receipt.json',root),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',checks:checks.length,cases:rows.length,stationSamples:rows.reduce((n,r)=>n+r.stationRows.length,0),summary:rows.map(r=>({id:r.id,globalWidth:r.global.wideFit?.wPx??null,globalCenter:r.global.wideFit?.cPx??null,learned:r.global.widthLearned,stationWidths:r.stationRows.map(s=>s.wideFit?.wPx??null),stationOffsets:r.stationRows.map(s=>s.wideFit?.cPx??null),stationCombined40:r.stationRows.map(s=>s.rawChannels.atWidth40.score)}))},null,2));
