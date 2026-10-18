import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {observeFourLaneCrossSection,estimateFourLaneCorridorWidth} from './vendor/dev72/fourLaneRibbon.ts';
import {profileAt,edgePairOf,samp,OFFS,EVIDENCE} from './vendor/active/ports/s6straight/pathSpace.mjs';
const here=dirname(fileURLToPath(import.meta.url)),sha=b=>createHash('sha256').update(b).digest('hex'),protocolBytes=readFileSync(join(here,'protocol.json')),P=JSON.parse(protocolBytes);
const sourceChecks=P.sources.map(s=>{const bytes=readFileSync(join(here,s.file));const hash=sha(bytes),blob=createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`),bytes])).digest('hex');if(hash!==s.sha256||blob!==s.gitBlob)throw Error('Source mismatch '+s.file);return {...s,verified:true}});
const preserve=(k,v)=>typeof v==='number'&&!Number.isFinite(v)?{nonfinite:Number.isNaN(v)?'NaN':v>0?'Infinity':'-Infinity'}:ArrayBuffer.isView(v)?Array.from(v):v;
const stable=v=>JSON.stringify(v,preserve);
function fixture(widthPx,phasePx,mode){
 const W=160,H=160,cy=80+phasePx,lower=cy-widthPx/2,upper=cy+widthPx/2,data=new Uint8Array(W*H*4),levels=[],coverages=[];
 for(let y=0;y<H;y++){const coverage=mode==='crisp-point'?+(lower<=y&&y<upper):Math.max(0,Math.min(y+.5,upper)-Math.max(y-.5,lower));const level=Math.floor(100+45*coverage+.5);coverages.push(coverage);levels.push(level);for(let x=0;x<W;x++)data.set([level,level,level,255],(y*W+x)*4)}
 const crossings=[];for(let y=0;y<H-1;y++)if((levels[y]<122.5&&levels[y+1]>=122.5)||(levels[y]>=122.5&&levels[y+1]<122.5))crossings.push(y+(122.5-levels[y])/(levels[y+1]-levels[y]));
 return {id:`W${widthPx}-p${phasePx}-${mode}`,image:{width:W,height:H,data},widths:{nominalWidthPx:widthPx,nominalCenterYPx:cy,nominalEdgesYPx:[lower,upper],nonzeroRasterSpanPx:levels.filter(v=>v>100).length,fullyBrightRowsPx:levels.filter(v=>v===145).length,integratedRasterContrastWidthPx:levels.reduce((a,v)=>a+(v-100)/45,0),bilinearHalfLevelEdgesYPx:crossings,bilinearHalfLevelEdgeSeparationPx:crossings.length===2?crossings[1]-crossings[0]:null},ribbonPhasePx:phasePx,mode,levels,coverages,rgbaSha256:sha(data)};
}
const fixtures=[],rows=[];
for(const widthPx of P.fixtures.widthPx)for(const phasePx of P.fixtures.ribbonCenterPhasePx)for(const mode of P.fixtures.rasterModes){
 const f=fixture(widthPx,phasePx,mode);const lum=Float64Array.from({length:160*160},(_,i)=>f.image.data[4*i]),ctx={W:160,H:160,lum,mask:null};
 fixtures.push({id:f.id,...f.widths,ribbonPhasePx:phasePx,mode,rgbaSha256:f.rgbaSha256,rowLuminance:f.levels,analyticOrPointCoverages:f.coverages});
 for(const queryPhasePx of P.query.sampleCenterPhasePx){
  const cy=80+queryPhasePx,state={xPx:80,yPx:cy,headingRad:0},segment={tee:{xPx:30,yPx:cy},badge:{xPx:130,yPx:cy}};
  const execute=()=>{const learner=estimateFourLaneCorridorWidth(f.image,[segment],[],P.query.widthBankPx);const profile=profileAt(ctx,[30,cy],0,0,100);const fourlane=P.query.widthBankPx.map(corridorWidthPx=>({widthPx:corridorWidthPx,observation:observeFourLaneCrossSection(f.image,{...state,corridorWidthPx},[])}));const edges=P.query.widthBankPx.map(expectedWidthPx=>({expectedWidthPx,fit:edgePairOf(profile,expectedWidthPx)}));return {learner,profile,fourlane,edges}};
  const a=execute(),b=execute();if(stable(a)!==stable(b))throw Error('Nondeterministic original API repeat');
  const finite=a.learner.scores.filter(r=>Number.isFinite(r.meanScore)&&r.visibleSamples>0),max=finite.length?Math.max(...finite.map(r=>r.meanScore)):null,winners=finite.filter(r=>r.meanScore===max).map(r=>r.widthPx);
  rows.push({fixtureId:f.id,queryPhasePx,state,segment,sourceAPIs:a,learnerInterpretation:{legacyNumericWidthPx:a.learner.widthPx,finiteMaximumMeanScore:max,tiedBestWidthsPx:winners,strictFiniteWinner:winners.length===1,uniqueWidthInterpretation:winners.length===1?'strict numerical winner only; no physical/calibration confidence':'UNKNOWN: no unique finite best',calibrationClaim:'UNKNOWN: no independent calibration/acceptance policy'},bilinearSourceSamplesAtNominalEdges:f.widths.nominalEdgesYPx.map(y=>({xPx:80,yPx:y,luminance:samp(lum,160,160,80,y)})),determinismRepeatExact:true});
 }
}
const range=v=>v.length?{min:Math.min(...v),max:Math.max(...v),span:Math.max(...v)-Math.min(...v)}:null;
const stability=[];
for(const widthPx of P.fixtures.widthPx)for(const mode of P.fixtures.rasterModes){const ids=new Set(fixtures.filter(f=>f.nominalWidthPx===widthPx&&f.mode===mode).map(f=>f.id)),r=rows.filter(r=>ids.has(r.fixtureId)),nominalFits=r.map(r=>r.sourceAPIs.edges.find(e=>e.expectedWidthPx===widthPx).fit),nominalChannels=r.map(r=>r.sourceAPIs.fourlane.find(e=>e.widthPx===widthPx).observation);stability.push({nominalWidthPx:widthPx,mode,poseRows:r.length,learnerLegacyWidthsPx:[...new Set(r.map(r=>r.sourceAPIs.learner.widthPx))],learnerTieRows:r.filter(r=>!r.learnerInterpretation.strictFiniteWinner).length,nominalFitAbsent:nominalFits.filter(f=>f===null).length,nominalFittedWidthPx:range(nominalFits.filter(Boolean).map(f=>f.wPx)),nominalFitScoreLumPerPx:range(nominalFits.filter(Boolean).map(f=>f.score)),nominalRailScoreDimensionless:range(nominalChannels.map(o=>o.railScore).filter(v=>v!==null)),nominalCombinedScoreDimensionless:range(nominalChannels.map(o=>o.score).filter(v=>v!==null))})}
const sourceHashesAfter=P.sources.map(s=>({file:s.file,sha256:sha(readFileSync(join(here,s.file)))}));for(const s of sourceHashesAfter)if(s.sha256!==P.sources.find(t=>t.file===s.file).sha256)throw Error('Source mutation');
const receipt={schema:'E309-AA-sampler-seam-receipt@1',job_id:'E309',worker:'C1',exposure:'EXPOSED exploration, not heldout',protocolSha256:sha(protocolBytes),producerSha256:sha(readFileSync(fileURLToPath(import.meta.url))),runtime:{node:process.version},sources:sourceChecks,sourceHashesAfter,sourceAPIConventions:{Dev72:'grayAt nearest Math.round source sampler, original observe/learner only; source channel normalized scores dimensionless',JSProfile:'source samp bilinear over mean RGB lum; profileAt averages100stations; offsets quarter-px; edgePairOf source smoothing/gradient/parabolic fit',options:EVIDENCE,OFFS:Array.from(OFFS)},fixtureCount:fixtures.length,poseRows:rows.length,widthBankPx:P.query.widthBankPx,fixtures,rows,stability,limits:P.limits};
writeFileSync(join(here,'receipt.json'),JSON.stringify(receipt,preserve,2)+'\n');console.log(JSON.stringify({fixtureCount:fixtures.length,poseRows:rows.length,determinism:true,stability},null,2));
