import {readFileSync,writeFileSync,mkdirSync,cpSync,appendFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {runComposition,preserveNonFinite} from '../../../chainspot-discovery-lab/experiments/capability-discovery/composition/recipe.mjs';
import {arange,profileAt,edgePairOf,lumOf} from '../../../chainspot-discovery-lab/experiments/capability-discovery/probes/width/vendor/active/ports/s6straight/pathSpace.mjs';
const here=new URL('./',import.meta.url),repo=new URL('../../../chainspot-discovery-lab/',import.meta.url),sha=b=>createHash('sha256').update(b).digest('hex');
const manifestBytes=readFileSync(new URL('../../C6/feature-manifest.json',import.meta.url));
assert.equal(sha(manifestBytes),'9ecd88635ed69ca8fb8e44ff044ac1e8fd704133c5687685b9a3114893ed9cd0');
const manifest=JSON.parse(manifestBytes),hashes=[];
for(const s of [...manifest.files,manifest.existingGuard,...manifest.immutableSources.map(s=>({path:'experiments/capability-discovery/probes/width/'+s.file,sha256:s.sha256}))]){const actual=sha(readFileSync(new URL(s.path,repo)));assert.equal(actual,s.sha256);hashes.push({...s,actual,verified:true});}
function input(nominal=30){
 const width=160,height=160,data=new Uint8Array(width*height*4),frame='R306-own-raster';
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const g=Math.abs(y-80)<nominal/2?145:100;data.set([g,g,g,255],4*(y*width+x));}
 return {enabled:true,frame,image:{width,height,data,frame},provenance:{imageId:'R306-own-exposed-stripe',geometrySource:'reviewer synthetic mathematical geometry; no semantic truth',rgbaSha256:sha(data)},training:{frame,segments:[{tee:{xPx:20,yPx:80},badge:{xPx:130,yPx:80}}]},stations:[{id:'review-ca',frame,xPx:80,yPx:80,headingRad:0,t0Px:-20,t1Px:20}],localWidthBank:{scope:'LOCAL',frame,valuesPx:[30]},occluders:{frame,boxes:[]},edgeSearch:{latLimPx:12,tolWidthPx:3}};
}
const controls=[];
const mutations={frame:i=>i.frame='wrong',hash:i=>i.image.data[0]=99,nonfiniteHeading:i=>i.stations[0].headingRad=NaN,nonfiniteWindow:i=>i.stations[0].t1Px=Infinity,nonfiniteBank:i=>i.localWidthBank.valuesPx=[NaN],duplicateBank:i=>i.localWidthBank.valuesPx=[30,30],zeroBank:i=>i.localWidthBank.valuesPx=[0],negativeMask:i=>i.occluders.boxes=[{bboxX:0,bboxY:0,bboxW:-1,bboxH:1}],nonfiniteMask:i=>i.occluders.boxes=[{bboxX:0,bboxY:0,bboxW:Infinity,bboxH:1}],duplicateStation:i=>i.stations.push({...i.stations[0]})};
for(const [id,mutate] of Object.entries(mutations)){const i=input();mutate(i);const r=runComposition(i);assert.equal(r.status,'UNKNOWN');assert.deepEqual(r.operationsExecuted,[]);controls.push({id,status:r.status,reason:r.reason,operations:r.operationsExecuted});}
const fractional=input(34);fractional.localWidthBank.valuesPx=[31.01];fractional.edgeSearch.tolWidthPx=1;
const fractionalResult=runComposition(fractional),ctx={W:160,H:160,lum:lumOf({widthPx:160,heightPx:160,rgba:fractional.image.data}),mask:null};
const direct=edgePairOf(profileAt(ctx,[80,80],0,-20,20),31.01,{tolW:1,latLim:12});
const enumeration=Array.from(arange(31.01,31.01+1,1)),fit=fractionalResult.stations[0].candidates[0].edgeFit;
assert.equal(enumeration.length,2);assert.equal(direct,null);assert.equal(fit.wPx,33);assert.equal(fit.wgPx,31.01+1);
writeFileSync(new URL('counterexample-input.json',here),JSON.stringify({...fractional,image:{...fractional.image,data:Array.from(fractional.image.data)}},null,2)+'\n');
writeFileSync(new URL('counterexample-receipt.json',here),JSON.stringify(fractionalResult,preserveNonFinite,2)+'\n');
const midpoints=[];
for(const headingRad of [0,Math.PI]){const i=input();i.stations[0].yPx=83.25;i.stations[0].headingRad=headingRad;const c=runComposition(i).stations[0].candidates[0];assert.equal(c.midpoint.candidateCenterMinusFitMidpointPx,-c.edgeFit.cPx);assert.ok(Math.abs(c.edgeFit.cPx-(headingRad===0?-3.25:3.25))<1e-10);midpoints.push({headingRad,fit:c.edgeFit,midpoint:c.midpoint,observation:c.observation});}
const hidden=input();hidden.occluders.boxes=[{bboxX:0,bboxY:0,bboxW:160,bboxH:160}];const hiddenResult=runComposition(hidden);assert.equal(hiddenResult.status,'UNKNOWN');assert.equal(hiddenResult.localWidth.widthPx,null);assert.equal(hiddenResult.rawWidthEstimate.scores[0].meanScore,-Infinity);
writeFileSync(new URL('hidden-input.json',here),JSON.stringify({...hidden,image:{...hidden.image,data:Array.from(hidden.image.data)}},null,2)+'\n');
const empty=input();empty.training.segments=[];empty.localWidthBank.valuesPx=[];const emptyResult=runComposition(empty);assert.equal(emptyResult.rawWidthEstimate.widthPx,40);assert.equal(emptyResult.status,'UNKNOWN');
const claimant=input();claimant.provenance.imageId='ASSERTED-INDEPENDENT-COURSE';claimant.provenance.geometrySource='unverified human claim';const claimantResult=runComposition(claimant);assert.equal(claimantResult.semanticIdentity.status,'UNKNOWN');assert.equal(claimantResult.localWidth.widthPx,null);
const subpixelMask=input();subpixelMask.occluders.boxes=[{bboxX:80.1,bboxY:64.9,bboxW:.2,bboxH:.2}];const subpixelResult=runComposition(subpixelMask);assert.equal(subpixelResult.promoted,false);
const closure=new URL('tamper-copy/',here);mkdirSync(closure,{recursive:true});
for(const name of ['composition','probes/width'])cpSync(new URL('experiments/capability-discovery/'+name+'/',repo),new URL(name+'/',closure),{recursive:true});
appendFileSync(new URL('probes/width/vendor/provider/fourLaneSensor.cjs',closure),'\n// reviewer integrity fault\n');
const tampered=await import(new URL('composition/recipe.mjs',closure));let integrityError=null;try{tampered.runComposition(input());}catch(e){integrityError=e.message;}assert.match(integrityError,/frozen source integrity mismatch/);
let nullError=null;try{runComposition(null);}catch(e){nullError=e.message;}
const output={job_id:'R306',candidateManifestSha256:sha(manifestBytes),hashes,controls,singletonCounterexample:{nominalRasterWidthArgumentPx:34,occupiedRasterRows:33,requestedBank:[31.01],declaredTolerancePx:1,sourceArangeActualValues:enumeration,directRequestedWidthEdgePair:direct,wrapperFit:fit,wrapperWidthArgument:fractionalResult.stations[0].candidates[0].widthArgPx,wrapperMidpoint:fractionalResult.stations[0].candidates[0].midpoint,calibratedWidth:fractionalResult.localWidth},midpoints,hidden:{status:hiddenResult.status,width:hiddenResult.rawWidthEstimate,localWidth:hiddenResult.localWidth},empty:{status:emptyResult.status,width:emptyResult.rawWidthEstimate},claimant:{semanticIdentity:claimantResult.semanticIdentity,localWidth:claimantResult.localWidth,inputProvenance:claimantResult.inputProvenance},subpixelMask:{status:subpixelResult.status,samplingSeam:subpixelResult.samplingSeam},integrityError,unsupportedTopLevelNullError:nullError};
writeFileSync(new URL('measurements.json',here),JSON.stringify(output,preserveNonFinite,2)+'\n');
console.log(JSON.stringify({verifiedHashes:hashes.length,guardControls:controls.length,singletonCounterexample:output.singletonCounterexample,integrityError,unsupportedTopLevelNullError:nullError},preserveNonFinite,2));
