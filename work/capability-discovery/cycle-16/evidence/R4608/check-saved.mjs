import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const repo='/workspace/scratch/86659bbafcce/chainspot-discovery-lab';
const owner='/workspace/scratch/afc0d51965a8/lab16/S1/E4608';
const hash=b=>createHash('sha256').update(b).digest('hex');
const read=p=>readFileSync(p);
const json=p=>JSON.parse(read(p));
const sourcePath=repo+'/work/capability-discovery/cycle-09/evidence/E3012/measurement/measurement.json';
const bytes=read(sourcePath),saved=JSON.parse(bytes),outBytes=read(owner+'/firstgreen/result.json'),out=JSON.parse(outBytes);
assert.equal(bytes.length,1808041);assert.equal(hash(bytes),'fc5da1eb88c0bb572506e815e653c94ddc71ba6d66b8832d513e889477fa95b1');
assert.equal(outBytes.length,321752);assert.equal(hash(outBytes),'0ba97bcc17e85249042127907c173aef8dfcab6a3abe159756312c69cb78fe79');
const pointer=(p)=>p.split('/').slice(1).reduce((a,k)=>a[k.replaceAll('~1','/').replaceAll('~0','~')],saved);
const numeric=c=>{assert(Number.isFinite(c.actual)&&Number.isFinite(c.expected));assert.equal(c.residual,c.actual-c.expected);assert.equal(c.tolerance,1e-9);assert(Math.abs(c.residual)<=c.tolerance);assert.equal(c.status,'MATCHED');};
let observed=0,unknown=0,checks=0,numericChecks=0,max=0;
function validateRows(result){
 assert.equal(result.rows.length,12);
 for(let i=0;i<12;i++){
  const r=result.rows[i],s=saved.rows[i];assert.equal(r.id,s.id);for(const k of ['branch','frame','group'])assert.equal(r[k],s[k]);assert.equal(r.nominalWidthPx,s.widthPx);assert.equal(r.slots.length,5);assert.deepEqual(pointer(r.rawContextPointer),s);assert.deepEqual(pointer(r.rawStationsPointer),s.rawStations);
  assert.deepEqual(r.savedContext.error,s.midpoint.error);assert.deepEqual(r.savedContext.isolatedIds,s.midpoint.isolatedIds);assert.equal(r.savedContext.completeFive,s.midpoint.completeFive);assert.deepEqual(pointer(r.savedContext.baselinePointer),s.baseline);assert.equal(r.savedContext.runs.length,s.midpoint.runs.length);
  r.savedContext.runs.forEach((v,j)=>{for(const k of ['stationIds','points','sharp'])assert.deepEqual(v[k],s.midpoint.runs[j][k]);assert.deepEqual(pointer(v.descriptorPointer),s.midpoint.runs[j].descriptor);});
  assert.equal(r.descriptor.frame,r.frame);assert.equal(r.descriptor.vertexCount,5);assert.equal(r.descriptor.centerline.totalVertices,5);assert.equal(r.descriptor.normalizedLength.status,'UNKNOWN');assert.equal(r.descriptor.supportEvidence.status,'UNKNOWN');assert.match(r.descriptor.centerline.provenance,/association\/orientation is caller testimony/);
  let rowObserved=0;
  for(let j=0;j<5;j++){
   const a=r.slots[j],b=s.midpoint.slots[j],d=r.descriptor.centerline.samples[j],c=r.comparisons[j];
   for(const k of ['id','state','reason','originPx','midpointPx','leftPx','rightPx'])assert.deepEqual(a[k],b[k]);
   assert.deepEqual(pointer(a.rawContextPointer),b);const station=pointer(a.association.rawStationPointer),candidate=pointer(a.association.candidatePointer);
   assert.equal(station.id,a.id);assert.equal(station.frame,r.frame);assert.deepEqual([station.pose.xPx,station.pose.yPx],a.originPx);assert.equal(candidate.widthArgPx,r.nominalWidthPx);assert.deepEqual(candidate,b.rawCandidate);
   assert.deepEqual(a.rawCandidate,{widthArgPx:b.rawCandidate.widthArgPx,edgeFit:b.rawCandidate.edgeFit,midpoint:b.rawCandidate.midpoint});assert.equal(a.association.status,'MATCHED');assert.equal(c.id,a.id);assert.equal(c.state,a.state);assert.equal(d.vertex,j);
   if(a.state==='UNKNOWN'){
    unknown++;assert.equal(a.midpointPx,null);assert.equal(a.leftPx,null);assert.equal(a.rightPx,null);assert.equal(d.status,'UNKNOWN');assert.deepEqual(Object.keys(d).sort(),['reason','status','vertex']);assert.equal(c.status,'UNKNOWN');assert.deepEqual(c.checks[0].actual,d);assert.equal(c.reason,a.reason);assert.equal(c.checks[0].status,'MATCHED');checks++;
   }else{
    observed++;rowObserved++;assert.equal(d.status,'observed');assert.equal(c.status,'MATCHED');assert.equal(c.checks.length,6);assert.deepEqual(c.checks[0].actual,{vertex:j,status:'observed'});assert.deepEqual(c.checks[0].expected,c.checks[0].actual);assert.equal(c.checks[0].status,'MATCHED');checks++;
    const f=b.rawCandidate.edgeFit,m=b.rawCandidate.midpoint;
    const expected=[['midpoint.x',d.midpointPx[0],b.midpointPx[0]],['midpoint.y',d.midpointPx[1],b.midpointPx[1]],['fittedFullWidthPx',d.fullWidthPx,f.wPx],['distanceFromMidpointPx',d.distanceFromMidpointPx,Math.abs(m.candidateCenterMinusFitMidpointPx)],['distanceInFittedFullWidths',d.distanceInFullWidths,Math.abs(m.candidateCenterMinusFitMidpointPx)/f.wPx]];
    expected.forEach(([name,actual,expected],k)=>{const x=c.checks[k+1];assert.equal(x.name,name);assert.equal(x.actual,actual);assert.equal(x.expected,expected);numeric(x);numericChecks++;checks++;max=Math.max(max,Math.abs(x.residual));});
    assert.deepEqual(c.normalization,{savedSignedPixelOffset:m.candidateCenterMinusFitMidpointPx,savedSignedNominalWidthRatio:m.candidateCenterMinusFitMidpointInNominalWidths,nominalWidthPx:s.widthPx,fittedWidthPx:f.wPx});
   }
  }
  assert.equal(r.descriptor.centerline.observedPairs,rowObserved);assert.equal(r.countCheck.actual,rowObserved);assert.equal(r.countCheck.expected,rowObserved);assert.equal(r.countCheck.residual,0);assert.equal(r.countCheck.tolerance,0);assert.equal(r.countCheck.status,'MATCHED');checks++;numericChecks++;assert.equal(r.status,'CONSISTENT_AVAILABLE');
 }
}
validateRows(out);assert.equal(observed,42);assert.equal(unknown,18);assert.equal(checks,282);assert.equal(numericChecks,222);
let frameChecks=0,frameUnknown=0,frameMax=0;
assert.equal(out.frameComparisons.length,6);
out.frameComparisons.forEach((pair,i)=>{
 assert.equal(pair.cropRowId,out.rows[i].id);assert.equal(pair.sourceRowId,out.rows[i+6].id);assert.equal(pair.dependent,true);assert.deepEqual(pair.translationPx,[400,1010]);assert.equal(pair.slots.length,5);assert.equal(pair.status,'CONSISTENT_AVAILABLE');
 pair.slots.forEach((c,j)=>{
  const a=out.rows[i].descriptor.centerline.samples[j],b=out.rows[i+6].descriptor.centerline.samples[j];assert.equal(c.id,out.rows[i].slots[j].id);
  if(a.status==='UNKNOWN'){frameUnknown++;assert.equal(b.status,'UNKNOWN');assert.equal(c.status,'UNKNOWN');assert.deepEqual(c.unavailable,['midpoint','offset','width','normalization']);return;}
  const exp=[['translatedMidpoint.x',b.midpointPx[0],a.midpointPx[0]+400],['translatedMidpoint.y',b.midpointPx[1],a.midpointPx[1]+1010],...['fullWidthPx','distanceFromMidpointPx','distanceInFullWidths'].map(k=>[k,b[k],a[k]]),...[0,1].map(k=>[`offsetVector.${k}`,b.offsetVectorPx[k],a.offsetVectorPx[k]])];
  assert.equal(c.status,'MATCHED');assert.equal(c.checks.length,7);exp.forEach(([name,actual,expected],k)=>{const x=c.checks[k];assert.equal(x.name,name);assert.equal(x.actual,actual);assert.equal(x.expected,expected);numeric(x);frameChecks++;frameMax=Math.max(frameMax,Math.abs(x.residual));});
 });
});
assert.equal(frameChecks,147);assert.equal(frameUnknown,9);assert.deepEqual(out.savedPredictions,saved.predictions);Object.values(out.rawContext).forEach(p=>assert.notEqual(pointer(p),undefined));
assert.deepEqual(out.counts,{attempted:12,completed:12,errors:0,slots:60,observed:42,unknown:18});assert.deepEqual(out.errors,[]);assert.equal(out.status,'CONSISTENT');assert.equal(out.qualifications.physicalClaims,'UNKNOWN/HOLD');assert.match(out.qualifications.swapBlindness,/symmetric left\/right swap/);assert.match(out.projectionLabel,/NOT complete original payload/);
assert.deepEqual(out.input.before,out.input.after);assert.deepEqual(out.fileBinding.before,out.fileBinding.after);assert.equal(out.fileBinding.actualPath,sourcePath);assert.deepEqual(out.sourceBinding.before,out.sourceBinding.after);
for(const pin of out.sourceBinding.before){const b=read(repo+'/'+pin.path);assert.equal(b.length,pin.bytes);assert.equal(hash(b),pin.sha256);}
for(const label of ['tests','audit-command']){
 const a=json(`${owner}/${label}/source-pins.before.json`),b=json(`${owner}/${label}/source-pins.after.json`);assert.deepEqual(a,b);for(const p of a){assert.equal(p.matched,true);assert.equal(p.sha256,p.expected);assert.equal(hash(read(repo+'/'+p.path)),p.sha256);}
 const e=json(`${owner}/${label}/execution.json`);assert.equal(e.exitCode,0);assert.equal(e.error,null);assert.equal(e.signal,null);for(const k of ['stdout','stderr']){const b=read(e[k].path);assert.equal(b.length,e[k].bytes);assert.equal(hash(b),e[k].sha256);}assert.equal(e.pinsBeforeAfterIdentical,true);assert.equal(e.allFrozenPinsMatched,true);
}
const report=[`result\t${hash(outBytes)}`,`status\t${out.status}`,`projection\t${out.projectionLabel}`,`calls\t${JSON.stringify(out.counts)}`,'meaning\tSoftware consistency only; physical claims UNKNOWN/HOLD; dependent exposed views; symmetric swap blind',...out.rows.flatMap(r=>r.slots.map((s,i)=>[r.id,s.id,s.state,r.status,r.comparisons[i].status].join('\t')))].join('\n')+'\n';
assert.equal(read(owner+'/firstgreen/cli.txt').toString(),report);assert.equal(read(owner+'/audit-command/stdout.txt').toString(),report);
console.log(JSON.stringify({status:'ACCEPTED_METADATA_CONSISTENCY',originalSha256:hash(bytes),resultSha256:hash(outBytes),rows:12,observed,unknown,rowChecks:checks,rowNumericalChecks:numericChecks,maxAbsRowResidual:max,frameChecks,frameUnknown,maxAbsFrameResidual:frameMax,geometryImports:0,geometryCalls:0,productTestReruns:0,qualifier:'Independent saved-evidence assertions only; not geometry reproduction or runtime authentication'},null,2));
